import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import {
  SqliteCoordinator,
  createEffectiveGrant,
  gitEvidenceVerificationResultDigest,
} from "../coordinator/sqlite-coordinator.mjs";
import { verificationAttestationDigest } from "../protocol-validator.mjs";
import {
  evaluateAttentionRoute,
  projectLifecycleEventToEnvelope,
} from "../routing/lifecycle-events.mjs";
import {
  independentGitClaimDigest,
  independentGitFindingDigest,
  verifyIndependentGitVerification,
} from "./independent-git-verifier.mjs";
import {
  readM52RecoveryJournal,
  writeM52RecoveryJournal,
} from "./m5-2-recovery-journal.mjs";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const EXPIRES_AT = "2026-08-31T13:00:00.000Z";
const DEPENDENT_ADAPTER_RECEIPT = Object.freeze({
  adapterOperationId: "fixture-dependent-post-admission-receipt",
  acceptedAt: NOW_ISO,
  evidenceRefs: ["fixture://dependent/post-admission-receipt"],
});
const owner = Object.freeze({ kind: "user", principalId: "owner_m52_integrated_fixture" });
const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });
const DEFAULT_RECOVERY_CHECKPOINTS = Object.freeze([
  "native-started-operation-bound",
  "event-created",
  "receipt-recorded",
  "final-verification",
  "satisfaction",
]);
const RECOVERY_STATE_TABLES = Object.freeze([
  ["messages", "sequence"],
  ["audit", "sequence"],
  ["executions", "created_at, execution_id"],
  ["actions", "execution_id, ordinal"],
  ["evidence", "chain_id, sequence"],
  ["finalizations", "dependency_id"],
  ["satisfactions", "dependency_id"],
  ["cursorCommits", "receiver_task_id, receiver_incarnation_id, sequence"],
]);
const RECOVERY_TABLE_NAMES = Object.freeze({
  messages: "messages",
  audit: "audit_events",
  executions: "turn_execution_intents",
  actions: "turn_tool_actions",
  evidence: "git_evidence_records",
  finalizations: "git_evidence_dependency_finalizations",
  satisfactions: "dependency_satisfactions",
  cursorCommits: "attention_cursor_commits",
});

