import { Order } from "@/lib/api";

export const formatDeadlineDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { dateStyle: "long" });

// Texto de estado que se agrega siempre que se le comparte al cliente el
// número de su pedido (registro inicial o actualizaciones de pago). En
// "Separación" además avisa el plazo de 15 días calendario para cancelar.
export const buildOrderStatusText = (order: Order) => {
  let text = `Estado del pedido: ${order.status}`;
  if (order.status === "Separación" && order.separationDeadline) {
    text += `\n\nTienes 15 días calendario para cancelar tu pedido. Fecha límite: ${formatDeadlineDate(order.separationDeadline)}.`;
  }
  return text;
};
