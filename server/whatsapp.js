// Cliente de la API de WhatsApp de migo.pe (docs.migo.pe/v2/api-whatsapp) —
// una API no oficial (conexión por código QR, no es la API de Meta), así
// que el envío nunca debe romper el flujo que lo dispara: cualquier error
// queda solo logueado, nunca se propaga (ver sendWhatsAppMessage).
import { pool } from "./db.js";

const MIGO_INSTANCE = process.env.MIGO_WHATSAPP_INSTANCE;
const MIGO_APIKEY = process.env.MIGO_WHATSAPP_APIKEY;
const MIGO_API_URL = "https://chat.migo.pe";
// Para armar links absolutos en los mensajes (link de registro de pedido,
// link de restablecer contraseña) — en el navegador se arman con
// window.location.origin, que no existe acá.
const SITE_URL = process.env.SITE_URL || "";

export const sendWhatsAppMessage = async (phone, text) => {
  if (!MIGO_INSTANCE || !MIGO_APIKEY) {
    console.warn("WhatsApp (migo.pe) no está configurado — se omite el envío.");
    return false;
  }
  const digits = (phone ?? "").replace(/\D/g, "");
  const number = digits.startsWith("51") ? digits : `51${digits}`;
  try {
    const response = await fetch(`${MIGO_API_URL}/message/sendText/${MIGO_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: MIGO_APIKEY },
      body: JSON.stringify({ number, text }),
    });
    if (!response.ok) {
      console.error("migo.pe sendText respondió con error:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("migo.pe sendText falló:", err);
    return false;
  }
};

// A diferencia de los 3 mensajes de abajo, este no pasa por message_templates
// (no es editable) — es un mensaje de seguridad del sistema, no de relación
// con el cliente.
export const sendMobileVerificationPin = async (mobile, pin) =>
  sendWhatsAppMessage(mobile, `Tu código de verificación ChicBags es: ${pin}. Válido por 10 minutos.`);

// Mismo criterio que sendMobileVerificationPin: mensaje fijo, no editable
// por message_templates — es seguridad de la cuenta, no relación con el
// cliente. El link se arma acá (no en index.js) por el mismo motivo que
// sendCustomerRegistrationWhatsApp: SITE_URL no existe en el navegador, así
// que este módulo lo resuelve una sola vez para todos los links que manda.
export const sendPasswordResetWhatsApp = async (mobile, token) =>
  sendWhatsAppMessage(
    mobile,
    `Para restablecer tu contraseña de ChicBags, entra a este link (válido por 30 minutos): ${SITE_URL}/mi-cuenta/restablecer/${token}`
  );

// --- Plantillas: puerto de src/lib/messageTemplates.ts + src/lib/orderMessages.ts
// (duplicado a propósito — frontend y backend no comparten módulos en este
// proyecto, mismo criterio de duplicación leve usado en todo el código). ---

const DEFAULT_MESSAGE_TEMPLATES = {
  order_registration: `Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}}:\n\n{{items}}\n\nTotal: S/.{{total}}\n\n{{estado_texto}}`,
  order_status_update: `Hola {{cliente}}, novedades de tu pedido #{{pedido}}:\n\n{{items}}\n\n{{estado_texto}}`,
  // A diferencia del texto anterior (pensado para que el cliente se lo
  // mandara a la empresa), ahora la empresa le escribe al cliente, así que
  // el texto está en segunda persona.
  customer_registration: `Hola {{cliente}}, gracias por registrarte en ChicBags. Tu código de cliente es #{{codigo}}. Aquí tienes el link para registrar tu pedido: {{link}}`,
  // A diferencia de customer_registration (registro por el link público,
  // donde el link de /registro-pedido lo sigue usando el vendedor), quien
  // crea una cuenta desde el catálogo ya puede comprar directo por la web
  // — no tiene sentido ofrecerle ese link.
  customer_account_registration: `Hola {{cliente}}, gracias por registrarte en ChicBags. Tu código de cliente es #{{codigo}}. Desde ahora ya puedes realizar tus compras desde la web.`,
};

const renderMessageTemplate = (template, vars) => template.replace(/\{\{(\w+)\}\}/g, (_match, key) => vars[key] ?? "");

const getMessageTemplate = async (key) => {
  const { rows } = await pool.query("SELECT template FROM message_templates WHERE template_key = $1", [key]);
  return rows[0]?.template ?? DEFAULT_MESSAGE_TEMPLATES[key];
};

const buildOrderItemsText = (order) =>
  order.items
    .map((item) => {
      const code = item.productCode ? ` [${item.productCode}]` : "";
      const color = item.colorName ? ` (${item.colorName})` : "";
      const discount = item.discount > 0 ? ` (dcto. S/.${item.discount.toFixed(2)})` : "";
      return `- ${item.productName}${code}${color} x${item.quantity}${discount}: S/.${item.subtotal.toFixed(2)}`;
    })
    .join("\n");

const formatDeadlineDate = (iso) => new Date(iso).toLocaleDateString("es-PE", { dateStyle: "long", timeZone: "UTC" });

const buildOrderStatusText = (order) => {
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

const formatDateTime = (iso) => new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });

export const sendCustomerRegistrationWhatsApp = async (customer) => {
  const template = await getMessageTemplate("customer_registration");
  const message = renderMessageTemplate(template, {
    cliente: customer.firstName,
    apellido: customer.paternalSurname,
    codigo: String(customer.id),
    link: `${SITE_URL}/registro-pedido/${customer.id}`,
  });
  return sendWhatsAppMessage(customer.mobile, message);
};

// Para quien crea una cuenta desde el catálogo (Crea tu cuenta) en vez de
// registrarse por el link público — ver nota en DEFAULT_MESSAGE_TEMPLATES.
export const sendCustomerAccountWhatsApp = async (customer) => {
  const template = await getMessageTemplate("customer_account_registration");
  const message = renderMessageTemplate(template, {
    cliente: customer.firstName,
    apellido: customer.paternalSurname,
    codigo: String(customer.id),
  });
  return sendWhatsAppMessage(customer.mobile, message);
};

export const sendOrderRegistrationWhatsApp = async (order, customer) => {
  const template = await getMessageTemplate("order_registration");
  const message = renderMessageTemplate(template, {
    cliente: customer.firstName,
    pedido: String(order.id),
    fecha: formatDateTime(order.createdAt),
    items: buildOrderItemsText(order),
    total: order.total.toFixed(2),
    estado_texto: buildOrderStatusText(order),
  });
  return sendWhatsAppMessage(customer.mobile, message);
};

export const sendOrderStatusWhatsApp = async (order, customer) => {
  const template = await getMessageTemplate("order_status_update");
  const message = renderMessageTemplate(template, {
    cliente: customer.firstName,
    pedido: String(order.id),
    items: buildOrderItemsText(order),
    estado_texto: buildOrderStatusText(order),
  });
  return sendWhatsAppMessage(customer.mobile, message);
};
