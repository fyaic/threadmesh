import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";
import { projectM52EventPumpCodexGateResult } from
  "../src/validation/m5-2-event-pump-codex-gate.mjs";

function git(repoPath, ...args) {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      LANG: "C",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "ThreadMesh Test",
      GIT_AUTHOR_EMAIL: "threadmesh@example.invalid",
      GIT_COMMITTER_NAME: "ThreadMesh Test",
      GIT_COMMITTER_EMAIL: "threadmesh@example.invalid",
    },
  }).trim();
}

function createRealEffectsSource(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-real-effects-source-"));
  const fixtureDirectory = path.join(root, "test", "fixtures");
  fs.mkdirSync(fixtureDirectory, { recursive: true });
  fs.copyFileSync(
    new URL("fixtures/independent-git-verifier-target.test.mjs", import.meta.url),
    path.join(fixtureDirectory, "independent-git-verifier-target.test.mjs"),
  );
  fs.writeFileSync(path.join(root, "README.md"), "bounded real-effects source\n");
  git(root, "init", "--quiet");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "source base");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, sha: git(root, "rev-parse", "HEAD") };
}

test("one pump autonomously closes A to R to same-A to V to dependent", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-driven-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });

  assert.equal(result.state, "passed-full-functional-in-process-fixture");
  assert.equal(result.liveProductEvidence, false);
  assert.deepEqual(result.promptBoundary, {
    initialUserKickoffPrompts: 1,
    phasePromptsSubmittedByRunner: 0,
    runnerDirectActivationDispatches: 0,
    logicalEventPumpLifecycleStarts: 1,
    pumpProtectedBoundNativeTurns: 8,
    boundNativeTurns: 9,
    runnerOwnedCounterSource: "scenario-entry-and-no-dispatch-call-sites",
    boundTurnSource: "sqlite-exact-turn-and-binding-records",
  });
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
  assert.equal(result.durableDispatchManifest.recordCount, 5);
  assert.equal(result.durableDispatchManifest.records.length, 5);
  assert.equal(new Set(result.durableDispatchManifest.records
    .map(({ selectionDigest }) => selectionDigest)).size, 5);
  assert.ok(result.durableDispatchManifest.records.every((record) =>
    record.checkpointCount >= 2 &&
    /^sha256:[a-f0-9]{64}$/u.test(record.checkpointHeadDigest) &&
    /^sha256:[a-f0-9]{64}$/u.test(record.dispatchIntentDigest)));
  assert.ok(result.durableDispatchManifest.records.every((record) =>
    ["published", "skipped"].includes(record.dispatchState) &&
    !Object.hasOwn(record, "outcome")));
  assert.match(result.durableDispatchManifest.manifestDigest,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(result.durableDispatchManifest.scope,
    "sqlite-correlated-snapshot-not-global-chain");
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
  assert.equal(result.verification.processIsolatedVerifier, false);
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
  assert.equal(result.runtime.modelSelectedToolCalls, 13);
  assert.equal(result.nativeTurnManifest.recordCount, 9);
  assert.equal(result.nativeTurnManifest.records.filter(
    ({ bindingKind }) => bindingKind === "decision",
  ).length, 4);
  assert.deepEqual(result.nativeTurnManifest.records.map(({ actions }) =>
    actions.map(({ tool }) => tool)), [
    ["threadmesh_publish_artifact"],
    ["threadmesh_decide_offer"],
    ["threadmesh_review_read_artifact", "threadmesh_report_review_finding"],
    ["threadmesh_decide_offer"],
    ["threadmesh_apply_review_fix", "threadmesh_publish_dependency"],
    ["threadmesh_decide_offer"],
    ["threadmesh_read_verification_chain", "threadmesh_verify_exact_chain"],
    ["threadmesh_decide_offer"],
    ["threadmesh_check_finalized_dependency",
      "threadmesh_activate_verified_dependency"],
  ]);
  assert.equal(result.nativeTurnManifest.records.filter(
    ({ bindingKind }) => bindingKind === "admission",
  ).length, 4);
  assert.equal(result.runnerTraceManifest.recordCount, 2);
  assert.deepEqual(result.runnerTraceManifest.records.map(({ event }) => event), [
    "explicit-user-kickoff", "event-pump-run-until-idle",
  ]);
  assert.equal(result.sessionManifest.recordCount, 5);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.remainingJournalCount, 0);
  assert.equal(result.cleanup.runRootRemoved, true);
  assert.ok(result.cleanup.roles.every(({ deleted, absenceVerified }) =>
    deleted && absenceVerified));
});

