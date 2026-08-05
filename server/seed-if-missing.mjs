import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(__dirname, "data", "products.json");

if (existsSync(dataFile)) {
  console.log("server/data/products.json ya existe, se omite el seed.");
} else {
  const result = spawnSync(process.execPath, [path.join(__dirname, "seed.mjs")], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
