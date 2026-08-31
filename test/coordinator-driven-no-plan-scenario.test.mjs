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
  assert.equal(result.eventPumpSelectionChainScope, "in-process-self-checked");
  assert.equal(result.eventPumpSelectionDurable, false);
  assert.equal(result.eventPumpTerminalState, "blocked-completed-bound");
  assert.equal(result.eventPumpAwaitingPromotion, true);
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
  assert.equal(result.cleanup.runRootRemoved, true);
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

test("cleanup preserves caller-owned journal-like files and reports them", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-owned-cleanup-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));
  const unrelatedJson = path.join(artifactsDirectory, "unrelated.json");
  const unrelatedDecision = path.join(
    artifactsDirectory, "unrelated.json.decision-action",
  );
  const callerDatabase = path.join(artifactsDirectory, "coordinator-driven.sqlite");
  const legacyJournalDirectory = path.join(
    artifactsDirectory, ".threadmesh-coordinator-driven-journals",
  );
  const legacyJson = path.join(legacyJournalDirectory, "legacy.json");
  const legacyDecision = path.join(
    legacyJournalDirectory, "legacy.json.decision-action",
  );
  fs.mkdirSync(legacyJournalDirectory, { mode: 0o700 });
  fs.writeFileSync(unrelatedJson, "caller-owned-json", { mode: 0o600 });
  fs.writeFileSync(unrelatedDecision, "caller-owned-decision", { mode: 0o600 });
  fs.writeFileSync(callerDatabase, "caller-owned-database", { mode: 0o600 });
  fs.writeFileSync(legacyJson, "caller-owned-legacy-json", { mode: 0o600 });
  fs.writeFileSync(legacyDecision, "caller-owned-legacy-decision", { mode: 0o600 });

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.cleanup.complete, false);
  assert.equal(result.cleanup.unknownJournalCount, 4);
  assert.equal(result.cleanup.remainingJournalCount, 0);
  assert.equal(result.cleanup.runRootRemoved, true);
  assert.equal(fs.readFileSync(unrelatedJson, "utf8"), "caller-owned-json");
  assert.equal(fs.readFileSync(unrelatedDecision, "utf8"), "caller-owned-decision");
  assert.equal(fs.readFileSync(callerDatabase, "utf8"), "caller-owned-database");
  assert.equal(fs.readFileSync(legacyJson, "utf8"), "caller-owned-legacy-json");
  assert.equal(
    fs.readFileSync(legacyDecision, "utf8"), "caller-owned-legacy-decision",
  );
  assert.deepEqual(
    fs.readdirSync(artifactsDirectory)
      .filter((name) => name.startsWith(".threadmesh-coordinator-driven-run-")),
    [],
  );
});