test("real-effects path keeps reviewer context blind and binds model finding", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-real-effects-artifacts-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));
  const source = createRealEffectsSource(t);

  const result = await runCoordinatorDrivenNoPlanScenario({
    artifactsDirectory,
    realEffects: true,
    sourceRoot: source.root,
    validatedBaseSha: source.sha,
    temporaryParent: artifactsDirectory,
  });

  assert.equal(result.state, "passed-full-functional-in-process-fixture");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.gitEffects.realBoundedWorktrees, true);
  assert.match(result.gitEffects.implementationSha, /^[a-f0-9]{40}$/u);
  assert.match(result.gitEffects.fixSha, /^[a-f0-9]{40}$/u);
  assert.notEqual(result.gitEffects.implementationSha, result.gitEffects.fixSha);
  assert.equal(result.gitEffects.directDescendant, true);
  assert.equal(result.gitEffects.reviewerDetached, true);
  assert.equal(result.gitEffects.verifierDetached, true);
  assert.equal(result.verification.externalIndependentVerifier, false);
  assert.equal(result.verification.processIsolatedVerifier, true);
  assert.equal(result.verification.signer,
    "process-isolated-child-owned-ephemeral-key");
  assert.equal(result.verification.signatureVerified, true);
  assert.equal(result.verification.resultDigestBound, true);
  assert.equal(result.runtime.modelSelectedToolCalls, 14);
  assert.deepEqual(result.nativeTurnManifest.records.map(({ actions }) =>
    actions.map(({ tool }) => tool)), [
    ["threadmesh_commit_candidate", "threadmesh_publish_artifact"],
    ["threadmesh_decide_offer"],
    ["threadmesh_review_read_artifact", "threadmesh_report_review_finding"],
    ["threadmesh_decide_offer"],
    ["threadmesh_commit_candidate", "threadmesh_publish_dependency"],
    ["threadmesh_decide_offer"],
    ["threadmesh_read_verification_chain", "threadmesh_verify_exact_chain"],
    ["threadmesh_decide_offer"],
    ["threadmesh_check_finalized_dependency",
      "threadmesh_activate_verified_dependency"],
  ]);
  const worktrees = Object.fromEntries(result.sessionManifest.records.map(
    ({ role, worktreeDigest }) => [role, worktreeDigest],
  ));
  assert.notEqual(worktrees.r, worktrees.a);
  assert.notEqual(worktrees.v, worktrees.a);
  assert.notEqual(worktrees.r, worktrees.v);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.verifierServiceClosed, true);
  assert.equal(result.cleanup.gitFixture.complete, true);
  assert.equal(result.cleanup.runRootRemoved, true);
  assert.equal(git(source.root, "rev-parse", "HEAD"), source.sha);
  assert.equal(git(source.root, "status", "--porcelain"), "");

  const projected = projectM52EventPumpCodexGateResult(result);
  assert.equal(projected.state, "blocked");
  assert.equal(projected.liveProductEvidence, false);
  assert.equal(projected.verificationMode,
    "process-isolated-child-service-signed");
  assert.deepEqual(projected.remainingGates, [
    "independent-verifier-service",
    "real-bounded-git-worktree-effects",
    "manual-relay-polling-baseline",
    "minimum-critical-negative-restart",
    "cross-process-os-kill-and-long-turn-lease-heartbeat",
    "global-selection-chain",
    "real-codex-product-run",
  ]);
});