function coded(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function taskPrincipal(actor) {
  return { kind: "task", taskId: actor.taskId, incarnationId: actor.incarnationId };
}

function taskRef(actor) {
  return { taskId: actor.taskId, incarnationId: actor.incarnationId };
}

function recoveryStateVector(coordinator, dependent) {
  const stores = {};
  for (const [label, orderBy] of RECOVERY_STATE_TABLES) {
    const table = RECOVERY_TABLE_NAMES[label];
    const rows = coordinator.db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
    stores[label] = { count: rows.length, digest: sha256Digest(rows) };
  }
  const metadata = coordinator.db.prepare(
    `SELECT revision FROM task_metadata
     WHERE task_id = ? AND incarnation_id = ?`,
  ).get(dependent.taskId, dependent.incarnationId);
  const task = coordinator.getTask(taskRef(dependent), owner);
  const cursor = coordinator.getAttentionCursor(
    taskRef(dependent), taskPrincipal(dependent),
  ).cursor;
  return {
    stores,
    dependent: {
      revision: metadata.revision,
      state: task.state,
      cursor: {
        committedCursor: cursor.committedCursor,
        commitCount: cursor.commitCount,
        revision: cursor.revision,
      },
    },
  };
}

function exactArtifactManifest(artifactsDirectory, databasePath, journalPath, journalRecord) {
  const resources = [
    { kind: "sqlite", path: path.basename(databasePath) },
    { kind: "recovery-journal", path: path.basename(journalPath) },
    { kind: "sqlite-wal", path: path.basename(`${databasePath}-wal`) },
    { kind: "sqlite-shm", path: path.basename(`${databasePath}-shm`) },
    { kind: "sqlite-rollback-journal", path: path.basename(`${databasePath}-journal`) },
  ].map((resource) => ({
    ...resource,
    present: fs.existsSync(path.join(artifactsDirectory, resource.path)),
  }));
  return {
    attempted: true,
    complete: true,
    resources,
    retainedEvidence: resources.filter((entry) => entry.present).map((entry) => entry.path),
    recoveryJournal: {
      path: path.basename(journalPath),
      present: fs.existsSync(journalPath),
      recordDigest: journalRecord.recordDigest,
      bundleDigest: journalRecord.bundleDigest,
    },
  };
}

function assertRecoveryExpectedDeltas(proofs) {
  const byCheckpoint = Object.fromEntries(
    proofs.map((proof) => [proof.checkpoint, proof.state]),
  );
  const native = byCheckpoint["native-started-operation-bound"];
  const created = byCheckpoint["event-created"];
  const receipt = byCheckpoint["receipt-recorded"];
  const verified = byCheckpoint["final-verification"];
  const satisfied = byCheckpoint.satisfaction;
  if (
    !native || !created || !receipt || !verified || !satisfied ||
    native.stores.executions.count !== 1 || native.stores.actions.count !== 0 ||
    created.stores.messages.count !== native.stores.messages.count + 1 ||
    created.stores.actions.count !== native.stores.actions.count + 1 ||
    created.stores.evidence.count !== native.stores.evidence.count + 1 ||
    receipt.stores.messages.count <= created.stores.messages.count ||
    receipt.stores.actions.count <= created.stores.actions.count ||
    canonicalJson(receipt) !== canonicalJson(verified) ||
    satisfied.stores.finalizations.count !== verified.stores.finalizations.count + 1 ||
    satisfied.stores.satisfactions.count !== verified.stores.satisfactions.count + 1 ||
    satisfied.stores.evidence.count !== verified.stores.evidence.count + 1 ||
    satisfied.dependent.revision !== verified.dependent.revision + 1 ||
    satisfied.dependent.state !== "ready"
  ) throw coded("threadmesh_integrated_recovery_delta_mismatch");
  return {
    nativeStartedExecutionPersistedWithoutAction: true,
    eventCreatedAddsOneMessageActionAndEvidenceRecord: true,
    receiptCheckpointAdvancesDurableWork: true,
    journalCheckpointHasNoCoordinatorDelta: true,
    satisfactionAddsOneFinalizationSatisfactionAndEvidenceRecord: true,
    dependentRevisionAdvancesOnce: true,
  };
}

export function decisionResultProjection({ messageId, receiver, disposition }) {
  return {
    messageId,
    receiver: taskRef(receiver),
    decision: {
      state: disposition.decision,
      reasonCode: disposition.decisionReasonCode,
      decisionRevision: disposition.revision,
    },
  };
}

function actor(role, ref) {
  return {
    taskId: `task_m52_${role}`,
    incarnationId: `inc_m52_${role}_01`,
    threadId: ref.threadId,
    snapshotDigest: ref.snapshotDigest,
  };
}

function grant(source, target, suffix) {
  return createEffectiveGrant({
    specVersion: "0.0-draft",
    grantId: `grant_m52_${suffix}`,
    grantVersion: 1,
    relationshipId: `rel_m52_${suffix}`,
    relationshipType: "peer",
    source: taskRef(source),
    target: taskRef(target),
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: "2026-08-31T11:00:00.000Z",
    expiresAt: EXPIRES_AT,
  }, {
    decisionId: `decision_m52_${suffix}`,
    authenticationId: `authn_m52_${suffix}`,
    decidedAt: "2026-08-31T11:00:00.000Z",
  }, owner);
}

function event({ eventType, messageId, sender, target, relationshipId, content }) {
  return {
    eventType,
    messageId,
    sender: { ...taskRef(sender), actorType: "agent", harness: "codex" },
    target: { ...taskRef(target), harness: "codex" },
    relationshipId,
    content,
    reason: "A causally bound fixture action produced this checkpoint offer.",
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: "2026-08-31T11:59:00.000Z",
    expiresAt: EXPIRES_AT,
  };
}

export function lifecycleActionEventBody(value) {
  return {
    eventType: value.eventType,
    messageId: value.messageId,
    target: { ...value.target },
    relationshipId: value.relationshipId,
    content: value.content,
    reason: value.reason,
    evidenceRefs: [...(value.evidenceRefs ?? [])],
    freshness: { ...value.freshness },
    causality: value.causality ? { ...value.causality } : null,
  };
}

function completedBinding(current, turn, actions) {
  const receipt = {
    adapterOperationId: turn.evidence.turnId,
    acceptedAt: NOW_ISO,
    evidenceRefs: [`fixture://turn/${turn.evidence.turnId}`],
  };
  return {
    evidence: {
      threadId: current.threadId,
      turnId: turn.evidence.turnId,
      turnStatus: "completed",
      completedAt: NOW_ISO,
      durationMs: 1,
      userAgent: "threadmesh-deterministic-fixture/1",
      snapshotDigest: current.snapshotDigest,
      serverRequestDeniedCount: 0,
      serverRequestHandledCount: 0,
      notificationCount: 1,
      deltaCount: 1,
    },
    receipt,
    adapterReceiptDigest: sha256Digest(receipt),
    toolCalls: actions.map((action) => ({
      ordinal: action.ordinal,
      turnId: action.turnId,
      callId: action.callId,
      tool: action.name,
      argumentsDigest: action.argumentsDigest,
      outputDigest: action.resultDigest,
      resultStatus: action.resultStatus,
    })),
    nonThreadMeshToolCalls: 0,
  };
}

async function durableTurn({
  coordinator, runtime, role, ref, current, phase, chainId, messageId, eventId,
  tool, arguments: args, result, record, restartAfterNativeBound = null,
}) {
  const principal = taskPrincipal(current);
  let execution = coordinator.createTurnExecutionIntent({
    intentId: `intent_m52_${phase}`,
    scenarioId: "scenario_m52_integrated_fixture",
    chainId,
    messageId,
    eventId,
    actor: current,
    adapterIdempotencyKey: `adapter_m52_${phase}`,
    promptDigest: digest(`prompt-${phase}`),
    allowedTools: [tool],
  }, 0, principal);
  const turn = await runtime.runTurn({
    role,
    phase,
    ref,
    plan: [{ tool, arguments: args }],
    beforeTurnStart: async () => {
      execution = coordinator.markTurnExecutionStarted(
        execution.executionId, { expectedRevision: 0 }, principal,
      );
      record("coordinator.turn.started", { role, phase, executionId: execution.executionId });
    },
    onTurnStarted: async ({ turnId }) => {
      execution = coordinator.bindStartedTurnExecutionOperation(
        execution.executionId, { turnId, expectedRevision: 1 }, principal,
      );
      record("coordinator.turn.native-bound", { role, phase, turnId });
      if (restartAfterNativeBound) {
        coordinator = restartAfterNativeBound({
          executionId: execution.executionId,
          turnId,
          principal,
        });
        execution = coordinator.getTurnExecution(execution.executionId, principal);
      }
    },
    beforeToolCall: async (selected) => {
      execution = coordinator.recordModelSelectedTurnToolAction(
        execution.executionId,
        {
          turnId: selected.turnId,
          callId: selected.callId,
          ordinal: selected.ordinal,
          name: selected.tool,
          arguments: selected.arguments,
          expectedRevision: 2,
          expectedActionHeadDigest: execution.actionHeadDigest,
        },
        principal,
      );
      record("coordinator.tool.model-selected", { role, phase, tool: selected.tool });
    },
    onToolCall: async () => (typeof result === "function" ? result() : result),
    afterToolCall: async (completed) => {
      execution = coordinator.completeModelSelectedTurnToolAction(
        execution.executionId,
        {
          turnId: completed.turnId,
          callId: completed.callId,
          ordinal: completed.ordinal,
          resultDigest: completed.outputDigest,
          resultStatus: completed.resultStatus,
          expectedRevision: 3,
          expectedActionHeadDigest: execution.actionHeadDigest,
        },
        principal,
      );
      record("coordinator.tool.completed", { role, phase, tool: completed.tool });
    },
  });
  execution = coordinator.bindCompletedTurnExecution(
    execution.executionId,
    { binding: completedBinding(current, turn, execution.actions), expectedRevision: 4 },
    principal,
  );
  record("coordinator.turn.completed-bound", { role, phase, executionId: execution.executionId });
  return execution;
}

export function submitLifecycleFromBoundAction({
  coordinator, execution, actionOrdinal = 0, expectedTool, lifecycleEvent, principal,
  expectedMaterial, consumedActions = null, allowCompletedFinalVerification = false,
}) {
  const persisted = coordinator.getTurnExecution(execution.executionId, principal);
  const action = persisted.actions[actionOrdinal];
  const toolEventTypes = {
    threadmesh_publish_artifact: "artifact-ready",
    threadmesh_report_review_finding: "review-failed",
    threadmesh_publish_dependency: "artifact-ready",
    threadmesh_verify_exact_chain: "dependency-satisfied",
  };
  const materialKeys = {
    threadmesh_publish_artifact: ["commitSha"],
    threadmesh_report_review_finding: ["findingDigest"],
    threadmesh_publish_dependency: ["commitSha"],
    threadmesh_verify_exact_chain: [
      "chainId", "expectedEvidenceChainHead", "expectedEvidenceChainRevision",
    ],
  };
  let args = null;
  try { args = action ? JSON.parse(action.argsJson) : null; } catch { /* fail below */ }
  const expectedArgs = expectedTool && materialKeys[expectedTool]
    ? {
        sourceEventId: persisted.intent.eventId,
        event: lifecycleEvent ? lifecycleActionEventBody(lifecycleEvent) : null,
        ...expectedMaterial,
      }
    : null;
  const allowedState = persisted.intent.state === "promoted" || (
    allowCompletedFinalVerification &&
    persisted.intent.state === "completed-turn-bound" &&
    expectedTool === "threadmesh_verify_exact_chain"
  );
  const consumptionKey = sha256Digest({
    executionId: execution.executionId,
    actionOrdinal,
    messageId: lifecycleEvent.messageId,
    sender: lifecycleEvent.sender,
  });
  if (
    !allowedState || !action || action.name !== expectedTool ||
    action.resultStatus !== "completed" ||
    toolEventTypes[expectedTool] !== lifecycleEvent?.eventType ||
    !expectedMaterial ||
    Object.keys(expectedMaterial).sort().join(",") !==
      [...(materialKeys[expectedTool] ?? [])].sort().join(",") ||
    canonicalJson(args) !== canonicalJson(expectedArgs) ||
    !(consumedActions instanceof Set) || consumedActions.has(consumptionKey) ||
    persisted.intent.actor.taskId !== lifecycleEvent?.sender?.taskId ||
    persisted.intent.actor.incarnationId !== lifecycleEvent?.sender?.incarnationId
  ) throw coded("threadmesh_integrated_lifecycle_submit_unbound");
  const submitted = coordinator.submit(
    projectLifecycleEventToEnvelope(lifecycleEvent), principal,
  );
  consumedActions.add(consumptionKey);
  return submitted;
}

function promoteStage(coordinator, execution, stage, payload, revision, head, principal) {
  return coordinator.promoteTurnExecutionWithGitEvidenceRecord(
    execution.executionId,
    {
      stage,
      payload,
      expectedEvidenceChainRevision: revision,
      expectedEvidenceChainHead: head,
      expectedRevision: 5,
    },
    principal,
  );
}

function nextReceivedEvent(coordinator, current, messageId) {
  const page = coordinator.waitTask(taskRef(current), { afterCursor: 0, limit: 100 }, taskPrincipal(current));
  const cursor = coordinator.getAttentionCursor(taskRef(current), taskPrincipal(current)).cursor;
  const found = page.events.find((entry) =>
    entry.cursor > cursor.committedCursor &&
    entry.eventType === "message-durably-received" && entry.messageId === messageId);
  if (!found) throw coded("threadmesh_integrated_attention_event_missing", current.taskId);
  return found;
}

function drainProcessedMessageEvents(coordinator, current, messageId, senderIncarnationId) {
  const principal = taskPrincipal(current);
  while (true) {
    const cursor = coordinator.getAttentionCursor(taskRef(current), principal).cursor;
    const page = coordinator.waitTask(taskRef(current), { afterCursor: cursor.committedCursor, limit: 100 }, principal);
    const next = page.events.find((entry) => entry.cursor > cursor.committedCursor);
    if (
      !next || next.messageId !== messageId ||
      next.senderIncarnationId !== senderIncarnationId
    ) return;
    coordinator.advanceAttentionCursor(
      taskRef(current),
      {
        eventCursor: next.cursor,
        eventId: next.eventId,
        classificationDigest: sha256Digest({ kind: "processed-message-audit", eventType: next.eventType }),
        expectedRevision: cursor.revision,
      },
      principal,
    );
  }
}

async function acceptAndAdmit({
  coordinator, runtime, role, ref, current, sourceEvent, observed, chainId, record,
  onClaim = () => {},
}) {
  const principal = taskPrincipal(current);
  const cursor = coordinator.getAttentionCursor(taskRef(current), principal).cursor;
  const claimEpoch = `claim_m52_${role}_${sourceEvent.messageId}`;
  coordinator.claimAttentionEvent(taskRef(current), {
    claimEpoch,
    eventCursor: observed.cursor,
    eventId: observed.eventId,
    expectedRevision: cursor.revision,
  }, principal);
  onClaim();
  record("coordinator.attention.next-only-claimed", { role, messageId: sourceEvent.messageId });
  const decisionExecution = await durableTurn({
    coordinator, runtime, role, ref, current,
    phase: `${role}-decision-${sourceEvent.messageId}`,
    chainId,
    messageId: sourceEvent.messageId,
    eventId: observed.eventId,
    tool: "threadmesh_decide_offer",
    arguments: { decision: "accepted", messageId: sourceEvent.messageId },
    result: () => {
      const pending = coordinator.claimPending(
        sourceEvent.sender.incarnationId, sourceEvent.messageId, 0, principal,
      );
      const acknowledged = coordinator.acknowledgePending(
        sourceEvent.sender.incarnationId,
        sourceEvent.messageId,
        pending.claimToken,
        "accepted",
        0,
        principal,
      );
      return decisionResultProjection({
        messageId: sourceEvent.messageId,
        receiver: current,
        disposition: acknowledged,
      });
    },
    record,
  });
  record("coordinator.decision.receiver-owned", { role, messageId: sourceEvent.messageId });
  const prepared = coordinator.prepareContextAdmission(
    sourceEvent.sender.incarnationId, sourceEvent.messageId, 1, principal,
  );
  if (prepared.adapterRef.threadId !== current.threadId) {
    throw coded("threadmesh_integrated_exact_resume_mismatch", role);
  }
  const delivered = await runtime.deliverContext({ role, ref, prepared });
  coordinator.confirmContextAdmission(
    sourceEvent.sender.incarnationId,
    sourceEvent.messageId,
    1,
    prepared.admissionToken,
    delivered.evidence,
    principal,
  );
  record("coordinator.context.exact-task-admitted", { role, threadId: current.threadId });
  return { claimEpoch, decisionExecution };
}

function bindAndCommitHandler(coordinator, current, claimEpoch, execution, record) {
  const principal = taskPrincipal(current);
  coordinator.bindCompletedAttentionHandler(
    claimEpoch, { turnExecutionId: execution.executionId, expectedRevision: 0 }, principal,
  );
  const cursor = coordinator.getAttentionCursor(taskRef(current), principal).cursor;
  const promoted = coordinator.promoteAttentionHandler(
    claimEpoch,
    { expectedClaimRevision: 1, expectedCursorRevision: cursor.revision },
    principal,
  );
  record("coordinator.attention.cursor-committed", {
    taskId: current.taskId,
    committedCursor: promoted.cursor.committedCursor,
  });
  return promoted;
}

function createVerification({ requirement, payloads, verifier, dependent, trustAnchor, privateKey }) {
  const request = {
    repoPath: "/private/deterministic-fixture/repository",
    chain: {
      chainId: requirement.chainId,
      requirementDigest: requirement.requirementDigest,
      validatedBaseSha: requirement.validatedBaseSha,
      fixtureSeedSha: requirement.fixtureSeedSha,
      fixtureDefinitionDigest: requirement.fixtureDefinitionDigest,
    },
    implementation: {
      sha: payloads.implementation.commitSha,
      treeSha: payloads.implementation.treeSha,
      diffDigest: payloads.implementation.diffDigest,
    },
    fix: {
      sha: payloads.fix.commitSha,
      treeSha: payloads.fix.treeSha,
      diffDigest: payloads.fix.diffDigest,
    },
    finding: {
      resourcePath: "artifact.txt",
      counterexample: "BAD_COUNTEREXAMPLE",
      digest: payloads["review-failed"].findingDigest,
    },
    trustedTest: {
      resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
      blobDigest: requirement.trustedTestBlobDigest,
    },
    subject: {
      messageId: "msg_m52_fix",
      senderIncarnationId: verifier.incarnationId,
      receiver: taskRef(dependent),
    },
  };
  const proof = {
    chain: request.chain,
    implementation: {
      ...request.implementation,
      parentSha: request.chain.fixtureSeedSha,
      resourceDigest: digest("implementation-resource"),
    },
    fix: {
      ...request.fix,
      parentSha: request.implementation.sha,
      resourceDigest: digest("fix-resource"),
    },
    finding: {
      resourcePath: request.finding.resourcePath,
      digest: request.finding.digest,
      counterexampleDigest: sha256Digest(request.finding.counterexample),
    },
    test: {
      command: "node",
      args: ["--test", "test/fixtures/independent-git-verifier-target.test.mjs"],
      resourcePath: request.trustedTest.resourcePath,
      seedBlobDigest: request.trustedTest.blobDigest,
      fixBlobDigest: request.trustedTest.blobDigest,
      trustedBlobDigest: request.trustedTest.blobDigest,
    },
  };
  const attestationId = `att_git_${sha256Digest({ chain: request.chain, implementationSha: request.implementation.sha, fixSha: request.fix.sha, findingDigest: request.finding.digest }).slice(7, 31)}`;
  const decisionId = `decision_git_${sha256Digest({ chain: request.chain, implementationSha: request.implementation.sha, fixSha: request.fix.sha, findingDigest: request.finding.digest }).slice(7, 31)}`;
  const attestation = {
    specVersion: "0.0-draft",
    attestationId,
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_m52_fixture_verifier",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      ...request.subject,
      claimType: "artifact-state",
      claimDigest: independentGitClaimDigest({ chain: proof.chain, proof }),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof),
    verifiedAt: NOW_ISO,
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId,
      decision: "trusted",
      decidedAt: NOW_ISO,
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519",
    keyId: trustAnchor.keyId,
    signature: sign(null, Buffer.from(attestation.signedPayloadDigest, "utf8"), privateKey).toString("base64url"),
  };
  const response = { trustAnchor, attestation, proof };
  verifyIndependentGitVerification({ request, response, expectedTrustAnchor: trustAnchor });
  return { request, response, expectedTrustAnchor: trustAnchor };
}

