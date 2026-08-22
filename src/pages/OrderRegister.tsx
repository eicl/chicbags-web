import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Minus, MessageCircle, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import Header from "@/components/Header";
import { useProducts } from "@/context/ProductContext";
import { useAuth } from "@/context/AuthContext";
import { Product, ProductColor } from "@/context/CartContext";
import { lookupCustomer, registerOrder, uploadPaymentProof, fetchSellers, fetchSettings, fetchServices, fetchMessageTemplates, ChargeType, Customer, Order, Service } from "@/lib/api";
import { productImageUrl } from "@/lib/images";
import { buildOrderStatusText } from "@/lib/orderMessages";
import { DEFAULT_MESSAGE_TEMPLATES, renderMessageTemplate } from "@/lib/messageTemplates";
import ProductOrderPicker from "@/components/ProductOrderPicker";
import ServiceOrderPicker from "@/components/ServiceOrderPicker";

const PAYMENT_SOURCES = ["Yape", "Plin", "Otro"];
const CHARGE_TYPES: ChargeType[] = ["Normal", "Contraentrega"];
// Shalom, Olva y Marvisur reparten a nivel nacional, así que Contraentrega
// se puede elegir para ellos en cualquier provincia. Motorizado Delivery
// solo existe en la provincia de Lima (ya restringido al registrar el
// cliente), así que ahí sí se exige esa provincia.
const CHARGE_TYPE_NATIONWIDE_DELIVERY_TYPES = ["Shalom", "Olva", "Marvisur"];

interface OrderLine {
  product: Product;
  color: ProductColor;
  quantity: number;
  // Descuento manual en soles para este ítem (tope validado también en el servidor).
  discount: number;
}

interface ServiceLine {
  service: Service;
  quantity: number;
  // Descuento manual en soles para este ítem (tope validado también en el servidor).
  discount: number;
}

// Pago ya agregado a la lista (a diferencia del borrador que se está llenando).
interface PaymentEntry {
  key: string;
  amount: number;
  source: string;
  date: string;
  proofImage: string;
}

const lineKey = (productId: number, colorName: string) => `${productId}::${colorName}`;

// El link de registro de pedidos es público, pero si en ese mismo navegador
// hay una sesión de admin abierta, se permite un descuento manual mayor.
// Los topes son configurables desde el panel (Admin > Pedidos); estos son
// solo el valor de respaldo mientras se cargan desde el servidor.
const FALLBACK_PUBLIC_MAX_ITEM_DISCOUNT = 4;
const FALLBACK_ADMIN_MAX_ITEM_DISCOUNT = 10;
const clampDiscount = (value: number, maxDiscount: number) => Math.min(Math.max(value, 0), maxDiscount);

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

// A diferencia de formatDateTime (para momentos reales, como cuándo se creó
// el pedido), esta es para fechas de calendario sin hora (fecha de pago,
// plazo de separación) guardadas en UTC medianoche — se muestran también en
// UTC para que no se corran un día según la zona horaria del navegador.
const formatDateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "UTC" });

// OJO: no usar toISOString() acá — convierte a UTC, y Perú (UTC-5) ya está
// "mañana" en UTC después de las 7pm, lo que adelantaba la fecha por defecto
// un día en pagos registrados de noche.
const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

