import { MessageTemplateKey } from "@/lib/api";

// Mismo texto que se siembra en la base (server/db.js) — sirve de respaldo
// mientras se cargan las plantillas reales, o si a una le falta el texto.
const CLOSING_TEXT = `Gracias por tu compra. Cualquier consulta, escríbenos por este medio.`;

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  order_registration: `Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}}:\n\n{{items}}\n\nTotal: S/.{{total}}\n\n{{estado_texto}}\n\n${CLOSING_TEXT}`,
  order_registration_separacion: `Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}} y quedó en Separación:\n\n{{items}}\n\nTotal: S/.{{total}}\n\n{{estado_texto}}\n\n${CLOSING_TEXT}`,
  order_registration_contraentrega: `Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}} para pago contra entrega:\n\n{{items}}\n\nTotal: S/.{{total}}\n\n{{estado_texto}}\n\n${CLOSING_TEXT}`,
  order_status_update: `Hola {{cliente}}, novedades de tu pedido #{{pedido}}:\n\n{{items}}\n\n{{estado_texto}}\n\n${CLOSING_TEXT}`,
  separation_deadline_notice: `Tienes {{dias}} días calendario para cancelar tu pedido. Fecha límite: {{fecha_limite}}.`,
  order_balance_notice: `Pagado: S/.{{pagado}}\nSaldo pendiente: S/.{{saldo}}`,
  order_balance_notice_cod: `Pagado: S/.{{pagado}}\nSaldo pendiente: S/.{{saldo}} (se cobra al momento de la entrega)`,
  // Antes lo mandaba el cliente a la empresa (link wa.me); ahora lo manda
  // la empresa al cliente automáticamente, así que va en segunda persona.
  customer_registration: `Hola {{cliente}}, gracias por registrarte en ChicBags. Tu código de cliente es #{{codigo}}. Aquí tienes el link para registrar tu pedido: {{link}}`,
  customer_account_registration: `Hola {{cliente}}, gracias por registrarte en ChicBags. Tu código de cliente es #{{codigo}}. Desde ahora ya puedes realizar tus compras desde la web.`,
};

// Reemplaza cada {{variable}} por su valor; una variable sin valor en el
// mapa se borra (no deja el marcador tal cual en el mensaje final).
export const renderMessageTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
