import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROACTIVE_B_MISSING_MARKER,
  PROACTIVE_B_MARKER,
  runProactiveCodexScenario,
} from "../src/validation/proactive-codex-scenario.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "test", "fixtures", "fake-codex-app-server.mjs");

async function runCondition(condition, runId) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-proactive-"));
  const baseEnv = { FAKE_CODEX_STATE_FILE: path.join(directory, "state.json") };
  try {
    const conditionEnv = {
      control: {
        ...baseEnv,
      },
      relevant: {
        ...baseEnv,
        FAKE_CODEX_AUTONOMOUS_TOOL: "1",
        FAKE_CODEX_AUTONOMOUS_MARKER: "Agent A sent the useful dependency.",
      },
      irrelevant: {
        ...baseEnv,
        FAKE_CODEX_AUTONOMOUS_TOOL: "1",
        FAKE_CODEX_AUTONOMOUS_SKIP_SEND: "1",
      },
    }[condition];
    return await runProactiveCodexScenario({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      condition,
      env: baseEnv,
      bootstrapEnv: {
        ...baseEnv,
        FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MISSING_MARKER,
      },
      autonomousEnv: conditionEnv,
      receiverEnv: {
        ...baseEnv,
        FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MARKER,
      },
      clock: () => Date.parse("2026-08-21T10:30:00Z"),
      runId,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("Agent A selects ThreadMesh tools before its suggestion reaches real-shaped Agent B", async () => {
  const result = await runCondition("relevant", "deterministic01");

  assert.equal(result.state, "passed");
  assert.equal(result.condition, "relevant");
  assert.equal(result.modelSelectedCommunication, true);
  assert.equal(result.scriptedSubmitCount, 0);
  assert.equal(result.relatedTaskCalls, 1);
  assert.equal(result.sendCalls, 1);
  assert.equal(result.nonThreadMeshToolCalls, 0);
  assert.deepEqual(result.aToolCalls, [
    "threadmesh_related_tasks",
    "threadmesh_send_suggestion",
  ]);
  assert.equal(result.mailbox, "claimed-and-accepted");
  assert.equal(result.delivery, "context-admitted");
  assert.equal(result.receiverActivated, true);
  assert.equal(result.bOutcome, "completed-with-dependency");
  assert.equal(result.outcomeScore, 1);
  assert.equal(result.aDecisionCompleted, true);
  assert.equal(result.bMarkerMatched, true);
  assert.equal(result.cleanup.complete, true);
});

test("control makes no ThreadMesh call and does not activate Agent B", async () => {
  const result = await runCondition("control", "deterministic02");

  assert.equal(result.condition, "control");
  assert.equal(result.modelSelectedCommunication, false);
  assert.equal(result.relatedTaskCalls, 0);
  assert.equal(result.sendCalls, 0);
  assert.deepEqual(result.aToolCalls, []);
  assert.equal(result.mailbox, "empty");
  assert.equal(result.receiverActivated, false);
  assert.equal(result.bOutcome, "missing-dependency");
  assert.equal(result.outcomeScore, 0);
  assert.equal(result.interferenceViolation, false);
  assert.equal(result.cleanup.complete, true);
});

test("irrelevant relationship is inspected without contacting Agent B", async () => {
  const result = await runCondition("irrelevant", "deterministic03");

  assert.equal(result.condition, "irrelevant");
  assert.equal(result.modelSelectedCommunication, false);
  assert.equal(result.relatedTaskCalls, 1);
  assert.equal(result.sendCalls, 0);
  assert.deepEqual(result.aToolCalls, ["threadmesh_related_tasks"]);
  assert.equal(result.mailbox, "empty");
  assert.equal(result.receiverActivated, false);
  assert.equal(result.bOutcome, "not-evaluated");
  assert.equal(result.outcomeScore, null);
  assert.equal(result.interferenceViolation, false);
  assert.equal(result.cleanup.complete, true);
});

test("B bootstrap marker failure retains and deletes the exact created thread", async () => {
  const deleted = [];
  const adapterRef = {
    kind: "codex-app-server",
    threadId: "thread_bootstrap_mismatch",
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  };
  const adapter = {
    async startValidationThread() {
      return { text: "WRONG_MARKER", truncated: false, adapterRef };
    },
    async deleteThread({ threadId }) {
      deleted.push(threadId);
      return { threadId, deleted: true };
    },
  };

  await assert.rejects(
    runProactiveCodexScenario({
      command: process.execPath,
      cwd: root,
      adapter,
      runId: "bootstrap_cleanup01",
    }),
    (error) => {
      assert.equal(error.code, "threadmesh_proactive_b_bootstrap_mismatch");
      assert.deepEqual(error.cleanup, {
        attempted: true,
        complete: true,
        aThreadDeleted: false,
        bThreadDeleted: true,
        threadDeleted: true,
      });
      return true;
    },
  );
  assert.deepEqual(deleted, [adapterRef.threadId]);
});

test("B bootstrap operation failure deletes the adapter reference carried by the error", async () => {
  const deleted = [];
  const adapterRef = {
    kind: "codex-app-server",
    threadId: "thread_bootstrap_operation_failure",
    snapshotDigest: `sha256:${"b".repeat(64)}`,
  };
  const adapter = {
    async startValidationThread() {
      const error = new Error("codex_app_server_operation_timeout");
      error.code = "codex_app_server_operation_timeout";
      error.adapterRef = adapterRef;
      throw error;
    },
    async deleteThread({ threadId }) {
      deleted.push(threadId);
      return { threadId, deleted: true };
    },
  };

  await assert.rejects(
    runProactiveCodexScenario({
      command: process.execPath,
      cwd: root,
      adapter,
      runId: "bootstrap_cleanup02",
    }),
    (error) => {
      assert.equal(error.code, "codex_app_server_operation_timeout");
      assert.equal(error.cleanup.complete, true);
      assert.equal(error.cleanup.bThreadDeleted, true);
      return true;
    },
  );
  assert.deepEqual(deleted, [adapterRef.threadId]);
});
