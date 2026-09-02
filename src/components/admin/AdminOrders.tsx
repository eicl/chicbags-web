import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronUp, Flag, MessageCircle, Loader2, PackageCheck, Pencil, Plus, Printer, Search, Trash2, Truck, Upload, Warehouse, X } from "lucide-react";
import {
  AdminOrder, ChargeType, DeliveryType, OrderItem, OrderStatus, PaymentInput, Service,
  addOrderItem, deleteOrder, deleteOrderItem, fetchMessageTemplates, fetchOrders, fetchServices, fetchSettings, markOrderAccumulating,
  markOrderDelivered, markOrderReadyForDelivery, markOrderWarehouseSeparated, registerPayment, releaseOrderAccumulating,
  updateOrderChargeType, updateOrderItemColor, updateOrderItemDiscount, updateOrderReceipt, updateOrderServiceItem,
  uploadImage,
} from "@/lib/api";
import { buildOrderStatusText } from "@/lib/orderMessages";
import { DEFAULT_MESSAGE_TEMPLATES, renderMessageTemplate } from "@/lib/messageTemplates";
import { productImageUrl } from "@/lib/images";
import { useProducts } from "@/context/ProductContext";
import { Product, ProductColor } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";
import ProductOrderPicker from "@/components/ProductOrderPicker";
import ServiceOrderPicker from "@/components/ServiceOrderPicker";

// Fecha de creación del pedido en el listado: solo día/mes, para no ocupar
// tanto espacio en la tabla.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });

// A diferencia de formatDate (para momentos reales, como cuándo se creó el
// pedido), esta es para fechas de calendario sin hora (fecha de pago, plazo
// de separación) guardadas en UTC medianoche — se muestran también en UTC
// para que no se corran un día según la zona horaria del navegador.
const formatDateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "medium", timeZone: "UTC" });

// Igual que formatDateOnly pero corto (dd/MM), para el reporte impreso de
// Separación. Se arma a mano (no con Intl) para garantizar el cero a la
// izquierda siempre, sin depender de qué tan completos estén los datos de
// localización del navegador.
const formatDayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// OJO: no usar toISOString() acá — convierte a UTC, y Perú (UTC-5) ya está
// "mañana" en UTC después de las 7pm, lo que adelantaba la fecha por defecto
// un día en pagos registrados de noche.
const toLocalDateStr = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const todayDate = () => toLocalDateStr(new Date());

const PAYMENT_SOURCES = ["Yape", "Plin", "Otro"];
// Respaldo mientras se carga la configuración real desde el servidor
// (Admin > Configuración > Pedidos).
const FALLBACK_NEAR_SEPARATION_DEADLINE_DAYS = 13;
const PAGE_SIZE = 20;

const matchesOrder = (order: AdminOrder, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [String(order.id), order.customerName, order.customerDocument, order.sellerName, order.status, order.type]
    .some((field) => (field ?? "").toLowerCase().includes(q));
};

// Alerta visual: pedidos "Separación"/"Separado en almacén" (el plazo para
// cancelar se configura en Admin > Configuración) que ya pasaron
// nearSeparationDeadlineDays días desde el primer pago y todavía tienen
// saldo pendiente — para verlos de un vistazo antes de que se cumpla el
// plazo. Un pedido ya pagado del todo (remaining = 0) no se marca, aunque
// siga técnicamente en ese estado.
const isNearSeparationDeadline = (order: AdminOrder, nearSeparationDeadlineDays: number) => {
  const status = order.status.toLowerCase();
  if (!status.includes("separac") && !status.includes("separad")) return false;
  const firstPayment = order.payments[0];
  if (!firstPayment) return false;
  const daysSinceFirstPayment = (Date.now() - new Date(firstPayment.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceFirstPayment <= nearSeparationDeadlineDays) return false;
  const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  return order.total - paid > 0;
};

const STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  "Registrado": "bg-muted text-muted-foreground",
  "Separación": "bg-amber-500/10 text-amber-600",
  "Separado en almacén": "bg-sky-500/10 text-sky-600",
  "Pendiente de envío en almacén por acumulación": "bg-violet-500/10 text-violet-600",
  "Pendiente de envío": "bg-primary/10 text-primary",
  "Listo para delivery": "bg-purple-500/10 text-purple-600",
  "Entregado a delivery": "bg-emerald-500/10 text-emerald-600",
};

// Mismo orden del ciclo de vida, para el filtro por estado del panel.
const ORDER_STATUSES: OrderStatus[] = [
  "Registrado",
  "Separación",
  "Separado en almacén",
  "Pendiente de envío en almacén por acumulación",
  "Pendiente de envío",
  "Listo para delivery",
  "Entregado a delivery",
];

