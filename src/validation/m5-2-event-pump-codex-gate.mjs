import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { runCoordinatorDrivenNoPlanScenario } from
  "./coordinator-driven-no-plan-scenario.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const BLOCKED_CODE = "threadmesh_m52_independent_verifier_service_pending";
const EXPECTED_PHASES = Object.freeze([
  ["a", "user-kickoff", "kickoff", 1],
  ["r", "receiver-decision", "decision", 1],
  ["r", "r-review", "admission", 2],
  ["a", "receiver-decision", "decision", 1],
  ["a", "same-a-fix", "admission", 2],
  ["v", "receiver-decision", "decision", 1],
  ["v", "v-verify", "admission", 2],
  ["dependent", "receiver-decision", "decision", 1],
  ["dependent", "dependent-gated-activation", "admission", 2],
]);
const EXPECTED_BUSINESS_SEQUENCES = Object.freeze({
  r: Object.freeze([
    "threadmesh_review_read_artifact", "threadmesh_report_review_finding",
  ]),
  a: Object.freeze([
    "threadmesh_apply_review_fix", "threadmesh_publish_dependency",
  ]),
  v: Object.freeze([
    "threadmesh_read_verification_chain", "threadmesh_verify_exact_chain",
  ]),
  dependent: Object.freeze([
    "threadmesh_check_finalized_dependency", "threadmesh_activate_verified_dependency",
  ]),
});
const EXPECTED_HANDLERS = Object.freeze([
  "handler.no-plan.review.v1",
  "handler.no-plan.same-a-fix.v1",
  "handler.no-plan.verify.v1",
  "handler.no-plan.dependent.v1",
  "handler.no-plan.irrelevant.v1",
]);
const EXPECTED_DISPATCH_HANDLERS = Object.freeze([
  EXPECTED_HANDLERS[0], EXPECTED_HANDLERS[4], EXPECTED_HANDLERS[1],
  EXPECTED_HANDLERS[2], EXPECTED_HANDLERS[3],
]);

function gateError(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", label);
  }
  return value;
}

function digest(value, label) {
  if (!DIGEST.test(value ?? "")) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", label);
  }
  return value;
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", label);
  }
  return value;
}

function validateNativeTurnManifest(manifest) {
  exactObject(manifest, ["scope", "recordCount", "records", "manifestDigest"],
    "nativeTurnManifest");
  if (manifest.scope !== "sqlite-turn-receipt-and-binding-records" ||
      manifest.recordCount !== 9 || !Array.isArray(manifest.records) ||
      manifest.records.length !== 9 ||
      sha256Digest(manifest.records) !== manifest.manifestDigest) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "nativeTurnManifest");
  }
  const records = manifest.records.map((record, index) => {
    exactObject(record, [
      "sequence", "role", "phase", "bindingKind", "executionDigest", "actorDigest",
      "turnDigest", "toolAllowlistDigest", "promptDigest", "receiptDigest",
      "actionCount", "actionHeadDigest", "executionState", "bindingDigest",
      "recordDigest",
    ], `nativeTurnManifest.records[${index}]`);
    const [role, phase, bindingKind, actionCount] = EXPECTED_PHASES[index];
    const body = { ...record };
    delete body.recordDigest;
    if (
      record.sequence !== index + 1 || record.role !== role || record.phase !== phase ||
      record.bindingKind !== bindingKind || record.actionCount !== actionCount ||
      sha256Digest(body) !== record.recordDigest ||
      !["completed-turn-bound", "promoted"].includes(record.executionState)
    ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "nativeTurnOrder");
    for (const field of [
      "executionDigest", "actorDigest", "turnDigest", "toolAllowlistDigest",
      "promptDigest", "receiptDigest", "actionHeadDigest", "bindingDigest", "recordDigest",
    ]) digest(record[field], `nativeTurn.${field}`);
    return record;
  });
  for (const field of ["executionDigest", "turnDigest", "receiptDigest", "recordDigest"]) {
    if (new Set(records.map((record) => record[field])).size !== records.length) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", `nativeTurn.${field}`);
    }
  }
  digest(manifest.manifestDigest, "nativeTurnManifest.manifestDigest");
  return records;
}

