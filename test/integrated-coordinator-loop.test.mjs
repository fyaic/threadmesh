import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DeterministicLiveAgentRuntime } from "../src/validation/live-agent-scenario.mjs";
import {
  lifecycleActionEventBody,
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
    assert.equal(result.coordinator.finalizedAttentionExpiryReplayStable, true);
    assert.equal(result.coordinator.finalizedAttentionTimestampTamperRejected, true);
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
      "verified-event-durable",
      "dependent-next-only-claim",
      "dependent-decision-admission-exact-resume",
      "dependent-decision-handler-bound",
      "dependent-adapter-receipt-recorded",
      "v7-finalize-promoted-satisfied",
      "dependent-finalized-cursor-committed",
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
      consumedActions: new Set(),
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

function boundPublishCase({ eventOverrides = {}, argumentOverrides = {} } = {}) {
  const boundEvent = {
    eventType: "artifact-ready",
    messageId: "msg_bound_publish",
    sender: {
      taskId: "task_a",
      incarnationId: "inc_agent_a01",
      actorType: "agent",
      harness: "codex",
    },
    target: {
      taskId: "task_r",
      incarnationId: "inc_agent_r01",
      harness: "codex",
    },
    relationshipId: "rel_a_r",
    content: "A bounded candidate is ready.",
    reason: "The model-selected publish action completed.",
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: "2026-08-31T11:59:00.000Z",
    expiresAt: "2026-08-31T13:00:00.000Z",
  };
  const lifecycleEvent = { ...boundEvent, ...eventOverrides };
  const args = {
    sourceEventId: "event_source_01",
    event: lifecycleActionEventBody(boundEvent),
    commitSha: "3".repeat(40),
    ...argumentOverrides,
  };
  let submissions = 0;
  const coordinator = {
    getTurnExecution() {
      return {
        intent: {
          state: "promoted",
          eventId: "event_source_01",
          actor: { taskId: "task_a", incarnationId: "inc_agent_a01" },
        },
        actions: [{
          name: "threadmesh_publish_artifact",
          resultStatus: "completed",
          argsJson: JSON.stringify(args),
        }],
      };
    },
    submit() {
      submissions += 1;
      return { accepted: true };
    },
  };
  return { lifecycleEvent, coordinator, submissions: () => submissions };
}

test("lifecycle submission accepts one exact promoted action binding", () => {
  const current = boundPublishCase();
  const consumedActions = new Set();
  submitLifecycleFromBoundAction({
    coordinator: current.coordinator,
    execution: { executionId: "intent_bound" },
    expectedTool: "threadmesh_publish_artifact",
    expectedMaterial: { commitSha: "3".repeat(40) },
    consumedActions,
    lifecycleEvent: current.lifecycleEvent,
    principal: { kind: "task", taskId: "task_a", incarnationId: "inc_agent_a01" },
  });
  assert.equal(current.submissions(), 1);
});

test("altered lifecycle body or material fails before submit", () => {
  const variants = [
    { eventOverrides: { messageId: "msg_altered" } },
    { eventOverrides: { eventType: "review-failed" } },
    {
      eventOverrides: {
        target: {
          taskId: "task_other",
          incarnationId: "inc_agent_other01",
          harness: "codex",
        },
      },
    },
    { argumentOverrides: { commitSha: "4".repeat(40) } },
    { eventOverrides: { relationshipId: "rel_altered" } },
    { eventOverrides: { content: "Altered event content." } },
    { eventOverrides: { reason: "Altered event reason." } },
    { eventOverrides: { freshness: { expectedObjectiveVersion: 2 } } },
  ];
  for (const variant of variants) {
    const current = boundPublishCase(variant);
    assert.throws(
      () => submitLifecycleFromBoundAction({
        coordinator: current.coordinator,
        execution: { executionId: "intent_bound" },
        expectedTool: "threadmesh_publish_artifact",
        expectedMaterial: { commitSha: "3".repeat(40) },
        consumedActions: new Set(),
        lifecycleEvent: current.lifecycleEvent,
        principal: {
          kind: "task", taskId: "task_a", incarnationId: "inc_agent_a01",
        },
      }),
      { code: "threadmesh_integrated_lifecycle_submit_unbound" },
    );
    assert.equal(current.submissions(), 0);
  }
});

test("one promoted action cannot submit the same lifecycle effect twice", () => {
  const current = boundPublishCase();
  const consumedActions = new Set();
  const call = () => submitLifecycleFromBoundAction({
    coordinator: current.coordinator,
    execution: { executionId: "intent_bound" },
    expectedTool: "threadmesh_publish_artifact",
    expectedMaterial: { commitSha: "3".repeat(40) },
    consumedActions,
    lifecycleEvent: current.lifecycleEvent,
    principal: { kind: "task", taskId: "task_a", incarnationId: "inc_agent_a01" },
  });
  call();
  const beforeReuse = current.submissions();
  assert.throws(call, { code: "threadmesh_integrated_lifecycle_submit_unbound" });
  assert.equal(current.submissions() - beforeReuse, 0);
});
