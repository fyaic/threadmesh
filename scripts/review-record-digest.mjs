import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/canonical-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const relative = process.argv[2];
const allowedRoot = path.join(root, "docs", "09-reviews", "external");
const absolute = relative ? path.resolve(root, relative) : "";
if (!relative || !absolute.startsWith(`${allowedRoot}${path.sep}`) || !absolute.endsWith(".json")) {
  console.error("usage: npm run review:hash -- docs/09-reviews/external/<review>.json");
  process.exit(1);
}
const record = JSON.parse(fs.readFileSync(absolute, "utf8"));
console.log(sha256Digest(record));

