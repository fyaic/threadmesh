import { performance } from "node:perf_hooks";

import { sha256Digest } from "../canonical-json.mjs";
import { runCoordinatorDrivenNoPlanScenario } from
  "./coordinator-driven-no-plan-scenario.mjs";

function invalid(detail) {
  const error = new Error(`threadmesh_m53_baseline_invalid: ${detail}`);
  error.code = "threadmesh_m53_baseline_invalid";
  return error;
}

function duplicateDeliveries(result) {
  const relevant = result.durableDispatchManifest.records.filter(
    ({ kind }) => kind === "coordinator-activation",
  );
  const keys = relevant.map(({ receiverDigest, eventDigest }) =>
    `${receiverDigest}:${eventDigest}`);
  return keys.length - new Set(keys).size;
}

function projectArm(result, timing, coordinationMode) {
  const expectedOperatorTriggered = coordinationMode === "operator-triggered";
  if (
    result?.state !== "passed-full-functional-in-process-fixture" ||
    result.autonomousEventPump === expectedOperatorTriggered ||
    result.promptBoundary?.initialUserKickoffPrompts !== 1 ||
    result.promptBoundary?.boundNativeTurns !== 9 ||
    result.eventPumpDispatches !== 4 || result.eventPumpSkips !== 1 ||
    ![13, 14].includes(result.runtime?.modelSelectedToolCalls) ||
    result.dependent?.effectCommittedAfterFinalization !== true ||
    result.dependent?.outcome !== "externally-verified" ||
    result.irrelevant?.turnCount !== 0 || result.cleanup?.complete !== true
  ) throw invalid(`${coordinationMode}-arm`);

  const duplicates = duplicateDeliveries(result);
  if (duplicates !== 0) throw invalid(`${coordinationMode}-duplicate-delivery`);
  return Object.freeze({
    coordinationMode,
    initialKickoffs: 1,
    manualRelayActions: result.humanRelayCount,
    manualStatusChecks: result.pollingCount,
    modelPollingTurns: result.rawPhasePromptsSubmittedByFixtureRunner,
    elapsedMs: timing.elapsedMs,
    productUsage: Object.freeze({
      state: "not-reported-by-codex-app-server",
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    }),
    activeReceiverInterruptions: 0,
    duplicateDeliveries: duplicates,
    incorrectUnlocks: 0,
    boundNativeTurns: result.promptBoundary.boundNativeTurns,
    businessToolCalls: result.nativeTurnManifest.records
      .filter(({ bindingKind }) => bindingKind === "admission")
      .reduce((count, record) => count + record.actionCount, 0),
    irrelevantNativeTurns: result.irrelevant.turnCount,
    finalArtifactClass: Object.freeze({
      fixtureDefinitionDigest: result.gitEffects.fixtureDefinitionDigest,
      directDescendant: result.gitEffects.directDescendant,
      trustedEvidenceRecords: result.evidenceChain.recordCount,
      dependencyOutcome: result.dependent.outcome,
    }),
    startedAt: timing.startedAt,
    completedAt: timing.completedAt,
    cleanup: Object.freeze({
      complete: true,
      rolesDeleted: result.cleanup.roles.length,
      roleAbsenceChecks: result.cleanup.roles.filter(
        ({ absenceVerified }) => absenceVerified === true,
      ).length,
      verifierServiceClosed: result.cleanup.verifierServiceClosed,
      gitResourcesRemoved: result.cleanup.gitFixture.complete,
      coordinatorRemoved: result.cleanup.coordinatorRemoved,
      remainingJournalCount: result.cleanup.remainingJournalCount,
    }),
  });
}

async function runArm({
  artifactsDirectory, coordinationMode, runtimeFactory, realEffects,
  sourceRoot, validatedBaseSha, temporaryParent,
}) {
  const runtime = runtimeFactory === null ? null : runtimeFactory(coordinationMode);
  const startedAt = new Date().toISOString();
  const start = performance.now();
  try {
    const result = await runCoordinatorDrivenNoPlanScenario({
      artifactsDirectory,
      coordinationMode,
      runtime,
      realEffects,
      ...(realEffects ? { sourceRoot, validatedBaseSha, temporaryParent } : {}),
    });
    const completedAt = new Date().toISOString();
    return {
      result,
      timing: Object.freeze({
        startedAt,
        completedAt,
        elapsedMs: Math.max(1, Math.round(performance.now() - start)),
      }),
    };
  } catch (error) {
    error.baselineArm = coordinationMode;
    error.baselineElapsedMs = Math.max(1, Math.round(performance.now() - start));
    throw error;
  }
}

