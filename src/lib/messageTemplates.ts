import { MessageTemplateKey } from "@/lib/api";

// Mismo texto que se siembra en la base (server/db.js) — sirve de respaldo
// mientras se cargan las plantillas reales, o si a una le falta el texto.
export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  order_registration: `Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}}:\n\n{{items}}\n\nTotal: S/.{{total}}\n\n{{estado_texto}}`,
  order_status_update: `Hola {{cliente}}, novedades de tu pedido #{{pedido}}:\n\n{{items}}\n\n{{estado_texto}}`,
  customer_registration: `Hola, soy {{cliente}} {{apellido}}, acabo de registrarme. Mi código de cliente es #{{codigo}}. Aquí está el link para registrar mi pedido: {{link}}`,
};

// Reemplaza cada {{variable}} por su valor; una variable sin valor en el
// mapa se borra (no deja el marcador tal cual en el mensaje final).
export const renderMessageTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
