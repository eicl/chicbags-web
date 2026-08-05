import "dotenv/config";
import { pool, initSchema } from "./db.js";
import { buildProducts, IMAGES_DIR } from "./seed-data.mjs";

const products = buildProducts();

await initSchema();
for (const p of products) {
  await pool.query(
    `INSERT INTO products (id, name, price, category, description, image, colors, code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, price = EXCLUDED.price, category = EXCLUDED.category,
       description = EXCLUDED.description, image = EXCLUDED.image, colors = EXCLUDED.colors,
       code = EXCLUDED.code`,
    [p.id, p.name, p.price, p.category, p.description, p.image, JSON.stringify(p.colors), p.code]
  );
}
await pool.end();
console.log(`Seed insertado en la base de datos (${products.length} productos)`);
console.log(`Imágenes generadas en ${IMAGES_DIR}`);
