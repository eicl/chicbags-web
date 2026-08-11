import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { mkdir } from "fs/promises";
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
  category: row.category,
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
  await pool.query("UPDATE products SET category = $1 WHERE category = $2", [name, current[0].name]);
  const { rows } = await pool.query("UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name", [name, id]);
  res.json(rows[0]);
});

app.delete("/api/categories/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { rows: current } = await pool.query("SELECT name FROM categories WHERE id = $1", [id]);
  if (current.length === 0) return res.status(404).json({ error: "Categoría no encontrada" });
  const { rows: inUse } = await pool.query("SELECT COUNT(*)::int AS count FROM products WHERE category = $1", [current[0].name]);
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

const insertCustomer = async (body) => {
  const {
    documentType, documentNumber, firstName, paternalSurname, maternalSurname,
    mobile, department, province, district, deliveryType, deliveryMode, agency, address,
  } = body;
  const deliveryModeValue = DELIVERY_MODE_REQUIRED.includes(deliveryType) ? deliveryMode : null;
  const agencyValue = AGENCY_REQUIRED.includes(deliveryType) ? (agency ?? "").trim() : "";
  const addressValue = ADDRESS_REQUIRED.includes(deliveryType) ? (address ?? "").trim() : "";
  await ensureDistrictExists(province, district);
  const { rows } = await pool.query(
    `INSERT INTO customers (document_type, document_number, first_name, paternal_surname, maternal_surname, mobile, country, department, province, district, delivery_type, delivery_mode, agency, address)
     VALUES ($1, $2, $3, $4, $5, $6, 'Perú', $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [documentType, documentNumber.trim(), firstName.trim(), paternalSurname.trim(), (maternalSurname ?? "").trim(), mobile.trim(), department, province, district.trim(), deliveryType, deliveryModeValue, agencyValue, addressValue]
  );
  return rows[0];
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
  try {
    const row = await insertCustomer(req.body);
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
  } = req.body;
  const deliveryModeValue = DELIVERY_MODE_REQUIRED.includes(deliveryType) ? deliveryMode : null;
  const agencyValue = AGENCY_REQUIRED.includes(deliveryType) ? (agency ?? "").trim() : "";
  const addressValue = ADDRESS_REQUIRED.includes(deliveryType) ? (address ?? "").trim() : "";
  await ensureDistrictExists(province, district);
  try {
    const { rows } = await pool.query(
      `UPDATE customers SET document_type = $1, document_number = $2, first_name = $3, paternal_surname = $4,
         maternal_surname = $5, mobile = $6, department = $7, province = $8, district = $9, delivery_type = $10, delivery_mode = $11, agency = $12, address = $13
       WHERE id = $14 RETURNING *`,
      [documentType, documentNumber.trim(), firstName.trim(), paternalSurname.trim(), (maternalSurname ?? "").trim(), mobile.trim(), department, province, district.trim(), deliveryType, deliveryModeValue, agencyValue, addressValue, id]
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

app.get("/api/products/:id", async (req, res) => {
  const includeCost = isAuthenticated(req);
  const { rows } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [Number(req.params.id)]);
  if (rows.length === 0) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(mapProduct(rows[0], includeCost));
});

app.post("/api/products", requireAuth, async (req, res) => {
  const { name, price, category, description, image, colors, code, brand, photos, videos, extraDescription, sortOrder, cost } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  const { rows } = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products");
  const id = rows[0].next_id;
  const brandId = await getOrCreateBrandId(brand);
  await ensureCategoryExists(category);
  const { rows: inserted } = await pool.query(
    `INSERT INTO products (id, name, price, category, description, image, colors, code, brand_id, photos, videos, extra_description, sort_order, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [
      id, name, price, category, description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
      brandId, JSON.stringify(photos ?? []), JSON.stringify(videos ?? []), extraDescription ?? "",
      Number.isFinite(sortOrder) ? sortOrder : id, Number.isFinite(cost) ? cost : null,
    ]
  );
  const { rows: fetched } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [inserted[0].id]);
  res.status(201).json(mapProduct(fetched[0], true));
});

