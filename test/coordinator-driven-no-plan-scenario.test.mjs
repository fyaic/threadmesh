import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";

test("one kickoff drives A to R to same-A without runner phase prompts", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-driven-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.state, "passed-partial");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.initialUserStartPrompts, 1);
  assert.equal(result.phasePromptsSubmittedByRunner, 0);
  assert.equal(result.humanRelayCount, 0);
  assert.equal(result.pollingCount, 0);
  assert.deepEqual(result.completedRoles, ["a-kickoff", "r", "same-a"]);
  assert.deepEqual(result.pendingRoles, ["v", "dependent"]);
  assert.equal(result.sameARef, true);
  assert.equal(result.priorAttentionSkipCount, 0);
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
