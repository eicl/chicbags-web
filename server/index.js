import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import ExcelJS from "exceljs";
import { mkdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, initSchema, getOrCreateBrandId, ensureCategoryExists, ensureDistrictExists } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Las imágenes viven dentro del frontend (carpeta public/) para que Vite
// las sirva directamente en desarrollo; el backend solo guarda el nombre
// de archivo y las sirve él mismo cuando corre en producción.
const IMAGES_DIR = path.join(__dirname, "..", "public", "product-images");
const DIST_DIR = path.join(__dirname, "..", "dist");
await mkdir(IMAGES_DIR, { recursive: true });

await initSchema();

const isProd = process.env.NODE_ENV === "production";
const COOKIE_NAME = "nc_admin_token";
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "⚠️  JWT_SECRET no está configurado. Define esa variable de entorno " +
      "(en .env localmente, o en las env vars de Render en producción)."
  );
}

// Crea el usuario admin la primera vez que arranca el servidor, si todavía
// no existe ningún usuario en la base de datos. Las credenciales salen de
// variables de entorno, nunca quedan escritas en el código.
const bootstrapAdminUser = async () => {
  const { rows } = await pool.query("SELECT 1 FROM users LIMIT 1");
  if (rows.length > 0) return;
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(`⚠️  Usando contraseña de admin por defecto ("${password}"). Define ADMIN_PASSWORD.`);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query("INSERT INTO users (username, password_hash) VALUES ($1, $2)", [username, passwordHash]);
  console.log(`Usuario admin "${username}" creado.`);
};
await bootstrapAdminUser();

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use("/product-images", express.static(IMAGES_DIR));

const signToken = (username) => jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: "7d" });

const requireAuth = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "No autorizado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
};

// A diferencia del stock, el costo es información comercial sensible
// (revela el margen exacto), así que nunca debe llegar a un visitante no
// autenticado aunque use el mismo endpoint público de productos.
const isAuthenticated = (req) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
};

const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query("SELECT username, password_hash FROM users WHERE username = $1", [username]);
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password || "", user.password_hash));
  if (!valid) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  setAuthCookie(res, signToken(user.username));
  res.json({ username: user.username });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ username: req.user.sub });
});

// Sesión de CLIENTE (para iniciar sesión en la tienda y dejar valoraciones):
// va en una cookie separada de la de admin, así un mismo navegador puede
// tener las dos sesiones a la vez sin pisarse.
const CUSTOMER_COOKIE_NAME = "nc_customer_token";

const signCustomerToken = (customerId) => jwt.sign({ sub: String(customerId) }, JWT_SECRET, { expiresIn: "30d" });

const setCustomerAuthCookie = (res, token) => {
  res.cookie(CUSTOMER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const requireCustomerAuth = (req, res, next) => {
  const token = req.cookies[CUSTOMER_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Inicia sesión para continuar" });
  try {
    req.customerId = Number(jwt.verify(token, JWT_SECRET).sub);
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Solo se permiten imágenes"));
    cb(null, true);
  },
});

app.post("/api/upload", requireAuth, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen" });
  res.json({ filename: req.file.filename });
});

// Sin requireAuth: el registro de pagos también se hace desde el link
// público de registro de pedido, así que la captura del pago debe poder
// subirse sin sesión de admin.
app.post("/api/upload-payment-proof", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen" });
  res.json({ filename: req.file.filename });
});

const uploadVideo = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) return cb(new Error("Solo se permiten videos"));
    cb(null, true);
  },
});

app.post("/api/upload-video", requireAuth, uploadVideo.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún video" });
  res.json({ filename: req.file.filename });
});

const PRODUCTS_SELECT = `
  SELECT p.*, b.name AS brand
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
`;

const mapProduct = (row, includeCost) => ({
  id: row.id,
  name: row.name,
  price: Number(row.price),
  categories: row.categories,
  description: row.description,
  image: row.image,
  colors: row.colors,
  code: row.code,
  brand: row.brand,
  photos: row.photos,
  videos: row.videos,
  extraDescription: row.extra_description,
  sortOrder: row.sort_order,
  ...(includeCost ? { cost: row.cost === null ? null : Number(row.cost) } : {}),
});

const MAX_PHOTOS = 5;
const MAX_VIDEOS = 2;

const validateMedia = (photos, videos) => {
  if (Array.isArray(photos) && photos.length > MAX_PHOTOS) {
    return `Máximo ${MAX_PHOTOS} fotos por producto`;
  }
  if (Array.isArray(videos) && videos.length > MAX_VIDEOS) {
    return `Máximo ${MAX_VIDEOS} videos por producto`;
  }
  return null;
};

app.get("/api/products", async (req, res) => {
  const includeCost = isAuthenticated(req);
  const { rows } = await pool.query(`${PRODUCTS_SELECT} ORDER BY p.sort_order, p.id`);
  res.json(rows.map((row) => mapProduct(row, includeCost)));
});

app.get("/api/categories", async (req, res) => {
  const { rows } = await pool.query("SELECT id, name FROM categories ORDER BY name");
  res.json(rows);
});

app.post("/api/categories", requireAuth, async (req, res) => {
  const name = (req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: existing } = await pool.query("SELECT id FROM categories WHERE lower(name) = lower($1)", [name]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
  const { rows } = await pool.query("INSERT INTO categories (name) VALUES ($1) RETURNING id, name", [name]);
  res.status(201).json(rows[0]);
});

app.put("/api/categories/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: existing } = await pool.query("SELECT id, name FROM categories WHERE lower(name) = lower($1) AND id != $2", [name, id]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe una categoría con ese nombre" });
  const { rows: current } = await pool.query("SELECT name FROM categories WHERE id = $1", [id]);
  if (current.length === 0) return res.status(404).json({ error: "Categoría no encontrada" });
  // Un array jsonb "contiene" un escalar cuando ese escalar es uno de sus
  // elementos, así que @> con to_jsonb($2) alcanza para el filtro.
  await pool.query(
    `UPDATE products SET categories = (
       SELECT jsonb_agg(CASE WHEN value = $2 THEN $1 ELSE value END)
       FROM jsonb_array_elements_text(categories) AS value
     ) WHERE categories @> to_jsonb($2::text)`,
    [name, current[0].name]
  );
  const { rows } = await pool.query("UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
  res.json(rows[0]);
});

app.delete("/api/categories/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: current } = await pool.query("SELECT name FROM categories WHERE id = $1", [id]);
  if (current.length === 0) return res.status(404).json({ error: "Categoría no encontrada" });
  const { rows: inUse } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM products WHERE categories @> to_jsonb($1::text)",
    [current[0].name]
  );
  if (inUse[0].count > 0) {
    return res.status(409).json({ error: "No puedes eliminar una categoría que está en uso por productos" });
  }
  await pool.query("DELETE FROM categories WHERE id = $1", [id]);
  res.status(204).end();
});

// Los distritos son propios de cada provincia (no hay una lista oficial
// cargada), así que siempre se filtran/gestionan con ?province=.
app.get("/api/districts", async (req, res) => {
  const province = (req.query.province ?? "").toString();
  if (!province) return res.json([]);
  const { rows } = await pool.query("SELECT id, name FROM districts WHERE province = $1 ORDER BY name", [province]);
  res.json(rows);
});

app.post("/api/districts", requireAuth, async (req, res) => {
  const province = (req.body.province ?? "").trim();
  const name = (req.body.name ?? "").trim();
  if (!province) return res.status(400).json({ error: "La provincia es obligatoria" });
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: existing } = await pool.query(
    "SELECT id FROM districts WHERE province = $1 AND lower(name) = lower($2)",
    [province, name]
  );
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe ese distrito en esa provincia" });
  const { rows } = await pool.query(
    "INSERT INTO districts (province, name) VALUES ($1, $2) RETURNING id, name",
    [province, name]
  );
  res.status(201).json(rows[0]);
});

app.put("/api/districts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: current } = await pool.query("SELECT province, name FROM districts WHERE id = $1", [id]);
  if (current.length === 0) return res.status(404).json({ error: "Distrito no encontrado" });
  const { rows: existing } = await pool.query(
    "SELECT id FROM districts WHERE province = $1 AND lower(name) = lower($2) AND id != $3",
    [current[0].province, name, id]
  );
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe ese distrito en esa provincia" });
  await pool.query(
    "UPDATE customers SET district = $1 WHERE province = $2 AND district = $3",
    [name, current[0].province, current[0].name]
  );
  const { rows } = await pool.query("UPDATE districts SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
  res.json(rows[0]);
});

app.delete("/api/districts/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: current } = await pool.query("SELECT province, name FROM districts WHERE id = $1", [id]);
  if (current.length === 0) return res.status(404).json({ error: "Distrito no encontrado" });
  const { rows: inUse } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM customers WHERE province = $1 AND district = $2",
    [current[0].province, current[0].name]
  );
  if (inUse[0].count > 0) {
    return res.status(409).json({ error: "No puedes eliminar un distrito que está en uso por clientes" });
  }
  await pool.query("DELETE FROM districts WHERE id = $1", [id]);
  res.status(204).end();
});

// Sedes de courriers (por ahora solo Shalom Lima, cargadas desde
// server/import-shalom-agencies.mjs). Solo lectura por API: se cargan por
// script, no hay mantenimiento CRUD todavía.
app.get("/api/agencies", async (req, res) => {
  const provider = (req.query.provider ?? "").toString();
  if (!provider) return res.json([]);
  const { rows } = await pool.query(
    "SELECT id, name, department, province, district, address, reference, phone, schedule FROM agencies WHERE provider = $1 ORDER BY district, name",
    [provider]
  );
  res.json(rows);
});

app.get("/api/brands", async (req, res) => {
  const { rows } = await pool.query("SELECT id, name FROM brands ORDER BY name");
  res.json(rows);
});