// Lleva la conversación de WhatsApp al celular del cliente con el número
// de pedido y el resumen ya redactados — solo falta darle Enviar. El texto
// sale de la plantilla configurable (Admin > Mensajes de WhatsApp).
const buildOrderWhatsAppLink = (order: Order, customer: Customer, template: string) => {
  const digits = customer.mobile.replace(/\D/g, "");
  const phone = digits.startsWith("51") ? digits : `51${digits}`;
  const itemsText = order.items
    .map((item) => {
      const code = item.productCode ? ` [${item.productCode}]` : "";
      const color = item.colorName ? ` (${item.colorName})` : "";
      const discount = item.discount > 0 ? ` (dcto. S/.${item.discount.toFixed(2)})` : "";
      return `- ${item.productName}${code}${color} x${item.quantity}${discount}: S/.${item.subtotal.toFixed(2)}`;
    })
    .join("\n");
  const message = renderMessageTemplate(template, {
    cliente: customer.firstName,
    pedido: String(order.id),
    fecha: formatDateTime(order.createdAt),
    items: itemsText,
    total: order.total.toFixed(2),
    estado_texto: buildOrderStatusText(order),
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const OrderRegister = () => {
  const { customerId: customerIdParam } = useParams();
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const { user } = useAuth();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const maxItemDiscount = user
    ? settings?.maxItemDiscountAdmin ?? FALLBACK_ADMIN_MAX_ITEM_DISCOUNT
    : settings?.maxItemDiscountPublic ?? FALLBACK_PUBLIC_MAX_ITEM_DISCOUNT;
  const { data: messageTemplates = [] } = useQuery({ queryKey: ["messageTemplates"], queryFn: fetchMessageTemplates });
  const orderRegistrationTemplate =
    messageTemplates.find((t) => t.key === "order_registration")?.template ?? DEFAULT_MESSAGE_TEMPLATES.order_registration;

  const [code, setCode] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [sellerId, setSellerId] = useState("");
  const [chargeType, setChargeType] = useState<ChargeType>("Normal");
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSource, setPaymentSource] = useState(PAYMENT_SOURCES[0]);
  const [paymentSourceOther, setPaymentSourceOther] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayDate);
  const [paymentProofImage, setPaymentProofImage] = useState("");
  const [paymentUploading, setPaymentUploading] = useState(false);

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
      setServiceLines([]);
      setPayments([]);
      setPaymentAmount("");
      setPaymentSource(PAYMENT_SOURCES[0]);
      setPaymentSourceOther("");
      setPaymentDate(todayDate());
      setPaymentProofImage("");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo registrar el pedido"),
  });

  const handleUploadProof = async (file: File) => {
    setPaymentUploading(true);
    try {
      const { filename } = await uploadPaymentProof(file);
      setPaymentProofImage(filename);
    } catch {
      toast.error("No se pudo subir la captura");
    } finally {
      setPaymentUploading(false);
    }
  };

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
    setServiceLines([]);
    setChargeType("Normal");
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
    const discount = clampDiscount(Number.isFinite(value) ? value : 0, maxItemDiscount);
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

  const handleAddService = (service: Service) => {
    setServiceLines((prev) => {
      const existing = prev.find((l) => l.service.id === service.id);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { service, quantity: 1, discount: 0 }];
    });
  };

  const handleServiceDiscount = (line: ServiceLine, value: number) => {
    const discount = clampDiscount(Number.isFinite(value) ? value : 0, maxItemDiscount);
    setServiceLines((prev) => prev.map((l) => (l.service.id === line.service.id ? { ...l, discount } : l)));
  };

  const handleServiceQuantity = (line: ServiceLine, delta: number) => {
    setServiceLines((prev) =>
      prev.map((l) => (l.service.id === line.service.id ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );
  };

  const handleRemoveService = (line: ServiceLine) => {
    setServiceLines((prev) => prev.filter((l) => l.service.id !== line.service.id));
  };

  const total =
    lines.reduce((sum, l) => sum + l.product.price * l.quantity - l.discount, 0) +
    serviceLines.reduce((sum, l) => sum + l.service.price * l.quantity - l.discount, 0);

  const canPickChargeType = Boolean(
    customer &&
      (CHARGE_TYPE_NATIONWIDE_DELIVERY_TYPES.includes(customer.deliveryType) ||
        (customer.province === "Lima" && customer.deliveryType === "Motorizado Delivery"))
  );

  // El pago es opcional: si no se llenó ningún campo del borrador, no hay
  // nada pendiente de agregar. Si se llenó alguno, todos los demás pasan a
  // ser obligatorios para poder agregarlo a la lista — no tendría sentido
  // un pago a medio llenar.
  const hasPaymentInput =
    paymentAmount.trim() !== "" ||
    paymentProofImage !== "" ||
    (paymentSource === "Otro" && paymentSourceOther.trim() !== "");

  const handleAddPayment = () => {
    const amountNumber = Number(paymentAmount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error("Ingresa un monto de pago válido");
      return;
    }
    const finalSource = paymentSource === "Otro" ? paymentSourceOther.trim() : paymentSource;
    if (!finalSource) {
      toast.error("Ingresa el medio de pago");
      return;
    }
    if (!paymentProofImage) {
      toast.error("Sube la captura del pago");
      return;
    }
    setPayments((prev) => [
      ...prev,
      { key: `${Date.now()}-${prev.length}`, amount: amountNumber, source: finalSource, date: paymentDate, proofImage: paymentProofImage },
    ]);
    setPaymentAmount("");
    setPaymentSource(PAYMENT_SOURCES[0]);
    setPaymentSourceOther("");
    setPaymentDate(todayDate());
    setPaymentProofImage("");
  };

  const handleRemovePayment = (key: string) => {
    setPayments((prev) => prev.filter((p) => p.key !== key));
  };

  const handleSubmit = () => {
    if (!customer) {
      toast.error("Busca un cliente primero");
      return;
    }
    if (!sellerId) {
      toast.error("Selecciona el vendedor");
      return;
    }
    if (lines.length === 0 && serviceLines.length === 0) {
      toast.error("Agrega al menos un producto o servicio al pedido");
      return;
    }
    if (hasPaymentInput) {
      toast.error('Tienes un pago sin agregar a la lista. Presiona "Agregar pago" o vacía esos campos.');
      return;
    }

    orderMutation.mutate({
      customerId: customer.id,
      sellerId: Number(sellerId),
      chargeType: canPickChargeType ? chargeType : "Normal",
      items: [
        ...lines.map((l) => ({ productId: l.product.id, colorName: l.color.name, quantity: l.quantity, discount: l.discount })),
        ...serviceLines.map((l) => ({ serviceId: l.service.id, quantity: l.quantity, discount: l.discount })),
      ],
      payments:
        payments.length > 0
          ? payments.map((p) => ({ amount: p.amount, source: p.source, date: p.date, proofImage: p.proofImage }))
          : undefined,
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
              <span className="font-medium text-foreground">{formatDateOnly(order.separationDeadline)}</span>.
            </p>
          )}
          <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.productName}
                  {item.productCode && <span className="text-muted-foreground"> [{item.productCode}]</span>}
                  {item.colorName && <> ({item.colorName})</>} x{item.quantity}
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

          {order.payments.length > 0 && (
            <div className="w-full border border-border rounded-lg p-4 text-left space-y-2">
              <h2 className="text-sm font-medium">Pagos registrados</h2>
              {order.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-sm text-muted-foreground">
                  <span>{payment.source} · {formatDateOnly(payment.createdAt)}</span>
                  <span className="font-medium text-foreground">S/.{payment.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {customer && (
            <a
              href={buildOrderWhatsAppLink(order, customer, orderRegistrationTemplate)}
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

            {canPickChargeType && (
              <div className="border border-border rounded-lg p-6 mb-6">
                <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>Tipo de cobro</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Contraentrega deja registrar el pedido con saldo pendiente — el motorizado cobra el resto al entregar.
                </p>
                <select
                  value={chargeType}
                  onChange={(e) => setChargeType(e.target.value as ChargeType)}
                  className="flex h-10 w-56 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {CHARGE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Agregar productos</h2>
              <ProductOrderPicker products={products} onAdd={handleAdd} />
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Agregar servicios</h2>
              <ServiceOrderPicker services={services} onAdd={handleAddService} />
            </div>

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-4" style={{ fontFamily: "var(--font-display)" }}>Pedido</h2>
              {lines.length === 0 && serviceLines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Todavía no agregaste productos ni servicios.</p>
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
                        <label className="block text-[10px] text-muted-foreground leading-tight">Dcto. (máx S/.{maxItemDiscount})</label>
                        <Input
                          type="number"
                          min={0}
                          max={maxItemDiscount}
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
                  {serviceLines.map((line) => (
                    <div key={line.service.id} className="flex items-center gap-3 p-3 rounded-md border border-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {line.service.name}
                          {line.service.code && <span className="text-muted-foreground"> [{line.service.code}]</span>}
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary font-semibold">Servicio</span>
                        </p>
                        <p className="text-xs text-muted-foreground">S/.{line.service.price.toFixed(2)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleServiceQuantity(line, -1)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm">{line.quantity}</span>
                        <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => handleServiceQuantity(line, 1)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="shrink-0 text-center">
                        <label className="block text-[10px] text-muted-foreground leading-tight">Dcto. (máx S/.{maxItemDiscount})</label>
                        <Input
                          type="number"
                          min={0}
                          max={maxItemDiscount}
                          step={0.5}
                          value={line.discount || ""}
                          onChange={(e) => handleServiceDiscount(line, e.target.valueAsNumber)}
                          placeholder="0"
                          className="h-7 w-16 text-sm text-right px-2"
                        />
                      </div>
                      <p className="w-20 text-right text-sm font-medium shrink-0">
                        S/.{(line.service.price * line.quantity - line.discount).toFixed(2)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleRemoveService(line)}
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

            <div className="border border-border rounded-lg p-6 mb-6">
              <h2 className="text-lg font-medium mb-1" style={{ fontFamily: "var(--font-display)" }}>Pagos (opcional)</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Si el cliente ya pagó (uno o más pagos), agrégalos aquí — quedan enlazados al pedido al registrarlo. Si no, deja
                esto vacío y registra el pago después desde el panel admin.
              </p>

              {payments.length > 0 && (
                <div className="space-y-2 mb-4">
                  {payments.map((p) => (
                    <div key={p.key} className="flex items-center gap-3 p-3 rounded-md border border-border">
                      <img
                        src={productImageUrl(p.proofImage)}
                        alt="Captura del pago"
                        className="w-10 h-10 rounded object-cover border border-border shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{p.source}</p>
                        <p className="text-xs text-muted-foreground">{p.date}</p>
                      </div>
                      <p className="text-sm font-medium shrink-0">S/.{p.amount.toFixed(2)}</p>
                      <button
                        type="button"
                        onClick={() => handleRemovePayment(p.key)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        aria-label="Quitar pago"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t border-border text-sm">
                    <span className="text-muted-foreground">Total pagado</span>
                    <span className="font-medium">S/.{payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Monto</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Medio de pago</label>
                  <select
                    value={paymentSource}
                    onChange={(e) => setPaymentSource(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {PAYMENT_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                {paymentSource === "Otro" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">¿Cuál?</label>
                    <Input value={paymentSourceOther} onChange={(e) => setPaymentSourceOther(e.target.value)} placeholder="Medio de pago" className="h-9" />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fecha del pago</label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Captura del pago</label>
                  <label className="flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
                    {paymentUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {paymentProofImage ? "Cambiar" : "Subir"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadProof(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              {paymentProofImage && (
                <img src={productImageUrl(paymentProofImage)} alt="Captura del pago" className="w-16 h-16 mt-3 rounded object-cover border border-border" />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddPayment}
                disabled={paymentUploading}
                className="mt-3 gap-2"
              >
                <Plus className="w-4 h-4" /> Agregar pago
              </Button>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={orderMutation.isPending || (lines.length === 0 && serviceLines.length === 0) || !sellerId || paymentUploading}
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
