import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { canonicalJson } from "../canonical-json.mjs";

const execFileAsync = promisify(execFile);

function filesUnder(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

export function digestCodexSchemaDirectory(directory) {
  const files = filesUnder(directory).sort((left, right) =>
    path.relative(directory, left).localeCompare(path.relative(directory, right)),
  );
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(directory, file));
    hash.update("\0");
    hash.update(canonicalJson(JSON.parse(fs.readFileSync(file, "utf8"))));
    hash.update("\0");
  }
  return { fileCount: files.length, digest: `sha256:${hash.digest("hex")}` };
}

export async function generateCodexProtocolDigest(command) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-schema-"));
  try {
    await execFileAsync(
      command,
      ["app-server", "generate-json-schema", "--out", directory],
      { timeout: 30_000 },
    );
    return digestCodexSchemaDirectory(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