app.post("/api/brands", requireAuth, async (req, res) => {
  const name = (req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: existing } = await pool.query("SELECT id FROM brands WHERE lower(name) = lower($1)", [name]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe una marca con ese nombre" });
  const { rows } = await pool.query("INSERT INTO brands (name) VALUES ($1) RETURNING id, name", [name]);
  res.status(201).json(rows[0]);
});

app.put("/api/brands/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "El nombre es obligatorio" });
  const { rows: existing } = await pool.query("SELECT id FROM brands WHERE lower(name) = lower($1) AND id != $2", [name, id]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe una marca con ese nombre" });
  const { rows } = await pool.query("UPDATE brands SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
  if (rows.length === 0) return res.status(404).json({ error: "Marca no encontrada" });
  res.json(rows[0]);
});

app.delete("/api/brands/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await pool.query("UPDATE products SET brand_id = NULL WHERE brand_id = $1", [id]);
  const { rowCount } = await pool.query("DELETE FROM brands WHERE id = $1", [id]);
  if (rowCount === 0) return res.status(404).json({ error: "Marca no encontrada" });
  res.status(204).end();
});

// Servicios: mantenimiento aparte de productos, solo código, nombre,
// descripción y precio (sin colores, categorías, marca, stock ni fotos).
const mapService = (row) => ({
  id: row.id,
  code: row.code ?? "",
  name: row.name,
  description: row.description,
  price: Number(row.price),
});

const validateService = ({ name, price }) => {
  if (!name?.trim()) return "El nombre es obligatorio";
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return "El precio es inválido";
  return null;
};

app.get("/api/services", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM services ORDER BY name");
  res.json(rows.map(mapService));
});

app.post("/api/services", requireAuth, async (req, res) => {
  const { code, name, description, price } = req.body;
  const error = validateService({ name, price });
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    "INSERT INTO services (code, name, description, price) VALUES ($1, $2, $3, $4) RETURNING *",
    [(code ?? "").trim(), name.trim(), (description ?? "").trim(), price]
  );
  res.status(201).json(mapService(rows[0]));
});

app.put("/api/services/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { code, name, description, price } = req.body;
  const error = validateService({ name, price });
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    "UPDATE services SET code = $1, name = $2, description = $3, price = $4 WHERE id = $5 RETURNING *",
    [(code ?? "").trim(), name.trim(), (description ?? "").trim(), price, id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Servicio no encontrado" });
  res.json(mapService(rows[0]));
});

app.delete("/api/services/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rowCount } = await pool.query("DELETE FROM services WHERE id = $1", [id]);
  if (rowCount === 0) return res.status(404).json({ error: "Servicio no encontrado" });
  res.status(204).end();
});

// El perfil es solo informativo por ahora: no restringe qué puede ver o
// hacer cada usuario dentro del panel admin.
const USER_ROLES = ["Administrador", "Vendedor"];

app.get("/api/users", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT id, username, role FROM users ORDER BY username");
  res.json(rows);
});

app.post("/api/users", requireAuth, async (req, res) => {
  const username = (req.body.username ?? "").trim();
  const password = req.body.password ?? "";
  const role = USER_ROLES.includes(req.body.role) ? req.body.role : "Vendedor";
  if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE lower(username) = lower($1)", [username]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role",
    [username, passwordHash, role]
  );
  res.status(201).json(rows[0]);
});

app.put("/api/users/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const username = (req.body.username ?? "").trim();
  const password = req.body.password ?? "";
  const role = USER_ROLES.includes(req.body.role) ? req.body.role : "Vendedor";
  if (!username) return res.status(400).json({ error: "El usuario es obligatorio" });
  if (password && password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE lower(username) = lower($1) AND id != $2", [username, id]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });

  const { rows } = password
    ? await pool.query(
        "UPDATE users SET username = $1, password_hash = $2, role = $3 WHERE id = $4 RETURNING id, username, role",
        [username, await bcrypt.hash(password, 10), role, id]
      )
    : await pool.query("UPDATE users SET username = $1, role = $2 WHERE id = $3 RETURNING id, username, role", [username, role, id]);

  if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(rows[0]);
});

app.delete("/api/users/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: countRows } = await pool.query("SELECT COUNT(*)::int AS count FROM users");
  if (countRows[0].count <= 1) return res.status(400).json({ error: "No puedes eliminar el único usuario administrador" });
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [id]);
  if (rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
  res.status(204).end();
});

// Lista pública de vendedores (solo id + usuario, nada sensible): la usa
// el registro de pedidos fuera del panel admin para elegir quién lo tomó.
app.get("/api/sellers", async (req, res) => {
  const { rows } = await pool.query("SELECT id, username FROM users WHERE role = 'Vendedor' ORDER BY username");
  res.json(rows);
});

const DELIVERY_TYPES = ["Shalom", "Motorizado Express", "Motorizado Delivery", "Olva", "Marvisur"];
// Los que reparten por agencia/courier (no motorizado propio): antes de
// marcarlos "Entregado a delivery" hace falta subir el recibo del envío.
const COURIER_DELIVERY_TYPES = ["Shalom", "Olva", "Marvisur"];
// Tipos de delivery donde tiene sentido "Contraentrega": el motorizado
// propio, o las agencias/courier de arriba. Motorizado Express queda
// afuera — no lo pidieron.
const CHARGE_TYPE_DELIVERY_TYPES = ["Motorizado Delivery", ...COURIER_DELIVERY_TYPES];

// Tope de descuento manual por ítem al registrar un pedido: más alto si
// quien registra tiene sesión de admin abierta en el navegador (aunque el
// registro de pedidos en sí sea público), más bajo por el link público sin
// sesión. Editable desde el panel — vive en la fila única de settings.
const mapSettings = (row) => ({
  maxItemDiscountPublic: Number(row.max_item_discount_public),
  maxItemDiscountAdmin: Number(row.max_item_discount_admin),
});

const getSettings = async () => {
  const { rows } = await pool.query("SELECT * FROM settings WHERE id = 1");
  return mapSettings(rows[0]);
};

app.get("/api/settings", async (req, res) => {
  res.json(await getSettings());
});

app.put("/api/settings", requireAuth, async (req, res) => {
  const { maxItemDiscountPublic, maxItemDiscountAdmin } = req.body;
  if (typeof maxItemDiscountPublic !== "number" || !Number.isFinite(maxItemDiscountPublic) || maxItemDiscountPublic < 0) {
    return res.status(400).json({ error: "El descuento máximo del link público es inválido" });
  }
  if (typeof maxItemDiscountAdmin !== "number" || !Number.isFinite(maxItemDiscountAdmin) || maxItemDiscountAdmin < 0) {
    return res.status(400).json({ error: "El descuento máximo con sesión de admin es inválido" });
  }
  const { rows } = await pool.query(
    "UPDATE settings SET max_item_discount_public = $1, max_item_discount_admin = $2 WHERE id = 1 RETURNING *",
    [maxItemDiscountPublic, maxItemDiscountAdmin]
  );
  res.json(mapSettings(rows[0]));
});

const DELIVERY_MODE_REQUIRED = ["Shalom", "Olva"];
const DELIVERY_MODES = ["Terrestre", "Aéreo"];
// Solo Shalom tiene sedes cargadas por ahora; cuando se cargue Olva se
// agrega aquí también.
const AGENCY_REQUIRED = ["Shalom"];
// Los tipos "motorizado" reparten a domicilio, así que piden la dirección
// exacta del cliente.
const ADDRESS_REQUIRED = ["Motorizado Express", "Motorizado Delivery"];

const mapCustomer = (row) => ({
  id: row.id,
  documentType: row.document_type,
  documentNumber: row.document_number,
  firstName: row.first_name,
  paternalSurname: row.paternal_surname,
  maternalSurname: row.maternal_surname,
  mobile: row.mobile,
  country: row.country,
  department: row.department,
  province: row.province,
  district: row.district,
  deliveryType: row.delivery_type,
  deliveryMode: row.delivery_mode,
  agency: row.agency,
  address: row.address,
  locationLat: row.location_lat === null || row.location_lat === undefined ? null : Number(row.location_lat),
  locationLng: row.location_lng === null || row.location_lng === undefined ? null : Number(row.location_lng),
});

const validateCustomer = (body) => {
  const { documentType, documentNumber, firstName, paternalSurname, mobile, department, province, district, deliveryType, deliveryMode, agency, address } = body;
  if (!documentType?.trim() || !documentNumber?.trim() || !firstName?.trim() || !paternalSurname?.trim() || !mobile?.trim() || !department?.trim() || !province?.trim() || !district?.trim()) {
    return "Completa todos los campos requeridos";
  }
  if (!DELIVERY_TYPES.includes(deliveryType)) {
    return "Tipo de delivery inválido";
  }
  if (DELIVERY_MODE_REQUIRED.includes(deliveryType) && !DELIVERY_MODES.includes(deliveryMode)) {
    return "Selecciona si el envío es terrestre o aéreo";
  }
  if (AGENCY_REQUIRED.includes(deliveryType) && !agency?.trim()) {
    return "Selecciona la sede de recojo";
  }
  if (ADDRESS_REQUIRED.includes(deliveryType) && !address?.trim()) {
    return "Ingresa la dirección de entrega";
  }
  return null;
};

app.get("/api/customers", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM customers ORDER BY id DESC");
  res.json(rows.map(mapCustomer));
});

const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);

