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
      videos JSONB NOT NULL DEFAULT '[]',
      extra_description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER,
      cost NUMERIC
    );
  `);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS code TEXT;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS cost NUMERIC;`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id);`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS videos JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS extra_description TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER;`);
  // Los productos que todavía no tienen un orden manual asignado se ordenan
  // por su id, para no romper el orden actual del catálogo.
  await pool.query(`UPDATE products SET sort_order = id WHERE sort_order IS NULL;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Administrador'
    );
  `);
  // Por ahora el perfil es solo informativo (no restringe accesos dentro
  // del panel admin).
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Administrador';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);
  // Precarga la tabla con las categorías que ya estén en uso en productos
  // existentes, para no partir de una lista vacía.
  await pool.query(`
    INSERT INTO categories (name)
    SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''
    ON CONFLICT (name) DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      document_type TEXT NOT NULL,
      document_number TEXT NOT NULL,
      first_name TEXT NOT NULL,
      paternal_surname TEXT NOT NULL,
      maternal_surname TEXT NOT NULL DEFAULT '',
      mobile TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Perú',
      department TEXT NOT NULL,
      province TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '',
      delivery_type TEXT NOT NULL,
      delivery_mode TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (document_type, document_number)
    );
  `);
  // El correo se quitó del mantenimiento de clientes; se elimina también la
  // columna (y cualquier dato ya guardado) para bases de datos existentes.
  await pool.query(`ALTER TABLE customers DROP COLUMN IF EXISTS email;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';`);
  // Sede de recojo (por ahora solo tiene sentido con Shalom). Queda vacía
  // para otros tipos de delivery.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS agency TEXT NOT NULL DEFAULT '';`);
  // Dirección exacta, solo tiene sentido para los tipos de delivery
  // "motorizado" (Express y Delivery). Queda vacía para Shalom/Olva/Marvisur.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agencies (
      id SERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      department TEXT NOT NULL DEFAULT '',
      province TEXT NOT NULL DEFAULT '',
      district TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL DEFAULT '',
      UNIQUE (provider, name, district)
    );
  `);
  // Se reemplazó el campo "details" (todo junto) por columnas separadas
  // para poder mostrar la ficha de la sede igual que en la app de Shalom.
  await pool.query(`ALTER TABLE agencies DROP COLUMN IF EXISTS details;`);
  await pool.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS reference TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE agencies ADD COLUMN IF NOT EXISTS schedule TEXT NOT NULL DEFAULT '';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS districts (
      id SERIAL PRIMARY KEY,
      province TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (province, name)
    );
  `);
  // Precarga distritos ya usados por clientes existentes, para no partir
  // de una lista vacía.
  await pool.query(`
    INSERT INTO districts (province, name)
    SELECT DISTINCT province, district FROM customers WHERE district IS NOT NULL AND district != ''
    ON CONFLICT (province, name) DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      seller_id INTEGER REFERENCES users(id),
      total NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Vendedor (usuario con perfil "Vendedor") que registró el pedido.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id INTEGER REFERENCES users(id);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      product_code TEXT NOT NULL DEFAULT '',
      color_name TEXT NOT NULL,
      unit_price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal NUMERIC NOT NULL
    );
  `);
  // Código del producto al momento del pedido (como product_name/unit_price,
  // es una foto del momento: si luego cambia el código, el pedido conserva
  // el que tenía al venderse).
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_code TEXT NOT NULL DEFAULT '';`);
  // Descuento manual aplicado al ítem (en soles, tope de S/.4 validado en
  // el servidor); ya viene restado en subtotal.
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;`);
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

// Asegura que una categoría exista en la tabla de mantenimiento (sin
// distinguir mayúsculas/minúsculas). No devuelve nada: products.category
// sigue guardando el texto tal cual, esto solo mantiene la lista al día.
export const ensureCategoryExists = async (name) => {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return;
  const { rows } = await pool.query("SELECT id FROM categories WHERE lower(name) = lower($1)", [trimmed]);
  if (rows.length > 0) return;
  await pool.query("INSERT INTO categories (name) VALUES ($1)", [trimmed]);
};

// Igual que ensureCategoryExists, pero el listado de distritos es propio
// de cada provincia (dos provincias pueden tener un distrito con el mismo
// nombre sin que sea el mismo registro).
export const ensureDistrictExists = async (province, name) => {
  const trimmedProvince = (province ?? "").trim();
  const trimmedName = (name ?? "").trim();
  if (!trimmedProvince || !trimmedName) return;
  const { rows } = await pool.query(
    "SELECT id FROM districts WHERE province = $1 AND lower(name) = lower($2)",
    [trimmedProvince, trimmedName]
  );
  if (rows.length > 0) return;
  await pool.query("INSERT INTO districts (province, name) VALUES ($1, $2)", [trimmedProvince, trimmedName]);
};
