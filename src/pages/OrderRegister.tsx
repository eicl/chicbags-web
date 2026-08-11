import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Minus, MessageCircle, Plus, Search, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useProducts } from "@/context/ProductContext";
import { Product, ProductColor } from "@/context/CartContext";
import { lookupCustomer, registerOrder, fetchSellers, Customer, Order } from "@/lib/api";
import { productImageUrl } from "@/lib/images";
import { buildOrderStatusText } from "@/lib/orderMessages";
import ProductOrderPicker from "@/components/ProductOrderPicker";

interface OrderLine {
  product: Product;
  color: ProductColor;
  quantity: number;
  // Descuento manual en soles para este ítem, tope de S/.4 (validado también en el servidor).
  discount: number;
}

const lineKey = (productId: number, colorName: string) => `${productId}::${colorName}`;

const MAX_ITEM_DISCOUNT = 4;
const clampDiscount = (value: number) => Math.min(Math.max(value, 0), MAX_ITEM_DISCOUNT);

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

// Lleva la conversación de WhatsApp al celular del cliente con el número
// de pedido y el resumen ya redactados — solo falta darle Enviar.
const buildOrderWhatsAppLink = (order: Order, customer: Customer) => {
  const digits = customer.mobile.replace(/\D/g, "");
  const phone = digits.startsWith("51") ? digits : `51${digits}`;
  const itemsText = order.items
    .map((item) => {
      const code = item.productCode ? ` [${item.productCode}]` : "";
      const discount = item.discount > 0 ? ` (dcto. S/.${item.discount.toFixed(2)})` : "";
      return `- ${item.productName}${code} (${item.colorName}) x${item.quantity}${discount}: S/.${item.subtotal.toFixed(2)}`;
    })
    .join("\n");
  const message = `Hola ${customer.firstName}, tu pedido #${order.id} fue registrado el ${formatDateTime(order.createdAt)}:\n\n${itemsText}\n\nTotal: S/.${order.total.toFixed(2)}\n\n${buildOrderStatusText(order)}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const OrderRegister = () => {
  const { customerId: customerIdParam } = useParams();
  const queryClient = useQueryClient();
  const { products } = useProducts();

  const [code, setCode] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [order, setOrder] = useState<Order | null>(null);

  const { data: sellers = [] } = useQuery({ queryKey: ["sellers"], queryFn: fetchSellers });

  const lookupMutation = useMutation({
    mutationFn: lookupCustomer,
    onSuccess: (found) => {
      setCustomer(found);
      toast.success(`Cliente encontrado: ${found.firstName} ${found.paternalSurname}`);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo buscar el cliente"),
  });

  // Si el link trae el código de cliente (ej. /registro-pedido/6, el que
  // se manda por WhatsApp al registrarse), lo busca solo — igual se puede
  // buscar a mano con el formulario de siempre.
  useEffect(() => {
    if (customerIdParam) {
      lookupMutation.mutate({ code: customerIdParam });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerIdParam]);

  const orderMutation = useMutation({
    mutationFn: registerOrder,
    onSuccess: (created) => {
      setOrder(created);
      setLines([]);
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo registrar el pedido"),
  });

  const handleLookup = () => {
    if (!code.trim() && !documentNumber.trim()) {
      toast.error("Ingresa el código de cliente o el número de documento");
      return;
    }
    lookupMutation.mutate({ code: code.trim() || undefined, documentNumber: documentNumber.trim() || undefined });
  };

  const handleChangeCustomer = () => {
    setCustomer(null);
    setLines([]);
    setCode("");
    setDocumentNumber("");
  };

  const handleAdd = (product: Product, color: ProductColor) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id && l.color.name === color.name);
      if (existing) {
        if (existing.quantity >= color.stock) {
          toast.error(`No hay más stock de "${product.name}" (${color.name})`);
          return prev;
        }
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, color, quantity: 1, discount: 0 }];
    });
  };

  const handleDiscount = (line: OrderLine, value: number) => {
    const discount = clampDiscount(Number.isFinite(value) ? value : 0);
    setLines((prev) =>
      prev.map((l) => (l.product.id === line.product.id && l.color.name === line.color.name ? { ...l, discount } : l))
    );
  };

  const handleQuantity = (line: OrderLine, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.product.id !== line.product.id || l.color.name !== line.color.name) return l;
          const next = l.quantity + delta;
          if (next > l.color.stock) {
            toast.error(`No hay más stock de "${l.product.name}" (${l.color.name})`);
            return l;
          }
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0)
    );
  };

  const handleRemove = (line: OrderLine) => {
    setLines((prev) => prev.filter((l) => !(l.product.id === line.product.id && l.color.name === line.color.name)));
  };

  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity - l.discount, 0);

  const handleSubmit = () => {
    if (!customer) {
      toast.error("Busca un cliente primero");
      return;
    }
    if (!sellerId) {
      toast.error("Selecciona el vendedor");
      return;
    }
    if (lines.length === 0) {
      toast.error("Agrega al menos un producto al pedido");
      return;
    }
    orderMutation.mutate({
      customerId: customer.id,
      sellerId: Number(sellerId),
      items: lines.map((l) => ({ productId: l.product.id, colorName: l.color.name, quantity: l.quantity, discount: l.discount })),
    });
  };

  const handleNewOrder = () => {
    setOrder(null);
    handleChangeCustomer();
  };

  if (order) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 md:px-8 py-16 md:py-24 flex flex-col items-center text-center gap-6 max-w-lg">
          <CheckCircle2 className="w-14 h-14 text-primary" />
          <h1 className="text-2xl md:text-3xl font-medium" style={{ fontFamily: "var(--font-display)" }}>
            ¡Pedido registrado!
          </h1>
          <span className="inline-block px-4 py-2 rounded-md bg-primary/10 text-primary font-semibold text-lg tracking-wide">
            Pedido #{order.id}
          </span>
          <p className="text-sm text-muted-foreground -mt-4">Registrado el {formatDateTime(order.createdAt)}</p>
          <span className="inline-block px-3 py-1 rounded-md bg-muted text-sm font-medium">
            Estado: {order.status}
          </span>
          {order.status === "Separación" && order.separationDeadline && (
            <p className="text-sm text-muted-foreground max-w-md">
              Tienes 15 días calendario para cancelar tu pedido. Fecha límite:{" "}
              <span className="font-medium text-foreground">{formatDateTime(order.separationDeadline)}</span>.
            </p>
          )}
          <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.productName}
                  {item.productCode && <span className="text-muted-foreground"> [{item.productCode}]</span>}
                  {" "}({item.colorName}) x{item.quantity}
                  {item.discount > 0 && (
                    <span className="text-muted-foreground"> (dcto. S/.{item.discount.toFixed(2)})</span>
                  )}
                </span>
                <span className="font-medium">S/.{item.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-base font-medium pt-2 border-t border-border">
              <span>Total</span>
              <span>S/.{order.total.toFixed(2)}</span>
            </div>
          </div>
          {customer && (
            <a
              href={buildOrderWhatsAppLink(order, customer)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-white font-medium transition-transform hover:scale-105"
              style={{ backgroundColor: "#25D366" }}
            >
              <MessageCircle className="w-5 h-5" fill="white" />
              Volver al chat de WhatsApp
            </a>
          )}
          <div className="flex gap-3">
            <Button onClick={handleNewOrder}>Registrar otro pedido</Button>
            <Link to="/"><Button variant="outline">Volver a la tienda</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-medium mb-2" style={{ fontFamily: "var(--font-display)" }}>
            Registrar pedido
          </h1>
          <p className="text-muted-foreground">Busca al cliente por su código o DNI, agrega los productos y registra el pedido.</p>
        </div>

        <div className="border border-border rounded-lg p-6 mb-6">
          {customer ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{customer.firstName} {customer.paternalSurname} {customer.maternalSurname}</p>
                <p className="text-sm text-muted-foreground">
                  {customer.documentType} {customer.documentNumber} · {customer.mobile}
                </p>
                <p className="text-sm text-muted-foreground">
                  {customer.district}, {customer.province}, {customer.department}
                </p>
                <p className="text-sm text-muted-foreground">
                  {customer.deliveryType}
                  {customer.deliveryMode && ` (${customer.deliveryMode})`}
                  {customer.agency && ` — Sede: ${customer.agency}`}
                  {customer.address && ` — ${customer.address}`}
                </p>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">
                  Código de cliente: #{customer.id}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleChangeCustomer} className="gap-2 shrink-0">
                <X className="w-3.5 h-3.5" /> Cambiar
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Código de cliente</label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej. 6" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">DNI / N° de documento</label>
                <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Ej. 42242274" />
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <Button onClick={handleLookup} disabled={lookupMutation.isPending} className="gap-2">
                  <Search className="w-4 h-4" /> {lookupMutation.isPending ? "Buscando..." : "Buscar cliente"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  ¿Cliente nuevo? <Link to="/registro-cliente" className="text-primary hover:underline">Regístralo aquí</Link>
                </span>
              </div>
            </div>
          )}
        </div>

        {customer && (
          <>
            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Vendedor</h2>
              {sellers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay usuarios con perfil Vendedor todavía. Créalos en{" "}
                  <Link to="/admin" className="text-primary hover:underline">Admin &gt; Usuarios</Link>.
                </p>
              ) : (
                <div className="max-w-xs">
                  <label className="text-sm text-muted-foreground mb-1 block">¿Quién está registrando el pedido? *</label>
                  <select
                    value={sellerId}
                    onChange={(e) => setSellerId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Selecciona...</option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>{seller.username}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Agregar productos</h2>
              <ProductOrderPicker products={products} onAdd={handleAdd} />
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Pedido</h2>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Todavía no agregaste productos.</p>
              ) : (
                <div className="space-y-3">
                  {lines.map((line) => (
                    <div key={lineKey(line.product.id, line.color.name)} className="flex items-center gap-3 p-3 rounded-md border border-border">
                      <div className="w-12 h-12 rounded bg-muted overflow-hidden shrink-0">
                        {line.color.image && (
                          <img src={productImageUrl(line.color.image)} alt={line.color.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {line.product.name}
                          {line.product.code && <span className="text-muted-foreground"> [{line.product.code}]</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{line.color.name} · S/.{line.product.price.toFixed(2)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleQuantity(line, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm">{line.quantity}</span>
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleQuantity(line, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="shrink-0 text-center">
                        <label className="block text-[10px] text-muted-foreground leading-tight">Dcto. (máx S/.{MAX_ITEM_DISCOUNT})</label>
                        <Input
                          type="number"
                          min={0}
                          max={MAX_ITEM_DISCOUNT}
                          step={0.5}
                          value={line.discount || ""}
                          onChange={(e) => handleDiscount(line, e.target.valueAsNumber)}
                          placeholder="0"
                          className="h-7 w-16 text-sm text-right px-2"
                        />
                      </div>
                      <p className="w-20 text-right text-sm font-medium shrink-0">
                        S/.{(line.product.price * line.quantity - line.discount).toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemove(line)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        aria-label="Quitar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <span className="text-base font-medium">Total</span>
                    <span className="text-xl font-semibold">S/.{total.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={orderMutation.isPending || lines.length === 0 || !sellerId}
              className="w-full py-6 text-sm tracking-widest uppercase gap-2"
            >
              {orderMutation.isPending ? "Registrando..." : "Registrar pedido"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderRegister;
