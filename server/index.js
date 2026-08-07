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
import { pool, initSchema, getOrCreateBrandId } from "./db.js";

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

const mapProduct = (row) => ({
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
  const { rows } = await pool.query(`${PRODUCTS_SELECT} ORDER BY p.id`);
  res.json(rows.map(mapProduct));
});

app.get("/api/categories", async (req, res) => {
  const { rows } = await pool.query("SELECT DISTINCT category FROM products ORDER BY category");
  res.json(["Todos", ...rows.map((r) => r.category)]);
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

app.get("/api/users", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT id, username FROM users ORDER BY username");
  res.json(rows);
});

app.post("/api/users", requireAuth, async (req, res) => {
  const username = (req.body.username ?? "").trim();
  const password = req.body.password ?? "";
  if (!username || !password) return res.status(400).json({ error: "Usuario y contraseña son obligatorios" });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE lower(username) = lower($1)", [username]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username",
    [username, passwordHash]
  );
  res.status(201).json(rows[0]);
});

app.put("/api/users/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const username = (req.body.username ?? "").trim();
  const password = req.body.password ?? "";
  if (!username) return res.status(400).json({ error: "El usuario es obligatorio" });
  if (password && password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE lower(username) = lower($1) AND id != $2", [username, id]);
  if (existing.length > 0) return res.status(409).json({ error: "Ya existe un usuario con ese nombre" });

  const { rows } = password
    ? await pool.query(
        "UPDATE users SET username = $1, password_hash = $2 WHERE id = $3 RETURNING id, username",
        [username, await bcrypt.hash(password, 10), id]
      )
    : await pool.query("UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username", [username, id]);

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

app.get("/api/products/:id", async (req, res) => {
  const { rows } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [Number(req.params.id)]);
  if (rows.length === 0) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(mapProduct(rows[0]));
});

app.post("/api/products", requireAuth, async (req, res) => {
  const { name, price, category, description, image, colors, code, brand, photos, videos } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  const { rows } = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products");
  const id = rows[0].next_id;
  const brandId = await getOrCreateBrandId(brand);
  const { rows: inserted } = await pool.query(
    `INSERT INTO products (id, name, price, category, description, image, colors, code, brand_id, photos, videos)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [
      id, name, price, category, description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
      brandId, JSON.stringify(photos ?? []), JSON.stringify(videos ?? []),
    ]
  );
  const { rows: fetched } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [inserted[0].id]);
  res.status(201).json(mapProduct(fetched[0]));
});

app.put("/api/products/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price, category, description, image, colors, code, brand, photos, videos } = req.body;
  const mediaError = validateMedia(photos, videos);
  if (mediaError) return res.status(400).json({ error: mediaError });
  const brandId = await getOrCreateBrandId(brand);
  const { rows } = await pool.query(
    `UPDATE products SET name = $1, price = $2, category = $3, description = $4, image = $5, colors = $6, code = $7, brand_id = $8, photos = $9, videos = $10
     WHERE id = $11 RETURNING id`,
    [
      name, price, category, description ?? "", image ?? "", JSON.stringify(colors ?? []), code ?? null,
      brandId, JSON.stringify(photos ?? []), JSON.stringify(videos ?? []), id,
    ]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Producto no encontrado" });
  const { rows: fetched } = await pool.query(`${PRODUCTS_SELECT} WHERE p.id = $1`, [id]);
  res.json(mapProduct(fetched[0]));
});

app.delete("/api/products/:id", requireAuth, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM products WHERE id = $1", [Number(req.params.id)]);
  if (rowCount === 0) return res.status(404).json({ error: "Producto no encontrado" });
  res.status(204).end();
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
