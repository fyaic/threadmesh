import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AcpStdioAdapter,
  KIMI_THREADMESH_CAPABILITIES,
} from "../src/adapters/acp-stdio.mjs";
import { assertProtocolObject } from "../src/protocol-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "test", "fixtures", "fake-acp-agent.mjs");
const adapter = new AcpStdioAdapter();

function envelope() {
  return {
    specVersion: "0.0-draft",
    messageId: "msg_acp_boundary01",
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "unverified",
    sender: {
      taskId: "task_acp_sender",
      incarnationId: "inc_acp_sender01",
      actorType: "agent",
      harness: "test",
    },
    target: {
      taskId: "task_acp_receiver",
      incarnationId: "inc_acp_receiver01",
      harness: "acp",
    },
    relationshipId: "rel_acp_boundary01",
    content: "Peer context only.",
    reason: "Boundary test.",
    evidenceRefs: [],
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: "2026-08-21T00:00:00Z",
    expiresAt: "2026-08-21T00:05:00Z",
  };
}

test("probes an ACP stdio agent without a model turn", async () => {
  const result = await adapter.probe({
    command: process.execPath,
    args: [fixture],
    cwd: root,
  });
  assert.equal(result.protocolVersion, 1);
  assert.equal(result.agentInfo.name, "threadmesh-fake-agent");
  assert.match(result.snapshotDigest, /^sha256:[a-f0-9]{64}$/);
});

test("runs a prompt and aggregates labelled ACP output", async () => {
  const result = await adapter.runPrompt({
    command: process.execPath,
    args: [fixture],
    cwd: root,
    promptText: "peer suggestion",
  });
  assert.equal(result.state, "completed");
  assert.equal(result.text, "FAKE_ACP:peer suggestion");
  assert.equal(result.evidence.stopReason, "end_turn");
  assert.equal(result.evidence.permissionDeniedCount, 0);
});

test("ACP accepted-suggestion boundary rejects missing receiver acceptance", async () => {
  await assert.rejects(
    adapter.runAcceptedSuggestion({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      envelope: envelope(),
      adapterRef: {
        kind: "acp-session",
        sessionId: "fake-never-used",
        snapshotDigest: `sha256:${"a".repeat(64)}`,
      },
      admission: {
        decision: "pending",
        receiverIncarnationId: "inc_acp_receiver01",
        revision: 0,
      },
    }),
    { code: "acp_receiver_acceptance_required" },
  );
});

test("ACP rejects capability drift before loading or prompting the session", async () => {
  await assert.rejects(
    adapter.runAcceptedSuggestion({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      envelope: envelope(),
      admission: {
        decision: "accepted",
        receiverIncarnationId: "inc_acp_receiver01",
        revision: 0,
      },
      adapterRef: {
        kind: "acp-session",
        sessionId: "fake-never-loaded",
        snapshotDigest: `sha256:${"a".repeat(64)}`,
      },
    }),
    { code: "acp_snapshot_mismatch" },
  );
});

test("creates, reloads, lists, and deletes the same logical ACP session", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-acp-"));
  const stateFile = path.join(directory, "sessions.json");
  const env = { FAKE_ACP_STATE_FILE: stateFile };
  const created = await adapter.createSession({
    command: process.execPath,
    args: [fixture],
    cwd: root,
    env,
  });
  const result = await adapter.runPrompt({
    command: process.execPath,
    args: [fixture],
    cwd: root,
    env,
    sessionId: created.sessionId,
    promptText: "bound receiver",
  });
  assert.equal(
    result.text,
    `FAKE_ACP:RESTORED:${created.sessionMeta.sentinel}:bound receiver`,
  );
  assert.doesNotMatch(result.text, /REPLAY:/);
  assert.equal(result.evidence.sessionId, created.sessionId);
  assert.equal(result.evidence.sessionLoaded, true);
  assert.equal(
    (await adapter.sessionExists({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env,
      sessionId: created.sessionId,
    })).exists,
    true,
  );
  const deleted = await adapter.deleteSession({
    command: process.execPath,
    args: [fixture],
    cwd: root,
    env,
    sessionId: created.sessionId,
  });
  assert.equal(deleted.deleted, true);
  assert.equal(
    (await adapter.sessionExists({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env,
      sessionId: created.sessionId,
    })).exists,
    false,
  );
  await assert.rejects(
    adapter.runPrompt({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env,
      sessionId: "fake-never-created",
      promptText: "must fail",
    }),
    { code: "acp_agent_error" },
  );
  fs.rmSync(directory, { recursive: true, force: true });
});

test("cancels ACP permission requests and exposes conservative capabilities", async () => {
  assert.equal(
    assertProtocolObject("capabilities", KIMI_THREADMESH_CAPABILITIES),
    KIMI_THREADMESH_CAPABILITIES,
  );
  const result = await adapter.runPrompt({
    command: process.execPath,
    args: [fixture],
    cwd: root,
    env: { FAKE_ACP_PERMISSION: "1" },
    promptText: "permission check",
  });
  assert.equal(result.evidence.permissionDeniedCount, 1);
  assert.equal(result.text, "FAKE_ACP:PERMISSION_CANCELLED:permission check");
});

test("classifies a quota error carried by the ACP response", async () => {
  await assert.rejects(
    adapter.runPrompt({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env: { FAKE_ACP_QUOTA: "1" },
      promptText: "quota classification",
    }),
    { code: "acp_agent_quota_error" },
  );
});

test("fails closed for relative executable paths", async () => {
  await assert.rejects(
    adapter.probe({ command: "node", args: [fixture], cwd: root }),
    { code: "acp_command_must_be_absolute" },
  );
});

test("times out and terminates an unresponsive ACP child", async () => {
  let childPid;
  const timeoutAdapter = new AcpStdioAdapter({
    spawnImpl: (...args) => {
      const child = spawn(...args);
      childPid = child.pid;
      return child;
    },
    killGraceMs: 100,
  });
  await assert.rejects(
    timeoutAdapter.runPrompt({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env: { FAKE_ACP_HANG: "1" },
      promptText: "hang",
      timeoutMs: 1_000,
    }),
    { code: "acp_operation_timeout" },
  );
  assert.throws(() => process.kill(childPid, 0), { code: "ESRCH" });
});