// Lleva la conversación de WhatsApp al celular del cliente con el estado
// actual del pedido (y, si está en Separación, el plazo para cancelar). El
// texto sale de la plantilla configurable (Admin > Mensajes de WhatsApp).
const buildStatusWhatsAppLink = (order: AdminOrder, template: string) => {
  const digits = order.customerMobile.replace(/\D/g, "");
  const phone = digits.startsWith("51") ? digits : `51${digits}`;
  const message = renderMessageTemplate(template, {
    cliente: order.customerName,
    pedido: String(order.id),
    estado_texto: buildOrderStatusText(order),
  });
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

// Solo estos tipos de delivery piden vía de envío (terrestre/aéreo) — misma
// regla que en el registro de cliente/pedido.
const DELIVERY_MODE_TYPES = ["Shalom", "Olva"];
// Los "motorizado" reparten a domicilio: en el reporte de envío muestran
// distrito + dirección exacta en vez de la ubicación completa, y no
// necesitan la fila de Documento.
const ADDRESS_TYPES = ["Motorizado Express", "Motorizado Delivery"];
// Los que reparten por agencia/courier: antes de marcarlos "Entregado a
// delivery" hace falta subir el recibo del envío (mismo requisito del
// servidor, repetido acá para deshabilitar el botón en vez de solo
// mostrar el error después de intentarlo).
const COURIER_DELIVERY_TYPES = ["Shalom", "Olva", "Marvisur"];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Ícono de moto para la etiqueta de envío de los "motorizado": rojo para
// Motorizado Delivery (Pitaya), verde para Motorizado Express — así se
// distingue de un vistazo qué motorizado le toca a cada paquete apilado.
const MOTO_ICON_SRC: Partial<Record<DeliveryType, string>> = {
  "Motorizado Delivery": "/motorizadoDelivery.png",
  "Motorizado Express": "/motorizadoExpress.png",
};

// Reglas comunes a los dos reportes; el tamaño de página va aparte porque
// cada uno usa uno distinto (A6 horizontal para el de envío, A5 vertical
// para el de separación).
const PRINT_BASE_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }
`;

// Reporte para pedidos "Pendiente de envío"/"Listo para delivery"/
// "Entregado a delivery" (ya pagados): datos de entrega del cliente,
// listos para pegar en el paquete.
// Vía (si aplica, Terrestre/Aéreo) va en la esquina superior izquierda y el
// número de pedido en la superior derecha; el resto son filas fijas:
// Delivery (tipo + agencia), Ubicación/Documento (o, si es "motorizado",
// Distrito + Dirección en su lugar y sin Documento), Nombre, Celular.
const buildShippingLabelHtml = (order: AdminOrder) => {
  const showMode = DELIVERY_MODE_TYPES.includes(order.customerDeliveryType);
  const isMotorized = ADDRESS_TYPES.includes(order.customerDeliveryType);
  const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = order.total - paid;
  const showCobrar = order.chargeType === "Contraentrega" && remaining > 0;
  // El QR de Yape es para que pague el mismo motorizado (Motorizado
  // Delivery); las agencias/courier cobran en efectivo al entregar, así que
  // no tiene sentido mostrárselo a ellas.
  const showYapeQr = showCobrar && !COURIER_DELIVERY_TYPES.includes(order.customerDeliveryType);
  const motoIconSrc = MOTO_ICON_SRC[order.customerDeliveryType];
  const rows: [string, string][] = [
    ["Delivery", order.customerAgency ? `${order.customerDeliveryType} - ${order.customerAgency}` : order.customerDeliveryType],
    ...(isMotorized
      ? ([
          ["Distrito", order.customerDistrict],
          ["Dirección", order.customerAddress],
        ] as [string, string][])
      : ([["Ubicación", `${order.customerDepartment} - ${order.customerProvince} - ${order.customerDistrict}`]] as [string, string][])),
    ...(isMotorized ? [] : ([["Documento", `${order.customerDocumentType} - ${order.customerDocumentNumber}`]] as [string, string][])),
    ["Nombre", order.customerName],
    ["Celular", order.customerMobile],
  ];
  // Solo productos (sin servicios, que no tienen color) — código, cantidad
  // y color de cada ítem, para armar el paquete sin tener que abrir el
  // pedido en el panel.
  const productItems = order.items.filter((item) => item.serviceId === null);
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Pedido #${order.id}</title>
        <style>
          @page { size: A6 landscape; margin: 8mm; }
          ${PRINT_BASE_STYLES}
          body { position: relative; min-height: 89mm; }
          .logo { display: block; margin: 0 auto 6px; width: 20mm; height: 20mm; border-radius: 9999px; object-fit: cover; }
          .via-corner { position: absolute; top: 0; left: 0; font-size: 12px; font-weight: 700; color: #444; }
          .order-corner { position: absolute; top: 0; right: 0; font-size: 16px; font-weight: 800; }
          table { width: 100%; border-collapse: collapse; font-size: 17px; }
          td { padding: 4px 4px; border-bottom: 1px solid #ddd; vertical-align: top; }
          td:first-child { font-weight: 700; width: 38%; color: #444; }
          .cobrar { font-size: 18px; font-weight: 800; text-align: center; margin-top: 8px; }
          .items-list { font-size: 11px; line-height: 1.3; color: #333; margin-top: 6px; }
          .items-list div { margin: 1px 0; break-inside: avoid; }
          .items-list.two-col { column-count: 2; column-gap: 8px; }
          .yape-qr { position: absolute; right: 0; bottom: 0; width: 24mm; height: 24mm; object-fit: contain; }
          .moto-icon { position: absolute; left: 0; bottom: 2mm; width: 20mm; height: 20mm; object-fit: contain; }
        </style>
      </head>
      <body>
        ${showMode && order.customerDeliveryMode ? `<div class="via-corner">Vía: ${escapeHtml(order.customerDeliveryMode)}</div>` : ""}
        <div class="order-corner">Pedido #${order.id}</div>
        <img class="logo" src="${window.location.origin}/chicBags.jpeg" alt="ChicBags" />
        <table>
          ${rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join("")}
        </table>
        ${showCobrar ? `<div class="cobrar">Cobrar: S/.${remaining.toFixed(2)}</div>` : ""}
        ${
          productItems.length > 0
            ? `<div class="items-list${productItems.length > 2 ? " two-col" : ""}" style="margin-left: ${
                motoIconSrc ? "20mm" : "4mm"
              }; margin-right: ${showYapeQr ? "24mm" : "4mm"};">${productItems
                .map((item) => `<div>${escapeHtml(item.productCode || "—")} · x${item.quantity} · ${escapeHtml(item.colorName || "—")}</div>`)
                .join("")}</div>`
            : ""
        }
        ${showYapeQr ? `<img class="yape-qr" src="${window.location.origin}/yapeChicBags.jpg" alt="QR Yape ChicBags" />` : ""}
        ${motoIconSrc ? `<img class="moto-icon" src="${window.location.origin}${motoIconSrc}" alt="Moto" />` : ""}
      </body>
    </html>
  `;
};

