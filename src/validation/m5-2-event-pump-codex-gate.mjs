import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import {
  COORDINATOR_FAILURE_BOUNDARIES,
  COORDINATOR_FAILURE_RECONCILIATION_REASONS,
  deriveCoordinatorDrivenFailureStage,
  runCoordinatorDrivenNoPlanScenario,
} from "./coordinator-driven-no-plan-scenario.mjs";
import {
  CodexLiveAgentRuntime,
  isCodexLiveAgentRuntime,
} from "./live-agent-scenario.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const ADAPTER_OWNED_CODEX_USER_AGENT =
  /^threadmesh-codex-app-server-adapter\/[0-9]+\.[0-9]+\.[0-9]+ \(Mac OS [0-9]+(?:\.[0-9]+){1,3}; (?:arm64|x86_64)\) dumb \(threadmesh-codex-app-server-adapter; 0\.0\.0\)$/u;
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
const EXPECTED_ACTION_SEQUENCES = Object.freeze([
  Object.freeze(["threadmesh_publish_artifact"]),
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.r,
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.a,
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.v,
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.dependent,
]);
const REAL_EFFECT_EXPECTED_PHASES = Object.freeze([
  ["a", "user-kickoff", "kickoff", 2],
  ["r", "receiver-decision", "decision", 1],
  ["r", "r-review", "admission", 2],
  ["a", "receiver-decision", "decision", 1],
  ["a", "same-a-fix", "admission", 2],
  ["v", "receiver-decision", "decision", 1],
  ["v", "v-verify", "admission", 2],
  ["dependent", "receiver-decision", "decision", 1],
  ["dependent", "dependent-gated-activation", "admission", 2],
]);
const REAL_EFFECT_EXPECTED_ACTION_SEQUENCES = Object.freeze([
  Object.freeze(["threadmesh_commit_candidate", "threadmesh_publish_artifact"]),
  Object.freeze(["threadmesh_decide_offer"]),
  Object.freeze([
    "threadmesh_review_read_artifact", "threadmesh_report_review_finding",
  ]),
  Object.freeze(["threadmesh_decide_offer"]),
  Object.freeze(["threadmesh_commit_candidate", "threadmesh_publish_dependency"]),
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.v,
  Object.freeze(["threadmesh_decide_offer"]),
  EXPECTED_BUSINESS_SEQUENCES.dependent,
]);
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
const EXPECTED_CURSOR_STATE = Object.freeze({
  r: Object.freeze({ taskId: "task_no_plan_r", incarnationId: "inc_no_plan_r_0001", cursor: 1, revision: 2 }),
  a: Object.freeze({ taskId: "task_no_plan_a", incarnationId: "inc_no_plan_a_0001", cursor: 7, revision: 2 }),
  v: Object.freeze({ taskId: "task_no_plan_v", incarnationId: "inc_no_plan_v_0001", cursor: 12, revision: 2 }),
  dependent: Object.freeze({ taskId: "task_no_plan_dependent", incarnationId: "inc_no_plan_dependent_0001", cursor: 17, revision: 2 }),
  irrelevant: Object.freeze({ taskId: "task_no_plan_irrelevant", incarnationId: "inc_no_plan_irrelevant_0001", cursor: 2, revision: 1 }),
});
const EXPECTED_COMPLETED_ROLES = Object.freeze([
  "a-kickoff", "r", "same-a", "v", "dependent",
]);
const EXPECTED_PENDING_GATES = Object.freeze([
  "cross-process-os-kill-and-long-turn-lease-heartbeat", "global-selection-chain",
]);
const CORE_RESULT_KEYS = Object.freeze([
  "state", "liveProductEvidence", "promptBoundary", "deterministicPolicyOracle",
  "activationDispatchesByFixtureRunner", "eventPumpDispatches", "eventPumpSkips",
  "eventPumpSelectionRecordCount", "eventPumpSelectionHeadDigest",
  "eventPumpSelectionChainValid", "eventPumpSelectionChainScope",
  "eventPumpSelectionDurable", "durablePerDispatchRecordsValid",
  "durablePerDispatchRecordCount", "eventPumpTerminalState",
  "eventPumpAwaitingPromotion", "autonomousEventPump", "autonomousEventPumpScope",
  "rawPhasePromptsSubmittedByFixtureRunner", "humanRelayCount", "pollingCount",
  "completedRoles", "pendingRoles", "pendingReason", "pendingGates",
  "routeHandlerConfigs", "executedHandlerIds", "selectionBindings",
  "durableDispatchManifest", "nativeTurnManifest", "runnerTraceManifest",
  "sessionManifest", "attention", "sameARef", "bindings", "verification", "gitEffects",
  "evidenceChain", "dependent", "ordering", "irrelevant", "runtime", "cleanup",
]);

