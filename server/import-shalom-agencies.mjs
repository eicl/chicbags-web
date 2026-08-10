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

const fixMojibake = (s) => Buffer.from(s, "latin1").toString("utf8");

// Cada registro tiene el nombre en la línea anterior a "Disponible", seguido
// de una línea de ubicación ("Depto · Distrito" o "Depto · Provincia ·
// Distrito") y 0+ líneas de dirección/referencia/teléfono/horario, que se
// guardan tal cual como texto libre en `details`.
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
    // rest[0] es la línea de ubicación; el resto son dirección/ref/tel/horario.
    const locationLine = rest[0] ?? "";
    const details = rest.slice(1).join(" | ");
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

    if (name && district) {
      records.push({ name, department, province, district, details });
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

  const names = [];
  const departments = [];
  const provinces = [];
  const districts = [];
  const detailsList = [];
  for (const r of records) {
    names.push(r.name);
    departments.push(r.department);
    provinces.push(r.province);
    districts.push(r.district);
    detailsList.push(r.details);
  }

  const { rows: before } = await pool.query("SELECT 1 FROM agencies WHERE provider = $1", [PROVIDER]);
  await pool.query(
    `INSERT INTO agencies (provider, name, department, province, district, details)
     SELECT $1, * FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
     AS t(name, department, province, district, details)
     ON CONFLICT (provider, name, district) DO NOTHING`,
    [PROVIDER, names, departments, provinces, districts, detailsList]
  );
  const { rows: after } = await pool.query("SELECT 1 FROM agencies WHERE provider = $1", [PROVIDER]);

  console.log(`Sedes de ${PROVIDER} en BD: ${before.length} -> ${after.length} (nuevas: ${after.length - before.length})`);

  const { rows: sample } = await pool.query(
    "SELECT name, department, province, district FROM agencies WHERE provider = $1 AND name ILIKE '%ñ%' LIMIT 5",
    [PROVIDER]
  );
  console.log("\nEjemplos con Ñ (verifica el fix de encoding):");
  for (const r of sample) console.log(`  - ${r.name} (${r.district}, ${r.province})`);

  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
