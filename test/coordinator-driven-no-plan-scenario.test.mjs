import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";

test("one pump autonomously closes A to R to same-A to V to dependent", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-driven-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.state, "passed-full-functional-in-process-fixture");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.initialUserStartPrompts, 1);
  assert.equal(result.deterministicPolicyOracle, true);
  assert.equal(result.activationDispatchesByFixtureRunner, 0);
  assert.equal(result.eventPumpDispatches, 4);
  assert.equal(result.eventPumpSkips, 1);
  assert.equal(result.eventPumpSelectionRecordCount, 5);
  assert.match(result.eventPumpSelectionHeadDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.eventPumpSelectionChainValid, null);
  assert.equal(result.eventPumpSelectionChainScope, "global-chain-not-implemented");
  assert.equal(result.eventPumpSelectionDurable, true);
  assert.equal(result.durablePerDispatchRecordsValid, true);
  assert.equal(result.durablePerDispatchRecordCount, 5);
  assert.equal(result.eventPumpTerminalState, "idle");
  assert.equal(result.eventPumpAwaitingPromotion, false);
  assert.equal(result.autonomousEventPump, true);
  assert.equal(result.autonomousEventPumpScope, "in-process-functional-fixture");
  assert.equal(result.rawPhasePromptsSubmittedByFixtureRunner, 0);
  assert.equal(result.humanRelayCount, 0);
  assert.equal(result.pollingCount, 0);
  assert.deepEqual(result.completedRoles, ["a-kickoff", "r", "same-a", "v", "dependent"]);
  assert.deepEqual(result.pendingRoles, []);
  assert.deepEqual(result.pendingGates, [
    "cross-process-os-kill-and-long-turn-lease-heartbeat",
    "global-selection-chain",
  ]);
  assert.equal(result.routeHandlerConfigs.length, 5);
  assert.equal(new Set(result.routeHandlerConfigs.map(({ handlerId }) => handlerId)).size, 5);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.routeHandlerConfigs)),
    result.routeHandlerConfigs,
  );
  assert.deepEqual(result.executedHandlerIds, [
    "handler.no-plan.review.v1",
    "handler.no-plan.same-a-fix.v1",
    "handler.no-plan.verify.v1",
    "handler.no-plan.dependent.v1",
  ]);
  assert.equal(result.selectionBindings.length, 5);
  assert.ok(result.selectionBindings.every((binding) =>
    /^handler\.no-plan\./u.test(binding.handlerId) &&
    /^sha256:[a-f0-9]{64}$/u.test(binding.handlerConfigDigest) &&
    /^sha256:[a-f0-9]{64}$/u.test(binding.recordDigest)));
  assert.deepEqual(
    result.selectionBindings.filter(({ kind }) => kind === "durable-route-skip")
      .map(({ handlerId }) => handlerId),
    ["handler.no-plan.irrelevant.v1"],
  );
  assert.equal(result.attention.allOfferedCursorsCommitted, true);
  assert.equal(result.attention.activeClaimCount, 0);
  assert.ok(Object.values(result.attention.cursors)
    .every(({ commitCount }) => commitCount === 1));
  assert.equal(result.sameARef, true);
  assert.equal(result.irrelevant.claimCount, 0);
  assert.equal(result.irrelevant.turnCount, 0);
  assert.equal(result.irrelevant.durableSkip, true);
  assert.equal(result.bindings.lifecycleActionPublications, 4);
  assert.equal(result.bindings.receiverDecisions, 4);
  assert.equal(result.bindings.contextAdmissions, 4);
  assert.equal(result.verification.externalIndependentVerifier, false);
  assert.equal(result.verification.signer, "fixture-owned-ephemeral-key");
  assert.equal(result.verification.nativeVerifierSessionIndependent, true);
  assert.match(result.verification.nativeVerifierTurnIdDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.verification.allLifecycleNativeTurnIdsDistinct, true);
  assert.equal(result.verification.lifecycleNativeTurnCount, 9);
  assert.equal(result.verification.signatureVerified, true);
  assert.equal(result.verification.resultDigestBound, true);
  assert.match(result.verification.trustAnchorDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.evidenceChain.recordCount, 4);
  assert.equal(result.evidenceChain.trustedComplete, true);
  assert.match(result.evidenceChain.headDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(result.dependent, {
    decision: "accepted",
    outcome: "externally-verified",
    edgeStatus: "satisfied",
    taskState: "ready",
    effectCommittedAfterFinalization: true,
  });
  assert.deepEqual(result.ordering.sequence, [
    "v-verification-tool-selected",
    "verified-event-durable",
    "dependent-admission-prepared",
    "trusted-finalization-completed",
    "dependent-business-tool-selected",
    "dependent-cursor-finalized",
  ]);
  assert.equal(result.ordering.finalizationBeforeDependentBusiness, true);
  assert.equal(result.ordering.timestampStrictlyEarlier, true);
  assert.ok(Date.parse(result.ordering.finalizationAt) <
    Date.parse(result.ordering.dependentBusinessStartedAt));
  assert.equal(result.runtime.planSurfaceUsed, false);
  assert.equal(result.runtime.modelSelectedToolCalls, 9);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.remainingJournalCount, 0);
  assert.equal(result.cleanup.runRootRemoved, true);
  assert.ok(result.cleanup.roles.every(({ deleted, absenceVerified }) =>
    deleted && absenceVerified));
});