function gateError(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

export function projectM52EventPumpFailureCleanup(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const roles = Array.isArray(source.roles) ? source.roles.slice(0, 5) : [];
  const remainingJournalCount = Number.isSafeInteger(source.remainingJournalCount) &&
      source.remainingJournalCount >= 0 && source.remainingJournalCount <= 10_000
    ? source.remainingJournalCount : null;
  const expectedKeys = [
    "complete", "roles", "ownedJournalRemovedCount", "remainingJournalCount",
    "unknownJournalCount", "unknownJournalPathDigests", "journalRemovalFailures",
    "databaseRemovalFailures", "journalDirectoryRemoved", "runRootRemoved",
    "coordinatorRemoved", "verifierServiceClosed", "gitFixture",
  ];
  const exactSchema = canonicalJson(Object.keys(source).sort()) ===
    canonicalJson(expectedKeys.sort());
  const roleCreationOrder = ["a", "r", "v", "dependent", "irrelevant"];
  const expectedCleanupOrder = roleCreationOrder.slice(0, roles.length).reverse();
  const rolesClosed = Array.isArray(source.roles) && source.roles.length <= 5 &&
    canonicalJson(roles.map((role) => role?.role)) ===
      canonicalJson(expectedCleanupOrder) &&
    roles.every((role) => role?.deleted === true && role?.absenceVerified === true);
  const ownedJournalRemovedCountValid =
    Number.isSafeInteger(source.ownedJournalRemovedCount) &&
    source.ownedJournalRemovedCount >= 0 && source.ownedJournalRemovedCount <= 10_000;
  const closureComplete = exactSchema && rolesClosed && ownedJournalRemovedCountValid &&
    remainingJournalCount === 0 && source.unknownJournalCount === 0 &&
    Array.isArray(source.unknownJournalPathDigests) &&
    source.unknownJournalPathDigests.length === 0 &&
    Array.isArray(source.journalRemovalFailures) &&
    source.journalRemovalFailures.length === 0 &&
    Array.isArray(source.databaseRemovalFailures) &&
    source.databaseRemovalFailures.length === 0 &&
    source.journalDirectoryRemoved === true && source.runRootRemoved === true &&
    source.coordinatorRemoved === true && source.verifierServiceClosed === true &&
    source.gitFixture?.complete === true;
  return Object.freeze({
    complete: closureComplete,
    rolesDeleted: roles.filter((role) => role?.deleted === true).length,
    roleAbsenceChecks: roles.filter((role) => role?.absenceVerified === true).length,
    coordinatorRemoved: source.coordinatorRemoved === true,
    remainingJournalCount,
  });
}

const FAILURE_PROGRESS_COUNT_LIMITS = Object.freeze({
  tasks: 5,
  dispatches: 5,
  turnIntents: 16,
  toolActions: 32,
  completedToolActions: 32,
  lifecyclePublications: 4,
  gitEvidenceRecords: 4,
  dependencyFinalizations: 1,
  dependencySatisfactions: 1,
  cursorCommits: 5,
});
export function projectM52EventPumpFailureProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const expectedKeys = [
    "schemaVersion", "source", "stage", "counts", "reconciliation",
  ];
  if (canonicalJson(Object.keys(value).sort()) !== canonicalJson(expectedKeys.sort()) ||
      value.schemaVersion !== 1 || value.source !== "sqlite-pre-cleanup" ||
      !value.counts || typeof value.counts !== "object" ||
      Array.isArray(value.counts)) {
    return null;
  }
  const countKeys = Object.keys(FAILURE_PROGRESS_COUNT_LIMITS);
  if (canonicalJson(Object.keys(value.counts).sort()) !==
      canonicalJson([...countKeys].sort())) {
    return null;
  }
  const counts = {};
  for (const [key, limit] of Object.entries(FAILURE_PROGRESS_COUNT_LIMITS)) {
    const count = value.counts[key];
    if (!Number.isSafeInteger(count) || count < 0 || count > limit) return null;
    counts[key] = count;
  }
  if (counts.completedToolActions > counts.toolActions) return null;
  if (value.stage !== deriveCoordinatorDrivenFailureStage(counts)) return null;
  let reconciliation = null;
  if (value.reconciliation !== null) {
    const source = value.reconciliation;
    const reconciliationKeys = ["state", "reasonCode", "boundary"];
    if (!source || typeof source !== "object" || Array.isArray(source) ||
        canonicalJson(Object.keys(source).sort()) !==
          canonicalJson(reconciliationKeys.sort()) ||
        source.state !== "ambiguous" ||
        !COORDINATOR_FAILURE_RECONCILIATION_REASONS.includes(source.reasonCode) ||
        (source.boundary !== null &&
          !Object.values(COORDINATOR_FAILURE_BOUNDARIES).includes(source.boundary))) {
      return null;
    }
    reconciliation = Object.freeze({
      state: source.state,
      reasonCode: source.reasonCode,
      boundary: source.boundary,
    });
  }
  return Object.freeze({
    schemaVersion: 1,
    source: "sqlite-pre-cleanup",
    stage: value.stage,
    counts: Object.freeze(counts),
    reconciliation,
  });
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", label);
  }
  return value;
}

