// Respaldo de las boletas (PDF) en una carpeta de Google Drive — mismo
// patrón que whatsapp.js/migo.js/sunat.js: módulo ESM propio, credenciales
// de process.env leídas al cargar, nunca revienta el módulo si falta
// configuración.
//
// Usa OAuth a nombre del usuario (no una cuenta de servicio): Google ya no
// deja que una cuenta de servicio suba archivos a una Drive personal
// (cuota propia = 0 GB desde hace unos años, ver
// https://developers.google.com/workspace/drive/api/guides/about-shareddrives)
// — confirmado con una prueba real que devolvió
// "storageQuotaExceeded"/"Service Accounts do not have storage quota". La
// única forma de que los PDF cuenten contra el Drive gratuito del usuario
// es subirlos "como si fuera él", con un refresh token obtenido una sola
// vez (ver server/scripts/google-drive-authorize.mjs). google-auth-library
// (paquete oficial de Google, liviano) maneja el intercambio del refresh
// token por access tokens — reinventar eso a mano sería el mismo tipo de
// riesgo que ya llevó a usar xml-crypto en vez de firmar XML a mano en
// sunat.js. La subida en sí es un POST multipart armado a mano (mismo
// criterio que el resto del proyecto para llamadas a APIs externas, ver
// sendBillToSunat en sunat.js).
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || "";
const REFRESH_TOKEN = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "";
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";

let cachedClient = null;
let clientLoadAttempted = false;

const getClient = () => {
  if (clientLoadAttempted) return cachedClient;
  clientLoadAttempted = true;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !FOLDER_ID) {
    console.warn("Google Drive no está configurado (faltan variables de entorno) — se omite el respaldo de boletas.");
    return null;
  }
  cachedClient = new OAuth2Client({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  cachedClient.setCredentials({ refresh_token: REFRESH_TOKEN });
  return cachedClient;
};

export const isDriveConfigured = () => getClient() !== null;

// Sube un PDF a la carpeta configurada. Scope drive.file (pedido en la
// autorización única, ver el script de arriba): el token solo puede tocar
// archivos que él mismo cree o que se le compartan explícitamente.
export const uploadPdfToDrive = async (filename, buffer) => {
  const client = getClient();
  if (!client) throw new Error("Google Drive no está configurado");
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("No se pudo obtener un token de acceso de Google");

  const boundary = `chicbags-${Date.now()}`;
  const metadata = JSON.stringify({ name: filename, parents: [FOLDER_ID] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive respondió ${response.status}: ${text}`);
  }
  const json = await response.json();
  return json.id;
};
