// Autorización única para el respaldo de boletas en Google Drive (ver
// server/googleDrive.js) — obtiene un refresh token a nombre de tu cuenta
// de Google, para que las subidas cuenten contra tu Drive personal (las
// cuentas de servicio no pueden hacer esto: ver el comentario al inicio de
// googleDrive.js). Se corre una sola vez, a mano, desde tu computadora —
// no es parte del server en producción.
//
// Uso:
//   node server/scripts/google-drive-authorize.mjs <CLIENT_ID> <CLIENT_SECRET>
//
// El Client ID/Secret salen de un OAuth Client tipo "Desktop app" (Google
// Cloud Console > APIs y servicios > Credenciales) del mismo proyecto
// donde ya habilitaste la Drive API.
import { createServer } from "http";
import { OAuth2Client } from "google-auth-library";

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error("Uso: node server/scripts/google-drive-authorize.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;
const client = new OAuth2Client({ clientId, clientSecret, redirectUri });

const authUrl = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // fuerza que Google entregue refresh_token también si ya habías autorizado antes
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("Abre esta URL en tu navegador, inicia sesión con la cuenta dueña de la carpeta de Drive y acepta el permiso:\n");
console.log(authUrl);
console.log("\nEsperando la autorización...");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Falta el parámetro code");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end("<html><body><h2>Listo, ya puedes cerrar esta pestaña.</h2></body></html>");
  server.close();
  try {
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      console.warn(
        "\nGoogle no devolvió un refresh_token (probablemente ya habías autorizado esta app antes). " +
          "Ve a https://myaccount.google.com/permissions, quita el acceso a la app, y vuelve a correr este script."
      );
    } else {
      console.log("\nAutorización correcta. Guarda este valor como GOOGLE_DRIVE_REFRESH_TOKEN:\n");
      console.log(tokens.refresh_token);
    }
  } catch (err) {
    console.error("Error intercambiando el código por tokens:", err.message);
  } finally {
    process.exit(0);
  }
});

server.listen(PORT);
