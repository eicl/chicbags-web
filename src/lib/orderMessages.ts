import { Order } from "@/lib/api";

// Detalle de cada ítem del pedido (nombre, código, color, descuento y
// subtotal), una línea por ítem — el mismo formato que se manda al
// registrar el pedido, reusado también al enviar una actualización de
// estado por WhatsApp para que el cliente tenga siempre a la vista qué
// incluye su pedido.
export const buildOrderItemsText = (order: Order) =>
  order.items
    .map((item) => {
      const code = item.productCode ? ` [${item.productCode}]` : "";
      const color = item.colorName ? ` (${item.colorName})` : "";
      const discount = item.discount > 0 ? ` (dcto. S/.${item.discount.toFixed(2)})` : "";
      return `- ${item.productName}${code}${color} x${item.quantity}${discount}: S/.${item.subtotal.toFixed(2)}`;
    })
    .join("\n");

// El plazo es una fecha de calendario (no un momento con hora), y se guarda
// en UTC medianoche — hay que mostrarla también en UTC para que no se corra
// un día según la zona horaria del navegador que la mira (Perú es UTC-5).
export const formatDeadlineDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "UTC" });

// Texto de estado que se agrega siempre que se le comparte al cliente el
// número de su pedido (registro inicial o actualizaciones de pago). En
// "Separación" (o "Separado en almacén", que sigue siendo pago parcial)
// además indica cuánto pagó, cuánto le falta, y el plazo de 15 días
// calendario para cancelar. Un pedido Contraentrega puede llegar a
// "Pendiente de envío" con saldo pendiente (el motorizado lo cobra al
// entregar) — ahí también hace falta el desglose, aunque ya no esté "en
// separación" ni tenga plazo de cancelación.
export const buildOrderStatusText = (order: Order) => {
  let text = `Estado del pedido: ${order.status}`;
  const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = order.total - paid;
  const isWaitingPayment = order.status === "Separación" || order.status === "Separado en almacén";
  const isPendingCod = order.status === "Pendiente de envío" && remaining > 0;
  if (isWaitingPayment || isPendingCod) {
    text += `\n\nPagado: S/.${paid.toFixed(2)}\nSaldo pendiente: S/.${remaining.toFixed(2)}`;
    if (isPendingCod) {
      text += ` (se cobra al momento de la entrega)`;
    }
  }
  if (isWaitingPayment && order.separationDeadline) {
    text += `\n\nTienes 15 días calendario para cancelar tu pedido. Fecha límite: ${formatDeadlineDate(order.separationDeadline)}.`;
  }
  return text;
};