function boundedObject(value, requiredKeys, allowedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      requiredKeys.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !allowedKeys.includes(key))) {
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

function validateNativeTurnManifest(manifest, { realEffects = false } = {}) {
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
      "adapterRefDigest", "turnDigest", "toolAllowlistDigest", "promptDigest",
      "receiptDigest", "actionCount", "actionHeadDigest", "actions",
      "actionSequenceDigest", "executionState", "bindingDigest", "recordDigest",
    ], `nativeTurnManifest.records[${index}]`);
    const phases = realEffects ? REAL_EFFECT_EXPECTED_PHASES : EXPECTED_PHASES;
    const sequences = realEffects
      ? REAL_EFFECT_EXPECTED_ACTION_SEQUENCES : EXPECTED_ACTION_SEQUENCES;
    const [role, phase, bindingKind, actionCount] = phases[index];
    const body = { ...record };
    delete body.recordDigest;
    if (
      record.sequence !== index + 1 || record.role !== role || record.phase !== phase ||
      record.bindingKind !== bindingKind || record.actionCount !== actionCount ||
      sha256Digest(body) !== record.recordDigest ||
      !["completed-turn-bound", "promoted"].includes(record.executionState)
    ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "nativeTurnOrder");
    if (!Array.isArray(record.actions) || record.actions.length !== actionCount ||
        sha256Digest(record.actions) !== record.actionSequenceDigest ||
        canonicalJson(record.actions.map(({ tool }) => tool)) !==
          canonicalJson(sequences[index])) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "nativeTurnActions");
    }
    record.actions.forEach((action, ordinal) => {
      exactObject(action, [
        "ordinal", "tool", "argumentsDigest", "selectionDigest", "resultDigest",
        "resultStatus", "previousActionDigest", "actionDigest",
      ], `nativeTurn.actions[${ordinal}]`);
      if (action.ordinal !== ordinal || action.resultStatus !== "completed" ||
          action.previousActionDigest !==
            (ordinal === 0 ? null : record.actions[ordinal - 1].selectionDigest) ||
          action.actionDigest !== sha256Digest({
            selectionDigest: action.selectionDigest,
            resultDigest: action.resultDigest,
            resultStatus: action.resultStatus,
          })) {
        throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "nativeActionOrder");
      }
      for (const field of [
        "argumentsDigest", "selectionDigest", "resultDigest", "actionDigest",
      ]) digest(action[field], `nativeAction.${field}`);
    });
    if (record.actionHeadDigest !== record.actions.at(-1).selectionDigest) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "actionHeadDigest");
    }
    for (const field of [
      "executionDigest", "actorDigest", "adapterRefDigest", "turnDigest",
      "toolAllowlistDigest", "promptDigest", "receiptDigest", "actionHeadDigest",
      "actionSequenceDigest", "bindingDigest", "recordDigest",
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
  const refsByRole = new Map(manifest.records.map((record) => [record.role, record.refDigest]));
  if (new Set(manifest.records.map(({ refDigest }) => refDigest)).size !== 5 ||
      manifest.sameARefDigest !== implementer.refDigest ||
      manifest.sameAWorktreeDigest !== implementer.worktreeDigest ||
      implementerTurns.length !== 3 ||
      new Set(implementerTurns.map(({ actorDigest }) => actorDigest)).size !== 1 ||
      nativeRecords.some((record) => record.adapterRefDigest !== refsByRole.get(record.role))) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "sameAIdentity");
  }
}

