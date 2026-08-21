import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { digestCodexSchemaDirectory } from "../src/validation/codex-schema-digest.mjs";

test("Codex schema digest is stable across JSON object-key order", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-schema-digest-"));
  try {
    fs.mkdirSync(path.join(directory, "nested"));
    fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify({ z: 1, a: 2 }));
    fs.writeFileSync(path.join(directory, "nested", "b.json"), JSON.stringify({ b: 3, a: 4 }));
    const first = digestCodexSchemaDirectory(directory);
    fs.writeFileSync(path.join(directory, "a.json"), JSON.stringify({ a: 2, z: 1 }));
    fs.writeFileSync(path.join(directory, "nested", "b.json"), JSON.stringify({ a: 4, b: 3 }));
    const second = digestCodexSchemaDirectory(directory);
    assert.equal(first.fileCount, 2);
    assert.deepEqual(second, first);
    assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
