// Script de una sola vez: carga las sedes de Shalom (por ahora solo Lima,
// copiadas a mano desde el buscador de agencias de Shalom) en la tabla
// `agencies`. El archivo fuente (server/shalom-lima.txt) llegó con mojibake
// clásico (UTF-8 reinterpretado como Latin-1: "Cañete" -> "CaÃ±ete"), que se
// revierte reinterpretando el texto como Latin-1 y reconvirtiéndolo a UTF-8.
//
// Uso: node server/import-shalom-agencies.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import { pool, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROVIDER = "Shalom";

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

// Cada registro tiene el nombre en la línea anterior a "Disponible", seguido
// de una línea de ubicación ("Depto · Distrito" o "Depto · Provincia ·
// Distrito") y 0+ líneas más, identificables por su prefijo: "Ref:",
// "Tel:" y "L-S:" (horario). La única línea sin prefijo (si existe) es la
// dirección.
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
    const locationLine = rest[0] ?? "";
    const parts = locationLine.split("·").map((p) => p.trim()).filter(Boolean);

    let department = "";
    let province = "";
    let district = "";
    if (parts.length === 2) {
      // "Lima · Cercado Lima" -> la provincia metropolitana es la misma
      // que el departamento (así se organiza también el ubigeo oficial).
      [department, district] = parts;
      province = department;
    } else if (parts.length >= 3) {
      [department, province, district] = parts;
    } else if (parts.length === 1) {
      department = parts[0];
    }

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
  const filePath = path.join(__dirname, "shalom-lima.txt");
  const raw = fs.readFileSync(filePath, "utf8");
  const records = parseAgencies(raw);
  console.log(`Sedes parseadas: ${records.length}`);

  await initSchema();

  // Recarga completa: se borra lo anterior de este provider y se inserta
  // todo de nuevo, así el script sigue siendo seguro de re-ejecutar aunque
  // cambie el formato de las columnas.
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
  const { rows: after } = await pool.query("SELECT 1 FROM agencies WHERE provider = $1", [PROVIDER]);

  console.log(`Sedes de ${PROVIDER} insertadas: ${after.length}`);

  const { rows: sample } = await pool.query(
    "SELECT name, department, province, district, address, reference, phone, schedule FROM agencies WHERE provider = $1 AND name ILIKE '%ñ%' LIMIT 3",
    [PROVIDER]
  );
  console.log("\nEjemplos con Ñ (verifica el fix de encoding y los campos separados):");
  for (const r of sample) console.log(r);

  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