function projectGateResult(coreResult, {
  productProbe = null,
  operatorSuppliedCodexShapedRuntime = false,
} = {}) {
  exactObject(coreResult, CORE_RESULT_KEYS, "result");
  const gitEffects = exactObject(coreResult.gitEffects, [
    "realBoundedWorktrees", "implementationSha", "fixSha", "directDescendant",
    "reviewerDetached", "verifierDetached", "fixtureDefinitionDigest",
  ], "gitEffects");
  const realEffects = gitEffects.realBoundedWorktrees === true;
  if (coreResult.state !== "passed-full-functional-in-process-fixture" ||
      coreResult.autonomousEventPump !== true ||
      coreResult.autonomousEventPumpScope !== "in-process-functional-fixture") {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "coreState");
  }
  const nativeRecords = validateNativeTurnManifest(
    coreResult.nativeTurnManifest, { realEffects },
  );
  const dispatchRecords = validateDispatchManifest(
    coreResult.durableDispatchManifest, coreResult.selectionBindings,
  );
  validateRunnerTrace(
    coreResult.runnerTraceManifest,
    nativeRecords,
    coreResult.durableDispatchManifest.manifestDigest,
  );
  validateSessionManifest(coreResult.sessionManifest, nativeRecords);

  const promptBoundary = exactObject(coreResult.promptBoundary, [
    "initialUserKickoffPrompts", "phasePromptsSubmittedByRunner",
    "runnerDirectActivationDispatches", "logicalEventPumpLifecycleStarts",
    "pumpProtectedBoundNativeTurns", "boundNativeTurns", "runnerOwnedCounterSource",
    "boundTurnSource",
  ], "promptBoundary");
  exactObject(coreResult.attention, [
    "cursors", "activeClaimCount", "allOfferedCursorsCommitted",
  ], "attention");
  for (const [role, cursor] of Object.entries(coreResult.attention.cursors ?? {})) {
    exactObject(cursor, [
      "receiver", "committedCursor", "commitCount", "commitHeadDigest", "revision",
      "activeClaimEpoch", "activeEventCursor",
    ], `attention.cursors.${role}`);
    const expected = EXPECTED_CURSOR_STATE[role];
    exactObject(cursor.receiver, ["taskId", "incarnationId"],
      `attention.cursors.${role}.receiver`);
    if (!expected || cursor.receiver.taskId !== expected.taskId ||
        cursor.receiver.incarnationId !== expected.incarnationId ||
        cursor.committedCursor !== expected.cursor || cursor.commitCount !== 1 ||
        cursor.revision !== expected.revision || cursor.activeClaimEpoch !== null ||
        cursor.activeEventCursor !== null) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "attentionCursorState");
    }
    digest(cursor.commitHeadDigest, "attention.commitHeadDigest");
  }
  if (canonicalJson(Object.keys(coreResult.attention.cursors).sort()) !==
      canonicalJson(Object.keys(EXPECTED_CURSOR_STATE).sort())) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "attentionCursorRoles");
  }
  exactObject(coreResult.bindings, [
    "lifecycleActionPublications", "receiverDecisions", "contextAdmissions",
  ], "bindings");
  exactObject(coreResult.runtime, [
    "productBoundary", "adapterInvocationAuditAvailable", "planSurfaceUsed",
    "modelSelectedToolCalls",
  ], "runtime");
  exactObject(coreResult.verification, [
    "mode", "externalIndependentVerifier", "processIsolatedVerifier", "signer",
    "nativeVerifierSessionIndependent",
    "nativeVerifierTurnIdDigest", "allLifecycleNativeTurnIdsDistinct",
    "lifecycleNativeTurnCount", "signatureVerified", "trustAnchorDigest",
    "resultDigestBound",
  ], "verification");
  exactObject(coreResult.evidenceChain, [
    "recordCount", "trustedComplete", "headDigest",
  ], "evidenceChain");
  exactObject(coreResult.dependent, [
    "decision", "outcome", "edgeStatus", "taskState", "effectCommittedAfterFinalization",
  ], "dependent");
  exactObject(coreResult.ordering, [
    "sequence", "finalizationBeforeDependentBusiness", "finalizationAt",
    "dependentBusinessStartedAt", "timestampStrictlyEarlier",
  ], "ordering");
  exactObject(coreResult.irrelevant, ["claimCount", "turnCount", "durableSkip"],
    "irrelevant");
  exactObject(coreResult.cleanup, [
    "complete", "roles", "ownedJournalRemovedCount", "remainingJournalCount",
    "unknownJournalCount", "unknownJournalPathDigests", "journalRemovalFailures",
    "databaseRemovalFailures", "journalDirectoryRemoved", "runRootRemoved",
    "coordinatorRemoved", "verifierServiceClosed", "gitFixture",
  ], "cleanup");
  if (!Array.isArray(coreResult.cleanup.roles)) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "cleanup.roles");
  }
  coreResult.cleanup.roles.forEach((role, index) => {
    boundedObject(role, ["role", "deleted", "absenceVerified"], [
      "role", "deleted", "absenceVerified", "checkedBy", "snapshotDigest",
      "identifierDigest", "replay",
    ], `cleanup.roles[${index}]`);
    if (Object.hasOwn(role, "snapshotDigest")) digest(role.snapshotDigest, "cleanup.snapshotDigest");
    if (Object.hasOwn(role, "identifierDigest")) {
      digest(role.identifierDigest, "cleanup.identifierDigest");
    }
    if (role.deleted !== true || role.absenceVerified !== true) {
      throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "cleanup.roleState");
    }
  });
  if (canonicalJson(coreResult.cleanup.roles.map(({ role }) => role).sort()) !==
      canonicalJson(["a", "dependent", "irrelevant", "r", "v"]) ||
      coreResult.cleanup.unknownJournalCount !== 0 ||
      canonicalJson(coreResult.cleanup.unknownJournalPathDigests) !== "[]" ||
      canonicalJson(coreResult.cleanup.journalRemovalFailures) !== "[]" ||
      canonicalJson(coreResult.cleanup.databaseRemovalFailures) !== "[]" ||
      coreResult.cleanup.journalDirectoryRemoved !== true ||
      coreResult.cleanup.runRootRemoved !== true ||
      coreResult.cleanup.coordinatorRemoved !== true ||
      coreResult.cleanup.verifierServiceClosed !== true ||
      coreResult.cleanup.gitFixture?.complete !== true ||
      coreResult.cleanup.ownedJournalRemovedCount !== 0 ||
      coreResult.cleanup.remainingJournalCount !== 0) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "cleanupClosure");
  }
  if (
    promptBoundary.initialUserKickoffPrompts !== 1 ||
    promptBoundary.phasePromptsSubmittedByRunner !== 0 ||
    promptBoundary.runnerDirectActivationDispatches !== 0 ||
    promptBoundary.logicalEventPumpLifecycleStarts !== 1 ||
    promptBoundary.pumpProtectedBoundNativeTurns !== 8 ||
    promptBoundary.boundNativeTurns !== 9 ||
    promptBoundary.runnerOwnedCounterSource !==
      "scenario-entry-and-no-dispatch-call-sites" ||
    promptBoundary.boundTurnSource !== "sqlite-exact-turn-and-binding-records" ||
    coreResult.activationDispatchesByFixtureRunner !== 0 ||
    coreResult.rawPhasePromptsSubmittedByFixtureRunner !== 0 ||
    coreResult.humanRelayCount !== 0 || coreResult.pollingCount !== 0
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "promptBoundary");
  if (
    coreResult.eventPumpDispatches !== 4 || coreResult.eventPumpSkips !== 1 ||
    coreResult.eventPumpTerminalState !== "idle" ||
    coreResult.eventPumpSelectionDurable !== true ||
    coreResult.durablePerDispatchRecordsValid !== true ||
    coreResult.eventPumpSelectionRecordCount !== 5 ||
    coreResult.durablePerDispatchRecordCount !== 5 ||
    coreResult.eventPumpSelectionChainValid !== null ||
    coreResult.eventPumpSelectionChainScope !== "global-chain-not-implemented" ||
    coreResult.eventPumpAwaitingPromotion !== false ||
    coreResult.attention?.allOfferedCursorsCommitted !== true ||
    coreResult.attention?.activeClaimCount !== 0 || coreResult.sameARef !== true ||
    coreResult.irrelevant?.claimCount !== 0 || coreResult.irrelevant?.turnCount !== 0 ||
    coreResult.irrelevant?.durableSkip !== true
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "pumpClosure");
  digest(coreResult.eventPumpSelectionHeadDigest, "eventPumpSelectionHeadDigest");
  if (canonicalJson(coreResult.completedRoles) !== canonicalJson(EXPECTED_COMPLETED_ROLES) ||
      canonicalJson(coreResult.pendingRoles) !== "[]" ||
      coreResult.pendingReason !==
        "OS-kill/long-turn lease heartbeat and a global selection chain remain outside this fixture." ||
      canonicalJson(coreResult.pendingGates) !== canonicalJson(EXPECTED_PENDING_GATES)) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "fixtureScope");
  }
  if (
    canonicalJson(coreResult.executedHandlerIds) !== canonicalJson(EXPECTED_HANDLERS.slice(0, 4)) ||
    coreResult.bindings?.lifecycleActionPublications !== 4 ||
    coreResult.bindings?.receiverDecisions !== 4 ||
    coreResult.bindings?.contextAdmissions !== 4 ||
    coreResult.runtime?.modelSelectedToolCalls !== (realEffects ? 14 : 13)
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
      coreResult.verification?.processIsolatedVerifier !== realEffects ||
      coreResult.verification?.mode !== (realEffects
        ? "process-isolated-child-service-signed"
        : "deterministic-in-process-trusted-signing") ||
      coreResult.verification?.signer !== (realEffects
        ? "process-isolated-child-owned-ephemeral-key"
        : "fixture-owned-ephemeral-key") ||
      coreResult.verification?.nativeVerifierSessionIndependent !== true ||
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
  if (
    gitEffects.directDescendant !== true ||
    (realEffects && (
      !/^[a-f0-9]{40}$/u.test(gitEffects.implementationSha ?? "") ||
      !/^[a-f0-9]{40}$/u.test(gitEffects.fixSha ?? "") ||
      gitEffects.implementationSha === gitEffects.fixSha ||
      gitEffects.reviewerDetached !== true || gitEffects.verifierDetached !== true
    ))
  ) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "gitEffects");
  digest(gitEffects.fixtureDefinitionDigest, "gitEffects.fixtureDefinitionDigest");
  digest(coreResult.verification.nativeVerifierTurnIdDigest,
    "verification.nativeVerifierTurnIdDigest");
  digest(coreResult.verification.trustAnchorDigest, "verification.trustAnchorDigest");
  digest(coreResult.evidenceChain.headDigest, "evidenceChain.headDigest");
  const productBoundary = coreResult.runtime?.productBoundary;
  if (!["deterministic-fake-codex-app-server", "injected-codex-runtime"].includes(
    productBoundary,
  )) throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "productBoundary");

  const deterministic = productBoundary === "deterministic-fake-codex-app-server";
  if (coreResult.deterministicPolicyOracle !== deterministic) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "policyOracle");
  }
  const auditStateValid = deterministic
    ? coreResult.runtime.adapterInvocationAuditAvailable === true &&
      coreResult.runtime.planSurfaceUsed === false
    : (coreResult.runtime.adapterInvocationAuditAvailable === false &&
        coreResult.runtime.planSurfaceUsed === null) ||
      (coreResult.runtime.adapterInvocationAuditAvailable === true &&
        coreResult.runtime.planSurfaceUsed === false);
  if (!auditStateValid) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "runtimeAuditBoundary");
  }
  if (!deterministic) {
    exactObject(productProbe, ["userAgentDigest", "snapshotDigest"], "productProbe");
    digest(productProbe.userAgentDigest, "productProbe.userAgentDigest");
    digest(productProbe.snapshotDigest, "productProbe.snapshotDigest");
  } else if (productProbe !== null) {
    throw gateError("threadmesh_m52_event_pump_gate_result_invalid", "productProbe");
  }
  const remainingGates = [
    "independent-verifier-service", "real-bounded-git-worktree-effects",
    "manual-relay-polling-baseline", "minimum-critical-negative-restart",
    ...EXPECTED_PENDING_GATES,
    ...(operatorSuppliedCodexShapedRuntime
      ? ["trusted-codex-binary-provenance"]
      : ["real-codex-product-run"]),
  ];
  const product = deterministic
    ? "deterministic-codex-fake"
    : (operatorSuppliedCodexShapedRuntime
      ? "operator-supplied-codex-shaped-executable" : "injected-runtime");
  return Object.freeze({
    schemaVersion: 1,
    state: "blocked",
    code: BLOCKED_CODE,
    product,
    evidenceClass: deterministic
      ? "deterministic-event-pump-codex-gate"
      : (operatorSuppliedCodexShapedRuntime
        ? "operator-supplied-codex-shaped-event-pump-gate"
        : "injected-runtime-event-pump-gate"),
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
      sum + (record.bindingKind === "admission" ? record.actions.length : 0), 0),
    sameAPersistentRefAndWorkspace: true,
    distinctReceiverRoles: true,
    dependentStartedAfterFinalization: true,
    irrelevantNativeTurns: 0,
    verificationMode: realEffects
      ? "process-isolated-child-service-signed"
      : "fixture-owned-ephemeral-key-not-independent",
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
      verifierServiceClosed: coreResult.cleanup.verifierServiceClosed,
      gitResourcesRemoved: coreResult.cleanup.gitFixture.complete === true,
    }),
  });
}

