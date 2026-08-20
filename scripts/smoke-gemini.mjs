import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { GeminiHeadlessAdapter } from "../src/adapters/gemini-headless.mjs";

const execFileAsync = promisify(execFile);
const command = process.env.NPX_BIN ?? "/opt/homebrew/bin/npx";
const npmCommand = process.env.NPM_BIN ?? "/opt/homebrew/bin/npm";
const packageSpecifier = "@google/gemini-cli@0.56.0";
const expectedIntegrity = "sha512-q4oBfb/Oh/HNLMYBOJMp88/QQ8hLffnB0ykoVThi6A5isbGHJ/ylWLMosMGqukKY0Q1Jv/XRDpb46Q1BV+zQqw==";
const baseArgs = ["--yes", packageSpecifier];
const liveEnabled = process.env.THREADMESH_GEMINI_LIVE === "1";
const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-gemini-home-"));
const adapter = new GeminiHeadlessAdapter();
const result = {
  command,
  packageSpecifier,
  packageIntegrity: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  probe: null,
  liveMarker: { state: "not-run", code: "gemini_live_marker_gated" },
  cleanup: { attempted: false, isolatedHomeRemoved: false },
};

function liveEnvelope() {
  const now = new Date();
  return {
    specVersion: "0.0-draft",
    messageId: `msg_gemini_live_${now.getTime()}`,
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
      taskId: "task_live_gemini",
      incarnationId: "inc_live_gemini01",
      harness: "gemini-headless",
    },
    relationshipId: "rel_live_gemini",
    content: "Reply with exactly GEMINI_THREADMESH_LIVE_OK and do not use tools.",
    reason: "Bounded live adapter marker validation.",
    evidenceRefs: [],
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
  };
}

try {
  const integrity = await execFileAsync(
    npmCommand,
    ["view", packageSpecifier, "dist.integrity"],
    { timeout: 30_000 },
  );
  result.packageIntegrity = integrity.stdout.trim();
  if (result.packageIntegrity !== expectedIntegrity) {
    throw new Error("gemini_package_integrity_mismatch");
  }
  const env = { GEMINI_CLI_HOME: temporaryHome };
  result.probe = await adapter.probe({
    command,
    baseArgs,
    cwd: process.cwd(),
    env,
    timeoutMs: 60_000,
  });

  if (liveEnabled) {
    if (typeof process.env.GEMINI_API_KEY !== "string" || process.env.GEMINI_API_KEY.length === 0) {
      result.liveMarker = { state: "blocked", code: "gemini_api_key_not_authorized" };
    } else {
      const envelope = liveEnvelope();
      const live = await adapter.runAcceptedSuggestion({
        command,
        baseArgs,
        cwd: process.cwd(),
        env: { ...env, GEMINI_API_KEY: process.env.GEMINI_API_KEY },
        envelope,
        admission: {
          decision: "accepted",
          receiverIncarnationId: envelope.target.incarnationId,
          revision: 1,
        },
        sessionId: randomUUID(),
        timeoutMs: 120_000,
      });
      const exactSuccess =
        live.text.trim() === "GEMINI_THREADMESH_LIVE_OK" &&
        live.truncated === false &&
        live.evidence.toolUseCount === 0;
      result.liveMarker = exactSuccess
        ? live
        : {
            state: "failed",
            code: "gemini_smoke_marker_mismatch",
            text: live.text,
            evidence: live.evidence,
          };
    }
  }
} catch (error) {
  const code = error?.code ?? "unknown_error";
  const blocked = ["gemini_quota_error", "gemini_auth_error"].includes(code);
  result.liveMarker = {
    state: blocked ? "blocked" : "failed",
    code,
    detail: error?.message ?? String(error),
  };
} finally {
  result.cleanup.attempted = true;
  fs.rmSync(temporaryHome, { recursive: true, force: false });
  result.cleanup.isolatedHomeRemoved = !fs.existsSync(temporaryHome);
  result.finishedAt = new Date().toISOString();
}

console.log(JSON.stringify(result, null, 2));
if (result.liveMarker.state === "failed" || !result.cleanup.isolatedHomeRemoved) process.exitCode = 1;
if (result.liveMarker.state === "blocked") process.exitCode = 2;
