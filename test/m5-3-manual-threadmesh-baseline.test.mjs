import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runM53ManualThreadmeshBaseline } from
  "../src/validation/m5-3-manual-threadmesh-baseline.mjs";

test("measures the operator-triggered control against one ThreadMesh kickoff", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-m53-baseline-test-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runM53ManualThreadmeshBaseline({ artifactsDirectory });

  assert.equal(result.state, "passed");
  assert.equal(result.evidenceClass, "deterministic-operator-control-vs-threadmesh");
  assert.equal(result.manual.manualRelayActions, 4);
  assert.equal(result.manual.manualStatusChecks, 4);
  assert.equal(result.threadmesh.manualRelayActions, 0);
  assert.equal(result.threadmesh.manualStatusChecks, 0);
  assert.equal(result.manual.modelPollingTurns, 0);
  assert.equal(result.threadmesh.modelPollingTurns, 0);
  assert.equal(result.manual.duplicateDeliveries, 0);
  assert.equal(result.threadmesh.duplicateDeliveries, 0);
  assert.equal(result.manual.activeReceiverInterruptions, 0);
  assert.equal(result.threadmesh.activeReceiverInterruptions, 0);
  assert.deepEqual(result.comparison, {
    manualUserActions: 9,
    threadmeshUserActions: 1,
    userActionsRemoved: 8,
    elapsedDeltaMs: result.threadmesh.elapsedMs - result.manual.elapsedMs,
    tokenDelta: null,
    tokenDeltaReason: "product-usage-not-reported",
    comparableArtifacts: true,
  });
  assert.equal(result.manual.cleanup.complete, true);
  assert.equal(result.threadmesh.cleanup.complete, true);
  assert.deepEqual(fs.readdirSync(artifactsDirectory), []);
  assert.match(result.recordDigest, /^sha256:[a-f0-9]{64}$/u);
});