// Reporte para pedidos en "Separación" (pago parcial): el número de pedido
// bien grande (lo más notorio, para ubicarlo rápido entre los demás), y
// abajo, más chico, el nombre del cliente, la fecha del primer pago y el
// detalle de cada ítem (código, modelo, color y cantidad) para identificar
// el paquete mientras espera el resto del pago.
const buildSeparationLabelHtml = (order: AdminOrder) => {
  const firstPaymentDate = order.payments.length > 0 ? order.payments[0].createdAt : null;
  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Pedido #${order.id}</title>
      <style>
        @page { size: A5 portrait; margin: 14mm; }
        ${PRINT_BASE_STYLES}
        body { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; padding: 20mm 0; }
        .order-number { font-size: 220px; font-weight: 800; }
        .customer-name { font-size: 40px; font-weight: 600; margin-bottom: 10px; }
        .payment-date { font-size: 24px; color: #333; margin-bottom: 10px; }
        .items { font-size: 28px; color: #333; }
        .items div { margin: 2px 0; }
      </style>
    </head>
    <body>
      <div></div>
      <div class="order-number">${order.id}</div>
      <div>
        <div class="customer-name">${escapeHtml(order.customerName)}</div>
        ${firstPaymentDate ? `<div class="payment-date">Primer pago: ${formatDayMonth(firstPaymentDate)}</div>` : ""}
        <div class="items">
          ${order.items
            .map(
              (item) =>
                `<div>${escapeHtml(item.productCode || "—")} · ${escapeHtml(item.productName)}${
                  item.colorName ? ` · ${escapeHtml(item.colorName)}` : ""
                } · x${item.quantity}</div>`
            )
            .join("")}
        </div>
      </div>
    </body>
  </html>
`;
};

const printOrder = (order: AdminOrder) => {
  const html =
    order.status === "Pendiente de envío" ||
    order.status === "Listo para delivery" ||
    order.status === "Entregado a delivery" ||
    order.status === "Pendiente de envío en almacén por acumulación"
      ? buildShippingLabelHtml(order)
      : buildSeparationLabelHtml(order);
  const printWindow = window.open("", "_blank", "width=600,height=800");
  if (!printWindow) {
    toast.error("El navegador bloqueó la ventana de impresión");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
};

// Deja cambiar el color de un ítem ya registrado. Si el producto sigue en
// el catálogo, ofrece sus colores actuales (con el stock de cada uno) en
// un select; si no, un texto libre. El servidor es quien ajusta el stock
// (devuelve el del color anterior, descuenta el del nuevo).
const ItemColorEditor = ({ orderId, item }: { orderId: number; item: OrderItem }) => {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(item.colorName);

  const product = item.productId !== null ? products.find((p) => p.id === item.productId) : undefined;

  const mutation = useMutation({
    mutationFn: (colorName: string) => updateOrderItemColor(orderId, item.id, colorName),
    onSuccess: () => {
      toast.success("Color actualizado");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setEditing(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo cambiar el color"),
  });

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.colorName}
        <button
          type="button"
          onClick={() => {
            setColor(item.colorName);
            setEditing(true);
          }}
          className="text-muted-foreground hover:text-primary"
          aria-label="Cambiar color"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {product ? (
        <select
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
        >
          {(product.colors ?? []).map((c) => (
            <option key={c.name} value={c.name}>{c.name} · {c.stock}</option>
          ))}
        </select>
      ) : (
        <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-24 text-xs px-2" />
      )}
      <button
        type="button"
        onClick={() => mutation.mutate(color)}
        disabled={mutation.isPending || !color.trim()}
        className="text-primary hover:text-primary/80 disabled:opacity-50"
        aria-label="Guardar color"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Cancelar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
};

// Deja editar el descuento de un producto ya agregado a un pedido, o
// quitarlo del todo (devuelve el stock) — los servicios no se editan acá
// (ahí lo editable es la cantidad, con ServiceItemEditor).
const ProductDiscountEditor = ({ orderId, item }: { orderId: number; item: OrderItem }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [discount, setDiscount] = useState(item.discount);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const updateMutation = useMutation({
    mutationFn: (d: number) => updateOrderItemDiscount(orderId, item.id, d),
    onSuccess: () => {
      toast.success("Descuento actualizado");
      invalidate();
      setEditing(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el descuento"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrderItem(orderId, item.id),
    onSuccess: () => {
      toast.success("Producto quitado del pedido");
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo quitar el producto"),
  });

  const handleRemove = () => {
    if (!confirm(`¿Quitar "${item.productName}" del pedido? Se devolverá el stock.`)) return;
    deleteMutation.mutate();
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <Input
          type="number"
          min={0}
          step={0.5}
          value={discount}
          onChange={(e) => setDiscount(e.target.valueAsNumber)}
          className="h-7 w-16 text-xs px-1 text-right"
        />
        <button
          type="button"
          onClick={() => updateMutation.mutate(Number.isFinite(discount) ? discount : 0)}
          disabled={updateMutation.isPending}
          className="text-primary hover:text-primary/80 disabled:opacity-50"
          aria-label="Guardar descuento"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      {item.discount > 0 ? `S/.${item.discount.toFixed(2)}` : "—"}
      <button
        type="button"
        onClick={() => {
          setDiscount(item.discount);
          setEditing(true);
        }}
        className="text-muted-foreground hover:text-primary"
        aria-label="Editar descuento"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={handleRemove}
        disabled={deleteMutation.isPending}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Quitar producto"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
  );
};

// Deja editar la cantidad de un servicio ya agregado a un pedido, o
// quitarlo del todo — los productos no se editan acá (ahí lo editable es
// el color, con ItemColorEditor).
const ServiceItemEditor = ({ orderId, item }: { orderId: number; item: OrderItem }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(item.quantity);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["orders"] });

  const updateMutation = useMutation({
    mutationFn: (q: number) => updateOrderServiceItem(orderId, item.id, { quantity: q, discount: item.discount }),
    onSuccess: () => {
      toast.success("Cantidad actualizada");
      invalidate();
      setEditing(false);
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar la cantidad"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteOrderItem(orderId, item.id),
    onSuccess: () => {
      toast.success("Servicio quitado del pedido");
      invalidate();
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo quitar el servicio"),
  });

  const handleRemove = () => {
    if (!confirm(`¿Quitar "${item.productName}" del pedido?`)) return;
    deleteMutation.mutate();
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5 justify-end">
        <Input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.valueAsNumber)}
          className="h-7 w-14 text-xs px-1 text-right"
        />
        <button
          type="button"
          onClick={() => updateMutation.mutate(quantity)}
          disabled={updateMutation.isPending || !Number.isInteger(quantity) || quantity <= 0}
          className="text-primary hover:text-primary/80 disabled:opacity-50"
          aria-label="Guardar cantidad"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-muted-foreground hover:text-destructive"
          aria-label="Cancelar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      {item.quantity}
      <button
        type="button"
        onClick={() => {
          setQuantity(item.quantity);
          setEditing(true);
        }}
        className="text-muted-foreground hover:text-primary"
        aria-label="Editar cantidad"
      >
        <Pencil className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={handleRemove}
        disabled={deleteMutation.isPending}
        className="text-muted-foreground hover:text-destructive"
        aria-label="Quitar servicio"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
  );
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

// Solo para pedidos con delivery Shalom/Olva/Marvisur: deja subir el
// recibo del envío (comprobante de la agencia) y una clave de rastreo
// opcional. Sin recibo, el servidor no deja marcar el pedido como
// "Entregado a delivery" (ver el botón más abajo).
const ReceiptForm = ({ order }: { order: AdminOrder }) => {
  const queryClient = useQueryClient();
  const [trackingCode, setTrackingCode] = useState(order.trackingCode);
  const [receiptImage, setReceiptImage] = useState(order.receiptImage);
  const [uploading, setUploading] = useState(false);

  const receiptMutation = useMutation({
    mutationFn: (data: { receiptImage: string; trackingCode?: string }) => updateOrderReceipt(order.id, data),
    onSuccess: () => {
      toast.success("Recibo guardado");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar el recibo"),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { filename } = await uploadImage(file);
      setReceiptImage(filename);
    } catch {
      toast.error("No se pudo subir el recibo");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!receiptImage) {
      toast.error("Sube el recibo del envío");
      return;
    }
    receiptMutation.mutate({ receiptImage, trackingCode });
  };

  return (
    <div>
      <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Recibo del envío</h4>
      <div className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-dashed border-border">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Recibo</label>
          <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-muted/50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {receiptImage ? "Cambiar" : "Subir"}
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
        {receiptImage && (
          <img src={productImageUrl(receiptImage)} alt="Recibo del envío" className="w-9 h-9 rounded object-cover border border-border" />
        )}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Clave (opcional)</label>
          <Input value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} placeholder="Clave de rastreo" className="h-9 w-40" />
        </div>
        <Button size="sm" onClick={handleSubmit} disabled={receiptMutation.isPending || uploading} className="h-9">
          {receiptMutation.isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
};

const CHARGE_TYPES: ChargeType[] = ["Normal", "Contraentrega"];
// Los tipos de delivery donde tiene sentido elegir Contraentrega: el
// motorizado propio (Delivery, o el que manda el mismo cliente a
// recoger), o las agencias/courier — Motorizado Express queda afuera, no
// lo pidieron.
const CHARGE_TYPE_DELIVERY_TYPES = ["Motorizado Delivery", "Motorizado Cliente", "Shalom", "Olva", "Marvisur"];

// Deja elegir el tipo de cobro (Normal/Contraentrega). Contraentrega pasa
// el pedido a "Pendiente de envío" aunque tenga saldo pendiente — quien
// reparte cobra el resto al entregar — y desde ahí ya se puede imprimir la
// etiqueta como si estuviera pagado, con una línea "Cobrar" al final.
const ChargeTypeSelector = ({ order }: { order: AdminOrder }) => {
  const queryClient = useQueryClient();
  const [chargeType, setChargeType] = useState<ChargeType>(order.chargeType);

  const chargeTypeMutation = useMutation({
    mutationFn: (value: ChargeType) => updateOrderChargeType(order.id, value),
    onSuccess: () => {
      toast.success("Tipo de cobro guardado");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo guardar el tipo de cobro"),
  });

  return (
    <div>
      <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Tipo de cobro</h4>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={chargeType}
          onChange={(e) => setChargeType(e.target.value as ChargeType)}
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {CHARGE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={() => chargeTypeMutation.mutate(chargeType)}
          disabled={chargeTypeMutation.isPending || chargeType === order.chargeType}
        >
          {chargeTypeMutation.isPending ? "Guardando..." : "Guardar"}
        </Button>
        {chargeType === "Contraentrega" && (
          <p className="text-xs text-muted-foreground">
            Si el pedido tiene saldo pendiente, al guardar pasa a "Pendiente de envío" y ya se puede imprimir con el saldo a cobrar.
          </p>
        )}
      </div>
    </div>
  );
};

// Deja agregar productos a un pedido que ya existe, sin importar el tipo de
// delivery. Agregar servicios sigue solo para "Motorizado Delivery" (el
// motorizado puede volver a pasar por más mercadería antes de entregar).
const AddOrderItemsExtras = ({ order }: { order: AdminOrder }) => {
  const queryClient = useQueryClient();
  const { products } = useProducts();
  const { data: services = [] } = useQuery({ queryKey: ["services"], queryFn: fetchServices });

  const addItemMutation = useMutation({
    mutationFn: (data: Parameters<typeof addOrderItem>[1]) => addOrderItem(order.id, data),
    onSuccess: () => {
      toast.success("Ítem agregado al pedido");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Algo salió mal"),
  });

  const handleAddProduct = (product: Product, color: ProductColor) => {
    addItemMutation.mutate({ productId: product.id, colorName: color.name, quantity: 1 });
  };

  const handleAddService = (service: Service) => {
    addItemMutation.mutate({ serviceId: service.id, quantity: 1 });
  };

  return (
    <div className="space-y-4 p-3 rounded-md border border-dashed border-border">
      <div>
        <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Agregar productos</h4>
        <ProductOrderPicker products={products} onAdd={handleAddProduct} />
      </div>
      {order.customerDeliveryType === "Motorizado Delivery" && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Agregar servicios</h4>
          <ServiceOrderPicker services={services} onAdd={handleAddService} />
        </div>
      )}
    </div>
  );
};

const AdminOrders = () => {
  const queryClient = useQueryClient();
  const { data: orders = [], isLoading, isError } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { products } = useProducts();
  const { data: messageTemplates = [] } = useQuery({ queryKey: ["messageTemplates"], queryFn: fetchMessageTemplates });
  const statusUpdateTemplate =
    messageTemplates.find((t) => t.key === "order_status_update")?.template ?? DEFAULT_MESSAGE_TEMPLATES.order_status_update;
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const nearSeparationDeadlineDays = settings?.nearSeparationDeadlineDays ?? FALLBACK_NEAR_SEPARATION_DEADLINE_DAYS;
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "Todos">("Todos");
  const [page, setPage] = useState(1);
  const [salesFrom, setSalesFrom] = useState(todayDate);
  const [salesTo, setSalesTo] = useState(todayDate);

  // Con el filtro en "Todos", los pedidos con la banderita (cerca del plazo
  // de separación) van primero — orden estable, así que dentro de cada
  // grupo (con/sin bandera) se respeta el orden que ya traían.
  const filteredOrders = orders
    .filter((o) => matchesOrder(o, query) && (statusFilter === "Todos" || o.status === statusFilter))
    .sort((a, b) => {
      if (statusFilter !== "Todos") return 0;
      return (
        Number(isNearSeparationDeadline(b, nearSeparationDeadlineDays)) -
        Number(isNearSeparationDeadline(a, nearSeparationDeadlineDays))
      );
    });
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const pageOrders = filteredOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Resumen de ventas del rango de fechas elegido (por defecto, hoy): monto
  // vendido, carteras (ítems de producto, sin contar servicios) y ganancia
  // = vendido - costo de esas carteras. El costo se busca en el catálogo
  // actual por producto (no hay una "foto" del costo al momento del pedido),
  // así que si el producto ya no existe o no tiene costo cargado, esa parte
  // queda fuera y se avisa con missingCost.
  const salesSummary = orders.reduce(
    (acc, order) => {
      const day = toLocalDateStr(new Date(order.createdAt));
      if (day < salesFrom || day > salesTo) return acc;
      acc.total += order.total;
      for (const item of order.items) {
        if (item.serviceId !== null) continue;
        acc.bags += item.quantity;
        const product = item.productId !== null ? products.find((p) => p.id === item.productId) : undefined;
        if (product && product.cost != null) acc.cost += product.cost * item.quantity;
        else acc.missingCost = true;
      }
      return acc;
    },
    { total: 0, bags: 0, cost: 0, missingCost: false }
  );
  const salesProfit = salesSummary.total - salesSummary.cost;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: OrderStatus | "Todos") => {
    setStatusFilter(value);
    setPage(1);
  };

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

  const deliverMutation = useMutation({
    mutationFn: markOrderDelivered,
    onSuccess: () => {
      toast.success("Pedido marcado como entregado a delivery");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el pedido"),
  });

  const readyForDeliveryMutation = useMutation({
    mutationFn: markOrderReadyForDelivery,
    onSuccess: () => {
      toast.success("Pedido marcado como listo para delivery");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el pedido"),
  });

  const warehouseMutation = useMutation({
    mutationFn: markOrderWarehouseSeparated,
    onSuccess: () => {
      toast.success("Pedido marcado como separado en almacén");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el pedido"),
  });

  const accumulateMutation = useMutation({
    mutationFn: markOrderAccumulating,
    onSuccess: () => {
      toast.success("Pedido guardado en almacén por acumulación");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el pedido"),
  });

  const releaseAccumulateMutation = useMutation({
    mutationFn: releaseOrderAccumulating,
    onSuccess: () => {
      toast.success("Pedido liberado, vuelve a Pendiente de envío");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "No se pudo actualizar el pedido"),
  });

  return (
    <div>
      <div className="mb-6 p-4 rounded-md border border-border bg-muted/20">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Desde</label>
            <Input type="date" value={salesFrom} onChange={(e) => setSalesFrom(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Hasta</label>
            <Input type="date" value={salesTo} onChange={(e) => setSalesTo(e.target.value)} className="h-9" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSalesFrom(todayDate());
              setSalesTo(todayDate());
            }}
            className="h-9"
          >
            Hoy
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">
            Total vendido: <span className="font-semibold text-foreground">S/.{salesSummary.total.toFixed(2)}</span>
          </span>
          <span className="text-muted-foreground">
            Carteras vendidas: <span className="font-semibold text-foreground">{salesSummary.bags}</span>
          </span>
          <span className="text-muted-foreground">
            Ganancia total: <span className="font-semibold text-foreground">S/.{salesProfit.toFixed(2)}</span>
            {salesSummary.missingCost && " (algunos productos no tienen costo cargado)"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Buscar por pedido, cliente, vendedor, estado..."
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value as OrderStatus | "Todos")}
            className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="Todos">Todos los estados</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
        <Link to="/registro-pedido" target="_blank" rel="noopener noreferrer">
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Registrar pedido
          </Button>
        </Link>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Pedido</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Cliente</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Celular</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Ubicación</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Tipo de delivery</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Vendedor</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Estado</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Total</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Pagado</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Restante</th>
                <th className="text-left text-xs uppercase tracking-widest text-muted-foreground py-3 px-4">Fecha</th>
                <th className="text-right text-xs uppercase tracking-widest text-muted-foreground py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((order) => {
                const isExpanded = expandedId === order.id;
                const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
                const remaining = Math.max(order.total - paid, 0);
                return (
                  <Fragment key={order.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 text-sm font-medium text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          #{order.id}
                          {isNearSeparationDeadline(order, nearSeparationDeadlineDays) && (
                            <span title={`Cerca del plazo de separación: más de ${nearSeparationDeadlineDays} días desde el primer pago`}>
                              <Flag className="w-3.5 h-3.5 text-destructive fill-destructive shrink-0" aria-label="Cerca del plazo de separación" />
                            </span>
                          )}
                        </span>
                        {order.type === "Regularización" && (
                          <div className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold">Regularización</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {order.customerName}
                        <div className="text-xs text-muted-foreground font-normal">Código: #{order.customerId}</div>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerMobile}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">
                        {order.customerDistrict}, {order.customerProvince}, {order.customerDepartment}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.customerDeliveryType}</td>
                      <td className="py-3 px-4 text-muted-foreground text-sm">{order.sellerName || "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-semibold ${STATUS_BADGE_CLASS[order.status]}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">S/.{order.total.toFixed(2)}</td>
                      <td className="py-3 px-4 text-emerald-600 text-sm">S/.{paid.toFixed(2)}</td>
                      <td className="py-3 px-4 text-sm">
                        {remaining > 0 ? <span className="text-amber-600">S/.{remaining.toFixed(2)}</span> : "—"}
                      </td>
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
                        <td colSpan={12} className="px-4 py-3 space-y-4">
                          <p className="text-sm">
                            <span className="text-muted-foreground">Documento:</span> <span className="font-medium">{order.customerDocument}</span>
                            {" · "}
                            <span className="text-muted-foreground">Celular:</span> <span className="font-medium">{order.customerMobile}</span>
                            {order.customerAddress && (
                              <>
                                {" · "}
                                <span className="text-muted-foreground">Dirección:</span> <span className="font-medium">{order.customerAddress}</span>
                              </>
                            )}
                          </p>
                          <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                            Productos ({order.items.length})
                          </h4>
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
                                  <td className="py-1.5">
                                    {item.productName}
                                    {item.serviceId !== null && (
                                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary font-semibold">Servicio</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-muted-foreground">
                                    {item.serviceId === null ? <ItemColorEditor orderId={order.id} item={item} /> : "—"}
                                  </td>
                                  <td className="py-1.5 text-right">S/.{item.unitPrice.toFixed(2)}</td>
                                  <td className="py-1.5 text-right">
                                    {item.serviceId !== null ? <ServiceItemEditor orderId={order.id} item={item} /> : item.quantity}
                                  </td>
                                  <td className="py-1.5 text-right text-muted-foreground">
                                    {item.serviceId === null ? (
                                      <ProductDiscountEditor orderId={order.id} item={item} />
                                    ) : item.discount > 0 ? (
                                      `S/.${item.discount.toFixed(2)}`
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right font-medium">S/.{item.subtotal.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {(order.status === "Separación" || order.status === "Separado en almacén") && order.separationDeadline && (
                            <p className="text-sm text-amber-600">
                              Pago parcial (S/.{paid.toFixed(2)} de S/.{order.total.toFixed(2)}). Plazo para cancelar: {" "}
                              <span className="font-medium">{formatDateOnly(order.separationDeadline)}</span>.
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
                                      <td className="py-1.5 text-muted-foreground">{formatDateOnly(payment.createdAt)}</td>
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

                          {CHARGE_TYPE_DELIVERY_TYPES.includes(order.customerDeliveryType) && <ChargeTypeSelector order={order} />}

                          <AddOrderItemsExtras order={order} />

                          {COURIER_DELIVERY_TYPES.includes(order.customerDeliveryType) && <ReceiptForm order={order} />}

                          <div className="flex flex-wrap items-center gap-3">
                            <a
                              href={buildStatusWhatsAppLink(order, statusUpdateTemplate)}
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
                              onClick={() => printOrder(order)}
                              disabled={order.status === "Registrado"}
                              title={order.status === "Registrado" ? "Registra un pago primero" : "Imprimir reporte A5"}
                              className="gap-2"
                            >
                              <Printer className="w-3.5 h-3.5" /> Imprimir
                            </Button>
                            {order.status === "Separación" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => warehouseMutation.mutate(order.id)}
                                disabled={warehouseMutation.isPending}
                                className="gap-2 text-sky-600 hover:text-sky-600"
                              >
                                <Warehouse className="w-3.5 h-3.5" /> Marcar como separado en almacén
                              </Button>
                            )}
                            {order.status === "Pendiente de envío" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => readyForDeliveryMutation.mutate(order.id)}
                                disabled={readyForDeliveryMutation.isPending}
                                className="gap-2 text-purple-600 hover:text-purple-600"
                              >
                                <PackageCheck className="w-3.5 h-3.5" /> Marcar como listo para delivery
                              </Button>
                            )}
                            {order.status === "Listo para delivery" && (() => {
                              const needsReceipt = COURIER_DELIVERY_TYPES.includes(order.customerDeliveryType) && !order.receiptImage;
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => deliverMutation.mutate(order.id)}
                                  disabled={deliverMutation.isPending || needsReceipt}
                                  title={needsReceipt ? "Sube el recibo del envío primero" : undefined}
                                  className="gap-2 text-emerald-600 hover:text-emerald-600"
                                >
                                  <Truck className="w-3.5 h-3.5" /> Marcar como entregado a delivery
                                </Button>
                              );
                            })()}
                            {order.status === "Pendiente de envío" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => accumulateMutation.mutate(order.id)}
                                disabled={accumulateMutation.isPending}
                                title="Guarda el pedido en almacén para despacharlo junto con otros pedidos del mismo cliente más adelante"
                                className="gap-2 text-violet-600 hover:text-violet-600"
                              >
                                <Archive className="w-3.5 h-3.5" /> Guardar en almacén (acumulación)
                              </Button>
                            )}
                            {order.status === "Pendiente de envío en almacén por acumulación" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => releaseAccumulateMutation.mutate(order.id)}
                                disabled={releaseAccumulateMutation.isPending}
                                title="Libera el pedido de vuelta a Pendiente de envío para despacharlo"
                                className="gap-2 text-violet-600 hover:text-violet-600"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5" /> Liberar de almacén
                              </Button>
                            )}
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
                  <td colSpan={12} className="py-12 text-center text-muted-foreground">Cargando pedidos...</td>
                </tr>
              )}
              {isError && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-destructive">No se pudo conectar con la API.</td>
                </tr>
              )}
              {!isLoading && !isError && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-muted-foreground">
                    {orders.length === 0 ? "No hay pedidos registrados." : "Ningún pedido coincide con la búsqueda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
};

export default AdminOrders;
