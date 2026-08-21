import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { CodexAppServerAdapter } from "../src/adapters/codex-app-server.mjs";

const execFileAsync = promisify(execFile);
const command = process.env.CODEX_BIN ?? "/opt/homebrew/bin/codex";
const adapter = new CodexAppServerAdapter();
const result = {
  command,
  version: null,
  protocolSchema: null,
  probe: null,
  threadStart: null,
  persistedLifecycle: { state: "not-run", code: "requires_live_first_turn" },
  liveMarker: { state: "not-run", code: "codex_live_marker_gated" },
  cleanup: { attempted: false, threadDeleted: false },
};
let created = null;

function filesUnder(root) {
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...filesUnder(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

async function generateProtocolDigest() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-schema-"));
  try {
    await execFileAsync(
      command,
      ["app-server", "generate-json-schema", "--out", directory],
      { timeout: 30_000 },
    );
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
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

try {
  const version = await execFileAsync(command, ["--version"], { timeout: 15_000 });
  result.version = version.stdout.trim();
  result.protocolSchema = await generateProtocolDigest();
  result.probe = await adapter.probe({ command, cwd: process.cwd() });
  result.threadStart = await adapter.validateThreadStart({
    command,
    cwd: process.cwd(),
  });
} catch (error) {
  const code = error?.code ?? "unknown_error";
  const blocked = ["codex_app_server_quota_error", "codex_app_server_auth_error"].includes(code);
  const failure = {
    state: blocked ? "blocked" : "failed",
    code,
  };
  if (!result.threadStart) result.threadStart = failure;
  else result.liveMarker = failure;
} finally {
  if (created?.threadId) {
    result.cleanup.attempted = true;
    try {
      const deleted = await adapter.deleteThread({
        command,
        cwd: process.cwd(),
        threadId: created.threadId,
      });
      result.cleanup.threadDeleted = deleted.deleted;
      result.cleanup.snapshotDigest = deleted.snapshotDigest;
    } catch (error) {
      result.cleanup.errorCode = error?.code ?? "unknown_cleanup_error";
    }
  }
}

console.log(JSON.stringify(result, null, 2));
if (result.threadStart?.state === "failed" || result.liveMarker.state === "failed") process.exitCode = 1;
if (result.threadStart?.state === "blocked" || result.liveMarker.state === "blocked") process.exitCode = 2;
if (result.cleanup.attempted && !result.cleanup.threadDeleted) process.exitCode = 1;
