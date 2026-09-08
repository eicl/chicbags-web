// Consulta de DNI de migo.pe (docs.migo.pe/v2/dni/dni.md) — un servicio
// aparte del de WhatsApp de la misma cuenta: se autentica con un Bearer
// token distinto del apikey usado en whatsapp.js.
const MIGO_API_TOKEN = process.env.MIGO_API_TOKEN;
const MIGO_API_URL = "https://api.migo.pe";

// RENIEC (y prácticamente todo proveedor peruano de consulta de DNI)
// devuelve el nombre completo como "APELLIDO_PATERNO APELLIDO_MATERNO
// NOMBRES", todo en mayúsculas — confirmado contra la API real.
const toTitleCase = (text) =>
  text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toLocaleUpperCase("es-PE") + word.slice(1))
    .join(" ");

const splitReniecName = (nombre) => {
  const [paternalSurname = "", maternalSurname = "", ...rest] = toTitleCase(nombre.trim()).split(/\s+/);
  return { paternalSurname, maternalSurname, firstName: rest.join(" ") };
};

export const lookupDni = async (dni) => {
  if (!MIGO_API_TOKEN) return null;
  try {
    const response = await fetch(`${MIGO_API_URL}/api/v2/dni/${dni}`, {
      headers: { Authorization: `Bearer ${MIGO_API_TOKEN}`, Accept: "application/json" },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.success || !data.nombre) return null;
    return splitReniecName(data.nombre);
  } catch (err) {
    console.error("migo.pe consulta DNI falló:", err);
    return null;
  }
};
