import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";

test("fixture runner exercises A to R to same-A activation plumbing honestly", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-driven-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.state, "passed-plumbing-partial");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.initialUserStartPrompts, 1);
  assert.equal(result.deterministicPolicyOracle, true);
  assert.equal(result.activationDispatchesByFixtureRunner, 2);
  assert.equal(result.autonomousEventPump, false);
  assert.equal(result.rawPhasePromptsSubmittedByFixtureRunner, 0);
  assert.equal(result.humanRelayCount, 0);
  assert.equal(result.pollingCount, 0);
  assert.deepEqual(result.completedRoles, ["a-kickoff", "r", "same-a"]);
  assert.deepEqual(result.pendingRoles, ["v", "dependent"]);
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

test("fixture never skips a prior relevant event to reach an expected later message", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-next-only-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  await assert.rejects(
    () => runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      injectPriorRelevant: true,
    }),
    (error) => error?.code === "threadmesh_activation_route_event_mismatch" &&
      error.cleanup?.complete === true,
  );
});
