// Script de una sola vez: carga los distritos oficiales del Perú (INEI) desde
// server/ubigeo.csv en la tabla `districts`, usando como referencia de
// provincias/departamentos la misma lista que ya usa el frontend
// (src/lib/peru-locations.ts) para no romper los registros existentes.
//
// Uso: node server/import-ubigeo.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { pool, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Copia de src/lib/peru-locations.ts (departamento -> provincias), con la
// grafía correcta (tildes/ñ) que ya usan los clientes existentes en BD.
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

// El CSV oficial (INEI) llegó con un mojibake: cada letra Latin-1 (Ñ, Á, etc,
// U+00C0-U+00FF) se codificó en UTF-8 (2 bytes, el primero siempre 0xC3) y
// esos 2 bytes se reinterpretaron cada uno como un codepoint aparte: 0xC3
// se ve como "Ã" y el segundo byte (0x80-0xBF) queda como un carácter de
// control invisible (U+0080-U+009F). Reemplazar solo "Ã" por "Ñ" deja
// pegado ese carácter invisible y rompe cualquier comparación (verificado
// con NEPEÃA -> Nepeña, CAÃETE -> Cañete, y con un caso de Á:
// ASHÃ\x81NINKA -> Asháninka). El fix real: tomar los 2 bytes originales y
// decodificarlos como UTF-8.
const MOJIBAKE_RE = new RegExp(String.fromCharCode(0xc3) + "[\u0080-\u009f]", "g");
const fixMojibake = (s) =>
  s.replace(MOJIBAKE_RE, (match) => Buffer.from([0xc3, match.codePointAt(1)]).toString("utf8"));

// Quita tildes/diéresis/ñ para poder comparar sin importar la grafía exacta.
const DIACRITICS_RE = new RegExp("[̀-ͯ]", "g");
const foldAscii = (s) => s.normalize("NFD").replace(DIACRITICS_RE, "").toUpperCase().trim();

const LOWERCASE_WORDS = new Set(["de", "del", "la", "las", "los", "y", "el", "en"]);
const titleCaseEs = (s) =>
  s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word, i) => {
      if (i > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word
        .split("-")
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-");
    })
    .join(" ");

// Mapa provincia-normalizada -> grafía canónica usada en PERU_LOCATIONS.
const provinceByFold = new Map();
for (const provinces of Object.values(PERU_LOCATIONS)) {
  for (const p of provinces) provinceByFold.set(foldAscii(p), p);
}

const parseCsv = (raw) => {
  const text = raw.replace(/^﻿/, "").replace(/^ï»¿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const [, ...rows] = lines; // descarta encabezado
  return rows.map((line) => {
    const cols = line.split(";");
    return {
      departamento: cols[4],
      provincia: cols[6],
      distrito: cols[7],
    };
  });
};

const main = async () => {
  const csvPath = path.join(__dirname, "ubigeo.csv");
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  console.log(`Filas leídas del CSV: ${rows.length}`);

  const unmatchedProvinces = new Set();
  const pairs = new Map(); // "province|foldedName" -> { province, name }

  for (const row of rows) {
    const provinciaFixed = fixMojibake(row.provincia || "").trim();
    const distritoFixed = fixMojibake(row.distrito || "").trim();
    if (!provinciaFixed || !distritoFixed) continue;

    const canonicalProvince = provinceByFold.get(foldAscii(provinciaFixed));
    if (!canonicalProvince) {
      unmatchedProvinces.add(`${provinciaFixed} (depto: ${fixMojibake(row.departamento || "")})`);
      continue;
    }

    const name = titleCaseEs(distritoFixed);
    const key = `${canonicalProvince}|${foldAscii(name)}`;
    if (!pairs.has(key)) pairs.set(key, { province: canonicalProvince, name });
  }

  if (unmatchedProvinces.size > 0) {
    console.log(`\n⚠️  Provincias del CSV sin coincidencia en peru-locations.ts (${unmatchedProvinces.size}):`);
    for (const p of unmatchedProvinces) console.log("  -", p);
  }

  console.log(`\nDistritos únicos a insertar: ${pairs.size}`);

  await initSchema();

  const provinces = [];
  const names = [];
  for (const { province, name } of pairs.values()) {
    provinces.push(province);
    names.push(name);
  }

  const { rowCount: before } = await pool.query("SELECT 1 FROM districts");
  await pool.query(
    `INSERT INTO districts (province, name)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT (province, name) DO NOTHING`,
    [provinces, names]
  );
  const { rowCount: after } = await pool.query("SELECT 1 FROM districts");

  console.log(`\nDistritos en BD: ${before} -> ${after} (nuevos: ${after - before})`);

  // Verificación rápida: nombres con Ñ que confirman el fix de mojibake, y
  // que no quedó ningún carácter de control invisible pegado.
  const { rows: sample } = await pool.query(
    "SELECT province, name FROM districts WHERE name ILIKE '%ñ%' ORDER BY name LIMIT 8"
  );
  console.log("\nEjemplos con Ñ (verifica el fix de encoding):");
  for (const r of sample) {
    const codepoints = [...r.name].map((c) => c.codePointAt(0).toString(16)).join(" ");
    console.log(`  - ${r.name} (${r.province}) [${codepoints}]`);
  }

  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
