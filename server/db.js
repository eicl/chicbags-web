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
  // Servicios: mantenimiento aparte, mucho más simple que productos (sin
  // colores, categorías, marca, stock ni fotos).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      code TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price NUMERIC NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price NUMERIC NOT NULL,
      categories JSONB NOT NULL DEFAULT '[]',
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
  // Un producto puede tener varias categorías: la columna "category" (texto
  // único) pasa a "categories" (arreglo). Se migra el valor existente a la
  // nueva columna y recién ahí se borra la vieja — solo corre una vez,
  // porque después "category" ya no existe.
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]';`);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category') THEN
        UPDATE products SET categories = jsonb_build_array(category)
        WHERE categories = '[]'::jsonb AND category IS NOT NULL AND category != '';
        ALTER TABLE products DROP COLUMN category;
      END IF;
    END $$;
  `);
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
    SELECT DISTINCT value FROM products, jsonb_array_elements_text(categories) AS value
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
  // El registro rápido de cliente desde Regularización de Separaciones no
  // pide documento, así que puede haber varios clientes con document_number
  // vacío — la UNIQUE (document_type, document_number) original chocaría
  // entre ellos. Se reemplaza por un índice único parcial que solo exige
  // unicidad cuando sí hay número de documento.
  await pool.query(`ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_document_type_document_number_key;`);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS customers_document_unique
    ON customers (document_type, document_number)
    WHERE document_number <> '';
  `);
  // Le permite al cliente crear una cuenta (con contraseña) para iniciar
  // sesión en la tienda y dejar valoraciones. Null para los clientes que
  // solo existen porque un vendedor los registró — nunca se creó cuenta.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
  // Ubicación GPS capturada por el cliente al registrarse desde el link
  // público con un tipo de delivery "motorizado" (obligatoria en ese caso).
  // Null para los demás tipos de delivery o clientes registrados antes de
  // este campo.
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
  // Un pedido de Regularización de Separaciones se guarda en la misma tabla
  // que uno normal (mismo ciclo de vida, mismos pagos), solo que su tipo
  // queda marcado así para distinguirlo — es el único que puede tener ítems
  // sin product_id y no descuenta stock al registrarse.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Pedido';`);
  // Ciclo de vida del pedido: arranca en "Registrado"; al registrar un pago
  // pasa a "Pendiente de envío" (si lo pagado cubre el total) o a
  // "Separación" (si es un pago parcial). separation_deadline se fija una
  // sola vez, la primera vez que entra a "Separación" (15 días calendario
  // desde ese momento), y no se vuelve a mover con pagos parciales
  // posteriores.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Registrado';`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS separation_deadline TIMESTAMPTZ;`);
  // Tipo de cobro: "Normal" (por defecto) o "Contraentrega" — este último
  // solo tiene sentido para delivery "Motorizado Delivery", y permite que
  // el pedido pase a "Pendiente de envío" aunque tenga saldo pendiente,
  // porque el motorizado cobra el resto al entregar.
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS charge_type TEXT NOT NULL DEFAULT 'Normal';`);
  // Recibo del envío (foto/captura del comprobante de la agencia) y clave de
  // rastreo opcional — solo tienen sentido para delivery Shalom/Olva/
  // Marvisur. Mientras no haya recibo, esos pedidos no pueden pasar a
  // "Entregado a delivery" (ver PUT /api/orders/:id/deliver).
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_image TEXT NOT NULL DEFAULT '';`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_code TEXT NOT NULL DEFAULT '';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      operation_number TEXT NOT NULL DEFAULT '',
      proof_image TEXT NOT NULL DEFAULT '',
      registered_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
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
  // La regularización de Separaciones (pedidos históricos que no pasan por
  // el flujo normal) permite ítems que no corresponden a ningún producto
  // del catálogo, así que product_id queda opcional para esos casos.
  await pool.query(`ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;`);
  // Un ítem de pedido es un producto (product_id) o un servicio (service_id)
  // — nunca los dos. Los servicios no tienen color, así que ahí color_name
  // queda vacío.
  await pool.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES services(id);`);

  // Cada vez que se genera el Excel de Pitaya queda una fila acá — nombre
  // del reporte, nombre del archivo generado y cuándo. Sirve para volver a
  // descargar un reporte ya generado sin tener que rearmarlo desde cero.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_generations (
      id SERIAL PRIMARY KEY,
      report_name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Una fila por pedido ya incluido en algún reporte de envíos (por ahora
  // solo Pitaya) — guarda una foto de los datos tal como salieron en ese
  // momento (igual que product_name/unit_price en order_items), para que
  // volver a descargar un reporte viejo muestre lo mismo que se generó esa
  // vez, aunque el pedido o el cliente hayan cambiado después. También
  // evita que un mismo pedido salga dos veces en generaciones distintas.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      report_id INTEGER NOT NULL REFERENCES report_generations(id) ON DELETE CASCADE,
      fecha_compra TEXT NOT NULL,
      monto NUMERIC NOT NULL,
      situacion_pago TEXT NOT NULL,
      nombre TEXT NOT NULL,
      celular TEXT NOT NULL,
      producto TEXT NOT NULL,
      fecha_entrega TEXT NOT NULL,
      direccion TEXT NOT NULL,
      distrito TEXT NOT NULL,
      maps TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // El código (E0000021, E0000022...) sale del id de shipments — arranca en
  // 21 para seguir la numeración manual que ya llevaban (el último a mano
  // fue E0000020). Solo se toca mientras la tabla esté vacía, así que en
  // cuanto se genere el primer envío esto deja de aplicar.
  await pool.query(`
    DO $do$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM shipments) THEN
        PERFORM setval('shipments_id_seq', 20, true);
      END IF;
    END $do$;
  `);

  // Fila única de configuración general, editable desde Admin >
  // Configuración: tope de descuento manual por ítem al registrar un
  // pedido (uno para el link público sin sesión, otro más alto con sesión
  // de admin), el plazo de separación (días calendario para cancelar un
  // pedido en "Separación" antes de que se cumpla) y a cuántos días de ese
  // plazo se enciende la bandera de alerta en el panel de Pedidos.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      max_item_discount_public NUMERIC NOT NULL DEFAULT 4,
      max_item_discount_admin NUMERIC NOT NULL DEFAULT 10,
      CONSTRAINT settings_singleton CHECK (id = 1)
    );
  `);
  await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS separation_days NUMERIC NOT NULL DEFAULT 15;`);
  await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS near_separation_deadline_days NUMERIC NOT NULL DEFAULT 13;`);
  await pool.query(`INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);

  // Título y descripción que se muestran al compartir cada link (ej. por
  // WhatsApp) — editables desde el panel. La imagen y a qué ruta aplica
  // cada fila siguen fijas en el código (server/index.js), solo el texto
  // es configurable acá.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS route_meta (
      route_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);
  await pool.query(`
    INSERT INTO route_meta (route_key, title, description) VALUES
      ('default', 'ChicBags', 'Tu tienda de confianza'),
      ('registro-pedido', 'Registrar pedido - ChicBags', 'Busca al cliente, agrega los productos y registra su pedido.'),
      ('registro-cliente', 'Regístrate como cliente - ChicBags', 'Completa tus datos para que podamos atenderte y coordinar tus envíos.'),
      ('regularizacion-separaciones', 'Regularización de Separaciones - ChicBags', 'Registra pedidos históricos sin descontar stock, con precio editable y registro de cliente si hace falta.'),
      ('catalogo', 'Catálogo - ChicBags', 'Aquí podrás ver todas nuestras hermosas carteras.')
    ON CONFLICT (route_key) DO NOTHING;
  `);

  // Registro de Compras (efectos contables): cada fila es un comprobante de
  // compra (factura/boleta/etc.) con su proveedor, montos y una foto del
  // recibo. purchase_date se guarda en UTC medianoche, mismo criterio que
  // separation_deadline — para mostrarla hay que leerla también en UTC.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      purchase_date TIMESTAMPTZ NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'Factura',
      document_number TEXT NOT NULL DEFAULT '',
      supplier_name TEXT NOT NULL,
      supplier_ruc TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      subtotal NUMERIC NOT NULL DEFAULT 0,
      igv NUMERIC NOT NULL DEFAULT 0,
      total NUMERIC NOT NULL,
      receipt_image TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Plantillas de los mensajes que se abren en WhatsApp (registro de
  // pedido, aviso de estado, registro de cliente) — editables desde el
  // panel. Las variables {{...}} se reemplazan en el navegador al armar el
  // link, no acá; esta tabla solo guarda el texto tal cual se escribe.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_templates (
      template_key TEXT PRIMARY KEY,
      template TEXT NOT NULL
    );
  `);
  await pool.query(`
    INSERT INTO message_templates (template_key, template) VALUES
      ('order_registration', 'Hola {{cliente}}, tu pedido #{{pedido}} fue registrado el {{fecha}}:

{{items}}

Total: S/.{{total}}

{{estado_texto}}'),
      ('order_status_update', 'Hola {{cliente}}, novedades de tu pedido #{{pedido}}:

{{items}}

{{estado_texto}}'),
      ('customer_registration', 'Hola, soy {{cliente}} {{apellido}}, acabo de registrarme. Mi código de cliente es #{{codigo}}. Aquí está el link para registrar mi pedido: {{link}}')
    ON CONFLICT (template_key) DO NOTHING;
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

// Asegura que una categoría exista en la tabla de mantenimiento (sin
// distinguir mayúsculas/minúsculas). No devuelve nada: products.categories
// sigue guardando el texto tal cual (un producto puede estar en varias),
// esto solo mantiene la lista de sugerencias al día.
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
