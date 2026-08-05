import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { pool, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await initSchema();
const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM products");
await pool.end();

if (rows[0].count > 0) {
  console.log("La base de datos ya tiene productos, se omite el seed.");
} else {
  const result = spawnSync(process.execPath, [path.join(__dirname, "seed.mjs")], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