function validateDispatchManifest(manifest, selectionBindings) {
  exactObject(manifest, ["scope", "recordCount", "records", "manifestDigest"],
    "durableDispatchManifest");
  if (manifest.scope !== "sqlite-correlated-snapshot-not-global-chain" ||
      manifest.recordCount !== 5 || !Array.isArray(manifest.records) ||
      manifest.records.length !== 5 || sha256Digest(manifest.records) !== manifest.manifestDigest ||
      !Array.isArray(selectionBindings) || selectionBindings.length !== 5) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "durableDispatchManifest");
  }
  const records = manifest.records.map((record, index) => {
    exactObject(record, [
      "kind", "receiverDigest", "eventCursor", "eventDigest", "registryDigest",
      "pumpIdentityDigest", "handlerId", "handlerConfigDigest", "routeDigest",
      "dispatchIntentDigest", "dispatchState", "selectionDigest", "checkpointCount",
      "checkpointHeadDigest",
    ], `durableDispatchManifest.records[${index}]`);
    if (record.handlerId !== EXPECTED_DISPATCH_HANDLERS[index] ||
        record.kind !== (index === 1 ? "durable-route-skip" : "coordinator-activation") ||
        record.dispatchState !== (index === 1 ? "skipped" : "published") ||
        !Number.isInteger(record.eventCursor) || record.eventCursor < 1 ||
        (index > 0 && record.eventCursor <= manifest.records[index - 1].eventCursor) ||
        record.checkpointCount < 2) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "dispatchOrder");
    }
    for (const field of [
      "receiverDigest", "eventDigest", "registryDigest", "pumpIdentityDigest",
      "handlerConfigDigest", "routeDigest", "dispatchIntentDigest", "selectionDigest",
      "checkpointHeadDigest",
    ]) digest(record[field], `dispatch.${field}`);
    const binding = selectionBindings[index];
    exactObject(binding, [
      "kind", "handlerId", "handlerConfigDigest", "recordDigest", "registryDigest",
      "pumpIdentityDigest", "routeDigest",
    ], `selectionBindings[${index}]`);
    if (canonicalJson(binding) !== canonicalJson({
      kind: record.kind,
      handlerId: record.handlerId,
      handlerConfigDigest: record.handlerConfigDigest,
      recordDigest: record.selectionDigest,
      registryDigest: record.registryDigest,
      pumpIdentityDigest: record.pumpIdentityDigest,
      routeDigest: record.routeDigest,
    })) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "selectionBinding");
    return record;
  });
  if (new Set(records.map(({ selectionDigest }) => selectionDigest)).size !== 5) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "selectionDigest");
  }
  digest(manifest.manifestDigest, "durableDispatchManifest.manifestDigest");
  return records;
}

function validateRunnerTrace(manifest, nativeRecords, dispatchManifestDigest) {
  exactObject(manifest, ["recordCount", "records", "manifestDigest"], "runnerTraceManifest");
  if (manifest.recordCount !== 2 || !Array.isArray(manifest.records) ||
      manifest.records.length !== 2 || sha256Digest(manifest.records) !== manifest.manifestDigest) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "runnerTraceManifest");
  }
  const expected = [
    ["explicit-user-kickoff", nativeRecords[0].recordDigest],
    ["event-pump-run-until-idle", dispatchManifestDigest],
  ];
  manifest.records.forEach((record, index) => {
    exactObject(record, ["sequence", "event", "bindingDigest", "recordDigest"],
      `runnerTraceManifest.records[${index}]`);
    const body = { ...record };
    delete body.recordDigest;
    if (record.sequence !== index + 1 || record.event !== expected[index][0] ||
        record.bindingDigest !== expected[index][1] || sha256Digest(body) !== record.recordDigest) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "runnerTraceBinding");
    }
  });
  digest(manifest.manifestDigest, "runnerTraceManifest.manifestDigest");
}

function validateSessionManifest(manifest, nativeRecords) {
  exactObject(manifest, [
    "recordCount", "records", "sameARefDigest", "sameAWorktreeDigest", "manifestDigest",
  ], "sessionManifest");
  if (manifest.recordCount !== 5 || !Array.isArray(manifest.records) ||
      manifest.records.length !== 5 || sha256Digest(manifest.records) !== manifest.manifestDigest ||
      canonicalJson(manifest.records.map(({ role }) => role)) !==
        canonicalJson(["a", "r", "v", "dependent", "irrelevant"])) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "sessionManifest");
  }
  manifest.records.forEach((record, index) => {
    exactObject(record, ["role", "refDigest", "worktreeDigest"],
      `sessionManifest.records[${index}]`);
    digest(record.refDigest, "session.refDigest");
    digest(record.worktreeDigest, "session.worktreeDigest");
  });
  const implementer = manifest.records[0];
  const implementerTurns = nativeRecords.filter(({ role }) => role === "a");
  if (new Set(manifest.records.map(({ refDigest }) => refDigest)).size !== 5 ||
      manifest.sameARefDigest !== implementer.refDigest ||
      manifest.sameAWorktreeDigest !== implementer.worktreeDigest ||
      implementerTurns.length !== 3 ||
      new Set(implementerTurns.map(({ actorDigest }) => actorDigest)).size !== 1) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "sameAIdentity");
  }
}

function validateBusinessSequences(value) {
  exactObject(value, Object.keys(EXPECTED_BUSINESS_SEQUENCES), "businessToolSequences");
  if (canonicalJson(value) !== canonicalJson(EXPECTED_BUSINESS_SEQUENCES)) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "businessToolSequences");
  }
}