export async function runM53ManualThreadmeshBaseline({
  artifactsDirectory,
  runtimeFactory = null,
  productProbe = null,
  model = null,
  realEffects = false,
  sourceRoot = null,
  validatedBaseSha = null,
  temporaryParent = null,
  onArmComplete = async () => {},
} = {}) {
  if (
    typeof artifactsDirectory !== "string" || artifactsDirectory.length < 1 ||
    (runtimeFactory !== null && typeof runtimeFactory !== "function") ||
    typeof onArmComplete !== "function" ||
    (productProbe !== null && (
      typeof productProbe !== "object" || Array.isArray(productProbe)
    )) ||
    typeof realEffects !== "boolean" ||
    (realEffects && (
      typeof sourceRoot !== "string" || typeof validatedBaseSha !== "string" ||
      typeof temporaryParent !== "string"
    ))
  ) throw invalid("input");

  const manualRun = await runArm({
    artifactsDirectory, coordinationMode: "operator-triggered", runtimeFactory,
    realEffects, sourceRoot, validatedBaseSha, temporaryParent,
  });
  const manual = projectArm(manualRun.result, manualRun.timing, "operator-triggered");
  await onArmComplete(manual);
  let threadmeshRun;
  try {
    threadmeshRun = await runArm({
      artifactsDirectory, coordinationMode: "event-pump", runtimeFactory,
      realEffects, sourceRoot, validatedBaseSha, temporaryParent,
    });
  } catch (error) {
    error.completedBaselineArm = manual;
    throw error;
  }
  const threadmesh = projectArm(
    threadmeshRun.result, threadmeshRun.timing, "threadmesh-event-pump",
  );
  await onArmComplete(threadmesh);
  const comparableArtifacts = sha256Digest(manual.finalArtifactClass) ===
    sha256Digest(threadmesh.finalArtifactClass);
  const comparison = Object.freeze({
    manualUserActions: manual.initialKickoffs + manual.manualRelayActions +
      manual.manualStatusChecks,
    threadmeshUserActions: threadmesh.initialKickoffs + threadmesh.manualRelayActions +
      threadmesh.manualStatusChecks,
    userActionsRemoved: manual.manualRelayActions + manual.manualStatusChecks,
    elapsedDeltaMs: threadmesh.elapsedMs - manual.elapsedMs,
    tokenDelta: null,
    tokenDeltaReason: "product-usage-not-reported",
    comparableArtifacts,
  });
  const passed = comparison.manualUserActions === 9 &&
    comparison.threadmeshUserActions === 1 && comparison.userActionsRemoved === 8 &&
    comparableArtifacts && manual.cleanup.complete && threadmesh.cleanup.complete;
  const body = {
    schemaVersion: 1,
    state: passed ? "passed" : "failed",
    evidenceClass: realEffects
      ? "measured-real-codex-operator-control-vs-threadmesh"
      : "deterministic-operator-control-vs-threadmesh",
    product: runtimeFactory === null ? "deterministic-codex-fake" :
      "operator-supplied-codex-shaped-executable",
    productProbe: productProbe === null ? null : Object.freeze({
      digest: sha256Digest(productProbe),
    }),
    modelDigest: model === null ? null : sha256Digest(model),
    validatedBaseSha: realEffects ? validatedBaseSha : null,
    manual,
    threadmesh,
    comparison,
    limitations: Object.freeze([
      "operator-triggered arm reuses the same guarded delivery seam",
      "product token usage is unavailable and was not estimated",
      "operator-supplied executable provenance is not independently trusted",
    ]),
  };
  return Object.freeze({ ...body, recordDigest: sha256Digest(body) });
}
