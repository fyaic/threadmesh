import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CODEX_ATTENTION_B_READY_MARKER,
  CODEX_ATTENTION_B_WAITING_MARKER,
  runCodexAttentionScenario,
} from "../src/validation/codex-attention-scenario.mjs";

class AttentionAdapterMock {
  constructor({ condition, invalidReceiverMarker = false } = {}) {
    this.condition = condition;
    this.invalidReceiverMarker = invalidReceiverMarker;
    this.deleted = [];
    this.bRef = null;
    this.resumedThreadIds = [];
  }

  #ref(name) {
    return {
      kind: "codex-app-server",
      threadId: `thread-${name}`,
      snapshotDigest: `sha256:${name[0].repeat(64)}`,
      userAgent: "codex mock",
    };
  }

  async startValidationThread({ marker }) {
    assert.equal(marker, CODEX_ATTENTION_B_WAITING_MARKER);
    this.bRef = this.#ref("b");
    return { text: marker, truncated: false, adapterRef: this.bRef };
  }

  async startAutonomousToolThread({ onToolCall }) {
    const calls = [];
    if (this.condition === "relevant" || this.condition === "irrelevant") {
      await onToolCall({ tool: "threadmesh_related_tasks", arguments: {} });
      calls.push({ tool: "threadmesh_related_tasks" });
    }
    if (this.condition === "relevant") {
      await onToolCall({
        tool: "threadmesh_publish_dependency",
        arguments: { reason: "The dependent task explicitly waits for this verified checksum." },
      });
      calls.push({ tool: "threadmesh_publish_dependency" });
    }
    return {
      text: "A completed its bounded decision.",
      truncated: false,
      adapterRef: this.#ref("a"),
      toolCalls: calls,
      nonThreadMeshToolCalls: 0,
    };
  }

  async runAcceptedSuggestion({ adapterRef }) {
    assert.deepEqual(adapterRef, this.bRef, "the wake must resume the pre-created B thread");
    this.resumedThreadIds.push(adapterRef.threadId);
    return {
      text: this.invalidReceiverMarker ? "WRONG_MARKER" : CODEX_ATTENTION_B_READY_MARKER,
      truncated: false,
      receipt: {
        adapterOperationId: "turn-b-received",
        acceptedAt: "2026-08-31T10:01:30.000Z",
        evidenceRefs: ["threadmesh-test://codex-attention/turn-b-received"],
      },
      evidence: {
        kind: "codex-app-server",
        threadId: adapterRef.threadId,
        turnId: "turn-b-received",
        turnStatus: "completed",
        snapshotDigest: adapterRef.snapshotDigest,
      },
    };
  }

  async deleteThread({ threadId }) {
    this.deleted.push(threadId);
    return { threadId, deleted: true };
  }
}

async function run(condition, options = {}) {
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-attention-test-"));
  const adapter = new AttentionAdapterMock({ condition, ...options });
  try {
    const result = await runCodexAttentionScenario({
      condition,
      adapter,
      runId: `test_${condition}`,
      temporaryParent,
      clock: () => Date.parse("2026-08-31T10:00:00.000Z"),
    });
    return { result, adapter, temporaryParent };
  } catch (error) {
    error.temporaryParent = temporaryParent;
    error.adapter = adapter;
    throw error;
  }
}

