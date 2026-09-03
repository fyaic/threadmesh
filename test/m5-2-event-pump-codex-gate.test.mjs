import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";
import {
  CodexLiveAgentRuntime,
  isCodexLiveAgentRuntime,
} from "../src/validation/live-agent-scenario.mjs";
import {
  projectM52EventPumpFailureCleanup,
  projectM52EventPumpFailureProgress,
  projectM52OperatorSuppliedCodexEventPumpGateResult,
  projectOperatorSuppliedCodexProbe,
  projectM52EventPumpCodexGateResult,
  runM52EventPumpCodexGate,
} from "../src/validation/m5-2-event-pump-codex-gate.mjs";

function artifacts(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function resignNativeRecord(core, index) {
  const record = core.nativeTurnManifest.records[index];
  record.actionSequenceDigest = sha256Digest(record.actions);
  const body = { ...record };
  delete body.recordDigest;
  record.recordDigest = sha256Digest(body);
  core.nativeTurnManifest.manifestDigest = sha256Digest(core.nativeTurnManifest.records);
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
    "manual-relay-polling-baseline", "minimum-critical-negative-restart",
    "cross-process-os-kill-and-long-turn-lease-heartbeat", "global-selection-chain",
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

test("event-pump gate projector rejects summary, action, identity, and trust drift", async (t) => {
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
    ["action-head", (value) => {
      value.nativeTurnManifest.records[2].actionHeadDigest = `sha256:${"2".repeat(64)}`;
      resignNativeRecord(value, 2);
    }],
    ["tool-name", (value) => {
      value.nativeTurnManifest.records[2].actions[0].tool =
        "threadmesh_report_review_finding";
      resignNativeRecord(value, 2);
    }],
    ["tool-order", (value) => {
      value.nativeTurnManifest.records[2].actions.reverse();
      resignNativeRecord(value, 2);
    }],
    ["tool-ordinal", (value) => {
      value.nativeTurnManifest.records[2].actions[0].ordinal = 1;
      resignNativeRecord(value, 2);
    }],
    ["adapter-ref", (value) => {
      value.nativeTurnManifest.records[2].adapterRefDigest = `sha256:${"3".repeat(64)}`;
      resignNativeRecord(value, 2);
    }],
    ["same-a-turn", (value) => {
      value.nativeTurnManifest.records[3].actorDigest = `sha256:${"4".repeat(64)}`;
      resignNativeRecord(value, 3);
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
    ["stale-top-level", (value) => {
      value.initialUserStartPrompts = 1;
    }],
    ["unknown-top-level", (value) => {
      value.untrustedSummary = true;
    }],
    ["unknown-cleanup", (value) => {
      value.cleanup.rawPath = "/private/path";
    }],
    ["cleanup-unknown-count", (value) => {
      value.cleanup.unknownJournalCount = 1;
    }],
    ["cleanup-unknown-path", (value) => {
      value.cleanup.unknownJournalPathDigests = [`sha256:${"5".repeat(64)}`];
    }],
    ["cleanup-journal-failure", (value) => {
      value.cleanup.journalRemovalFailures = [{ errorCode: "synthetic" }];
    }],
    ["cleanup-directory", (value) => {
      value.cleanup.runRootRemoved = false;
    }],
    ["cleanup-role-duplicate", (value) => {
      value.cleanup.roles[0].role = "a";
    }],
    ["attention-extra-role", (value) => {
      value.attention.cursors.extra = structuredClone(value.attention.cursors.r);
    }],
    ["attention-active", (value) => {
      value.attention.cursors.r.activeClaimEpoch = 2;
    }],
    ["attention-cursor", (value) => {
      value.attention.cursors.r.committedCursor = 2;
    }],
    ["prompt-source", (value) => {
      value.promptBoundary.boundTurnSource = "summary-owned-counter";
    }],
    ["selection-scope", (value) => {
      value.eventPumpSelectionChainScope = "global";
      value.eventPumpSelectionChainValid = true;
    }],
    ["fixture-scope", (value) => {
      value.completedRoles.pop();
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

test("event-pump gate keeps an internal branded-runtime identity boundary without model use", async (t) => {
  const plainSpoof = {
    probe() {}, createRole() {}, runTurn() {}, runReceiverDecisionTurn() {},
    runAdmittedToolTurn() {}, deleteRole() {},
  };
  assert.equal(isCodexLiveAgentRuntime(plainSpoof), false);
  const branded = new CodexLiveAgentRuntime({ command: "/not-started", adapter: {} });
  assert.equal(isCodexLiveAgentRuntime(branded), true);

  await assert.rejects(
    () => runM52EventPumpCodexGate({
      artifactsDirectory: artifacts(t, "threadmesh-m52-live-ready-input-"),
      runtime: { async createRole() {} },
    }),
    { code: "threadmesh_m52_event_pump_gate_input_invalid" },
  );
});

test("operator-supplied Codex-shaped probe is strict but proves no binary provenance", () => {
  const probe = {
    userAgent: "threadmesh-codex-app-server-adapter/0.145.0 (Mac OS 26.5.1; arm64) dumb (threadmesh-codex-app-server-adapter; 0.0.0)",
    platformFamily: "unix",
    platformOs: "macos",
  };
  probe.snapshotDigest = sha256Digest(probe);
  const projected = projectOperatorSuppliedCodexProbe(probe);
  assert.equal(projected.userAgentDigest, sha256Digest(probe.userAgent));
  assert.equal(projected.snapshotDigest, probe.snapshotDigest);
  assert.equal(Object.hasOwn(projected, "binaryProvenanceVerified"), false);

  for (const changed of [
    { ...probe, userAgent: probe.userAgent.replace("threadmesh-", "spoofed-") },
    { ...probe, userAgent: probe.userAgent.replace("; 0.0.0)", "; 1.0.0)") },
    { ...probe, userAgent: `${probe.userAgent}\nspoofed` },
    { ...probe, platformFamily: "windows" },
    { ...probe, platformOs: "darwin" },
    { ...probe, snapshotDigest: `sha256:${"6".repeat(64)}` },
    { ...probe, binaryPath: "/private/codex" },
  ]) {
    assert.throws(
      () => projectOperatorSuppliedCodexProbe(changed),
      { code: /threadmesh_m52_event_pump_gate_/u },
    );
  }
});

test("an injected runtime cannot spoof Codex product evidence in the public projector", async (t) => {
  const source = await runCoordinatorDrivenNoPlanScenario({
    artifactsDirectory: artifacts(t, "threadmesh-m52-injected-label-"),
  });
  const core = structuredClone(source);
  core.runtime.productBoundary = "injected-codex-runtime";
  core.runtime.adapterInvocationAuditAvailable = false;
  core.runtime.planSurfaceUsed = null;
  core.deterministicPolicyOracle = false;
  const probe = {
    userAgentDigest: sha256Digest("codex_cli_rs/999.999.999"),
    snapshotDigest: sha256Digest({ userAgent: "spoof" }),
  };
  const result = projectM52EventPumpCodexGateResult(core, { productProbe: probe });
  assert.equal(result.product, "injected-runtime");
  assert.equal(result.evidenceClass, "injected-runtime-event-pump-gate");
  assert.equal(result.liveProductEvidence, false);
  assert.equal(result.remainingGates.includes("real-codex-product-run"), true);

  const rawProbe = {
    userAgent: "threadmesh-codex-app-server-adapter/0.145.0 (Mac OS 26.5.1; arm64) dumb (threadmesh-codex-app-server-adapter; 0.0.0)",
    platformFamily: "unix",
    platformOs: "macos",
  };
  rawProbe.snapshotDigest = sha256Digest(rawProbe);
  const operatorResult = projectM52OperatorSuppliedCodexEventPumpGateResult(
    core, { probe: rawProbe },
  );
  assert.equal(operatorResult.product, "operator-supplied-codex-shaped-executable");
  assert.equal(operatorResult.evidenceClass,
    "operator-supplied-codex-shaped-event-pump-gate");
  assert.equal(operatorResult.liveProductEvidence, false);
  assert.equal(operatorResult.remainingGates.includes(
    "trusted-codex-binary-provenance",
  ), true);
});

test("event-pump gate CLI distinguishes help, blocked, and preflight exits", () => {
  const script = path.resolve("scripts/run-m5-2-event-pump-gate.mjs");
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /THREADMESH_CODEX_COMMAND/u);
  assert.match(help.stdout, /operator-supplied and Codex-shaped/u);
  assert.match(help.stdout, /blocked=2, failed=1, usage\/preflight\/not-run=3/u);

  const blocked = spawnSync(process.execPath, [script, "--mode", "fake"], {
    encoding: "utf8",
  });
  assert.equal(blocked.status, 2);
  assert.equal(JSON.parse(blocked.stdout).state, "blocked");

  const preflight = spawnSync(process.execPath, [script, "--mode", "live"], {
    encoding: "utf8",
    env: {
      ...process.env,
      THREADMESH_M52_EVENT_PUMP_LIVE_ACK: "",
      THREADMESH_CODEX_COMMAND: "/definitely/not/accessed/without/ack",
    },
  });
  assert.equal(preflight.status, 3);
  assert.equal(JSON.parse(preflight.stderr).code,
    "threadmesh_m52_event_pump_runner_live_ack_required");

  const failureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-failure-"));
  const rawToken = "RAW_FAILURE_PATH_TOKEN";
  try {
    fs.writeFileSync(path.join(failureDirectory, `${rawToken}.json`), "{}\n");
    const failure = spawnSync(process.execPath, [
      script, "--mode", "fake", "--artifacts-dir", failureDirectory,
    ], { encoding: "utf8" });
    assert.equal(failure.status, 1);
    const output = JSON.parse(failure.stderr);
    assert.equal(output.state, "failed");
    assert.deepEqual(output.cleanup, {
      complete: false,
      rolesDeleted: 5,
      roleAbsenceChecks: 5,
      coordinatorRemoved: true,
      remainingJournalCount: 0,
    });
    assert.equal(failure.stderr.includes(rawToken), false);
    assert.equal(failure.stderr.includes(failureDirectory), false);
    assert.equal(Object.hasOwn(output, "message"), false);
  } finally {
    fs.rmSync(failureDirectory, { recursive: true, force: true });
  }
});

test("failure cleanup projection is bounded and omits raw role and path data", () => {
  const projected = projectM52EventPumpFailureCleanup({
    complete: true,
    roles: [{
      role: "a",
      deleted: true,
      absenceVerified: true,
      threadId: "raw-thread-id",
      path: "/private/raw/path",
    }],
    coordinatorRemoved: true,
    remainingJournalCount: 0,
    rawError: "secret error text",
  });
  assert.deepEqual(projected, {
    complete: false,
    rolesDeleted: 1,
    roleAbsenceChecks: 1,
    coordinatorRemoved: true,
    remainingJournalCount: 0,
  });
  const encoded = JSON.stringify(projected);
  assert.equal(encoded.includes("raw-thread-id"), false);
  assert.equal(encoded.includes("/private/raw/path"), false);
  assert.equal(encoded.includes("secret error text"), false);

  const fullCleanup = {
    complete: false,
    roles: ["irrelevant", "dependent", "v", "r", "a"].map((role) => ({
      role, deleted: true, absenceVerified: true,
    })),
    ownedJournalRemovedCount: 0,
    remainingJournalCount: 0,
    unknownJournalCount: 0,
    unknownJournalPathDigests: [],
    journalRemovalFailures: [],
    databaseRemovalFailures: [],
    journalDirectoryRemoved: true,
    runRootRemoved: true,
    coordinatorRemoved: true,
    verifierServiceClosed: true,
    gitFixture: { complete: true },
  };
  assert.equal(projectM52EventPumpFailureCleanup(fullCleanup).complete, true);
  assert.equal(projectM52EventPumpFailureCleanup({ complete: true }).complete, false);
  for (const roles of [[], ["a"], ["r", "a"]]) {
    const partialCleanup = structuredClone(fullCleanup);
    partialCleanup.roles = roles.map((role) => ({
      role, deleted: true, absenceVerified: true,
    }));
    assert.equal(projectM52EventPumpFailureCleanup(partialCleanup).complete, true);
  }

  const duplicates = structuredClone(fullCleanup);
  duplicates.complete = true;
  duplicates.roles[0].role = "a";
  assert.deepEqual(projectM52EventPumpFailureCleanup(duplicates), {
    complete: false,
    rolesDeleted: 5,
    roleAbsenceChecks: 5,
    coordinatorRemoved: true,
    remainingJournalCount: 0,
  });
  for (const invalidRoles of [
    [{ role: "unknown", deleted: true, absenceVerified: true }],
    [...fullCleanup.roles, { role: "unknown", deleted: true, absenceVerified: true }],
  ]) {
    const invalid = structuredClone(fullCleanup);
    invalid.complete = true;
    invalid.roles = invalidRoles;
    assert.equal(projectM52EventPumpFailureCleanup(invalid).complete, false);
  }

  for (const mutate of [
    (value) => { value.unknownJournalCount = 1; },
    (value) => { value.unknownJournalPathDigests = [`sha256:${"7".repeat(64)}`]; },
    (value) => { value.journalRemovalFailures = [{ errorCode: "synthetic" }]; },
    (value) => { value.databaseRemovalFailures = [{ errorCode: "synthetic" }]; },
    (value) => { value.runRootRemoved = false; },
  ]) {
    const contradictory = structuredClone(fullCleanup);
    contradictory.complete = true;
    mutate(contradictory);
    assert.equal(projectM52EventPumpFailureCleanup(contradictory).complete, false);
    assert.equal(JSON.stringify(
      projectM52EventPumpFailureCleanup(contradictory),
    ).includes("synthetic"), false);
  }
});

test("failure progress projection exposes only bounded SQLite-derived stage data", () => {
  const source = {
    schemaVersion: 1,
    source: "sqlite-pre-cleanup",
    stage: "reviewer-admitted-turn-partial",
    counts: {
      tasks: 5,
      dispatches: 1,
      turnIntents: 3,
      toolActions: 4,
      completedToolActions: 3,
      lifecyclePublications: 1,
      gitEvidenceRecords: 1,
      dependencyFinalizations: 0,
      dependencySatisfactions: 0,
      cursorCommits: 0,
    },
    reconciliation: {
      state: "ambiguous",
      reasonCode: "codex-native-turn-completed-observation-only",
      boundary: "review-counterexample",
    },
  };
  assert.deepEqual(projectM52EventPumpFailureProgress(source), source);
  for (const boundary of [
    "native-turn-timeout", "admitted-tools-missing", "tool-correlation", "turn-result",
  ]) {
    const classified = structuredClone(source);
    classified.reconciliation.boundary = boundary;
    assert.deepEqual(projectM52EventPumpFailureProgress(classified), classified);
  }

  for (const mutate of [
    (value) => { value.rawThreadId = "raw-thread-id"; },
    (value) => { value.counts.prompt = 1; },
    (value) => { value.counts.turnIntents = 17; },
    (value) => { value.counts.completedToolActions = value.counts.toolActions + 1; },
    (value) => { value.stage = "review-published"; },
    (value) => { value.reconciliation.reasonCode = "/private/raw/path"; },
    (value) => { value.reconciliation.reasonCode = "codex-native-turn-secret-id"; },
    (value) => { value.reconciliation.boundary = "review-secret-id"; },
  ]) {
    const tampered = structuredClone(source);
    mutate(tampered);
    assert.equal(projectM52EventPumpFailureProgress(tampered), null);
  }
  const encoded = JSON.stringify(projectM52EventPumpFailureProgress(source));
  assert.equal(encoded.includes("threadId"), false);
  assert.equal(encoded.includes("prompt"), false);
  assert.equal(encoded.includes("/private/"), false);
});
