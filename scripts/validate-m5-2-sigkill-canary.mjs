#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runM52SigkillCanary } from "../src/validation/m5-2-sigkill-canary.mjs";

const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-sigkill-"));
try {
  const result = await runM52SigkillCanary({ temporaryParent });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  fs.rmSync(temporaryParent, { recursive: true, force: true });
}
