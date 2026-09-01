import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";
import {
  projectM52EventPumpCodexGateResult,
  runM52EventPumpCodexGate,
} from "../src/validation/m5-2-event-pump-codex-gate.mjs";

function artifacts(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("deterministic Codex gate is pump-driven but remains blocked on verifier custody", async (t) => {
  const result = await runM52EventPumpCodexGate({
    artifactsDirectory: artifacts(t, "threadmesh-m52-event-pump-gate-"),
  });

  assert.equal(result.state, "blocked");
  assert.equal(result.code, "threadmesh_m52_independent_verifier_service_pending");
  assert.equal(result.product, "deterministic-codex-fake");
  assert.equal(result.evidenceClass, "deterministic-event-pump-codex-gate");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.deterministicPolicyOracle, true);
  assert.equal(result.userKickoffs, 1);
  assert.equal(result.runnerPhasePrompts, 0);
  assert.equal(result.runnerDirectActivationDispatches, 0);
  assert.equal(result.pumpProtectedBoundNativeTurns, 8);
  assert.equal(result.boundNativeTurns, 9);
  assert.equal(result.eventPumpDispatches, 4);
  assert.equal(result.eventPumpSkips, 1);
  assert.equal(result.businessToolCalls, 8);
  assert.equal(result.sameAPersistentRefAndWorkspace, true);
  assert.equal(result.distinctReceiverRoles, true);
  assert.equal(result.dependentStartedAfterFinalization, true);
  assert.equal(result.irrelevantNativeTurns, 0);
  assert.equal(result.verificationMode, "fixture-owned-ephemeral-key-not-independent");
  assert.deepEqual(result.remainingGates, [
    "independent-verifier-service", "real-bounded-git-worktree-effects",
    "real-codex-product-run",
  ]);
  assert.equal(result.evidence.nativeTurnManifest.recordCount, 9);
  assert.equal(result.evidence.durableDispatchManifest.recordCount, 5);
  assert.equal(result.evidence.runnerTraceManifest.recordCount, 2);
  assert.equal(result.evidence.sessionManifest.recordCount, 5);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.rolesDeleted, 5);
  assert.equal(result.cleanup.roleAbsenceChecks, 5);
  assert.equal(JSON.stringify(result).includes("thread-deterministic"), false);
  assert.equal(JSON.stringify(result).includes("turn-thread"), false);
});

test("event-pump gate projector rejects summary, receipt, dispatch, trace, and trust drift", async (t) => {
  const core = await runCoordinatorDrivenNoPlanScenario({
    artifactsDirectory: artifacts(t, "threadmesh-m52-event-pump-projector-"),
  });
  assert.equal(projectM52EventPumpCodexGateResult(core).state, "blocked");

  const cases = [
    ["summary", (value) => { value.promptBoundary.phasePromptsSubmittedByRunner = 1; }],
    ["receipt", (value) => {
      value.nativeTurnManifest.records[2].receiptDigest = `sha256:${"0".repeat(64)}`;
    }],
    ["dispatch", (value) => {
      value.durableDispatchManifest.records[0].selectionDigest =
        value.durableDispatchManifest.records[1].selectionDigest;
      value.durableDispatchManifest.manifestDigest =
        sha256Digest(value.durableDispatchManifest.records);
    }],
    ["trace", (value) => {
      value.runnerTraceManifest.records[1].event = "runner-phase-dispatch";
      const body = { ...value.runnerTraceManifest.records[1] };
      delete body.recordDigest;
      value.runnerTraceManifest.records[1].recordDigest = sha256Digest(body);
      value.runnerTraceManifest.manifestDigest =
        sha256Digest(value.runnerTraceManifest.records);
    }],
    ["sequence", (value) => {
      value.businessToolSequences.r.reverse();
    }],
    ["identity", (value) => {
      value.sessionManifest.sameARefDigest = `sha256:${"1".repeat(64)}`;
    }],
    ["trust", (value) => {
      value.verification.externalIndependentVerifier = true;
    }],
    ["extra", (value) => {
      value.nativeTurnManifest.records[0].rawTurnId = "private-turn-id";
    }],
  ];
  for (const [name, mutate] of cases) {
    const changed = structuredClone(core);
    mutate(changed);
    assert.throws(
      () => projectM52EventPumpCodexGateResult(changed),
      { code: "threadmesh_m52_event_pump_gate_result_invalid" },
      name,
    );
  }
});

test("event-pump gate exposes a strict live-runtime injection boundary without starting it", async (t) => {
  await assert.rejects(
    () => runM52EventPumpCodexGate({
      artifactsDirectory: artifacts(t, "threadmesh-m52-live-ready-input-"),
      runtime: { async createRole() {} },
    }),
    { code: "threadmesh_m52_event_pump_gate_input_invalid" },
  );
});
