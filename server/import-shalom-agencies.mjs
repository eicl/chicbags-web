// Script de una sola vez (re-ejecutable): carga las sedes de Shalom en la
// tabla `agencies`, a partir de archivos server/shalom-<ciudad>.txt copiados
// a mano desde el buscador de agencias de Shalom. Cada vez que se agregue
// una ciudad nueva, se guarda el archivo con ese mismo patrón de nombre y
// se agrega a SOURCE_FILES.
//
// Los archivos llegan con mojibake clásico (UTF-8 reinterpretado como
// Latin-1: "Cañete" -> "CaÃ±ete"), que se revierte reinterpretando el texto
// como Latin-1 y reconvirtiéndolo a UTF-8.
//
// Uso: node server/import-shalom-agencies.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { pool, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER = "Shalom";

const SOURCE_FILES = ["shalom-lima.txt", "shalom-arequipa.txt", "shalom-la-libertad.txt", "shalom-piura.txt"];

// Copia de src/lib/peru-locations.ts (departamento -> provincias). Se usa
// solo para decidir, en una línea de ubicación de 2 partes ("Depto · X"),
// si X es en realidad una provincia (con distrito capital del mismo
// nombre, como "Huaral" o "Islay") o un distrito dentro de la provincia
// metropolitana que comparte nombre con el departamento (como "Lima").
const PERU_LOCATIONS = {
  Amazonas: ["Chachapoyas", "Bagua", "Bongará", "Condorcanqui", "Luya", "Rodríguez de Mendoza", "Utcubamba"],
  Áncash: [
    "Huaraz", "Aija", "Antonio Raymondi", "Asunción", "Bolognesi", "Carhuaz", "Carlos Fermín Fitzcarrald",
    "Casma", "Corongo", "Huari", "Huarmey", "Huaylas", "Mariscal Luzuriaga", "Ocros", "Pallasca", "Pomabamba",
    "Recuay", "Santa", "Sihuas", "Yungay",
  ],
  Apurímac: ["Abancay", "Andahuaylas", "Antabamba", "Aymaraes", "Cotabambas", "Chincheros", "Grau"],
  Arequipa: ["Arequipa", "Camaná", "Caravelí", "Castilla", "Caylloma", "Condesuyos", "Islay", "La Unión"],
  Ayacucho: [
    "Huamanga", "Cangallo", "Huanca Sancos", "Huanta", "La Mar", "Lucanas", "Parinacochas",
    "Páucar del Sara Sara", "Sucre", "Víctor Fajardo", "Vilcas Huamán",
  ],
  Cajamarca: [
    "Cajamarca", "Cajabamba", "Celendín", "Chota", "Contumazá", "Cutervo", "Hualgayoc", "Jaén",
    "San Ignacio", "San Marcos", "San Miguel", "San Pablo", "Santa Cruz",
  ],
  Callao: ["Callao"],
  Cusco: [
    "Cusco", "Acomayo", "Anta", "Calca", "Canas", "Canchis", "Chumbivilcas", "Espinar",
    "La Convención", "Paruro", "Paucartambo", "Quispicanchi", "Urubamba",
  ],
  Huancavelica: ["Huancavelica", "Acobamba", "Angaraes", "Castrovirreyna", "Churcampa", "Huaytará", "Tayacaja"],
  Huánuco: [
    "Huánuco", "Ambo", "Dos de Mayo", "Huacaybamba", "Huamalíes", "Leoncio Prado", "Marañón",
    "Pachitea", "Puerto Inca", "Lauricocha", "Yarowilca",
  ],
  Ica: ["Ica", "Chincha", "Nazca", "Palpa", "Pisco"],
  Junín: ["Huancayo", "Concepción", "Chanchamayo", "Jauja", "Junín", "Satipo", "Tarma", "Yauli", "Chupaca"],
  "La Libertad": [
    "Trujillo", "Ascope", "Bolívar", "Chepén", "Julcán", "Otuzco", "Pacasmayo", "Pataz",
    "Sánchez Carrión", "Santiago de Chuco", "Gran Chimú", "Virú",
  ],
  Lambayeque: ["Chiclayo", "Ferreñafe", "Lambayeque"],
  Lima: ["Lima", "Barranca", "Cajatambo", "Canta", "Cañete", "Huaral", "Huarochirí", "Huaura", "Oyón", "Yauyos"],
  Loreto: [
    "Maynas", "Alto Amazonas", "Loreto", "Mariscal Ramón Castilla", "Requena", "Ucayali",
    "Datem del Marañón", "Putumayo",
  ],
  "Madre de Dios": ["Tambopata", "Manu", "Tahuamanu"],
  Moquegua: ["Mariscal Nieto", "General Sánchez Cerro", "Ilo"],
  Pasco: ["Pasco", "Daniel Alcides Carrión", "Oxapampa"],
  Piura: ["Piura", "Ayabaca", "Huancabamba", "Morropón", "Paita", "Sullana", "Talara", "Sechura"],
  Puno: [
    "Puno", "Azángaro", "Carabaya", "Chucuito", "El Collao", "Huancané", "Lampa", "Melgar",
    "Moho", "San Antonio de Putina", "San Román", "Sandia", "Yunguyo",
  ],
  "San Martín": [
    "Moyobamba", "Bellavista", "El Dorado", "Huallaga", "Lamas", "Mariscal Cáceres",
    "Picota", "Rioja", "San Martín", "Tocache",
  ],
  Tacna: ["Tacna", "Candarave", "Jorge Basadre", "Tarata"],
  Tumbes: ["Tumbes", "Contralmirante Villar", "Zarumilla"],
  Ucayali: ["Coronel Portillo", "Atalaya", "Padre Abad", "Purús"],
};

