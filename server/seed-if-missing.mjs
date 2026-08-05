import "dotenv/config";
import { pool, initSchema } from "./db.js";
import { buildProducts, IMAGES_DIR } from "./seed-data.mjs";

// El filesystem de Render es efímero: en cada deploy hay que regenerar los
// archivos de imagen aunque la base de datos ya tenga productos guardados.
const products = buildProducts();
console.log(`Imágenes regeneradas en ${IMAGES_DIR}`);

await initSchema();
const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM products");

if (rows[0].count > 0) {
  console.log("La base de datos ya tiene productos, se omite el seed.");
} else {
  for (const p of products) {
    await pool.query(
      "INSERT INTO products (id, name, price, category, description, image, colors, code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [p.id, p.name, p.price, p.category, p.description, p.image, JSON.stringify(p.colors), p.code]
    );
  }
  console.log(`Seed insertado en la base de datos (${products.length} productos)`);
}
await pool.end();