export function projectM52EventPumpCodexGateResult(coreResult, { productProbe = null } = {}) {
  if (!coreResult || typeof coreResult !== "object" || Array.isArray(coreResult)) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "result");
  }
  if (coreResult.state !== "passed-full-functional-in-process-fixture" ||
      coreResult.autonomousEventPump !== true ||
      coreResult.autonomousEventPumpScope !== "in-process-functional-fixture") {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "coreState");
  }
  const nativeRecords = validateNativeTurnManifest(coreResult.nativeTurnManifest);
  const dispatchRecords = validateDispatchManifest(
    coreResult.durableDispatchManifest, coreResult.selectionBindings,
  );
  validateRunnerTrace(
    coreResult.runnerTraceManifest,
    nativeRecords,
    coreResult.durableDispatchManifest.manifestDigest,
  );
  validateSessionManifest(coreResult.sessionManifest, nativeRecords);
  validateBusinessSequences(coreResult.businessToolSequences);

  const promptBoundary = exactObject(coreResult.promptBoundary, [
    "initialUserKickoffPrompts", "phasePromptsSubmittedByRunner",
    "runnerDirectActivationDispatches", "logicalEventPumpLifecycleStarts",
    "pumpProtectedBoundNativeTurns", "boundNativeTurns", "runnerOwnedCounterSource",
    "boundTurnSource",
  ], "promptBoundary");
  if (
    promptBoundary.initialUserKickoffPrompts !== 1 ||
    promptBoundary.phasePromptsSubmittedByRunner !== 0 ||
    promptBoundary.runnerDirectActivationDispatches !== 0 ||
    promptBoundary.logicalEventPumpLifecycleStarts !== 1 ||
    promptBoundary.pumpProtectedBoundNativeTurns !== 8 ||
    promptBoundary.boundNativeTurns !== 9 ||
    coreResult.activationDispatchesByFixtureRunner !== 0 ||
    coreResult.rawPhasePromptsSubmittedByFixtureRunner !== 0 ||
    coreResult.humanRelayCount !== 0 || coreResult.pollingCount !== 0
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "promptBoundary");
  if (
    coreResult.eventPumpDispatches !== 4 || coreResult.eventPumpSkips !== 1 ||
    coreResult.eventPumpTerminalState !== "idle" ||
    coreResult.eventPumpSelectionDurable !== true ||
    coreResult.durablePerDispatchRecordsValid !== true ||
    coreResult.attention?.allOfferedCursorsCommitted !== true ||
    coreResult.attention?.activeClaimCount !== 0 || coreResult.sameARef !== true ||
    coreResult.irrelevant?.claimCount !== 0 || coreResult.irrelevant?.turnCount !== 0 ||
    coreResult.irrelevant?.durableSkip !== true
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "pumpClosure");
  if (
    canonicalJson(coreResult.executedHandlerIds) !== canonicalJson(EXPECTED_HANDLERS.slice(0, 4)) ||
    coreResult.bindings?.lifecycleActionPublications !== 4 ||
    coreResult.bindings?.receiverDecisions !== 4 ||
    coreResult.bindings?.contextAdmissions !== 4 ||
    coreResult.runtime?.modelSelectedToolCalls !== 13 ||
    coreResult.runtime?.planSurfaceUsed === true
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "exactBindings");
  const expectedOrder = [
    "v-verification-tool-selected", "verified-event-durable",
    "dependent-admission-prepared", "trusted-finalization-completed",
    "dependent-business-tool-selected", "dependent-cursor-finalized",
  ];
  if (canonicalJson(coreResult.ordering?.sequence) !== canonicalJson(expectedOrder) ||
      coreResult.ordering?.finalizationBeforeDependentBusiness !== true ||
      coreResult.ordering?.timestampStrictlyEarlier !== true ||
      coreResult.dependent?.effectCommittedAfterFinalization !== true) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "finalizationOrder");
  }
  if (coreResult.verification?.externalIndependentVerifier !== false ||
      coreResult.verification?.signer !== "fixture-owned-ephemeral-key" ||
      coreResult.verification?.signatureVerified !== true ||
      coreResult.verification?.resultDigestBound !== true ||
      coreResult.verification?.allLifecycleNativeTurnIdsDistinct !== true ||
      coreResult.verification?.lifecycleNativeTurnCount !== 9 ||
      coreResult.evidenceChain?.recordCount !== 4 ||
      coreResult.evidenceChain?.trustedComplete !== true ||
      coreResult.dependent?.decision !== "accepted" ||
      coreResult.dependent?.outcome !== "externally-verified" ||
      coreResult.dependent?.edgeStatus !== "satisfied" ||
      coreResult.dependent?.taskState !== "ready" ||
      coreResult.liveProductEvidence !== false || coreResult.cleanup?.complete !== true ||
      coreResult.cleanup?.roles?.length !== 5 ||
      coreResult.cleanup.roles.some(({ deleted, absenceVerified }) =>
        deleted !== true || absenceVerified !== true) ||
      coreResult.cleanup?.coordinatorRemoved !== true ||
      coreResult.cleanup?.remainingJournalCount !== 0
  ) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "honestyBoundary");
  }
  const productBoundary = coreResult.runtime?.productBoundary;
  if (!["deterministic-fake-codex-app-server", "injected-codex-runtime"].includes(
    productBoundary,
  )) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "productBoundary");

  const deterministic = productBoundary === "deterministic-fake-codex-app-server";
  if (coreResult.deterministicPolicyOracle !== deterministic) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "policyOracle");
  }
  if (!deterministic) {
    exactObject(productProbe, ["userAgentDigest", "snapshotDigest"], "productProbe");
    digest(productProbe.userAgentDigest, "productProbe.userAgentDigest");
    digest(productProbe.snapshotDigest, "productProbe.snapshotDigest");
  } else if (productProbe !== null) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "productProbe");
  }
  const remainingGates = [
    "independent-verifier-service",
    "real-bounded-git-worktree-effects",
    ...(deterministic ? ["real-codex-product-run"] : []),
  ];
  return Object.freeze({
    schemaVersion: 1,
    state: "blocked",
    code: BLOCKED_CODE,
    product: deterministic ? "deterministic-codex-fake" : "codex",
    evidenceClass: deterministic
      ? "deterministic-event-pump-codex-gate"
      : "real-codex-event-pump-gate-with-simulated-verifier",
    liveProductEvidence: false,
    deterministicPolicyOracle: deterministic,
    productProbe: deterministic ? null : Object.freeze({ ...productProbe }),
    userKickoffs: 1,
    runnerPhasePrompts: 0,
    runnerDirectActivationDispatches: 0,
    pumpProtectedBoundNativeTurns: 8,
    boundNativeTurns: 9,
    eventPumpDispatches: dispatchRecords.filter(
      ({ kind }) => kind === "coordinator-activation",
    ).length,
    eventPumpSkips: dispatchRecords.filter(
      ({ kind }) => kind === "durable-route-skip",
    ).length,
    businessToolCalls: nativeRecords.reduce((sum, record) =>
      sum + (record.bindingKind === "admission" ? record.actionCount : 0), 0),
    sameAPersistentRefAndWorkspace: true,
    distinctReceiverRoles: true,
    dependentStartedAfterFinalization: true,
    irrelevantNativeTurns: 0,
    verificationMode: "fixture-owned-ephemeral-key-not-independent",
    remainingGates,
    evidence: Object.freeze({
      nativeTurnManifest: coreResult.nativeTurnManifest,
      durableDispatchManifest: coreResult.durableDispatchManifest,
      runnerTraceManifest: coreResult.runnerTraceManifest,
      sessionManifest: coreResult.sessionManifest,
    }),
    cleanup: Object.freeze({
      complete: true,
      rolesDeleted: coreResult.cleanup.roles.length,
      roleAbsenceChecks: coreResult.cleanup.roles.filter(
        ({ absenceVerified }) => absenceVerified === true,
      ).length,
      coordinatorRemoved: coreResult.cleanup.coordinatorRemoved,
      remainingJournalCount: coreResult.cleanup.remainingJournalCount,
    }),
  });
}