const insertCustomer = async (body, passwordHash = null) => {
  const {
    documentType, documentNumber, firstName, paternalSurname, maternalSurname,
    mobile, department, province, district, deliveryType, deliveryMode, agency, address,
    locationLat, locationLng,
  } = body;
  const deliveryModeValue = DELIVERY_MODE_REQUIRED.includes(deliveryType) ? deliveryMode : null;
  const agencyValue = AGENCY_REQUIRED.includes(deliveryType) ? (agency ?? "").trim() : "";
  const addressValue = ADDRESS_REQUIRED.includes(deliveryType) ? (address ?? "").trim() : "";
  const locationLatValue = ADDRESS_REQUIRED.includes(deliveryType) && isFiniteNumber(locationLat) ? locationLat : null;
  const locationLngValue = ADDRESS_REQUIRED.includes(deliveryType) && isFiniteNumber(locationLng) ? locationLng : null;
  await ensureDistrictExists(province, district);
  const { rows } = await pool.query(
    `INSERT INTO customers (document_type, document_number, first_name, paternal_surname, maternal_surname, mobile, country, department, province, district, delivery_type, delivery_mode, agency, address, password_hash, location_lat, location_lng)
     VALUES ($1, $2, $3, $4, $5, $6, 'Perú', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
    [documentType, documentNumber.trim(), firstName.trim(), paternalSurname.trim(), (maternalSurname ?? "").trim(), mobile.trim(), department, province, district.trim(), deliveryType, deliveryModeValue, agencyValue, addressValue, passwordHash, locationLatValue, locationLngValue]
  );
  return rows[0];
};

// Si ya existe un cliente con ese documento pero nunca creó cuenta (lo
// registró un vendedor), esto "reclama" ese registro: actualiza su perfil
// y le pone contraseña, en vez de duplicarlo. Si ya tiene cuenta, avisa
// que inicie sesión en vez de registrarse de nuevo.
const claimOrCreateCustomerAccount = async (body, passwordHash) => {
  const trimmedDoc = (body.documentNumber ?? "").trim();
  if (trimmedDoc) {
    const { rows: existing } = await pool.query(
      "SELECT id, password_hash FROM customers WHERE document_type = $1 AND document_number = $2",
      [body.documentType, trimmedDoc]
    );
    if (existing.length > 0) {
      if (existing[0].password_hash) {
        throw new Error("ACCOUNT_EXISTS");
      }
      const { firstName, paternalSurname, maternalSurname, mobile, department, province, district, deliveryType, deliveryMode, agency, address, locationLat, locationLng } = body;
      const deliveryModeValue = DELIVERY_MODE_REQUIRED.includes(deliveryType) ? deliveryMode : null;
      const agencyValue = AGENCY_REQUIRED.includes(deliveryType) ? (agency ?? "").trim() : "";
      const addressValue = ADDRESS_REQUIRED.includes(deliveryType) ? (address ?? "").trim() : "";
      // Este formulario (creación de cuenta) no captura ubicación, así que
      // si no viene en el body se conserva la que ya tuviera el registro.
      const locationLatParam = isFiniteNumber(locationLat) ? locationLat : null;
      const locationLngParam = isFiniteNumber(locationLng) ? locationLng : null;
      await ensureDistrictExists(province, district);
      const { rows } = await pool.query(
        `UPDATE customers SET first_name = $1, paternal_surname = $2, maternal_surname = $3, mobile = $4,
           department = $5, province = $6, district = $7, delivery_type = $8, delivery_mode = $9, agency = $10, address = $11,
           password_hash = $12, location_lat = COALESCE($14, location_lat), location_lng = COALESCE($15, location_lng)
         WHERE id = $13 RETURNING *`,
        [
          firstName.trim(), paternalSurname.trim(), (maternalSurname ?? "").trim(), mobile.trim(),
          department, province, district.trim(), deliveryType, deliveryModeValue, agencyValue, addressValue,
          passwordHash, existing[0].id, locationLatParam, locationLngParam,
        ]
      );
      return rows[0];
    }
  }
  return insertCustomer(body, passwordHash);
};

app.post("/api/customers", requireAuth, async (req, res) => {
  const error = validateCustomer(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const row = await insertCustomer(req.body);
    res.status(201).json(mapCustomer(row));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un cliente con ese tipo y número de documento" });
    throw err;
  }
});

// Registro público de clientes: pensado para un link fuera del panel admin
// que solo permite CREAR un cliente (sin sesión). No expone listar, editar
// ni eliminar — eso sigue exclusivamente en /api/customers con requireAuth.
app.post("/api/customers/register", async (req, res) => {
  const error = validateCustomer(req.body);
  if (error) return res.status(400).json({ error });
  // Los tipos de delivery "motorizado" reparten a domicilio, así que además
  // de la dirección exigen que el cliente comparta su ubicación GPS actual
  // (solo en este link público; el panel admin no lo pide al editar).
  if (ADDRESS_REQUIRED.includes(req.body.deliveryType) && !(isFiniteNumber(req.body.locationLat) && isFiniteNumber(req.body.locationLng))) {
    return res.status(400).json({ error: "Comparte tu ubicación actual para continuar" });
  }
  try {
    const row = await insertCustomer(req.body);
    res.status(201).json(mapCustomer(row));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un cliente con ese tipo y número de documento" });
    throw err;
  }
});

// Registro público de clientes, pero relajado: lo usa Regularización de
// Separaciones, donde suele haber datos históricos incompletos. Solo exige
// nombre y celular; el resto de campos queda opcional (se guardan vacíos si
// no vienen). No lo usa el registro de cliente normal ni el panel admin,
// que siguen pidiendo todos los campos vía validateCustomer/insertCustomer.
app.post("/api/customers/register-minimal", async (req, res) => {
  if (!req.body.firstName?.trim() || !req.body.mobile?.trim()) {
    return res.status(400).json({ error: "Ingresa al menos el nombre y el celular" });
  }
  const body = {
    documentType: (req.body.documentType || "").trim(),
    documentNumber: (req.body.documentNumber || "").trim(),
    firstName: req.body.firstName,
    paternalSurname: req.body.paternalSurname || "",
    maternalSurname: req.body.maternalSurname,
    mobile: req.body.mobile,
    department: (req.body.department || "").trim(),
    province: (req.body.province || "").trim(),
    district: req.body.district || "",
    deliveryType: DELIVERY_TYPES.includes(req.body.deliveryType) ? req.body.deliveryType : "Motorizado Express",
    deliveryMode: req.body.deliveryMode,
    agency: req.body.agency,
    address: req.body.address,
  };
  try {
    const row = await insertCustomer(body);
    res.status(201).json(mapCustomer(row));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un cliente con ese tipo y número de documento" });
    throw err;
  }
});

app.put("/api/customers/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const error = validateCustomer(req.body);
  if (error) return res.status(400).json({ error });
  const {
    documentType, documentNumber, firstName, paternalSurname, maternalSurname,
    mobile, department, province, district, deliveryType, deliveryMode, agency, address,
    locationLat, locationLng,
  } = req.body;
  const deliveryModeValue = DELIVERY_MODE_REQUIRED.includes(deliveryType) ? deliveryMode : null;
  const agencyValue = AGENCY_REQUIRED.includes(deliveryType) ? (agency ?? "").trim() : "";
  const addressValue = ADDRESS_REQUIRED.includes(deliveryType) ? (address ?? "").trim() : "";
  // El panel admin no edita la ubicación GPS, así que si no viene en el
  // body se conserva la que ya tuviera el cliente.
  const locationLatParam = isFiniteNumber(locationLat) ? locationLat : null;
  const locationLngParam = isFiniteNumber(locationLng) ? locationLng : null;
  await ensureDistrictExists(province, district);
  try {
    const { rows } = await pool.query(
      `UPDATE customers SET document_type = $1, document_number = $2, first_name = $3, paternal_surname = $4,
         maternal_surname = $5, mobile = $6, department = $7, province = $8, district = $9, delivery_type = $10, delivery_mode = $11, agency = $12, address = $13,
         location_lat = COALESCE($15, location_lat), location_lng = COALESCE($16, location_lng)
       WHERE id = $14 RETURNING *`,
      [documentType, documentNumber.trim(), firstName.trim(), paternalSurname.trim(), (maternalSurname ?? "").trim(), mobile.trim(), department, province, district.trim(), deliveryType, deliveryModeValue, agencyValue, addressValue, id, locationLatParam, locationLngParam]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(mapCustomer(rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un cliente con ese tipo y número de documento" });
    throw err;
  }
});

app.delete("/api/customers/:id", requireAuth, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM customers WHERE id = $1", [Number(req.params.id)]);
  if (rowCount === 0) return res.status(404).json({ error: "Cliente no encontrado" });
  res.status(204).end();
});

// Búsqueda pública de un cliente por su propio código o número de documento
// (el cliente se identifica a sí mismo). Pensada para el registro de
// pedidos fuera del panel admin: no expone el listado completo.
app.get("/api/customers/lookup", async (req, res) => {
  const code = (req.query.code ?? "").toString().trim();
  const documentNumber = (req.query.documentNumber ?? "").toString().trim();
  if (!code && !documentNumber) {
    return res.status(400).json({ error: "Indica el código de cliente o el número de documento" });
  }
  if (code && !Number.isInteger(Number(code))) {
    return res.status(404).json({ error: "No se encontró ningún cliente con ese dato" });
  }
  const { rows } = code
    ? await pool.query("SELECT * FROM customers WHERE id = $1", [Number(code)])
    : await pool.query("SELECT * FROM customers WHERE document_number = $1", [documentNumber]);
  if (rows.length === 0) return res.status(404).json({ error: "No se encontró ningún cliente con ese dato" });
  res.json(mapCustomer(rows[0]));
});

// Registro de cuenta de cliente (con contraseña), para iniciar sesión en la
// tienda y dejar valoraciones. Mismos datos que el registro de cliente
// normal, más contraseña. Si ya existe un cliente con ese documento sin
// cuenta (lo registró un vendedor), la "reclama" en vez de duplicarlo.
app.post("/api/customers/register-account", async (req, res) => {
  const error = validateCustomer(req.body);
  if (error) return res.status(400).json({ error });
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const row = await claimOrCreateCustomerAccount(req.body, passwordHash);
    setCustomerAuthCookie(res, signCustomerToken(row.id));
    res.status(201).json(mapCustomer(row));
  } catch (err) {
    if (err.message === "ACCOUNT_EXISTS") {
      return res.status(409).json({ error: "Ya existe una cuenta con ese documento. Inicia sesión." });
    }
    if (err.code === "23505") return res.status(409).json({ error: "Ya existe un cliente con ese tipo y número de documento" });
    throw err;
  }
});

// El cliente puede iniciar sesión con su documento, su celular o su código
// de cliente — lo que le resulte más fácil de recordar.
app.post("/api/customers/login", async (req, res) => {
  const identifier = (req.body.identifier ?? "").toString().trim();
  const { password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: "Ingresa tu usuario y contraseña" });
  }
  const { rows } = await pool.query(
    `SELECT * FROM customers
     WHERE password_hash IS NOT NULL AND (document_number = $1 OR mobile = $1 OR id::text = $1)
     LIMIT 1`,
    [identifier]
  );
  const customer = rows[0];
  const valid = customer && (await bcrypt.compare(password, customer.password_hash));
  if (!valid) return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  setCustomerAuthCookie(res, signCustomerToken(customer.id));
  res.json(mapCustomer(customer));
});

app.post("/api/customers/logout", (req, res) => {
  res.clearCookie(CUSTOMER_COOKIE_NAME);
  res.status(204).end();
});

app.get("/api/customers/me", requireCustomerAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM customers WHERE id = $1", [req.customerId]);
  if (rows.length === 0) return res.status(401).json({ error: "Sesión inválida" });
  res.json(mapCustomer(rows[0]));
});

const mapReview = (row) => ({
  id: row.id,
  customerId: row.customer_id,
  customerName: `${row.first_name} ${(row.paternal_surname ?? "").charAt(0)}${row.paternal_surname ? "." : ""}`.trim(),
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
});

// Valoraciones de la tienda (no de un producto en particular): se muestran
// al final de la página de inicio. Un cliente solo puede tener una — si
// vuelve a enviar, se actualiza la que ya tenía (UNIQUE en customer_id).
app.get("/api/reviews", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, c.first_name, c.paternal_surname FROM reviews r
     JOIN customers c ON c.id = r.customer_id
     ORDER BY r.created_at DESC LIMIT 100`
  );
  res.json(rows.map(mapReview));
});

