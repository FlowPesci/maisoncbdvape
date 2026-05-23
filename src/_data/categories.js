import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, "../data-source/categories.json");
const raw = JSON.parse(readFileSync(SOURCE, "utf8"));
export default Array.isArray(raw) ? raw : (raw.categories || []);