function finalDispositionAfterDecision(coordinator, verifier, dependent, sourceEvent, attestation) {
  const principal = taskPrincipal(dependent);
  const persisted = coordinator.getDisposition(verifier.incarnationId, sourceEvent.messageId, principal);
  return {
    specVersion: "0.0-draft",
    dispositionId: "dsp_m52_verified",
    messageId: sourceEvent.messageId,
    receiver: taskRef(dependent),
    revision: persisted.revision + 1,
    delivery: { state: persisted.delivery, observedAt: NOW_ISO },
    decision: {
      state: persisted.decision,
      decidedAt: NOW_ISO,
      decidedBy: { actorType: "agent", task: taskRef(dependent) },
      reasonCode: persisted.decisionReasonCode,
    },
    outcome: {
      state: "externally-verified",
      observedAt: NOW_ISO,
      evidenceRefs: ["threadmesh://git-evidence/final"],
      verificationAttestations: [attestation],
    },
    updatedAt: NOW_ISO,
  };
}

function recordDependentAdapterReceipt(coordinator, verifier, dependent, sourceEvent) {
  const principal = taskPrincipal(dependent);
  const prepared = coordinator.prepareAdapterSubmission(
    verifier.incarnationId, sourceEvent.messageId, 2, principal,
  );
  coordinator.beginAdapterSubmission(prepared.submission.submissionId, 2, principal);
  return coordinator.recordAdapterReceipt(
    prepared.submission.submissionId,
    2,
    DEPENDENT_ADAPTER_RECEIPT,
    principal,
  );
}

