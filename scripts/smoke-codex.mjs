import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { CodexAppServerAdapter } from "../src/adapters/codex-app-server.mjs";
import { generateCodexProtocolDigest } from "../src/validation/codex-schema-digest.mjs";

const execFileAsync = promisify(execFile);
const command = process.env.CODEX_BIN ?? "/opt/homebrew/bin/codex";
const adapter = new CodexAppServerAdapter();
const result = {
  commandName: path.basename(command),
  version: null,
  protocolSchema: null,
  probe: null,
  threadStart: null,
  persistedLifecycle: { state: "not-run", code: "requires_live_first_turn" },
  liveMarker: { state: "not-run", code: "codex_live_marker_gated" },
  cleanup: { attempted: false, threadDeleted: false },
};
let created = null;

try {
  const version = await execFileAsync(command, ["--version"], { timeout: 15_000 });
  result.version = version.stdout.trim();
  result.protocolSchema = await generateCodexProtocolDigest(command);
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
