import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MessageCircle, Loader2, Trash2, Upload } from "lucide-react";
import { AdminOrder, OrderStatus, PaymentInput, deleteOrder, fetchOrders, registerPayment, uploadImage } from "@/lib/api";
import { buildOrderStatusText } from "@/lib/orderMessages";
import { productImageUrl } from "@/lib/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

const todayDate = () => new Date().toISOString().slice(0, 10);

const PAYMENT_SOURCES = ["Yape", "Plin", "Otro"];

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  "Registrado": "bg-muted text-muted-foreground",
  "Separación": "bg-amber-500/10 text-amber-600",
  "Pendiente de envío": "bg-primary/10 text-primary",
};

// Lleva la conversación de WhatsApp al celular del cliente con el estado
// actual del pedido (y, si está en Separación, el plazo para cancelar).
const buildStatusWhatsAppLink = (order: AdminOrder) => {
  const digits = order.customerMobile.replace(/\D/g, "");
  const phone = digits.startsWith("51") ? digits : `51${digits}`;
  const message = `Hola ${order.customerName}, novedades de tu pedido #${order.id}:\n\n${buildOrderStatusText(order)}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const PaymentForm = ({ orderId }: { orderId: number }) => {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState(PAYMENT_SOURCES[0]);
  const [sourceOther, setSourceOther] = useState("");
  const [date, setDate] = useState(todayDate);
  const [proofImage, setProofImage] = useState("");
  const [uploading, setUploading] = useState(false);

  const paymentMutation = useMutation({
    mutationFn: (data: PaymentInput) => registerPayment(orderId, data),
    onSuccess: () => {
      toast.success("Pago registrado");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setAmount("");
      setSource(PAYMENT_SOURCES[0]);
      setSourceOther("");
      setDate(todayDate());
      setProofImage("");
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo registrar el pago"),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { filename } = await uploadImage(file);
      setProofImage(filename);
    } catch {
      toast.error("No se pudo subir la captura");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    const finalSource = source === "Otro" ? sourceOther.trim() : source;
    if (!finalSource) {
      toast.error("Ingresa el medio de pago");
      return;
    }
    if (!proofImage) {
      toast.error("Sube la captura del pago");
      return;
    }
    paymentMutation.mutate({ amount: amountNumber, source: finalSource, date, proofImage });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-dashed border-border">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Monto</label>
        <Input
          type="number"
          min={0}
          step={0.1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="h-9 w-24"
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Medio de pago</label>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {PAYMENT_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      {source === "Otro" && (
        <div>
          <label className="block text-xs text-muted-foreground mb-1">¿Cuál?</label>
          <Input value={sourceOther} onChange={(e) => setSourceOther(e.target.value)} placeholder="Medio de pago" className="h-9 w-32" />
        </div>
      )}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Fecha del pago</label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Captura del pago</label>
        <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {proofImage ? "Cambiar" : "Subir"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {proofImage && (
        <img src={productImageUrl(proofImage)} alt="Captura del pago" className="w-9 h-9 rounded object-cover border border-border" />
      )}
      <Button size="sm" onClick={handleSubmit} disabled={paymentMutation.isPending || uploading} className="h-9">
        {paymentMutation.isPending ? "Registrando..." : "Registrar pago"}
      </Button>
    </div>
  );
};

const AdminOrders = () => {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading, isError } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: (_data, id) => {
      toast.success("Pedido eliminado");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setExpandedId((current) => (current === id ? null : current));
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo eliminar el pedido"),
  });

  const handleDelete = (order: AdminOrder) => {
    const stockNote = order.type === "Pedido" ? " Se devolverá el stock descontado." : "";
    if (!confirm(`¿Eliminar el pedido #${order.id}?${stockNote}`)) return;
    deleteMutation.mutate(order.id);
  };

  return (
    <div>
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Pedido</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Cliente</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Documento</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Celular</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Vendedor</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Estado</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Productos</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Total</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Fecha</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const isExpanded = expandedId === order.id;
                const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-primary">
                        #{order.id}
                        {order.type === "Regularización" && (
                          <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Regularización</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {order.customerName}
                        <div className="text-xs text-muted-foreground font-normal">Código: #{order.customerId}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerDocument}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerMobile}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.sellerName || "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_BADGE_CLASS[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {order.items.length} {order.items.length === 1 ? "producto" : "productos"}
                      </td>
                      <td className="py-3 px-4 font-medium">S/.{order.total.toFixed(2)}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{formatDate(order.createdAt)}</td>
                      <td className="py-3 px-4 text-right">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 inline text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 inline text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${order.id}-detail`} className="border-b border-border last:border-0 bg-muted/20">
                        <td colSpan={10} className="px-4 py-3 space-y-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs uppercase tracking-widest text-muted-foreground">
                                <th className="text-left py-1.5 font-medium">Código</th>
                                <th className="text-left py-1.5 font-medium">Producto</th>
                                <th className="text-left py-1.5 font-medium">Color</th>
                                <th className="text-right py-1.5 font-medium">Precio</th>
                                <th className="text-right py-1.5 font-medium">Cant.</th>
                                <th className="text-right py-1.5 font-medium">Dcto.</th>
                                <th className="text-right py-1.5 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1.5 text-muted-foreground">{item.productCode || "—"}</td>
                                  <td className="py-1.5">{item.productName}</td>
                                  <td className="py-1.5 text-muted-foreground">{item.colorName}</td>
                                  <td className="py-1.5 text-right">S/.{item.unitPrice.toFixed(2)}</td>
                                  <td className="py-1.5 text-right">{item.quantity}</td>
                                  <td className="py-1.5 text-right text-muted-foreground">
                                    {item.discount > 0 ? `S/.${item.discount.toFixed(2)}` : "—"}
                                  </td>
                                  <td className="py-1.5 text-right font-medium">S/.{item.subtotal.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {order.status === "Separación" && order.separationDeadline && (
                            <p className="text-sm text-amber-600">
                              Pago parcial (S/.{paid.toFixed(2)} de S/.{order.total.toFixed(2)}). Plazo para cancelar: {" "}
                              <span className="font-medium">{formatDate(order.separationDeadline)}</span>.
                            </p>
                          )}

                          {order.payments.length > 0 && (
                            <div>
                              <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Pagos registrados</h4>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs uppercase tracking-widest text-muted-foreground">
                                    <th className="text-left py-1.5 font-medium">Fecha</th>
                                    <th className="text-left py-1.5 font-medium">Medio</th>
                                    <th className="text-left py-1.5 font-medium">Registrado por</th>
                                    <th className="text-left py-1.5 font-medium">Captura</th>
                                    <th className="text-right py-1.5 font-medium">Monto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.payments.map((payment) => (
                                    <tr key={payment.id}>
                                      <td className="py-1.5 text-muted-foreground">{formatDate(payment.createdAt)}</td>
                                      <td className="py-1.5">{payment.source}</td>
                                      <td className="py-1.5 text-muted-foreground">{payment.registeredBy}</td>
                                      <td className="py-1.5">
                                        {payment.proofImage && (
                                          <a
                                            href={productImageUrl(payment.proofImage)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline"
                                          >
                                            Ver
                                          </a>
                                        )}
                                      </td>
                                      <td className="py-1.5 text-right font-medium">S/.{payment.amount.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div>
                            <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Registrar pago</h4>
                            <PaymentForm orderId={order.id} />
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <a
                              href={buildStatusWhatsAppLink(order)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white font-medium text-sm transition-transform hover:scale-105"
                              style={{ backgroundColor: "#25D366" }}
                            >
                              <MessageCircle className="w-4 h-4" fill="white" />
                              Enviar estado por WhatsApp
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(order)}
                              disabled={deleteMutation.isPending}
                              className="gap-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Eliminar pedido
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {isLoading && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">Cargando pedidos...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && orders.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">No hay pedidos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;