export function projectM52EventPumpCodexGateResult(coreResult, { productProbe = null } = {}) {
  return projectGateResult(coreResult, {
    productProbe, operatorSuppliedCodexShapedRuntime: false,
  });
}

export function projectOperatorSuppliedCodexProbe(probe) {
  exactObject(probe, ["userAgent", "platformFamily", "platformOs", "snapshotDigest"],
    "operatorSuppliedProductProbe");
  if (!ADAPTER_OWNED_CODEX_USER_AGENT.test(probe.userAgent) ||
      probe.platformFamily !== "unix" || probe.platformOs !== "macos" ||
      probe.snapshotDigest !== sha256Digest({
        userAgent: probe.userAgent,
        platformFamily: probe.platformFamily,
        platformOs: probe.platformOs,
      })) {
    throw gateError("threadmesh_m52_event_pump_gate_product_probe_invalid");
  }
  return Object.freeze({
    userAgentDigest: sha256Digest(probe.userAgent),
    snapshotDigest: probe.snapshotDigest,
  });
}

export function projectM52OperatorSuppliedCodexEventPumpGateResult(
  coreResult,
  { probe } = {},
) {
  return projectGateResult(coreResult, {
    productProbe: projectOperatorSuppliedCodexProbe(probe),
    operatorSuppliedCodexShapedRuntime: true,
  });
}

