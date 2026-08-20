import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { CodexAppServerAdapter } from "../src/adapters/codex-app-server.mjs";
import { canonicalJson } from "../src/canonical-json.mjs";

const execFileAsync = promisify(execFile);
const command = process.env.CODEX_BIN ?? "/opt/homebrew/bin/codex";
const liveEnabled = process.env.THREADMESH_CODEX_LIVE === "1";
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

function liveEnvelope() {
  const now = new Date();
  return {
    specVersion: "0.0-draft",
    messageId: `msg_codex_live_${now.getTime()}`,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "unverified",
    sender: {
      taskId: "task_live_sender",
      incarnationId: "inc_live_sender01",
      actorType: "agent",
      harness: "threadmesh-smoke",
    },
    target: {
      taskId: "task_live_codex",
      incarnationId: "inc_live_codex01",
      harness: "codex-app-server",
    },
    relationshipId: "rel_live_codex",
    content: "Reply with exactly CODEX_THREADMESH_LIVE_OK and do not use tools.",
    reason: "Bounded live adapter marker validation.",
    evidenceRefs: [],
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };
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

  if (liveEnabled) {
    const envelope = liveEnvelope();
    const live = await adapter.startThreadWithAcceptedSuggestion({
      command,
      cwd: process.cwd(),
      envelope,
      admission: {
        decision: "accepted",
        receiverIncarnationId: envelope.target.incarnationId,
        revision: 1,
      },
      adapterIdempotencyKey: `idem_${envelope.messageId}`,
      timeoutMs: 120_000,
    });
    created = live.adapterRef;
    const resumed = await adapter.resumeThread({
      command,
      cwd: process.cwd(),
      threadId: created.threadId,
    });
    result.persistedLifecycle = {
      state: "passed",
      threadId: created.threadId,
      resumedThreadId: resumed.threadId,
      snapshotDigest: resumed.snapshotDigest,
    };
    const exactSuccess =
      live.text.trim() === "CODEX_THREADMESH_LIVE_OK" &&
      live.truncated === false &&
      live.evidence.turnStatus === "completed" &&
      live.evidence.serverRequestDeniedCount === 0;
    result.liveMarker = exactSuccess
      ? live
      : {
          state: "failed",
          code: "codex_smoke_marker_mismatch",
          text: live.text,
          evidence: live.evidence,
        };
  }
} catch (error) {
  const code = error?.code ?? "unknown_error";
  const blocked = ["codex_app_server_quota_error", "codex_app_server_auth_error"].includes(code);
  const failure = {
    state: blocked ? "blocked" : "failed",
    code,
    detail: error?.message ?? String(error),
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
      result.cleanup.error = error?.code ?? error?.message ?? String(error);
    }
  }
}

console.log(JSON.stringify(result, null, 2));
if (result.threadStart?.state === "failed" || result.liveMarker.state === "failed") process.exitCode = 1;
if (result.threadStart?.state === "blocked" || result.liveMarker.state === "blocked") process.exitCode = 2;
if (result.cleanup.attempted && !result.cleanup.threadDeleted) process.exitCode = 1;
