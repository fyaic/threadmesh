import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DeterministicLiveAgentRuntime } from "../src/validation/live-agent-scenario.mjs";
import {
  runIntegratedCoordinatorLoop,
  submitLifecycleFromBoundAction,
} from "../src/validation/integrated-coordinator-loop.mjs";

test("integrated fixture traverses coordinator A-R-same-A-V and v7 finalize in strict order", async () => {
  const artifactsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-integrated-loop-"));
  const runtime = new DeterministicLiveAgentRuntime();
  try {
    const result = await runIntegratedCoordinatorLoop({ runtime, artifactsDirectory });
    assert.equal(result.state, "passed");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(result.fixtureAssertions.integratedSqliteCoordinator, true);
    assert.equal(result.fixtureAssertions.scriptedToolPlan, true);
    assert.equal(result.coordinator.sameImplementerThread, true);
    assert.equal(result.coordinator.dependencyLockedBefore, true);
    assert.equal(result.coordinator.dependencySatisfiedAfter, true);
    assert.equal(result.coordinator.dependentStateBefore, "waiting");
    assert.equal(result.coordinator.dependentStateAfter, "ready");
    assert.equal(result.coordinator.irrelevantAuthorizedTaskWakeCount, 0);
    assert.equal(result.coordinator.irrelevantAuthorizedTaskTurnCount, 0);
    assert.equal(result.chain.recordCount, 4);
    assert.equal(result.chain.trustedComplete, true);
    assert.equal(result.chain.dependencyUnlocked, true);
    assert.equal(result.chain.signedIndependentAttestation, false);
    assert.deepEqual(result.coordinator.strictOrder, [
      "a-implementation-promoted",
      "artifact-event-durable",
      "r-next-only-claim",
      "r-decision-admission-exact-resume",
      "r-review-promoted",
      "r-cursor-committed",
      "same-a-next-only-claim",
      "same-a-decision-admission-exact-resume",
      "same-a-fix-promoted",
      "a-cursor-committed",
      "v-next-only-claim",
      "v-decision-admission-exact-resume",
      "v-verification-completed-bound",
      "v7-finalize-promoted-satisfied",
      "v-cursor-committed",
    ]);
    const aTurns = runtime.turns.filter(({ role }) => role === "a");
    assert.ok(aTurns.length >= 4);
    assert.ok(aTurns.every(({ ref }) => ref.threadId === aTurns[0].ref.threadId));
    assert.equal(runtime.turns.some(({ role }) => role === "irrelevant"), false);
    assert.equal(result.liveClosureGates.satisfied, false);
    assert.match(result.liveClosureGates.pending.join("\n"), /native start before operation binding/u);
    assert.match(result.liveClosureGates.pending.join("\n"), /signed verifier result journal/u);
  } finally {
    fs.rmSync(artifactsDirectory, { recursive: true, force: true });
  }
});

test("lifecycle submission fails before coordinator submit when action is not bound and promoted", () => {
  let submissions = 0;
  const coordinator = {
    getTurnExecution() {
      return {
        intent: {
          state: "started",
          actor: { taskId: "task_a", incarnationId: "inc_a" },
        },
        actions: [],
      };
    },
    submit() {
      submissions += 1;
    },
  };
  assert.throws(
    () => submitLifecycleFromBoundAction({
      coordinator,
      execution: { executionId: "intent_unbound" },
      expectedTool: "threadmesh_publish_artifact",
      lifecycleEvent: {
        messageId: "msg_unbound",
        sender: { taskId: "task_a", incarnationId: "inc_a" },
      },
      principal: { kind: "task", taskId: "task_a", incarnationId: "inc_a" },
    }),
    { code: "threadmesh_integrated_lifecycle_submit_unbound" },
  );
  assert.equal(submissions, 0);
});
