import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️  DATABASE_URL no está configurado. Define esa variable de entorno " +
      "(en .env localmente, o en las env vars de Render en producción)."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export const initSchema = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image TEXT NOT NULL DEFAULT '',
      colors JSONB NOT NULL DEFAULT '[]',
      code TEXT,
      brand_id INTEGER REFERENCES brands(id),
      photos JSONB NOT NULL DEFAULT '[]',
      videos JSONB NOT NULL DEFAULT '[]'
    );
  `);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id);`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );
  `);
};

// Busca una marca por nombre (sin distinguir mayúsculas/minúsculas) o la crea
// si no existe todavía. Devuelve su id, o null si el nombre viene vacío.
export const getOrCreateBrandId = async (name) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const { rows } = await pool.query("SELECT id FROM brands WHERE lower(name) = lower($1)", [trimmed]);
  if (rows.length > 0) return rows[0].id;
  const { rows: inserted } = await pool.query(
    "INSERT INTO brands (name) VALUES ($1) RETURNING id",
    [trimmed]
  );
  return inserted[0].id;
};