test("relevant model tool choice emits one lifecycle event and cursor-wakes the same persisted B thread", async () => {
  const { result, adapter, temporaryParent } = await run("relevant");
  try {
    assert.equal(result.productId, "codex-attention");
    assert.equal(result.adapterKind, "codex-app-server");
    assert.equal(result.modelSelectedCommunication, true);
    assert.equal(result.scriptedSubmitCount, 0);
    assert.deepEqual(
      [result.relatedTaskCalls, result.publishCalls, result.nonThreadMeshToolCalls],
      [1, 1, 0],
    );
    assert.deepEqual(result.aToolCalls, [
      "threadmesh_related_tasks",
      "threadmesh_publish_dependency",
    ]);
    assert.deepEqual(
      [result.lifecycleEventType, result.routeReasonCode, result.wakeReasonCode],
      ["dependency-satisfied", "attention-offer-authorized", "attention-wake-reconciled"],
    );
    assert.equal(result.wakeCursor > 0, true);
    assert.equal(result.cursorEventObserved, true);
    assert.equal(result.receiverResumeCount, 1);
    assert.equal(result.receiverActivated, true);
    assert.deepEqual(adapter.resumedThreadIds, [result.threads.b.threadId]);
    assert.deepEqual(
      [result.receiverDecision, result.delivery, result.outcome],
      ["accepted", "adapter-submitted", "externally-verified"],
    );
    assert.equal(result.verificationMode, "local-simulation");
    assert.equal(result.receiverEvidence.threadId, result.threads.b.threadId);
    assert.equal(
      result.adapterReceipt.adapterOperationId,
      result.receiverEvidence.turnId,
    );
    assert.notEqual(result.threads.a.threadId, result.threads.b.threadId);
    assert.deepEqual(
      [result.externalVerificationReasonCode, result.dependencyStatus, result.dependencyUnlock, result.recoveredTaskState],
      ["dependency-satisfied-verified", "satisfied", true, "ready"],
    );
    assert.equal(result.manualRelayActions, 0);
    assert.equal(result.modelPollingTurns, 0);
    assert.equal(result.restartRecovered, true);
    assert.equal(result.messageId?.startsWith("msg_codex_attention_"), true);
    assert.equal(result.mailbox, "claimed-and-accepted");
    assert.equal(result.markerMatched, true);
    assert.deepEqual(result.evidenceKeys, ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"]);
    assert.equal(result.adapterSnapshotDigest, result.threads.b.snapshotDigest);
    assert.deepEqual(Object.keys(result.evidenceDigests), ["lifecycleEvent", "disposition", "dependencyEdge"]);
    assert.ok(Object.values(result.evidenceDigests).every((digest) => /^sha256:[a-f0-9]{64}$/.test(digest)));
    assert.deepEqual(result.cleanup, {
      attempted: true,
      complete: true,
      threadDeleted: true,
      aThreadDeleted: true,
      bThreadDeleted: true,
    });
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

for (const condition of ["control", "irrelevant"]) {
  test(`${condition} does not publish an event or resume B`, async () => {
    const { result, adapter, temporaryParent } = await run(condition);
    try {
      assert.equal(result.modelSelectedCommunication, false);
      assert.equal(result.scriptedSubmitCount, 0);
      assert.deepEqual(
        [result.relatedTaskCalls, result.publishCalls, result.nonThreadMeshToolCalls],
        [condition === "irrelevant" ? 1 : 0, 0, 0],
      );
      assert.deepEqual(result.aToolCalls, condition === "irrelevant" ? ["threadmesh_related_tasks"] : []);
      assert.equal(result.lifecycleEventType, null);
      assert.equal(result.routeReasonCode, null);
      assert.equal(result.receiverActivated, false);
      assert.deepEqual(adapter.resumedThreadIds, []);
      assert.deepEqual(
        [result.dependencyStatus, result.dependencyUnlock, result.recoveredTaskState],
        ["waiting", false, "waiting"],
      );
      assert.equal(result.wakeReasonCode, "attention-wake-idle");
      assert.equal(result.cursorEventObserved, false);
      assert.equal(result.restartRecovered, true);
      assert.equal(result.cleanup.complete, true);
    } finally {
      fs.rmSync(temporaryParent, { recursive: true, force: true });
    }
  });
}

test("a receiver failure still deletes both threads and the SQLite directory", async () => {
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-attention-failure-"));
  const adapter = new AttentionAdapterMock({ condition: "relevant", invalidReceiverMarker: true });
  try {
    await assert.rejects(
      () => runCodexAttentionScenario({
        condition: "relevant",
        adapter,
        runId: "receiver_failure",
        temporaryParent,
        clock: () => Date.parse("2026-08-31T10:00:00.000Z"),
      }),
      (error) => {
        assert.equal(error.code, "threadmesh_codex_attention_b_marker_mismatch");
        assert.equal(error.attention.stage, "b-receiver");
        assert.deepEqual(error.attention.cleanup, {
          attempted: true,
          complete: true,
          threadDeleted: true,
          aThreadDeleted: true,
          bThreadDeleted: true,
        });
        return true;
      },
    );
    assert.equal(adapter.deleted.length, 2);
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});
