import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";

test("one pump lifecycle autonomously dispatches A to R to same-A", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-driven-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.state, "passed-autonomous-pump-in-process-partial");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.initialUserStartPrompts, 1);
  assert.equal(result.deterministicPolicyOracle, true);
  assert.equal(result.activationDispatchesByFixtureRunner, 0);
  assert.equal(result.eventPumpDispatches, 2);
  assert.equal(result.eventPumpSkips, 1);
  assert.equal(result.eventPumpSelectionRecordCount, 3);
  assert.match(result.eventPumpSelectionHeadDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.eventPumpSelectionChainValid, true);
  assert.equal(result.eventPumpSelectionDurable, false);
  assert.equal(result.autonomousEventPump, true);
  assert.equal(result.autonomousEventPumpScope, "in-process-partial");
  assert.equal(result.rawPhasePromptsSubmittedByFixtureRunner, 0);
  assert.equal(result.humanRelayCount, 0);
  assert.equal(result.pollingCount, 0);
  assert.deepEqual(result.completedRoles, ["a-kickoff", "r", "same-a"]);
  assert.deepEqual(result.pendingRoles, ["v", "dependent"]);
  assert.deepEqual(result.pendingGates, [
    "durable-pump-restart-checkpoint",
    "cross-process-concurrent-pump-lease",
    "verifier-and-dependent-activation",
  ]);
  assert.equal(result.sameARef, true);
  assert.equal(result.irrelevant.claimCount, 0);
  assert.equal(result.irrelevant.turnCount, 0);
  assert.equal(result.irrelevant.durableSkip, true);
  assert.equal(result.bindings.lifecycleActionPublications, 2);
  assert.equal(result.bindings.receiverDecisions, 2);
  assert.equal(result.bindings.contextAdmissions, 2);
  assert.equal(result.runtime.planSurfaceUsed, false);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.remainingJournalCount, 0);
  assert.ok(result.cleanup.roles.every(({ deleted, absenceVerified }) =>
    deleted && absenceVerified));
});

test("pump never looks ahead past a prior relevant event", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-next-only-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  await assert.rejects(
    () => runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      injectPriorRelevant: true,
    }),
    (error) => error?.code === "threadmesh_policy_oracle_event_unregistered" &&
      error.cleanup?.complete === true,
  );
});