app.post("/api/reviews", requireCustomerAuth, async (req, res) => {
  const { rating, comment } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "La calificación debe ser de 1 a 5 estrellas" });
  }
  if (!comment?.trim()) {
    return res.status(400).json({ error: "Escribe tu comentario" });
  }
  const { rows } = await pool.query(
    `INSERT INTO reviews (customer_id, rating, comment)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = now()
     RETURNING id`,
    [req.customerId, rating, comment.trim()]
  );
  const { rows: withName } = await pool.query(
    "SELECT r.*, c.first_name, c.paternal_surname FROM reviews r JOIN customers c ON c.id = r.customer_id WHERE r.id = $1",
    [rows[0].id]
  );
  res.status(201).json(mapReview(withName[0]));
});

app.get("/api/products/:id", async (req, res) => {
  const includeCost = isAuthenticated(req);
  const { rows } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [Number(req.params.id)]);
  if (rows.length === 0) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(mapProduct(rows[0], includeCost));
});

app.post("/api/products", requireAuth, async (req, res) => {
  const { name, price, categories, description, image, colors, code, brand, photos, videos, extraDescription, sortOrder, cost } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  if (!Array.isArray(categories) || categories.length === 0 || categories.some((c) => !c?.trim())) {
    return res.status(400).json({ error: "Elige al menos una categoría" });
  }
  const { rows } = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products");
  const id = rows[0].next_id;
  const brandId = await getOrCreateBrandId(brand);
  for (const c of categories) await ensureCategoryExists(c);
  const { rows: inserted } = await pool.query(
    `INSERT INTO products (id, name, price, categories, description, image, colors, code, brand_id, photos, videos, extra_description, sort_order, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      id, name, price, JSON.stringify(categories), description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
      brandId, JSON.stringify(photos ?? []), JSON.stringify(videos ?? []), extraDescription ?? "",
      Number.isFinite(sortOrder) ? sortOrder : id, Number.isFinite(cost) ? cost : null,
    ]
  );
  const { rows: fetched } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [inserted[0].id]);
  res.status(201).json(mapProduct(fetched[0], true));
});

app.put("/api/products/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price, categories, description, image, colors, code, brand, photos, videos, extraDescription, sortOrder, cost } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  if (!Array.isArray(categories) || categories.length === 0 || categories.some((c) => !c?.trim())) {
    return res.status(400).json({ error: "Elige al menos una categoría" });
  }
  const brandId = await getOrCreateBrandId(brand);
  for (const c of categories) await ensureCategoryExists(c);
  const { rows } = await pool.query(
    `UPDATE products SET name = $1, price = $2, categories = $3, description = $4, image = $5, colors = $6, code = $7, brand_id = $8, photos = $9, videos = $10, extra_description = $11, sort_order = $12, cost = $13
     WHERE id = $14 RETURNING id`,
    [
      name, price, JSON.stringify(categories), description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
      brandId, JSON.stringify(photos ?? []), JSON.stringify(videos ?? []), extraDescription ?? "",
      Number.isFinite(sortOrder) ? sortOrder : id, Number.isFinite(cost) ? cost : null, id,
    ]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Producto no encontrado" });
  const { rows: fetched } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [id]);
  res.json(mapProduct(fetched[0], true));
});

app.delete("/api/products/:id", requireAuth, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [Number(req.params.id)]);
  if (rowCount === 0) return res.status(404).json({ error: "Producto no encontrado" });
  res.status(204).end();
});

const mapPayment = (p) => ({
  id: p.id,
  orderId: p.order_id,
  amount: Number(p.amount),
  source: p.source,
  operationNumber: p.operation_number,
  proofImage: p.proof_image,
  registeredBy: p.registered_by,
  createdAt: p.created_at,
});

const mapOrder = (order, items, payments = []) => ({
  id: order.id,
  customerId: order.customer_id,
  sellerId: order.seller_id,
  type: order.type,
  status: order.status,
  chargeType: order.charge_type,
  receiptImage: order.receipt_image,
  trackingCode: order.tracking_code,
  separationDeadline: order.separation_deadline,
  total: Number(order.total),
  createdAt: order.created_at,
  items: items.map((i) => ({
    id: i.id,
    productId: i.product_id,
    serviceId: i.service_id,
    productName: i.product_name,
    productCode: i.product_code,
    colorName: i.color_name,
    unitPrice: Number(i.unit_price),
    quantity: i.quantity,
    discount: Number(i.discount),
    subtotal: Number(i.subtotal),
  })),
  payments: payments.map(mapPayment),
});

const SEPARATION_DAYS = 15;

const validatePaymentInput = ({ amount, source, proofImage, date }) => {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto del pago es inválido");
  }
  if (!source?.trim()) {
    throw new Error("Selecciona el medio de pago");
  }
  if (!proofImage?.trim()) {
    throw new Error("Sube la captura del pago");
  }
  if (date !== undefined && date !== "" && Number.isNaN(new Date(date).getTime())) {
    throw new Error("La fecha del pago es inválida");
  }
};

// Inserta el pago y recalcula el estado del pedido sumando TODOS los pagos
// ya registrados contra el total: si lo cubre pasa a "Pendiente de envío",
// si no a "Separación" (con un plazo de 15 días calendario para cancelar,
// que se fija solo la primera vez que entra a ese estado). No abre su
// propia transacción: el caller decide el alcance — sola (registerPaymentTx)
// o junto con la creación del pedido, en la misma transacción, cuando el
// pago se carga al mismo tiempo que los productos.
const applyPayment = async (client, orderId, total, currentDeadline, { amount, source, proofImage, registeredBy, date }) => {
  const paidAt = date ? new Date(date) : new Date();
  await client.query(
    `INSERT INTO payments (order_id, amount, source, proof_image, registered_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId, amount, source.trim(), proofImage.trim(), registeredBy, paidAt]
  );
  const { rows: paidRows } = await client.query(
    "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE order_id = $1",
    [orderId]
  );
  const paid = Number(paidRows[0].paid);
  const status = paid >= total ? "Pendiente de envío" : "Separación";
  // El plazo se cuenta desde la fecha del pago (no desde que se registró en
  // el sistema), así que si el pago se carga con una fecha pasada, el plazo
  // también arranca desde esa fecha y no desde "ahora".
  const separationDeadline =
    status === "Separación" ? currentDeadline ?? new Date(paidAt.getTime() + SEPARATION_DAYS * 24 * 60 * 60 * 1000) : currentDeadline;
  await client.query("UPDATE orders SET status = $1, separation_deadline = $2 WHERE id = $3", [status, separationDeadline, orderId]);
  return { status, separationDeadline };
};

// Abre su propia transacción con FOR UPDATE sobre el pedido (para que dos
// pagos registrados a la vez no se pisen el estado calculado el uno al
// otro) y aplica applyPayment. Usada para agregar un pago a un pedido que
// ya existe (panel admin, o un pago adicional desde el link público).
const registerPaymentTx = async (orderId, paymentData) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      "SELECT id, total, separation_deadline FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }
    const order = orderRows[0];
    await applyPayment(client, orderId, Number(order.total), order.separation_deadline, paymentData);

    const { rows: updatedRows } = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    const { rows: itemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [orderId]);

    await client.query("COMMIT");
    return mapOrder(updatedRows[0], itemRows, paymentRows);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

app.get("/api/orders", requireAuth, async (req, res) => {
  // Los items y los pagos se agregan cada uno en su propio subquery LATERAL
  // (en vez de un solo LEFT JOIN a las dos tablas) para que uno no multiplique
  // las filas del otro: un pedido con 3 items y 2 pagos daría 6 filas si se
  // unieran directamente, duplicando cada item y cada pago.
  const { rows } = await pool.query(`
    SELECT
      o.id, o.customer_id, o.seller_id, o.type, o.status, o.charge_type, o.receipt_image, o.tracking_code,
      o.separation_deadline, o.total, o.created_at,
      c.first_name, c.paternal_surname, c.maternal_surname, c.document_type, c.document_number, c.mobile,
      c.department, c.province, c.district, c.delivery_type, c.delivery_mode, c.agency, c.address,
      u.username AS seller_username,
      COALESCE(items.items, '[]') AS items,
      COALESCE(payments.payments, '[]') AS payments
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.seller_id
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', oi.id, 'productId', oi.product_id, 'serviceId', oi.service_id, 'productName', oi.product_name,
          'productCode', oi.product_code, 'colorName', oi.color_name, 'unitPrice', oi.unit_price,
          'quantity', oi.quantity, 'discount', oi.discount, 'subtotal', oi.subtotal
        ) ORDER BY oi.id
      ) AS items
      FROM order_items oi WHERE oi.order_id = o.id
    ) items ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', p.id, 'orderId', p.order_id, 'amount', p.amount, 'source', p.source,
          'operationNumber', p.operation_number, 'proofImage', p.proof_image,
          'registeredBy', p.registered_by, 'createdAt', p.created_at
        ) ORDER BY p.id
      ) AS payments
      FROM payments p WHERE p.order_id = o.id
    ) payments ON true
    ORDER BY o.id DESC
  `);
  res.json(
    rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: [row.first_name, row.paternal_surname, row.maternal_surname].filter(Boolean).join(" "),
      customerDocument: `${row.document_type} ${row.document_number}`,
      customerDocumentType: row.document_type,
      customerDocumentNumber: row.document_number,
      customerMobile: row.mobile,
      customerDepartment: row.department,
      customerProvince: row.province,
      customerDistrict: row.district,
      customerDeliveryType: row.delivery_type,
      customerDeliveryMode: row.delivery_mode,
      customerAgency: row.agency,
      customerAddress: row.address,
      sellerId: row.seller_id,
      sellerName: row.seller_username ?? "",
      type: row.type,
      status: row.status,
      chargeType: row.charge_type,
      receiptImage: row.receipt_image,
      trackingCode: row.tracking_code,
      separationDeadline: row.separation_deadline,
      total: Number(row.total),
      createdAt: row.created_at,
      items: row.items.map((i) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
        subtotal: Number(i.subtotal),
      })),
      payments: row.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    }))
  );
});

