import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { verifyExternalReviewGate } from "../src/validation/external-review-gate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = verifyExternalReviewGate({ root });
console.log(JSON.stringify(result, null, 2));
if (!result.satisfied) process.exitCode = 3;