app.put("/api/products/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price, category, description, image, colors, code, brand, photos, videos, extraDescription, sortOrder, cost } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  const brandId = await getOrCreateBrandId(brand);
  await ensureCategoryExists(category);
  const { rows } = await pool.query(
    `UPDATE products SET name = $1, price = $2, category = $3, description = $4, image = $5, colors = $6, code = $7, brand_id = $8, photos = $9, videos = $10, extra_description = $11, sort_order = $12, cost = $13
     WHERE id = $14 RETURNING id`,
    [
      name, price, category, description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
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

const mapOrder = (order, items) => ({
  id: order.id,
  customerId: order.customer_id,
  sellerId: order.seller_id,
  total: Number(order.total),
  createdAt: order.created_at,
  items: items.map((i) => ({
    id: i.id,
    productId: i.product_id,
    productName: i.product_name,
    colorName: i.color_name,
    unitPrice: Number(i.unit_price),
    quantity: i.quantity,
    subtotal: Number(i.subtotal),
  })),
});

app.get("/api/orders", requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      o.id, o.customer_id, o.seller_id, o.total, o.created_at,
      c.first_name, c.paternal_surname, c.maternal_surname, c.document_type, c.document_number, c.mobile,
      u.username AS seller_username,
      COALESCE(
        json_agg(
          json_build_object(
            'id', oi.id, 'productId', oi.product_id, 'productName', oi.product_name,
            'colorName', oi.color_name, 'unitPrice', oi.unit_price, 'quantity', oi.quantity, 'subtotal', oi.subtotal
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL),
        '[]'
      ) AS items
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    LEFT JOIN users u ON u.id = o.seller_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    GROUP BY o.id, c.first_name, c.paternal_surname, c.maternal_surname, c.document_type, c.document_number, c.mobile, u.username
    ORDER BY o.id DESC
  `);
  res.json(
    rows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      customerName: [row.first_name, row.paternal_surname, row.maternal_surname].filter(Boolean).join(" "),
      customerDocument: `${row.document_type} ${row.document_number}`,
      customerMobile: row.mobile,
      sellerId: row.seller_id,
      sellerName: row.seller_username ?? "",
      total: Number(row.total),
      createdAt: row.created_at,
      items: row.items.map((i) => ({ ...i, unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
    }))
  );
});

// Registro público de pedidos: fuera del panel admin. Valida el stock de
// cada producto/color dentro de una transacción (con FOR UPDATE para
// evitar que dos pedidos a la vez vendan el mismo stock), lo descuenta y
// recién ahí crea el pedido — si algo falla, no se descuenta nada.
app.post("/api/orders/register", async (req, res) => {
  const { customerId, sellerId, items } = req.body;
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
    if (!Number.isInteger(item?.productId) || !item?.colorName || !Number.isInteger(item?.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: "Hay un producto inválido en el pedido" });
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: customerRows } = await client.query("SELECT id FROM customers WHERE id = $1", [customerId]);
    if (customerRows.length === 0) {
      throw new Error("El cliente no existe");
    }

    const { rows: sellerRows } = await client.query("SELECT id FROM users WHERE id = $1 AND role = 'Vendedor'", [sellerId]);
    if (sellerRows.length === 0) {
      throw new Error("El vendedor no existe o ya no tiene ese perfil");
    }

    const lineItems = [];
    let total = 0;

    for (const item of items) {
      const { rows: productRows } = await client.query(
        "SELECT id, name, price, colors FROM products WHERE id = $1 FOR UPDATE",
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
      const subtotal = unitPrice * item.quantity;
      total += subtotal;
      lineItems.push({
        productId: product.id,
        productName: product.name,
        colorName: item.colorName,
        unitPrice,
        quantity: item.quantity,
        subtotal,
      });
    }

    const { rows: orderRows } = await client.query(
      "INSERT INTO orders (customer_id, seller_id, total) VALUES ($1, $2, $3) RETURNING *",
      [customerId, sellerId, total]
    );
    const order = orderRows[0];

    const insertedItems = [];
    for (const li of lineItems) {
      const { rows } = await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, color_name, unit_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [order.id, li.productId, li.productName, li.colorName, li.unitPrice, li.quantity, li.subtotal]
      );
      insertedItems.push(rows[0]);
    }

    await client.query("COMMIT");
    res.status(201).json(mapOrder(order, insertedItems));
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// En producción, este mismo servicio sirve la web ya compilada (dist/) y
// resuelve las rutas del cliente (React Router) devolviendo el index.html.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
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