// dd/mm/yyyy en hora de Perú (UTC-5), sin importar en qué huso horario
// corra el servidor (Render suele correr en UTC) — arma la fecha a mano
// con los "parts" de Intl en vez de confiar en su padding de 2 dígitos,
// que no siempre está disponible según qué tan completos sean los datos
// de localización instalados.
const formatPeruDate = (date) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day").padStart(2, "0")}/${get("month").padStart(2, "0")}/${get("year")}`;
};

const PITAYA_HEADER_ROW = [
  "FECHA DE COMPRA", "ESTADO", "CODIGO", "Monto", "SITUACIÓN DE PAGO", "NOMBRE", "CELULAR",
  "PRODUCTO", "FECHA DE ENTREGA", "DIRECCIÓN", "DISTRITO ", "MAPS",
];

// Arma el Excel a partir de filas ya guardadas en shipments — tanto para una
// generación nueva como para volver a descargar una vieja, siempre el mismo
// contenido (el código sale del id de shipments, no se recalcula).
const buildPitayaWorkbook = async (shipmentRows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pitaya");
  sheet.addRow(PITAYA_HEADER_ROW);
  for (const s of shipmentRows) {
    sheet.addRow([
      s.fecha_compra,
      "Nuevo",
      `E${String(s.id).padStart(7, "0")}`,
      Number(s.monto),
      s.situacion_pago,
      s.nombre,
      s.celular,
      s.producto,
      s.fecha_entrega,
      s.direccion,
      s.distrito,
      s.maps,
    ]);
  }
  return workbook.xlsx.writeBuffer();
};

// Genera un reporte NUEVO para el motorizado Pitaya: toma los pedidos
// Motorizado Delivery en Pendiente de envío que todavía no salieron en
// ningún reporte anterior (shipments), los deja asentados (report_generations
// + shipments, con su código secuencial) y devuelve el Excel. Si se vuelve a
// generar después, esos mismos pedidos ya no van a aparecer de nuevo.
app.post("/api/pitaya-reports", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT
        o.id, o.total, o.charge_type, o.created_at,
        c.first_name, c.paternal_surname, c.maternal_surname, c.mobile, c.address, c.district,
        c.location_lat, c.location_lng,
        COALESCE(payments.payments, '[]') AS payments
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('amount', p.amount, 'source', p.source) ORDER BY p.id) AS payments
        FROM payments p WHERE p.order_id = o.id
      ) payments ON true
      WHERE o.status = 'Pendiente de envío' AND c.delivery_type = 'Motorizado Delivery'
        AND o.id NOT IN (SELECT order_id FROM shipments)
      ORDER BY o.id
    `);

    const todayStr = formatPeruDate(new Date());
    const fileName = `Reporte Chic Bags_${todayStr.replaceAll("/", "")}.xlsx`;

    const { rows: reportRows } = await client.query(
      "INSERT INTO report_generations (report_name, file_name) VALUES ($1, $2) RETURNING *",
      ["Pitaya", fileName]
    );
    const report = reportRows[0];

    const shipmentRows = [];
    for (const row of rows) {
      const paid = row.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const remaining = Number(row.total) - paid;
      const pendingCod = row.charge_type === "Contraentrega" && remaining > 0;
      const monto = pendingCod ? remaining : Number(row.total);
      const nombre = [row.first_name, row.paternal_surname, row.maternal_surname].filter(Boolean).join(" ");
      const maps =
        row.location_lat != null && row.location_lng != null
          ? `https://www.google.com/maps?q=${row.location_lat},${row.location_lng}`
          : "";
      const { rows: inserted } = await client.query(
        `INSERT INTO shipments (order_id, report_id, fecha_compra, monto, situacion_pago, nombre, celular, producto, fecha_entrega, direccion, distrito, maps)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [row.id, report.id, formatPeruDate(row.created_at), monto, "YAPE", nombre, row.mobile, "CARTERA", todayStr, row.address, row.district, maps]
      );
      shipmentRows.push(inserted[0]);
    }

    await client.query("COMMIT");

    const buffer = await buildPitayaWorkbook(shipmentRows);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Historial de generaciones del reporte Pitaya (sin el archivo, solo la
// lista) — para poder volver a descargar una de más atrás.
app.get("/api/pitaya-reports", requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.id, r.report_name, r.file_name, r.created_at, COUNT(s.id)::int AS row_count
    FROM report_generations r
    LEFT JOIN shipments s ON s.report_id = r.id
    GROUP BY r.id
    ORDER BY r.id DESC
  `);
  res.json(
    rows.map((r) => ({
      id: r.id,
      reportName: r.report_name,
      fileName: r.file_name,
      createdAt: r.created_at,
      rowCount: r.row_count,
    }))
  );
});

// Vuelve a armar el Excel de una generación ya hecha antes, a partir de las
// filas guardadas en ese momento (no vuelve a consultar los pedidos).
app.get("/api/pitaya-reports/:id/download", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Reporte inválido" });
  }
  const { rows: reportRows } = await pool.query("SELECT * FROM report_generations WHERE id = $1", [id]);
  if (reportRows.length === 0) return res.status(404).json({ error: "Reporte no encontrado" });
  const { rows: shipmentRows } = await pool.query("SELECT * FROM shipments WHERE report_id = $1 ORDER BY id", [id]);
  const buffer = await buildPitayaWorkbook(shipmentRows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${reportRows[0].file_name}"`);
  res.send(Buffer.from(buffer));
});