// Un puñado de nombres perdieron una vocal con tilde por completo (no solo
// el acento, la letra entera) porque el byte que la identificaba nunca
// llegó al archivo fuente — no hay forma de reconstruirla automáticamente.
// Se corrigen a mano una vez identificadas.
const KNOWN_NAME_FIXES = {
  "valo Mariategui": "Ovalo Mariategui",
};

const fixMojibake = (s) => Buffer.from(s, "latin1").toString("utf8");

// Solo el nombre de la sede se muestra sin tildes en vocales (á é í ó ú),
// para que sea más fácil de escribir/filtrar. La ñ NO es un acento (es otra
// letra), así que se conserva: "Cañete" sigue siendo "Cañete".
const stripVowelAccents = (s) => s.normalize("NFD").replace(/́/g, "").normalize("NFC");

// Algunos caracteres especiales del texto original (guiones —/–, comillas
// tipograficas “ ”) se perdieron al copiar: sus bytes UTF-8 intermedios caian
// en el rango de control C1 y quedaron invisibles, dejando un unico byte
// huerfano que se convierte en U+FFFD al reinterpretar como Latin-1. Al
// final de una frase truncada ("Ref: ... algo…") se restituye como "…"; en
// medio de una frase se reemplaza por un guion legible.
const cleanText = (s) => s.replace(/�+$/g, "…").replace(/�/g, "-");

// Para comparar nombres de provincia sin importar tildes/ñ/mayúsculas
// (Shalom no siempre coincide letra por letra con el nombre oficial).
const foldAscii = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// Resuelve departamento/provincia/distrito de una línea de ubicación como
// "Arequipa", "Lima · Cercado Lima" o "Arequipa · Caraveli · Chala".
// Con 2 partes, la segunda puede ser un distrito de la provincia
// metropolitana (que comparte nombre con el departamento, como en "Lima ·
// Cercado Lima") o directamente el nombre de OTRA provincia mostrada sin
// su distrito capital (como "Lima · Huaral" o "Arequipa · Islay") — en ese
// caso se asume que el distrito capital comparte el nombre de la provincia.
const resolveLocation = (locationLine) => {
  const parts = locationLine.split("·").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const [department, province, district] = parts;
    return { department, province, district };
  }
  if (parts.length === 2) {
    const [department, second] = parts;
    const provinces = PERU_LOCATIONS[department] ?? [];
    const isOtherProvince = provinces.some((p) => foldAscii(p) === foldAscii(second));
    if (isOtherProvince) return { department, province: second, district: second };
    return { department, province: department, district: second };
  }
  if (parts.length === 1) {
    const [department] = parts;
    return { department, province: department, district: department };
  }
  return { department: "", province: "", district: "" };
};

