import { createHash } from "node:crypto";
import fs from "node:fs";
import process from "node:process";

import { AcpStdioAdapter } from "../src/adapters/acp-stdio.mjs";

const command = process.env.KIMI_BIN ?? "/Users/veil/.kimi-code/bin/kimi";
const adapter = new AcpStdioAdapter();
const startedAt = new Date().toISOString();
const result = {
  command,
  commandDigest: null,
  startedAt,
  finishedAt: null,
  probe: null,
  lifecycle: null,
  livePrompt: { state: "not-run", code: "kimi_live_marker_gated" },
  cleanup: { attempted: false, sessionDeleted: false, absenceVerified: false },
};
let created = null;

async function fileDigest(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

try {
  result.commandDigest = await fileDigest(command);
  result.probe = await adapter.probe({ command, args: ["acp"], cwd: process.cwd() });
  created = await adapter.createSession({ command, args: ["acp"], cwd: process.cwd() });
  const present = await adapter.sessionExists({
    command,
    args: ["acp"],
    cwd: process.cwd(),
    sessionId: created.sessionId,
  });
  if (!present.exists) throw new Error("kimi_session_not_listed_after_create");
  result.lifecycle = {
    state: "passed",
    sessionId: created.sessionId,
    listedAfterCreate: true,
    snapshotDigest: present.snapshotDigest,
  };
} catch (error) {
  const detail = error?.message ?? String(error);
  const quotaBlocked =
    error?.code === "acp_agent_quota_error" ||
    (/403/.test(detail) && /usage limit|billing cycle/i.test(detail));
  const failure = {
    state: quotaBlocked ? "blocked" : "failed",
    code: quotaBlocked ? "kimi_quota_exhausted" : (error?.code ?? "unknown_error"),
  };
  if (!result.lifecycle) result.lifecycle = failure;
  else result.livePrompt = failure;
} finally {
  if (created?.sessionId) {
    result.cleanup.attempted = true;
    try {
      const deleted = await adapter.deleteSession({
        command,
        args: ["acp"],
        cwd: process.cwd(),
        sessionId: created.sessionId,
      });
      result.cleanup.sessionDeleted = deleted.deleted;
      const remaining = await adapter.sessionExists({
        command,
        args: ["acp"],
        cwd: process.cwd(),
        sessionId: created.sessionId,
      });
      result.cleanup.absenceVerified = remaining.exists === false;
      result.cleanup.snapshotDigest = remaining.snapshotDigest;
    } catch (error) {
      result.cleanup.errorCode = error?.code ?? "unknown_cleanup_error";
    }
  }
  result.finishedAt = new Date().toISOString();
}

console.log(JSON.stringify(result, null, 2));
if (result.lifecycle?.state === "failed" || result.livePrompt.state === "failed") process.exitCode = 1;
if (result.lifecycle?.state === "blocked" || result.livePrompt.state === "blocked") process.exitCode = 2;
if (
  result.cleanup.attempted &&
  (!result.cleanup.sessionDeleted || !result.cleanup.absenceVerified)
) {
  process.exitCode = 1;
}