// Elimina un pedido desde el panel admin. Si es un pedido normal (no una
// Regularización, que nunca descontó stock), devuelve el stock de cada
// ítem a su producto y color antes de borrar — si el producto o el color
// ya no existen (se borró/renombró después), simplemente no hay a quién
// devolvérselo y se sigue de largo. order_items y payments se borran solos
// por el ON DELETE CASCADE de sus FK a orders.
app.delete("/api/orders/:id", requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: orderRows } = await client.query("SELECT type FROM orders WHERE id = $1", [orderId]);
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }

    if (orderRows[0].type === "Pedido") {
      const { rows: items } = await client.query(
        "SELECT product_id, color_name, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL",
        [orderId]
      );
      for (const item of items) {
        const { rows: productRows } = await client.query("SELECT colors FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
        if (productRows.length === 0) continue;
        const colors = productRows[0].colors ?? [];
        const colorIndex = colors.findIndex((c) => c.name === item.color_name);
        if (colorIndex === -1) continue;
        colors[colorIndex] = { ...colors[colorIndex], stock: colors[colorIndex].stock + item.quantity };
        await client.query("UPDATE products SET colors = $1 WHERE id = $2", [JSON.stringify(colors), item.product_id]);
      }
    }

    await client.query("DELETE FROM orders WHERE id = $1", [orderId]);

    await client.query("COMMIT");
    res.status(204).end();
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Cambia el color de un ítem de un pedido, desde el panel admin. En un
// pedido normal ("Pedido") con producto de catálogo, ajusta el stock: le
// devuelve al color anterior lo que tenía descontado y le descuenta al
// color nuevo la misma cantidad (rechaza el cambio si no le alcanza el
// stock). En Regularización, o en ítems sin product_id (cargados a mano),
// solo cambia el texto — nunca tocaron stock, así que tampoco ahora.
app.put("/api/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const itemId = Number(req.params.itemId);
  const { colorName } = req.body;
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    return res.status(400).json({ error: "Pedido o ítem inválido" });
  }
  if (!colorName?.trim()) {
    return res.status(400).json({ error: "Selecciona un color" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: orderRows } = await client.query("SELECT type FROM orders WHERE id = $1", [orderId]);
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }

    const { rows: itemRows } = await client.query(
      "SELECT id, product_id, color_name, quantity FROM order_items WHERE id = $1 AND order_id = $2",
      [itemId, orderId]
    );
    if (itemRows.length === 0) {
      throw new Error("El ítem no existe en este pedido");
    }
    const item = itemRows[0];
    const newColorName = colorName.trim();

    if (orderRows[0].type === "Pedido" && item.product_id !== null && newColorName !== item.color_name) {
      const { rows: productRows } = await client.query("SELECT colors FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
      if (productRows.length === 0) {
        throw new Error("El producto de este ítem ya no existe");
      }
      const colors = productRows[0].colors ?? [];
      const newColorIndex = colors.findIndex((c) => c.name === newColorName);
      if (newColorIndex === -1) {
        throw new Error(`El producto ya no tiene el color "${newColorName}"`);
      }
      if (colors[newColorIndex].stock < item.quantity) {
        throw new Error(`No hay suficiente stock de "${newColorName}": quedan ${colors[newColorIndex].stock}`);
      }
      const oldColorIndex = colors.findIndex((c) => c.name === item.color_name);
      if (oldColorIndex !== -1) {
        colors[oldColorIndex] = { ...colors[oldColorIndex], stock: colors[oldColorIndex].stock + item.quantity };
      }
      colors[newColorIndex] = { ...colors[newColorIndex], stock: colors[newColorIndex].stock - item.quantity };
      await client.query("UPDATE products SET colors = $1 WHERE id = $2", [JSON.stringify(colors), item.product_id]);
    }

    await client.query("UPDATE order_items SET color_name = $1 WHERE id = $2", [newColorName, itemId]);

    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    const { rows: finalItemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [orderId]);

    await client.query("COMMIT");
    res.json(mapOrder(finalOrderRows[0], finalItemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Registro público de pedidos: fuera del panel admin. Valida el stock de
// cada producto/color dentro de una transacción (con FOR UPDATE para
// evitar que dos pedidos a la vez vendan el mismo stock), lo descuenta y
// recién ahí crea el pedido — si algo falla, no se descuenta nada. El pago
// (opcional) se carga al mismo tiempo que los productos y queda enlazado
// al pedido dentro de la misma transacción, sin un paso aparte.
app.post("/api/orders/register", async (req, res) => {
  const { customerId, sellerId, items, payments } = req.body;
  if (!Number.isInteger(customerId)) {
    return res.status(400).json({ error: "Cliente inválido" });
  }
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "Selecciona el vendedor" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido no tiene ítems" });
  }
  if (payments !== undefined) {
    if (!Array.isArray(payments)) {
      return res.status(400).json({ error: "Los pagos son inválidos" });
    }
    for (const p of payments) {
      validatePaymentInput(p);
    }
  }
  const settings = await getSettings();
  const maxDiscount = isAuthenticated(req) ? settings.maxItemDiscountAdmin : settings.maxItemDiscountPublic;
  for (const item of items) {
    const isProduct = Number.isInteger(item?.productId);
    const isService = Number.isInteger(item?.serviceId);
    if (isProduct === isService) {
      return res.status(400).json({ error: "Hay un ítem inválido en el pedido" });
    }
    if (!Number.isInteger(item?.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: "Hay un ítem inválido en el pedido" });
    }
    if (isProduct && !item?.colorName) {
      return res.status(400).json({ error: "Hay un producto inválido en el pedido" });
    }
    const discount = item.discount ?? 0;
    if (typeof discount !== "number" || !Number.isFinite(discount) || discount < 0 || discount > maxDiscount) {
      return res.status(400).json({ error: `El descuento por ítem no puede superar S/.${maxDiscount}` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: customerRows } = await client.query("SELECT id FROM customers WHERE id = $1", [customerId]);
    if (customerRows.length === 0) {
      throw new Error("El cliente no existe");
    }

    const { rows: sellerRows } = await client.query("SELECT id, username FROM users WHERE id = $1 AND role = 'Vendedor'", [sellerId]);
    if (sellerRows.length === 0) {
      throw new Error("El vendedor no existe o ya no tiene ese perfil");
    }
    const seller = sellerRows[0];

    const lineItems = [];
    let total = 0;

    for (const item of items) {
      if (Number.isInteger(item.serviceId)) {
        const { rows: serviceRows } = await client.query(
          "SELECT id, name, code, price FROM services WHERE id = $1",
          [item.serviceId]
        );
        if (serviceRows.length === 0) {
          throw new Error(`El servicio #${item.serviceId} ya no existe`);
        }
        const service = serviceRows[0];
        const unitPrice = Number(service.price);
        const discount = Math.min(item.discount ?? 0, unitPrice * item.quantity);
        const subtotal = unitPrice * item.quantity - discount;
        total += subtotal;
        lineItems.push({
          productId: null,
          serviceId: service.id,
          productName: service.name,
          productCode: service.code ?? "",
          colorName: "",
          unitPrice,
          quantity: item.quantity,
          discount,
          subtotal,
        });
        continue;
      }

      const { rows: productRows } = await client.query(
        "SELECT id, name, code, price, colors FROM products WHERE id = $1 FOR UPDATE",
        [item.productId]
      );
      if (productRows.length === 0) {
        throw new Error(`El producto #${item.productId} ya no existe`);
      }
      const product = productRows[0];
      const colors = product.colors ?? [];
      const colorIndex = colors.findIndex((c) => c.name === item.colorName);
      if (colorIndex === -1) {
        throw new Error(`"${product.name}" ya no tiene el color "${item.colorName}"`);
      }
      const color = colors[colorIndex];
      if (color.stock < item.quantity) {
        throw new Error(`No hay suficiente stock de "${product.name}" (${item.colorName}): quedan ${color.stock}`);
      }
      colors[colorIndex] = { ...color, stock: color.stock - item.quantity };
      await client.query("UPDATE products SET colors = $1 WHERE id = $2", [JSON.stringify(colors), product.id]);

      const unitPrice = Number(product.price);
      const discount = Math.min(item.discount ?? 0, unitPrice * item.quantity);
      const subtotal = unitPrice * item.quantity - discount;
      total += subtotal;
      lineItems.push({
        productId: product.id,
        serviceId: null,
        productName: product.name,
        productCode: product.code ?? "",
        colorName: item.colorName,
        unitPrice,
        quantity: item.quantity,
        discount,
        subtotal,
      });
    }

    const { rows: orderRows } = await client.query(
      "INSERT INTO orders (customer_id, seller_id, total, type) VALUES ($1, $2, $3, 'Pedido') RETURNING *",
      [customerId, sellerId, total]
    );
    const order = orderRows[0];

    const insertedItems = [];
    for (const li of lineItems) {
      const { rows } = await client.query(
        `INSERT INTO order_items (order_id, product_id, service_id, product_name, product_code, color_name, unit_price, quantity, discount, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [order.id, li.productId, li.serviceId, li.productName, li.productCode, li.colorName, li.unitPrice, li.quantity, li.discount, li.subtotal]
      );
      insertedItems.push(rows[0]);
    }

    if (Array.isArray(payments) && payments.length > 0) {
      let deadline = null;
      for (const p of payments) {
        const result = await applyPayment(client, order.id, total, deadline, { ...p, registeredBy: seller.username });
        deadline = result.separationDeadline;
      }
    }
    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [order.id]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [order.id]);

    await client.query("COMMIT");
    res.status(201).json(mapOrder(finalOrderRows[0], insertedItems, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Regularización de Separaciones: registra pedidos históricos (fuera del
// flujo normal), sin tocar el stock de los productos — el movimiento físico
// ya ocurrió antes, esto solo lo deja asentado en el sistema. A diferencia
// de /orders/register, el precio de cada ítem se ingresa a mano y el
// producto no tiene que existir en el catálogo (product_id queda null en
// ese caso, con nombre/código/color escritos directamente).
app.post("/api/orders/regularize", async (req, res) => {
  const { customerId, sellerId, items, payment } = req.body;
  if (!Number.isInteger(customerId)) {
    return res.status(400).json({ error: "Cliente inválido" });
  }
  if (!Number.isInteger(sellerId)) {
    return res.status(400).json({ error: "Selecciona el vendedor" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El pedido no tiene productos" });
  }
  for (const item of items) {
    if (item?.productId !== null && !Number.isInteger(item?.productId)) {
      return res.status(400).json({ error: "Hay un producto inválido en el pedido" });
    }
    if (!item?.productName?.trim()) {
      return res.status(400).json({ error: "Falta el nombre de un ítem" });
    }
    if (typeof item?.unitPrice !== "number" || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      return res.status(400).json({ error: `El precio de "${item.productName}" es inválido` });
    }
    if (!Number.isInteger(item?.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: `La cantidad de "${item.productName}" es inválida` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: customerRows } = await client.query("SELECT id FROM customers WHERE id = $1", [customerId]);
    if (customerRows.length === 0) {
      throw new Error("El cliente no existe");
    }

    const { rows: sellerRows } = await client.query("SELECT id, username FROM users WHERE id = $1 AND role = 'Vendedor'", [sellerId]);
    if (sellerRows.length === 0) {
      throw new Error("El vendedor no existe o ya no tiene ese perfil");
    }
    const seller = sellerRows[0];

    const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const { rows: orderRows } = await client.query(
      "INSERT INTO orders (customer_id, seller_id, total, type) VALUES ($1, $2, $3, 'Regularización') RETURNING *",
      [customerId, sellerId, total]
    );
    const order = orderRows[0];

    const insertedItems = [];
    for (const item of items) {
      const subtotal = item.unitPrice * item.quantity;
      const { rows } = await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, product_code, color_name, unit_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [order.id, item.productId ?? null, item.productName.trim(), (item.productCode ?? "").trim(), (item.colorName ?? "").trim(), item.unitPrice, item.quantity, subtotal]
      );
      insertedItems.push(rows[0]);
    }

    if (payment !== undefined) {
      validatePaymentInput(payment);
      await applyPayment(client, order.id, total, null, { ...payment, registeredBy: seller.username });
    }
    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [order.id]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [order.id]);

    await client.query("COMMIT");
    res.status(201).json(mapOrder(finalOrderRows[0], insertedItems, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Registro de pago desde el panel admin: queda atribuido al usuario logueado.
app.post("/api/orders/:id/payments", requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  try {
    validatePaymentInput(req.body);
    const result = await registerPaymentTx(orderId, { ...req.body, registeredBy: req.user.sub });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Transición de estado a mano desde el panel: cuando el paquete ya se le
// entregó al courier/delivery, deja de estar "Pendiente de envío" y pasa a
// "Entregado a delivery". El resto del ciclo de vida (Registrado →
// Separación/Pendiente de envío) sigue calculándose solo a partir de los
// pagos, nunca a mano. Para Shalom/Olva/Marvisur, además exige que ya se
// haya subido el recibo del envío (ver PUT /api/orders/:id/receipt).
app.put("/api/orders/:id/deliver", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.status, o.receipt_image, c.delivery_type
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 FOR UPDATE OF o`,
      [id]
    );
    if (orderRows.length === 0) {
      throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });
    }
    const order = orderRows[0];
    if (order.status !== "Pendiente de envío") {
      throw new Error("Solo se puede marcar como entregado a delivery un pedido Pendiente de envío");
    }
    if (COURIER_DELIVERY_TYPES.includes(order.delivery_type) && !order.receipt_image) {
      throw new Error("Sube el recibo del envío antes de marcar el pedido como entregado a delivery");
    }
    const { rows } = await client.query(
      "UPDATE orders SET status = 'Entregado a delivery' WHERE id = $1 RETURNING *",
      [id]
    );
    const { rows: itemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [id]);
    await client.query("COMMIT");
    res.json(mapOrder(rows[0], itemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Guarda el recibo del envío (foto/captura) y una clave de rastreo opcional
// — pensado para Shalom/Olva/Marvisur, aunque el endpoint no lo exige (la
// restricción real está en /deliver, arriba).
app.put("/api/orders/:id/receipt", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { receiptImage, trackingCode } = req.body;
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  if (!receiptImage?.trim()) {
    return res.status(400).json({ error: "Sube el recibo del envío" });
  }
  const { rows } = await pool.query(
    "UPDATE orders SET receipt_image = $1, tracking_code = $2 WHERE id = $3 RETURNING *",
    [receiptImage.trim(), (trackingCode ?? "").trim(), id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Pedido no encontrado" });
  const { rows: itemRows } = await pool.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]);
  const { rows: paymentRows } = await pool.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [id]);
  res.json(mapOrder(rows[0], itemRows, paymentRows));
});

// Otra transición a mano: mientras un pedido está en "Separación" (pago
// parcial), deja marcar que el producto ya se apartó físicamente en el
// almacén, sin que eso cambie nada del cálculo de pagos/plazo.
app.put("/api/orders/:id/warehouse", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  const { rows } = await pool.query(
    "UPDATE orders SET status = 'Separado en almacén' WHERE id = $1 AND status = 'Separación' RETURNING *",
    [id]
  );
  if (rows.length === 0) {
    const { rows: existing } = await pool.query("SELECT id FROM orders WHERE id = $1", [id]);
    if (existing.length === 0) return res.status(404).json({ error: "Pedido no encontrado" });
    return res.status(400).json({ error: "Solo se puede marcar como separado en almacén un pedido en Separación" });
  }
  const { rows: itemRows } = await pool.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]);
  const { rows: paymentRows } = await pool.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [id]);
  res.json(mapOrder(rows[0], itemRows, paymentRows));
});

// Recalcula estado/plazo de un pedido después de que cambió su total (por
// agregar, editar o quitar un ítem) — misma regla que applyPayment: solo
// toca el estado si el pedido ya estaba en Separación/Pendiente de envío
// (es decir, si ya había al menos un pago); antes de eso no hay nada que
// recalcular. Si ya eligieron Contraentrega, el saldo pendiente no lo
// devuelve a Separación — quien reparte sigue cobrando el resto al entregar.
const recomputeOrderStatusForTotal = async (client, orderId, newTotal, order) => {
  if (order.status !== "Separación" && order.status !== "Pendiente de envío") {
    return { status: order.status, separationDeadline: order.separation_deadline };
  }
  const { rows: paidRows } = await client.query("SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE order_id = $1", [orderId]);
  const paid = Number(paidRows[0].paid);
  const isContraentrega = order.charge_type === "Contraentrega";
  const status = paid >= newTotal || isContraentrega ? "Pendiente de envío" : "Separación";
  const separationDeadline =
    status === "Separación" ? order.separation_deadline ?? new Date(Date.now() + SEPARATION_DAYS * 24 * 60 * 60 * 1000) : order.separation_deadline;
  return { status, separationDeadline };
};

// Agrega un producto o servicio a un pedido que ya existe, desde el panel
// admin. Productos se pueden agregar sin importar el tipo de delivery;
// servicios siguen solo para "Motorizado Delivery" (el motorizado puede
// volver a pasar por más mercadería antes de entregar). Recalcula el total
// y, si el pedido ya tenía algún pago (Separación o Pendiente de envío),
// también el estado — igual que applyPayment, pero disparado por un cambio
// de total en vez de un pago nuevo.
app.post("/api/orders/:id/items", requireAuth, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  const { productId, serviceId, colorName, quantity, discount } = req.body;
  const isProduct = Number.isInteger(productId);
  const isService = Number.isInteger(serviceId);
  if (isProduct === isService) {
    return res.status(400).json({ error: "Hay un ítem inválido" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "Hay un ítem inválido" });
  }
  if (isProduct && !colorName) {
    return res.status(400).json({ error: "Selecciona un color" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.total, o.status, o.charge_type, o.separation_deadline, c.delivery_type
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 FOR UPDATE OF o`,
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }
    const order = orderRows[0];
    if (isService && order.delivery_type !== "Motorizado Delivery") {
      throw new Error('Solo se pueden agregar servicios a pedidos con delivery "Motorizado Delivery"');
    }

    const settings = await getSettings();
    const maxDiscount = settings.maxItemDiscountAdmin;
    const requestedDiscount = discount ?? 0;
    if (typeof requestedDiscount !== "number" || !Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > maxDiscount) {
      return res.status(400).json({ error: `El descuento por ítem no puede superar S/.${maxDiscount}` });
    }

    let li;
    if (isService) {
      const { rows: serviceRows } = await client.query("SELECT id, name, code, price FROM services WHERE id = $1", [serviceId]);
      if (serviceRows.length === 0) {
        throw new Error(`El servicio #${serviceId} ya no existe`);
      }
      const service = serviceRows[0];
      const unitPrice = Number(service.price);
      const itemDiscount = Math.min(requestedDiscount, unitPrice * quantity);
      const subtotal = unitPrice * quantity - itemDiscount;
      li = { productId: null, serviceId: service.id, productName: service.name, productCode: service.code ?? "", colorName: "", unitPrice, quantity, discount: itemDiscount, subtotal };
    } else {
      const { rows: productRows } = await client.query("SELECT id, name, code, price, colors FROM products WHERE id = $1 FOR UPDATE", [productId]);
      if (productRows.length === 0) {
        throw new Error(`El producto #${productId} ya no existe`);
      }
      const product = productRows[0];
      const colors = product.colors ?? [];
      const colorIndex = colors.findIndex((c) => c.name === colorName);
      if (colorIndex === -1) {
        throw new Error(`"${product.name}" ya no tiene el color "${colorName}"`);
      }
      const color = colors[colorIndex];
      if (color.stock < quantity) {
        throw new Error(`No hay suficiente stock de "${product.name}" (${colorName}): quedan ${color.stock}`);
      }
      colors[colorIndex] = { ...color, stock: color.stock - quantity };
      await client.query("UPDATE products SET colors = $1 WHERE id = $2", [JSON.stringify(colors), product.id]);
      const unitPrice = Number(product.price);
      const itemDiscount = Math.min(requestedDiscount, unitPrice * quantity);
      const subtotal = unitPrice * quantity - itemDiscount;
      li = { productId: product.id, serviceId: null, productName: product.name, productCode: product.code ?? "", colorName, unitPrice, quantity, discount: itemDiscount, subtotal };
    }

    const newTotal = Number(order.total) + li.subtotal;
    await client.query(
      `INSERT INTO order_items (order_id, product_id, service_id, product_name, product_code, color_name, unit_price, quantity, discount, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [orderId, li.productId, li.serviceId, li.productName, li.productCode, li.colorName, li.unitPrice, li.quantity, li.discount, li.subtotal]
    );

    const { status: newStatus, separationDeadline: newDeadline } = await recomputeOrderStatusForTotal(client, orderId, newTotal, order);
    await client.query("UPDATE orders SET total = $1, status = $2, separation_deadline = $3 WHERE id = $4", [newTotal, newStatus, newDeadline, orderId]);

    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    const { rows: itemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [orderId]);
    await client.query("COMMIT");
    res.status(201).json(mapOrder(finalOrderRows[0], itemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Edita la cantidad (y el descuento) de un servicio ya agregado a un
// pedido — no aplica a productos, ahí lo editable es el color (ver el
// endpoint de arriba). Recalcula el total y, si corresponde, el estado.
app.put("/api/orders/:orderId/items/:itemId/service", requireAuth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const itemId = Number(req.params.itemId);
  const { quantity, discount } = req.body;
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    return res.status(400).json({ error: "Pedido o ítem inválido" });
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      "SELECT id, total, status, charge_type, separation_deadline FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }
    const order = orderRows[0];

    const { rows: itemRows } = await client.query(
      "SELECT id, service_id, unit_price, subtotal FROM order_items WHERE id = $1 AND order_id = $2",
      [itemId, orderId]
    );
    if (itemRows.length === 0) {
      throw new Error("El ítem no existe en este pedido");
    }
    const item = itemRows[0];
    if (item.service_id === null) {
      throw new Error("Solo se puede editar la cantidad de un servicio");
    }

    const settings = await getSettings();
    const maxDiscount = settings.maxItemDiscountAdmin;
    const requestedDiscount = discount ?? 0;
    if (typeof requestedDiscount !== "number" || !Number.isFinite(requestedDiscount) || requestedDiscount < 0 || requestedDiscount > maxDiscount) {
      throw new Error(`El descuento por ítem no puede superar S/.${maxDiscount}`);
    }

    const unitPrice = Number(item.unit_price);
    const newDiscount = Math.min(requestedDiscount, unitPrice * quantity);
    const newSubtotal = unitPrice * quantity - newDiscount;
    const newTotal = Number(order.total) - Number(item.subtotal) + newSubtotal;

    await client.query("UPDATE order_items SET quantity = $1, discount = $2, subtotal = $3 WHERE id = $4", [quantity, newDiscount, newSubtotal, itemId]);

    const { status: newStatus, separationDeadline: newDeadline } = await recomputeOrderStatusForTotal(client, orderId, newTotal, order);
    await client.query("UPDATE orders SET total = $1, status = $2, separation_deadline = $3 WHERE id = $4", [newTotal, newStatus, newDeadline, orderId]);

    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    const { rows: finalItemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [orderId]);
    await client.query("COMMIT");
    res.json(mapOrder(finalOrderRows[0], finalItemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Quita un servicio de un pedido (no aplica a productos). No deja vaciar el
// pedido del todo — para eso hay que eliminarlo entero.
app.delete("/api/orders/:orderId/items/:itemId", requireAuth, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(orderId) || !Number.isInteger(itemId)) {
    return res.status(400).json({ error: "Pedido o ítem inválido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      "SELECT id, total, status, charge_type, separation_deadline FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );
    if (orderRows.length === 0) {
      throw new Error("El pedido no existe");
    }
    const order = orderRows[0];

    const { rows: itemRows } = await client.query(
      "SELECT id, service_id, subtotal FROM order_items WHERE id = $1 AND order_id = $2",
      [itemId, orderId]
    );
    if (itemRows.length === 0) {
      throw new Error("El ítem no existe en este pedido");
    }
    const item = itemRows[0];
    if (item.service_id === null) {
      throw new Error("Solo se pueden quitar servicios");
    }

    const { rows: countRows } = await client.query("SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1", [orderId]);
    if (countRows[0].count <= 1) {
      throw new Error("El pedido no puede quedar sin ítems");
    }

    await client.query("DELETE FROM order_items WHERE id = $1", [itemId]);

    const newTotal = Number(order.total) - Number(item.subtotal);
    const { status: newStatus, separationDeadline: newDeadline } = await recomputeOrderStatusForTotal(client, orderId, newTotal, order);
    await client.query("UPDATE orders SET total = $1, status = $2, separation_deadline = $3 WHERE id = $4", [newTotal, newStatus, newDeadline, orderId]);

    const { rows: finalOrderRows } = await client.query("SELECT * FROM orders WHERE id = $1", [orderId]);
    const { rows: finalItemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [orderId]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [orderId]);
    await client.query("COMMIT");
    res.json(mapOrder(finalOrderRows[0], finalItemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Tipo de cobro del pedido (Normal/Contraentrega). Elegir "Contraentrega" en
// un pedido Motorizado Delivery/Shalom/Olva/Marvisur que todavía tiene
// saldo pendiente lo pasa a "Pendiente de envío" sin exigir que esté pagado
// del todo — quien reparte cobra el resto al entregar, y desde ahí ya se
// puede imprimir la etiqueta (con la línea "Cobrar" al final).
app.put("/api/orders/:id/charge-type", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { chargeType } = req.body;
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Pedido inválido" });
  }
  if (!["Normal", "Contraentrega"].includes(chargeType)) {
    return res.status(400).json({ error: "Tipo de cobro inválido" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: orderRows } = await client.query(
      `SELECT o.id, o.status, c.delivery_type
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1 FOR UPDATE OF o`,
      [id]
    );
    if (orderRows.length === 0) {
      throw new Error("Pedido no encontrado");
    }
    const order = orderRows[0];
    const newStatus =
      chargeType === "Contraentrega" && CHARGE_TYPE_DELIVERY_TYPES.includes(order.delivery_type) && order.status === "Separación"
        ? "Pendiente de envío"
        : order.status;
    const { rows } = await client.query(
      "UPDATE orders SET charge_type = $1, status = $2 WHERE id = $3 RETURNING *",
      [chargeType, newStatus, id]
    );
    const { rows: itemRows } = await client.query("SELECT * FROM order_items WHERE order_id = $1 ORDER BY id", [id]);
    const { rows: paymentRows } = await client.query("SELECT * FROM payments WHERE order_id = $1 ORDER BY id", [id]);
    await client.query("COMMIT");
    res.json(mapOrder(rows[0], itemRows, paymentRows));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Metadatos Open Graph/Twitter por ruta: así, cuando se comparte por
// WhatsApp el link de una de estas páginas, la vista previa muestra su
// propio título/ícono y la URL real (en vez de siempre el logo y la URL de
// inicio, que es lo que salía con las etiquetas fijas del index.html).
// El ícono y a qué ruta aplica cada uno quedan fijos acá; el título y la
// descripción son editables desde el panel (tabla route_meta).
const ROUTE_KEYS = [
  { key: "regularizacion-separaciones", prefix: "/regularizacion-separaciones", image: "/og-regularizacion.png" },
  { key: "registro-pedido", prefix: "/registro-pedido", image: "/og-registro-pedido.png" },
  { key: "registro-cliente", prefix: "/registro-cliente", image: "/og-registro-cliente.png" },
  { key: "catalogo", prefix: "/catalogo", image: "/og-catalogo.png" },
];
const DEFAULT_ROUTE_KEY = "default";
const DEFAULT_ROUTE_IMAGE = "/chicBags.jpeg";
const DEFAULT_ROUTE_META = { title: "ChicBags", description: "Tu tienda de confianza" };

// Etiqueta/ruta para mostrar en el panel admin (el título/descripción sí
// vienen de la base de datos).
const ROUTE_META_ADMIN_INFO = {
  default: { label: "Inicio", path: "/" },
  "registro-pedido": { label: "Registrar pedido", path: "/registro-pedido" },
  "registro-cliente": { label: "Registro de cliente", path: "/registro-cliente" },
  "regularizacion-separaciones": { label: "Regularización de Separaciones", path: "/regularizacion-separaciones" },
  catalogo: { label: "Catálogo", path: "/catalogo" },
};

app.get("/api/route-meta", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT route_key, title, description FROM route_meta ORDER BY route_key");
  res.json(
    rows.map((r) => ({
      key: r.route_key,
      label: ROUTE_META_ADMIN_INFO[r.route_key]?.label ?? r.route_key,
      path: ROUTE_META_ADMIN_INFO[r.route_key]?.path ?? `/${r.route_key}`,
      title: r.title,
      description: r.description,
    }))
  );
});

app.put("/api/route-meta/:key", requireAuth, async (req, res) => {
  const { title, description } = req.body;
  if (!title?.trim() || !description?.trim()) {
    return res.status(400).json({ error: "Completa el título y la descripción" });
  }
  const { rows } = await pool.query(
    "UPDATE route_meta SET title = $1, description = $2 WHERE route_key = $3 RETURNING *",
    [title.trim(), description.trim(), req.params.key]
  );
  if (rows.length === 0) return res.status(404).json({ error: "No existe esa ruta" });
  res.json({ key: rows[0].route_key, title: rows[0].title, description: rows[0].description });
});

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const replaceMetaContent = (html, selectorRegex, value) => html.replace(selectorRegex, (_match, before, after) => `${before}${escapeHtml(value)}${after}`);

// En producción, este mismo servicio sirve la web ya compilada (dist/) y
// resuelve las rutas del cliente (React Router) devolviendo el index.html,
// con los metadatos de la ruta ya reemplazados.
if (existsSync(DIST_DIR)) {
  // { index: false } para que también pase por acá la ruta "/" y le
  // calculemos su og:url real, en vez de que express.static la sirva tal
  // cual desde disco (sin pasar por el reemplazo de abajo).
  app.use(express.static(DIST_DIR, { index: false }));

  let indexHtmlTemplate = null;

  app.get(/^(?!\/api\/).*/, async (req, res) => {
    if (!indexHtmlTemplate) {
      indexHtmlTemplate = await readFile(path.join(DIST_DIR, "index.html"), "utf-8");
    }
    const matchedRoute = ROUTE_KEYS.find((r) => req.path.startsWith(r.prefix));
    const routeKey = matchedRoute?.key ?? DEFAULT_ROUTE_KEY;
    const { rows: metaRows } = await pool.query("SELECT title, description FROM route_meta WHERE route_key = $1", [routeKey]);
    const meta = {
      title: metaRows[0]?.title ?? DEFAULT_ROUTE_META.title,
      description: metaRows[0]?.description ?? DEFAULT_ROUTE_META.description,
      image: matchedRoute?.image ?? DEFAULT_ROUTE_IMAGE,
    };
    const origin = `${req.protocol}://${req.get("host")}`;
    const url = `${origin}${req.originalUrl}`;
    const image = meta.image.startsWith("http") ? meta.image : `${origin}${meta.image}`;

    let html = indexHtmlTemplate;
    html = replaceMetaContent(html, /(<title>)[^<]*(<\/title>)/, meta.title);
    html = replaceMetaContent(html, /(<meta name="description" content=")[^"]*(")/, meta.description);
    html = replaceMetaContent(html, /(<meta property="og:title" content=")[^"]*(")/, meta.title);
    html = replaceMetaContent(html, /(<meta property="og:description" content=")[^"]*(")/, meta.description);
    html = replaceMetaContent(html, /(<meta property="og:image" content=")[^"]*(")/, image);
    html = replaceMetaContent(html, /(<meta property="og:url" content=")[^"]*(")/, url);
    html = replaceMetaContent(html, /(<meta name="twitter:title" content=")[^"]*(")/, meta.title);
    html = replaceMetaContent(html, /(<meta name="twitter:description" content=")[^"]*(")/, meta.description);
    html = replaceMetaContent(html, /(<meta name="twitter:image" content=")[^"]*(")/, image);

    res.set("Content-Type", "text/html");
    res.send(html);
  });
}

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API de ChicBags corriendo en http://localhost:${PORT}`);
});