export async function runM52EventPumpCodexGate({
  artifactsDirectory, runtime = null, signal = null,
} = {}) {
  if (!path.isAbsolute(artifactsDirectory ?? "") ||
      (signal !== null && (
        typeof signal !== "object" || typeof signal.aborted !== "boolean"
      )) ||
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
    signal,
  });
  try {
    return projectM52EventPumpCodexGateResult(coreResult, { productProbe });
  } catch (error) {
    if (error.cleanup === undefined) error.cleanup = coreResult.cleanup;
    throw error;
  }
}

export async function runM52OperatorSuppliedCodexEventPumpGate({
  artifactsDirectory,
  sourceRoot,
  validatedBaseSha,
  temporaryParent,
  command,
  args,
  env,
  model,
  signal = null,
} = {}) {
  if (!path.isAbsolute(artifactsDirectory ?? "") || !path.isAbsolute(command ?? "") ||
      !path.isAbsolute(sourceRoot ?? "") || !path.isAbsolute(temporaryParent ?? "") ||
      !/^[a-f0-9]{40}$/u.test(validatedBaseSha ?? "") ||
      (signal !== null && (
        typeof signal !== "object" || typeof signal.aborted !== "boolean"
      ))) {
    throw gateError("threadmesh_m52_event_pump_gate_input_invalid");
  }
  const runtime = new CodexLiveAgentRuntime({
    command,
    ...(args === undefined ? {} : { args }),
    ...(env === undefined ? {} : { env }),
    ...(model === undefined ? {} : { model }),
  });
  if (!isCodexLiveAgentRuntime(runtime)) {
    throw gateError("threadmesh_m52_event_pump_gate_runtime_authenticity_invalid");
  }
  const probe = await runtime.probe(artifactsDirectory);
  projectOperatorSuppliedCodexProbe(probe);
  const coreResult = await runCoordinatorDrivenNoPlanScenario({
    artifactsDirectory,
    runtime,
    signal,
    realEffects: true,
    sourceRoot,
    validatedBaseSha,
    temporaryParent,
  });
  try {
    return projectM52OperatorSuppliedCodexEventPumpGateResult(coreResult, { probe });
  } catch (error) {
    if (error.cleanup === undefined) error.cleanup = coreResult.cleanup;
    throw error;
  }
}