export async function runM52EventPumpCodexGate({ artifactsDirectory, runtime = null } = {}) {
  if (!path.isAbsolute(artifactsDirectory ?? "") ||
      (runtime !== null && (
        typeof runtime?.probe !== "function" ||
        typeof runtime?.createRole !== "function" ||
        typeof runtime?.runTurn !== "function" ||
        typeof runtime?.runReceiverDecisionTurn !== "function" ||
        typeof runtime?.runAdmittedToolTurn !== "function" ||
        typeof runtime?.deleteRole !== "function"
      ))) {
    throw gateError("threadmesh_m52_event_pump_gate_input_invalid");
  }
  let productProbe = null;
  if (runtime !== null) {
    const probe = await runtime.probe(artifactsDirectory);
    if (typeof probe?.userAgent !== "string" || probe.userAgent.length < 1 ||
        !DIGEST.test(probe.snapshotDigest ?? "")) {
      throw gateError("threadmesh_m52_event_pump_gate_product_probe_invalid");
    }
    productProbe = {
      userAgentDigest: sha256Digest(probe.userAgent),
      snapshotDigest: probe.snapshotDigest,
    };
  }
  const coreResult = await runCoordinatorDrivenNoPlanScenario({
    artifactsDirectory,
    runtime,
  });
  return projectM52EventPumpCodexGateResult(coreResult, { productProbe });
}