test("failed trusted finalization starts no dependent business turn", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-finalization-failure-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  await assert.rejects(
    () => runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      injectFinalizationFailure: true,
    }),
    (error) => {
      assert.equal(error?.code, "threadmesh_git_evidence_finalization_tool_mismatch");
      assert.deepEqual(error.failureEvidence, {
        dependentBusinessTurnCount: 0,
        dependentBusinessToolActionCount: 0,
        committedEffectCount: 0,
        edgeStatus: "waiting",
        taskState: "waiting",
        sequence: [
          "v-verification-tool-selected",
          "verified-event-durable",
          "dependent-admission-prepared",
        ],
        cleanupComplete: true,
      });
      assert.equal(error.cleanup?.complete, true);
      return true;
    },
  );
});

test("preverified admission requires exact durable provenance before dependent turn", async (t) => {
  for (const variant of [
    "state-only",
    "missing-receipt",
    "missing-satisfaction",
    "missing-finalization",
    "wrong-digest",
  ]) {
    const artifactsDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), `threadmesh-preverified-${variant}-`),
    );
    t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));
    await assert.rejects(
      () => runCoordinatorDrivenNoPlanScenario({
        artifactsDirectory,
        injectPreverifiedTamper: variant,
      }),
      (error) => {
        assert.equal(error?.code, "threadmesh_preverified_admission_provenance_invalid");
        assert.equal(error.failureEvidence.dependentBusinessTurnCount, 0, variant);
        assert.equal(error.failureEvidence.dependentBusinessToolActionCount, 0, variant);
        assert.ok([
          "threadmesh_preverified_admission_provenance_invalid",
          "threadmesh_git_evidence_dependency_storage_tampered",
        ].includes(error.failureEvidence.tamperedReopenRejectionCode), variant);
        assert.deepEqual(error.failureEvidence.sequence, [
          "v-verification-tool-selected",
          "verified-event-durable",
          "dependent-admission-prepared",
        ], variant);
        assert.equal(error.failureEvidence.cleanupComplete, true, variant);
        assert.equal(error.cleanup?.complete, true, variant);
        if (variant === "state-only") {
          assert.equal(error.failureEvidence.committedEffectCount, 0);
          assert.equal(error.failureEvidence.edgeStatus, "waiting");
          assert.equal(error.failureEvidence.taskState, "waiting");
        }
        return true;
      },
    );
  }
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