test("real-effects path rejects a model-reported finding not present in checkout", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-real-effects-tamper-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));
  const source = createRealEffectsSource(t);

  await assert.rejects(
    () => runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      realEffects: true,
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      temporaryParent: artifactsDirectory,
      injectRealReviewFindingTamper: true,
    }),
    (error) => {
      assert.equal(error?.code, "threadmesh_codex_live_context_terminal_reconciled");
      assert.equal(error?.originCode,
        "threadmesh_real_effect_review_finding_not_reproduced");
      assert.equal(error.cleanup?.complete, true);
      assert.equal(error.cleanup?.roles.length, 5);
      assert.equal(error.cleanup?.verifierServiceClosed, true);
      assert.equal(error.cleanup?.gitFixture.complete, true);
      assert.equal(error.cleanup?.runRootRemoved, true);
      return true;
    },
  );
  assert.equal(git(source.root, "rev-parse", "HEAD"), source.sha);
  assert.equal(git(source.root, "status", "--porcelain"), "");
});

test("public manifest rejects a runtime selection binding not present in SQLite", async (t) => {
  const artifactsDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "threadmesh-coordinator-selection-mismatch-"),
  );
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  await assert.rejects(
    () => runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      injectSelectionBindingMismatch: true,
    }),
    (error) => {
      assert.equal(
        error?.code,
        "threadmesh_durable_dispatch_runtime_correlation_invalid",
      );
      assert.equal(error.cleanup?.complete, true);
      return true;
    },
  );
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

test("a bounded shutdown after role bootstrap cleans every created role and run resource", async (t) => {
  const controller = new AbortController();
  const created = [];
  const deleted = [];
  const runtime = {
    async createRole(options) {
      const { role } = options;
      const ref = {
        kind: "codex-app-server",
        threadId: `shutdown-thread-${role}`,
        snapshotDigest: sha256Digest({ role, boundary: "shutdown" }),
      };
      created.push({ role, ref, options });
      if (created.length === 5) controller.abort();
      return ref;
    },
    async deleteRole({ role, ref }) {
      deleted.push({ role, ref });
      return { deleted: true, absenceVerified: true };
    },
    async runTurn() {
      throw new Error("shutdown must occur before a native turn");
    },
    async runReceiverDecisionTurn() {
      throw new Error("shutdown must occur before a receiver decision");
    },
    async runAdmittedToolTurn() {
      throw new Error("shutdown must occur before an admitted turn");
    },
  };
  const artifactsDirectory = fs.mkdtempSync(path.join(
    os.tmpdir(), "threadmesh-coordinator-signal-cleanup-",
  ));
  t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));

  let failure;
  try {
    await runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      runtime,
      signal: controller.signal,
    });
  } catch (error) {
    failure = error;
  }

  assert.equal(failure?.code, "threadmesh_coordinator_driven_shutdown_requested");
  assert.deepEqual(created.map(({ role }) => role), ["a", "r", "v", "dependent", "irrelevant"]);
  assert.deepEqual(deleted.map(({ role }) => role), ["irrelevant", "dependent", "v", "r", "a"]);
  const aKickoffSchema = created[0].options.phaseTools["user-kickoff"][0].inputSchema;
  assert.equal(aKickoffSchema.additionalProperties, false);
  assert.equal(aKickoffSchema.properties.sourceEventId.const, "msg_no_plan_artifact_0001");
  assert.equal(aKickoffSchema.properties.commitSha.const, "3".repeat(40));
  const reviewSchema = created[1].options.phaseTools["r-review"][1].inputSchema;
  assert.equal(reviewSchema.properties.event.const.eventType, "review-failed");
  assert.match(reviewSchema.properties.findingDigest.const, /^sha256:[a-f0-9]{64}$/u);
  const verifySchema = created[2].options.phaseTools["v-verify"][1].inputSchema;
  assert.equal(verifySchema.properties.chainId.const, "chain_coordinator_driven_no_plan");
  assert.equal(verifySchema.properties.expectedEvidenceChainHead.const, undefined);
  assert.equal(verifySchema.properties.expectedEvidenceChainHead.pattern,
    "^sha256:[a-f0-9]{64}$");
  assert.equal(failure.cleanup?.complete, true);
  assert.equal(failure.cleanup?.roles.length, 5);
  assert.equal(failure.cleanup?.remainingJournalCount, 0);
  assert.equal(failure.cleanup?.coordinatorRemoved, true);
  assert.equal(failure.cleanup?.runRootRemoved, true);
});