// Cada registro tiene el nombre en la línea anterior a "Disponible", seguido
// de una línea de ubicación y 0+ líneas más, identificables por su prefijo:
// "Ref:", "Tel:" y "L-S:" (horario). La única línea sin prefijo (si existe)
// es la dirección.
const parseAgencies = (raw) => {
  const lines = fixMojibake(raw)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const records = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "Disponible") continue;
    const name = lines[i - 1];
    let j = i + 1;
    const rest = [];
    while (j < lines.length && !(lines[j + 1] === "Disponible")) {
      rest.push(lines[j]);
      j++;
    }
    const { department, province, district } = resolveLocation(rest[0] ?? "");

    let address = "";
    let reference = "";
    let phone = "";
    let schedule = "";
    for (const line of rest.slice(1)) {
      if (line.startsWith("Ref:")) reference = cleanText(line.replace(/^Ref:\s*/, ""));
      else if (line.startsWith("Tel:")) phone = line.replace(/^Tel:\s*/, "");
      else if (line.startsWith("L-S:") || line.startsWith("L-D:")) schedule = line.replace(/^L-[SD]:\s*/, "");
      else if (!address) address = cleanText(line);
    }

    if (name && district) {
      // Un byte huérfano suelto en el nombre (ver cleanText) es casi
      // siempre una vocal con tilde mayúscula perdida; como los nombres ya
      // van sin tildes, se elimina, salvo que se haya identificado y
      // corregido a mano en KNOWN_NAME_FIXES.
      let cleanName = stripVowelAccents(name.replace(/�/g, ""));
      cleanName = KNOWN_NAME_FIXES[cleanName] ?? cleanName;
      records.push({ name: cleanName, department, province, district, address, reference, phone, schedule });
    }
    i = j - 1;
  }
  return records;
};

const main = async () => {
  const records = [];
  for (const fileName of SOURCE_FILES) {
    const filePath = path.join(__dirname, fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`(omitido, no existe) ${fileName}`);
      continue;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parseAgencies(raw);
    console.log(`${fileName}: ${parsed.length} sedes`);
    records.push(...parsed);
  }
  console.log(`Total de sedes parseadas: ${records.length}`);

  await initSchema();

  // Recarga completa: se borra lo anterior de este provider y se inserta
  // todo de nuevo, así el script sigue siendo seguro de re-ejecutar aunque
  // cambie el formato de las columnas o se agreguen más ciudades.
  const { rowCount: deleted } = await pool.query("DELETE FROM agencies WHERE provider = $1", [PROVIDER]);
  console.log(`Sedes de ${PROVIDER} anteriores borradas: ${deleted}`);

  const names = [];
  const departments = [];
  const provinces = [];
  const districts = [];
  const addresses = [];
  const references = [];
  const phones = [];
  const schedules = [];
  for (const r of records) {
    names.push(r.name);
    departments.push(r.department);
    provinces.push(r.province);
    districts.push(r.district);
    addresses.push(r.address);
    references.push(r.reference);
    phones.push(r.phone);
    schedules.push(r.schedule);
  }

  await pool.query(
    `INSERT INTO agencies (provider, name, department, province, district, address, reference, phone, schedule)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
     AS t(name, department, province, district, address, reference, phone, schedule)
     ON CONFLICT (provider, name, district) DO NOTHING`,
    [PROVIDER, names, departments, provinces, districts, addresses, references, phones, schedules]
  );
  const { rows: after } = await pool.query(
    "SELECT department, count(*)::int AS c FROM agencies WHERE provider = $1 GROUP BY department ORDER BY department",
    [PROVIDER]
  );

  console.log(`\nSedes de ${PROVIDER} insertadas por departamento:`);
  for (const r of after) console.log(`  ${r.department}: ${r.c}`);

  const { rows: sample } = await pool.query(
    "SELECT name, department, province, district FROM agencies WHERE provider = $1 AND (name ILIKE '%ñ%' OR district IN ('Huaral', 'Islay', 'Camaná', 'Camana')) LIMIT 8",
    [PROVIDER]
  );
  console.log("\nEjemplos a revisar (Ñ y provincias-capital como distrito):");
  for (const r of sample) console.log(`  - ${r.name} (${r.department} · ${r.province} · ${r.district})`);

  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