export async function runIntegratedCoordinatorLoop({
  runtime,
  artifactsDirectory,
  scenarioId = "scenario_m52_integrated_fixture",
  restartCheckpoints = DEFAULT_RECOVERY_CHECKPOINTS,
  record = () => {},
}) {
  if (
    !Array.isArray(restartCheckpoints) ||
    new Set(restartCheckpoints).size !== restartCheckpoints.length ||
    restartCheckpoints.some((checkpoint) => !DEFAULT_RECOVERY_CHECKPOINTS.includes(checkpoint))
  ) throw coded("threadmesh_integrated_recovery_checkpoint_invalid");
  const databasePath = path.join(artifactsDirectory, "integrated-coordinator.sqlite");
  const journalPath = path.join(artifactsDirectory, "m5-2-recovery-journal.json");
  const reservedArtifacts = [
    databasePath, journalPath, `${databasePath}-wal`, `${databasePath}-shm`,
    `${databasePath}-journal`,
  ];
  if (reservedArtifacts.some((filename) => fs.existsSync(filename))) {
    throw coded("threadmesh_integrated_recovery_artifacts_not_fresh");
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const trustAnchor = {
    keyId: "threadmesh://independent-git-verifier/key/ephemeral",
    algorithm: "ed25519",
    actorId: "threadmesh-independent-git-verifier",
    trustDomain: "threadmesh://independent-git-verifier",
    policyId: "threadmesh://independent-git-verifier/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
  let coordinator = new SqliteCoordinator({
    filename: databasePath,
    clock: () => NOW,
    verificationTrustAnchors: [trustAnchor],
  });
  const consumedLifecycleActions = new Set();
  const remainingRestartCheckpoints = new Set(restartCheckpoints);
  const recoveryProofs = [];
  let journalRecord = null;
  try {
    const refs = {};
    const actors = {};
    for (const role of ["a", "r", "v", "dependent", "irrelevant"]) {
      refs[role] = await runtime.createRole({ role });
      actors[role] = actor(role, refs[role]);
      coordinator.registerTask({
        ...taskRef(actors[role]),
        harness: "codex",
        state: role === "dependent" ? "waiting" : "idle",
        runtime: role === "dependent"
          ? { runId: "run-dependent", objectiveVersion: 2, checkpoint: "waiting-for-verified-fix" }
          : { objectiveVersion: 1 },
        adapterRef: refs[role],
      }, owner);
    }
    const controlledCoordinatorReopen = (checkpoint) => {
      if (!remainingRestartCheckpoints.has(checkpoint)) return coordinator;
      const before = recoveryStateVector(coordinator, actors.dependent);
      coordinator.close();
      coordinator = new SqliteCoordinator({
        filename: databasePath,
        clock: () => NOW,
        verificationTrustAnchors: [trustAnchor],
      });
      const after = recoveryStateVector(coordinator, actors.dependent);
      if (canonicalJson(before) !== canonicalJson(after)) {
        throw coded("threadmesh_integrated_recovery_state_drift", checkpoint);
      }
      const stateDigest = sha256Digest(after);
      recoveryProofs.push({
        checkpoint,
        coordinatorReopenOnly: true,
        processCrashBeforeOperationBind: false,
        beforeDigest: sha256Digest(before),
        afterDigest: stateDigest,
        state: after,
        exactReplayNoDuplicate: false,
      });
      remainingRestartCheckpoints.delete(checkpoint);
      record("coordinator.recovery.reopened", {
        checkpoint,
        stateDigest,
        processCrashBeforeOperationBind: false,
      });
      return coordinator;
    };
    const assertExactReplayNoDuplicate = (checkpoint, operation) => {
      const before = recoveryStateVector(coordinator, actors.dependent);
      const result = operation();
      const after = recoveryStateVector(coordinator, actors.dependent);
      if (canonicalJson(before) !== canonicalJson(after)) {
        throw coded("threadmesh_integrated_recovery_replay_duplicated", checkpoint);
      }
      const proof = recoveryProofs.find((entry) => entry.checkpoint === checkpoint);
      if (!proof) throw coded("threadmesh_integrated_recovery_checkpoint_missing", checkpoint);
      proof.exactReplayNoDuplicate = true;
      proof.replayStateDigest = sha256Digest(after);
      return result;
    };
    const grants = {
      ar: grant(actors.a, actors.r, "a_r"),
      ra: grant(actors.r, actors.a, "r_a"),
      av: grant(actors.a, actors.v, "a_v"),
      vd: grant(actors.v, actors.dependent, "v_dependent"),
      ai: grant(actors.a, actors.irrelevant, "a_irrelevant"),
    };
    for (const installed of Object.values(grants)) coordinator.installGrant(installed, owner);
    coordinator.createDependencyEdge({
      dependencyId: "dependency_m52_verified",
      version: 1,
      edgeType: "dependency",
      prerequisite: taskRef(actors.v),
      dependent: taskRef(actors.dependent),
      relationshipId: grants.vd.relationshipId,
      expectedEventType: "dependency-satisfied",
      freshness: { expectedRunId: "run-dependent", expectedObjectiveVersion: 2, expectedCheckpoint: "waiting-for-verified-fix" },
      createdAt: "2026-08-31T11:00:00.000Z",
      expiresAt: EXPIRES_AT,
    }, owner);
    const findingDigest = independentGitFindingDigest({ resourcePath: "artifact.txt", counterexample: "BAD_COUNTEREXAMPLE" });
    const requirement = coordinator.createGitEvidenceRequirement({
      chainId: "chain_m52_integrated",
      validatedBaseSha: sha("1"),
      fixtureSeedSha: sha("2"),
      fixtureDefinitionDigest: digest("fixture-definition"),
      trustedTestBlobDigest: digest("trusted-test"),
      implementer: actors.a,
      reviewer: actors.r,
      verifier: actors.v,
      preconfiguredTrustAnchorDigest: sha256Digest(trustAnchor),
    }, owner).requirement;
    coordinator.bindGitEvidenceDependency(
      requirement.chainId, { dependencyId: "dependency_m52_verified", expectedVersion: 1 }, owner,
    );
    const dependencyBefore = coordinator.getDependencyEdge("dependency_m52_verified", taskPrincipal(actors.dependent));
    const dependentBefore = coordinator.getTask(taskRef(actors.dependent), owner);
    record("coordinator.integrated.initialized", { dependencyStatus: dependencyBefore.status });

    const payloads = {
      implementation: {
        actor: actors.a, turnId: null, toolCallDigest: null,
        commitSha: sha("3"), parentSha: sha("2"), treeSha: sha("4"),
        diffDigest: digest("implementation-diff"), testEvidenceDigest: digest("implementation-test"),
      },
      "review-failed": {
        actor: actors.r, turnId: null, toolCallDigest: null,
        implementationSha: sha("3"), findingDigest,
        reproductionEvidenceDigest: digest("reproduction"),
      },
      fix: {
        actor: actors.a, turnId: null, toolCallDigest: null,
        commitSha: sha("5"), parentSha: sha("3"), treeSha: sha("6"),
        diffDigest: digest("fix-diff"), resolvesFindingDigest: findingDigest,
        testEvidenceDigest: digest("fix-test"),
      },
    };
    let evidenceRevision = 0;
    let evidenceHead = null;
    const strictOrder = [];

    const artifactEvent = event({
      eventType: "artifact-ready", messageId: "msg_m52_artifact",
      sender: actors.a, target: actors.r, relationshipId: grants.ar.relationshipId,
      content: "A committed implementation candidate is ready for review.",
    });
    let implementation = await durableTurn({
      coordinator, runtime, role: "a", ref: refs.a, current: actors.a,
      phase: "implementation", chainId: requirement.chainId,
      messageId: "msg_m52_artifact", eventId: "event_m52_artifact_source",
      tool: "threadmesh_publish_artifact", arguments: {
        sourceEventId: "event_m52_artifact_source",
        event: lifecycleActionEventBody(artifactEvent),
        commitSha: sha("3"),
      },
      result: { published: true }, record,
      restartAfterNativeBound: ({ executionId, turnId, principal }) => {
        controlledCoordinatorReopen("native-started-operation-bound");
        assertExactReplayNoDuplicate(
          "native-started-operation-bound",
          () => coordinator.bindStartedTurnExecutionOperation(
            executionId, { turnId, expectedRevision: 1 }, principal,
          ),
        );
        return coordinator;
      },
    });
    payloads.implementation.turnId = implementation.actions[0].turnId;
    payloads.implementation.toolCallDigest = implementation.actions[0].actionDigest;
    implementation = promoteStage(coordinator, implementation, "implementation", payloads.implementation, evidenceRevision, evidenceHead, taskPrincipal(actors.a));
    evidenceRevision = implementation.evidenceState.recordCount;
    evidenceHead = implementation.evidenceState.headDigest;
    strictOrder.push("a-implementation-promoted");
    submitLifecycleFromBoundAction({
      coordinator, execution: implementation,
      expectedTool: "threadmesh_publish_artifact",
      expectedMaterial: { commitSha: payloads.implementation.commitSha },
      consumedActions: consumedLifecycleActions,
      lifecycleEvent: artifactEvent, principal: taskPrincipal(actors.a),
    });
    strictOrder.push("artifact-event-durable");
    controlledCoordinatorReopen("event-created");
    assertExactReplayNoDuplicate(
      "event-created",
      () => coordinator.submit(
        projectLifecycleEventToEnvelope(artifactEvent), taskPrincipal(actors.a),
      ),
    );

    const irrelevantTurnsBefore = runtime.turns.filter((entry) => entry.role === "irrelevant").length;
    const irrelevantClaimsBefore = coordinator.db.prepare(
      `SELECT COUNT(*) AS count FROM attention_handler_claims
       WHERE receiver_task_id = ? AND receiver_incarnation_id = ?`,
    ).get(actors.irrelevant.taskId, actors.irrelevant.incarnationId).count;
    const irrelevantControlEvent = event({
      eventType: "artifact-ready",
      messageId: "msg_m52_irrelevant_control",
      sender: actors.a,
      target: actors.irrelevant,
      relationshipId: grants.ai.relationshipId,
      content: "Harness-seeded negative control for durable irrelevant routing.",
    });
    coordinator.submit(
      projectLifecycleEventToEnvelope(irrelevantControlEvent),
      taskPrincipal(actors.a),
    );
    const irrelevantRoute = evaluateAttentionRoute({
      event: irrelevantControlEvent,
      receiverTask: taskRef(actors.irrelevant),
      subscribedEventTypes: ["review-failed"],
      grant: grants.ai,
      currentGrant: grants.ai,
      sourceTask: actors.a,
      targetTask: actors.irrelevant,
      now: NOW,
    });
    if (irrelevantRoute.reasonCode !== "attention-event-type-not-subscribed") {
      throw coded("threadmesh_integrated_irrelevant_control_failed");
    }
    const irrelevantObserved = nextReceivedEvent(
      coordinator, actors.irrelevant, irrelevantControlEvent.messageId,
    );
    const irrelevantCursorBefore = coordinator.getAttentionCursor(
      taskRef(actors.irrelevant), taskPrincipal(actors.irrelevant),
    ).cursor;
    const irrelevantSkip = coordinator.advanceAttentionCursor(
      taskRef(actors.irrelevant),
      {
        eventCursor: irrelevantObserved.cursor,
        eventId: irrelevantObserved.eventId,
        classificationDigest: sha256Digest({
          state: irrelevantRoute.state,
          reasonCode: irrelevantRoute.reasonCode,
          eventType: irrelevantRoute.eventType,
          messageId: irrelevantRoute.messageId,
        }),
        expectedRevision: irrelevantCursorBefore.revision,
      },
      taskPrincipal(actors.irrelevant),
    );
    record("coordinator.attention.irrelevant-skipped", {
      reasonCode: irrelevantRoute.reasonCode,
      commitDigest: irrelevantSkip.commit.commitDigest,
    });

    const rObserved = nextReceivedEvent(coordinator, actors.r, artifactEvent.messageId);
    const rAdmission = await acceptAndAdmit({
      coordinator, runtime, role: "r", ref: refs.r, current: actors.r,
      sourceEvent: artifactEvent, observed: rObserved, chainId: requirement.chainId,
      record, onClaim: () => strictOrder.push("r-next-only-claim"),
    });
    strictOrder.push("r-decision-admission-exact-resume");
    const reviewEvent = event({
      eventType: "review-failed", messageId: "msg_m52_review",
      sender: actors.r, target: actors.a, relationshipId: grants.ra.relationshipId,
      content: "The candidate has a reproducible blocking counterexample.",
    });
    let review = await durableTurn({
      coordinator, runtime, role: "r", ref: refs.r, current: actors.r,
      phase: "review", chainId: requirement.chainId,
      messageId: "msg_m52_artifact", eventId: rObserved.eventId,
      tool: "threadmesh_report_review_finding", arguments: {
        sourceEventId: rObserved.eventId,
        event: lifecycleActionEventBody(reviewEvent),
        findingDigest,
      },
      result: { blocking: true }, record,
    });
    payloads["review-failed"].turnId = review.actions[0].turnId;
    payloads["review-failed"].toolCallDigest = review.actions[0].actionDigest;
    review = promoteStage(coordinator, review, "review-failed", payloads["review-failed"], evidenceRevision, evidenceHead, taskPrincipal(actors.r));
    evidenceRevision = review.evidenceState.recordCount;
    evidenceHead = review.evidenceState.headDigest;
    strictOrder.push("r-review-promoted");
    submitLifecycleFromBoundAction({
      coordinator, execution: review,
      expectedTool: "threadmesh_report_review_finding",
      expectedMaterial: { findingDigest },
      consumedActions: consumedLifecycleActions,
      lifecycleEvent: reviewEvent, principal: taskPrincipal(actors.r),
    });
    bindAndCommitHandler(coordinator, actors.r, rAdmission.claimEpoch, review, record);
    drainProcessedMessageEvents(coordinator, actors.r, artifactEvent.messageId, actors.a.incarnationId);
    strictOrder.push("r-cursor-committed");

    const aObserved = nextReceivedEvent(coordinator, actors.a, reviewEvent.messageId);
    const aAdmission = await acceptAndAdmit({
      coordinator, runtime, role: "a", ref: refs.a, current: actors.a,
      sourceEvent: reviewEvent, observed: aObserved, chainId: requirement.chainId,
      record, onClaim: () => strictOrder.push("same-a-next-only-claim"),
    });
    strictOrder.push("same-a-decision-admission-exact-resume");
    const fixEvent = event({
      eventType: "artifact-ready", messageId: "msg_m52_fix",
      sender: actors.a, target: actors.v, relationshipId: grants.av.relationshipId,
      content: "The same A task published the direct-descendant fix.",
    });
    let fix = await durableTurn({
      coordinator, runtime, role: "a", ref: refs.a, current: actors.a,
      phase: "fix", chainId: requirement.chainId,
      messageId: "msg_m52_review", eventId: aObserved.eventId,
      tool: "threadmesh_publish_dependency", arguments: {
        sourceEventId: aObserved.eventId,
        event: lifecycleActionEventBody(fixEvent),
        commitSha: sha("5"),
      },
      result: { published: true }, record,
    });
    payloads.fix.turnId = fix.actions[0].turnId;
    payloads.fix.toolCallDigest = fix.actions[0].actionDigest;
    fix = promoteStage(coordinator, fix, "fix", payloads.fix, evidenceRevision, evidenceHead, taskPrincipal(actors.a));
    evidenceRevision = fix.evidenceState.recordCount;
    evidenceHead = fix.evidenceState.headDigest;
    strictOrder.push("same-a-fix-promoted");
    submitLifecycleFromBoundAction({
      coordinator, execution: fix,
      expectedTool: "threadmesh_publish_dependency",
      expectedMaterial: { commitSha: payloads.fix.commitSha },
      consumedActions: consumedLifecycleActions,
      lifecycleEvent: fixEvent, principal: taskPrincipal(actors.a),
    });
    bindAndCommitHandler(coordinator, actors.a, aAdmission.claimEpoch, fix, record);
    drainProcessedMessageEvents(coordinator, actors.a, reviewEvent.messageId, actors.r.incarnationId);
    strictOrder.push("a-cursor-committed");

    const vObserved = nextReceivedEvent(coordinator, actors.v, fixEvent.messageId);
    const vAdmission = await acceptAndAdmit({
      coordinator, runtime, role: "v", ref: refs.v, current: actors.v,
      sourceEvent: fixEvent, observed: vObserved, chainId: requirement.chainId,
      record, onClaim: () => strictOrder.push("v-next-only-claim"),
    });
    strictOrder.push("v-decision-admission-exact-resume");
    const verification = createVerification({ requirement, payloads, verifier: actors.v, dependent: actors.dependent, trustAnchor, privateKey });
    const verificationArguments = {
      chainId: requirement.chainId,
      expectedEvidenceChainRevision: evidenceRevision,
      expectedEvidenceChainHead: evidenceHead,
    };
    const verifiedEvent = {
      ...event({
        eventType: "dependency-satisfied", messageId: "msg_m52_fix",
        sender: actors.v, target: actors.dependent, relationshipId: grants.vd.relationshipId,
        content: "The exact fixed evidence chain passed fixture verification.",
      }),
      freshness: { expectedRunId: "run-dependent", expectedObjectiveVersion: 2, expectedCheckpoint: "waiting-for-verified-fix" },
    };
    const verificationActionArguments = {
      sourceEventId: vObserved.eventId,
      event: lifecycleActionEventBody(verifiedEvent),
      ...verificationArguments,
    };
    let verifierExecution = await durableTurn({
      coordinator, runtime, role: "v", ref: refs.v, current: actors.v,
      phase: "verification", chainId: requirement.chainId,
      messageId: "msg_m52_fix", eventId: vObserved.eventId,
      tool: "threadmesh_verify_exact_chain", arguments: verificationActionArguments,
      result: verification, record,
    });
    strictOrder.push("v-verification-completed-bound");
    submitLifecycleFromBoundAction({
      coordinator, execution: verifierExecution, expectedTool: "threadmesh_verify_exact_chain",
      expectedMaterial: verificationArguments,
      consumedActions: consumedLifecycleActions,
      lifecycleEvent: verifiedEvent, principal: taskPrincipal(actors.v),
      allowCompletedFinalVerification: true,
    });
    strictOrder.push("verified-event-durable");
    const dependentObserved = nextReceivedEvent(
      coordinator, actors.dependent, verifiedEvent.messageId,
    );
    const dependentAdmission = await acceptAndAdmit({
      coordinator, runtime, role: "dependent", ref: refs.dependent,
      current: actors.dependent, sourceEvent: verifiedEvent,
      observed: dependentObserved, chainId: requirement.chainId, record,
      onClaim: () => strictOrder.push("dependent-next-only-claim"),
    });
    strictOrder.push("dependent-decision-admission-exact-resume");
    coordinator.bindCompletedAttentionHandler(
      dependentAdmission.claimEpoch,
      {
        turnExecutionId: dependentAdmission.decisionExecution.executionId,
        expectedRevision: 0,
      },
      taskPrincipal(actors.dependent),
    );
    strictOrder.push("dependent-decision-handler-bound");
    const dependentReceipt = recordDependentAdapterReceipt(
      coordinator, actors.v, actors.dependent, verifiedEvent,
    );
    strictOrder.push("dependent-adapter-receipt-recorded");
    controlledCoordinatorReopen("receipt-recorded");
    assertExactReplayNoDuplicate(
      "receipt-recorded",
      () => coordinator.recordAdapterReceipt(
        dependentReceipt.submission.submissionId,
        2,
        DEPENDENT_ADAPTER_RECEIPT,
        taskPrincipal(actors.dependent),
      ),
    );
    const finalDisposition = finalDispositionAfterDecision(
      coordinator, actors.v, actors.dependent, verifiedEvent, verification.response.attestation,
    );
    const persistedVerifier = coordinator.getTurnExecution(
      verifierExecution.executionId, taskPrincipal(actors.v),
    );
    const verifierAction = persistedVerifier.actions[0];
    const expectedVerificationResultDigest = gitEvidenceVerificationResultDigest({
      ...verification,
      expectedTrustAnchor: verification.expectedTrustAnchor,
    });
    if (verifierAction?.resultDigest !== expectedVerificationResultDigest) {
      throw coded("threadmesh_integrated_recovery_verifier_result_unbound");
    }
    const finalizeArguments = {
      actionOrdinal: 0,
      verificationToolArguments: verificationActionArguments,
      dependencyId: "dependency_m52_verified",
      expectedDependencyVersion: 1,
      event: verifiedEvent,
      disposition: finalDisposition,
      expectedEvidenceChainRevision: evidenceRevision,
      expectedEvidenceChainHead: evidenceHead,
      expectedRevision: 5,
    };
    const replayBinding = {
      executionId: verifierExecution.executionId,
      messageId: verifiedEvent.messageId,
      eventDigest: sha256Digest(verifiedEvent),
      actionDigest: verifierAction.actionDigest,
      resultDigest: verifierAction.resultDigest,
      expectedRevision: finalizeArguments.expectedRevision,
    };
    journalRecord = writeM52RecoveryJournal({
      filename: journalPath,
      scenarioId,
      checkpoint: "final-verification",
      replayBinding,
      bundle: {
        verification,
        finalize: finalizeArguments,
      },
    });
    controlledCoordinatorReopen("final-verification");
    const recoveredFinalVerification = readM52RecoveryJournal({
      filename: journalPath,
      expectedScenarioId: scenarioId,
      expectedCheckpoint: "final-verification",
      expectedReplayBinding: replayBinding,
    });
    const journalReplay = writeM52RecoveryJournal({
      filename: journalPath,
      scenarioId,
      checkpoint: "final-verification",
      replayBinding,
      bundle: recoveredFinalVerification.bundle,
    });
    if (journalReplay.replay !== true) {
      throw coded("threadmesh_integrated_recovery_journal_replay_failed");
    }
    const finalVerificationProof = recoveryProofs.find(
      (entry) => entry.checkpoint === "final-verification",
    );
    finalVerificationProof.exactReplayNoDuplicate = true;
    finalVerificationProof.replayStateDigest = finalVerificationProof.afterDigest;
    const recoveredAction = coordinator.getTurnExecution(
      verifierExecution.executionId, taskPrincipal(actors.v),
    ).actions[0];
    if (
      recoveredAction.resultDigest !== replayBinding.resultDigest ||
      gitEvidenceVerificationResultDigest({
        ...recoveredFinalVerification.bundle.verification,
        expectedTrustAnchor:
          recoveredFinalVerification.bundle.verification.expectedTrustAnchor,
      }) !== recoveredAction.resultDigest
    ) throw coded("threadmesh_integrated_recovery_verifier_result_unbound");
    const recoveredFinalizeArguments = {
      ...recoveredFinalVerification.bundle.finalize,
      ...recoveredFinalVerification.bundle.verification,
    };
    const finalized = coordinator.finalizeGitEvidenceDependency(
      replayBinding.executionId,
      recoveredFinalizeArguments,
      taskPrincipal(actors.v),
    );
    verifierExecution = finalized;
    strictOrder.push("v7-finalize-promoted-satisfied");
    controlledCoordinatorReopen("satisfaction");
    const satisfactionReplay = assertExactReplayNoDuplicate(
      "satisfaction",
      () => coordinator.finalizeGitEvidenceDependency(
        replayBinding.executionId,
        recoveredFinalizeArguments,
        taskPrincipal(actors.v),
      ),
    );
    if (satisfactionReplay.replay !== true || satisfactionReplay.unlock !== false) {
      throw coded("threadmesh_integrated_recovery_satisfaction_replay_failed");
    }
    const dependentCursor = coordinator.getAttentionCursor(
      taskRef(actors.dependent), taskPrincipal(actors.dependent),
    ).cursor;
    const dependentCommit = coordinator.commitFinalizedDependencyAttentionHandler(
      dependentAdmission.claimEpoch,
      {
        dependencyId: "dependency_m52_verified",
        expectedClaimRevision: 1,
        expectedCursorRevision: dependentCursor.revision,
      },
      taskPrincipal(actors.dependent),
    );
    const dependentCommittedCursor = dependentCommit.cursor.committedCursor;
    coordinator.clock = () => Date.parse("2026-08-31T14:00:00.000Z");
    const expiredReplay = coordinator.commitFinalizedDependencyAttentionHandler(
      dependentAdmission.claimEpoch,
      {
        dependencyId: "dependency_m52_verified",
        expectedClaimRevision: 1,
        expectedCursorRevision: dependentCommit.cursor.revision,
      },
      taskPrincipal(actors.dependent),
    );
    if (
      expiredReplay.replay !== true ||
      expiredReplay.cursor.committedCursor !== dependentCommittedCursor
    ) throw coded("threadmesh_integrated_expired_attention_replay_failed");
    coordinator.db.prepare(
      "UPDATE dependency_satisfactions SET satisfied_at = ? WHERE dependency_id = ?",
    ).run("2026-08-31T12:00:01.000Z", "dependency_m52_verified");
    let timestampTamperRejected = false;
    try {
      coordinator.commitFinalizedDependencyAttentionHandler(
        dependentAdmission.claimEpoch,
        {
          dependencyId: "dependency_m52_verified",
          expectedClaimRevision: 1,
          expectedCursorRevision: dependentCommit.cursor.revision,
        },
        taskPrincipal(actors.dependent),
      );
    } catch (error) {
      timestampTamperRejected =
        error?.code === "threadmesh_finalized_dependency_attention_finalization_mismatch";
    }
    coordinator.db.prepare(
      "UPDATE dependency_satisfactions SET satisfied_at = ? WHERE dependency_id = ?",
    ).run(NOW_ISO, "dependency_m52_verified");
    coordinator.clock = () => NOW;
    if (!timestampTamperRejected) {
      throw coded("threadmesh_integrated_attention_timestamp_tamper_not_rejected");
    }
    drainProcessedMessageEvents(
      coordinator, actors.dependent, verifiedEvent.messageId, actors.v.incarnationId,
    );
    strictOrder.push("dependent-finalized-cursor-committed");
    bindAndCommitHandler(coordinator, actors.v, vAdmission.claimEpoch, finalized, record);
    drainProcessedMessageEvents(coordinator, actors.v, fixEvent.messageId, actors.a.incarnationId);
    strictOrder.push("v-cursor-committed");

    const dependencyAfter = coordinator.getDependencyEdge("dependency_m52_verified", taskPrincipal(actors.dependent));
    const dependentAfter = coordinator.getTask(taskRef(actors.dependent), owner);
    const irrelevantTurnsAfter = runtime.turns.filter((entry) => entry.role === "irrelevant").length;
    const irrelevantClaimsAfter = coordinator.db.prepare(
      `SELECT COUNT(*) AS count FROM attention_handler_claims
       WHERE receiver_task_id = ? AND receiver_incarnation_id = ?`,
    ).get(actors.irrelevant.taskId, actors.irrelevant.incarnationId).count;
    const irrelevantCursor = coordinator.getAttentionCursor(taskRef(actors.irrelevant), taskPrincipal(actors.irrelevant)).cursor;
    const recoveryDeltas = assertRecoveryExpectedDeltas(recoveryProofs);
    if (
      dependencyBefore.status !== "waiting" || dependencyAfter.status !== "satisfied" ||
      dependentBefore.state !== "waiting" || dependentAfter.state !== "ready" ||
      irrelevantTurnsAfter !== irrelevantTurnsBefore ||
      irrelevantClaimsAfter !== irrelevantClaimsBefore ||
      irrelevantSkip.commit.kind !== "irrelevant-skip" ||
      irrelevantCursor.committedCursor !== irrelevantObserved.cursor ||
      refs.a.threadId !== actors.a.threadId || remainingRestartCheckpoints.size !== 0
    ) throw coded("threadmesh_integrated_invariant_failed", JSON.stringify({
      dependencyBefore: dependencyBefore.status,
      dependencyAfter: dependencyAfter.status,
      dependentBefore: dependentBefore.state,
      dependentAfter: dependentAfter.state,
      irrelevantTurnsBefore,
      irrelevantTurnsAfter,
      irrelevantClaimsBefore,
      irrelevantClaimsAfter,
      irrelevantCursor: irrelevantCursor.committedCursor,
      remainingRestartCheckpoints: [...remainingRestartCheckpoints],
      originalAThread: refs.a.threadId,
      actorAThread: actors.a.threadId,
    }));
    record("coordinator.integrated.completed", { strictOrder, dependencyStatus: dependencyAfter.status });
    coordinator.close();
    coordinator = null;
    const cleanup = exactArtifactManifest(
      artifactsDirectory, databasePath, journalPath, journalRecord,
    );
    return {
      state: "passed",
      evidenceClass: "deterministic-integrated-coordinator-fixture",
      liveProductEvidence: false,
      fixtureAssertions: {
        scriptedToolPlan: true,
        scriptedHandoff: true,
        humanRelayActions: 0,
        orchestratorPromptSubmissionsAfterReview: 1,
        integratedSqliteCoordinator: true,
      },
      coordinator: {
        strictOrder,
        sameImplementerThread: true,
        dependencyLockedBefore: dependencyBefore.status === "waiting",
        dependencySatisfiedAfter: dependencyAfter.status === "satisfied",
        dependentStateBefore: dependentBefore.state,
        dependentStateAfter: dependentAfter.state,
        irrelevantAuthorizedTaskWakeCount: 0,
        irrelevantAuthorizedTaskTurnCount: irrelevantTurnsAfter - irrelevantTurnsBefore,
        irrelevantAuthorizedTaskClaimCount: irrelevantClaimsAfter - irrelevantClaimsBefore,
        irrelevantPersistedSkip: true,
        irrelevantCursorCommitKind: irrelevantSkip.commit.kind,
        lifecycleSubmitAuthority: "observed-bound-action-only",
        finalizedAttentionExpiryReplayStable: true,
        finalizedAttentionTimestampTamperRejected: true,
      },
      chain: {
        recordCount: finalized.evidenceState.recordCount,
        trustedComplete: finalized.evidenceState.trustedComplete,
        verificationMode: "deterministic-in-process-fixture-signing",
        signedIndependentAttestation: false,
        dependencyUnlocked: finalized.unlock,
      },
      recovery: {
        controlledCoordinatorReopen: true,
        checkpoints: recoveryProofs,
        expectedDeltas: recoveryDeltas,
        unifiedStateVectorStores: RECOVERY_STATE_TABLES.map(([label]) => label),
        nativeStartedBoundary:
          "operation-bound coordinator reopen; not process-crash-before-bind",
        finalVerificationRecoveredFromJournal: true,
        satisfactionReplay: true,
        journal: {
          path: path.basename(journalPath),
          recordDigest: journalRecord.recordDigest,
          bundleDigest: journalRecord.bundleDigest,
          containsSignedVerifierBundle: true,
          projectedIntoTrace: false,
        },
      },
      liveClosureGates: {
        satisfied: false,
        pending: [
          "real Codex product run",
          "crash after native start before operation binding requires adapter reconcile surface",
          "process-crash fault injection beyond controlled coordinator reopen",
          "Kimi bounded dynamic-tool evidence support",
        ],
      },
      cleanup,
    };
  } finally {
    coordinator?.close();
  }
}
