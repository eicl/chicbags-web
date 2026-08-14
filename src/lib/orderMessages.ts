import { Order } from "@/lib/api";

// El plazo es una fecha de calendario (no un momento con hora), y se guarda
// en UTC medianoche — hay que mostrarla también en UTC para que no se corra
// un día según la zona horaria del navegador que la mira (Perú es UTC-5).
export const formatDeadlineDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "UTC" });

// Texto de estado que se agrega siempre que se le comparte al cliente el
// número de su pedido (registro inicial o actualizaciones de pago). En
// "Separación" (o "Separado en almacén", que sigue siendo pago parcial)
// además indica cuánto pagó, cuánto le falta, y el plazo de 15 días
// calendario para cancelar.
export const buildOrderStatusText = (order: Order) => {
  let text = `Estado del pedido: ${order.status}`;
  if (order.status === "Separación" || order.status === "Separado en almacén") {
    const paid = order.payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = order.total - paid;
    text += `\n\nPagado: S/.${paid.toFixed(2)}\nSaldo pendiente: S/.${remaining.toFixed(2)}`;
    if (order.separationDeadline) {
      text += `\n\nTienes 15 días calendario para cancelar tu pedido. Fecha límite: ${formatDeadlineDate(order.separationDeadline)}.`;
    }
  }
  return text;
};
