import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  renderAttentionRouterDemo,
  runAttentionRouterDemo,
} from "../src/demo/attention-router-demo.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("attention-router demo is deterministic, routes the review-fix sequence, and cleans up", async () => {
  const first = await runAttentionRouterDemo();
  const second = await runAttentionRouterDemo();

  assert.deepEqual(second, first);
  assert.deepEqual(first.sequence.map((step) => step.eventType), [
    "artifact-ready",
    "review-failed",
    "artifact-ready",
    "dependency-satisfied",
  ]);
  assert.deepEqual(first.sequence.map((step) => step.receiverDecision), [
    "accepted",
    "accepted",
    "accepted",
    "accepted",
  ]);
  assert.deepEqual(first.counters, {
    manualRelayActions: 0,
    modelPollingTurns: 0,
    incorrectUnlocks: 0,
    durableReconciliations: 4,
  });
  assert.deepEqual(first.comparison, {
    classification: "modeled-workflow-accounting",
    workflowHandoffs: 4,
    manual: {
      initialKickoffs: 1,
      relayActions: 4,
      statusChecks: 4,
      totalUserActionsLowerBound: 9,
    },
    threadmesh: {
      initialKickoffs: 1,
      relayActions: 0,
      statusChecks: 0,
      totalUserActions: 1,
    },
    notMeasured: ["elapsed-time", "model-tokens"],
  });
  assert.deepEqual(first.safety, {
    activeCheckpoint: {
      eventType: "completed",
      requestedDeliveryMode: "checkpoint-offer",
      delivery: "durably-received",
      receiverDecision: "pending",
      receiverStateBefore: "running",
      receiverStateAfter: "running",
      steerRequests: 0,
      interruptRequests: 0,
      nativeTurnStarts: 0,
      unsubscribedOffers: 0,
      unsubscribedReasonCode: "attention-event-type-not-subscribed",
    },
    droppedWakeHints: 4,
    durableReconciliations: 4,
  });
  assert.deepEqual(first.dependency, {
    eventType: "dependency-satisfied",
    state: "satisfied",
    reasonCode: "dependency-satisfied-verified",
    unlock: true,
  });
  assert.deepEqual(first.cleanup, { attempted: true, complete: true });
  assert.equal(first.inspector.dependencies[0].status, "satisfied");
  assert.equal(first.inspector.dependencies[0].verificationState, "externally-verified");
  assert.match(renderAttentionRouterDemo(first), /dependency-satisfied-verified/);
});

test("attention-router demo removes its isolated state after a failure", async () => {
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-demo-test-"));
  try {
    await assert.rejects(
      () => runAttentionRouterDemo({
        temporaryParent,
        onStep: (step) => {
          if (step.eventType === "review-failed") throw new Error("intentional-demo-test-failure");
        },
      }),
      (error) => {
        assert.equal(error.demo.state, "failed");
        assert.deepEqual(error.demo.cleanup, { attempted: true, complete: true });
        return true;
      },
    );
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("repository CLI emits the bounded JSON result", () => {
  const output = execFileSync(process.execPath, ["bin/threadmesh.mjs", "demo", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  const result = JSON.parse(output);
  assert.equal(Object.keys(result).length, 9);
  assert.equal(result.state, "passed");
  assert.equal(result.sequence.length, 4);
  assert.deepEqual(result.cleanup, { attempted: true, complete: true });
});
