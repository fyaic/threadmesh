import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { sha256Digest } from "../canonical-json.mjs";
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

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const NOW_ISO = new Date(NOW).toISOString();
const EXPIRES_AT = "2026-08-31T13:00:00.000Z";
const owner = Object.freeze({ kind: "user", principalId: "owner_m52_integrated_fixture" });
const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });

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
  tool, arguments: args, result, record,
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
  allowCompletedFinalVerification = false,
}) {
  const persisted = coordinator.getTurnExecution(execution.executionId, principal);
  const action = persisted.actions[actionOrdinal];
  const allowedState = persisted.intent.state === "promoted" || (
    allowCompletedFinalVerification &&
    persisted.intent.state === "completed-turn-bound" &&
    expectedTool === "threadmesh_verify_exact_chain"
  );
  if (
    !allowedState || !action || action.name !== expectedTool ||
    action.resultStatus !== "completed" ||
    persisted.intent.actor.taskId !== lifecycleEvent.sender.taskId ||
    persisted.intent.actor.incarnationId !== lifecycleEvent.sender.incarnationId
  ) throw coded("threadmesh_integrated_lifecycle_submit_unbound");
  return coordinator.submit(projectLifecycleEventToEnvelope(lifecycleEvent), principal);
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

async function acceptAndAdmit({ coordinator, runtime, role, ref, current, sourceEvent, observed, chainId, record }) {
  const principal = taskPrincipal(current);
  const cursor = coordinator.getAttentionCursor(taskRef(current), principal).cursor;
  const claimEpoch = `claim_m52_${role}_${sourceEvent.messageId}`;
  coordinator.claimAttentionEvent(taskRef(current), {
    claimEpoch,
    eventCursor: observed.cursor,
    eventId: observed.eventId,
    expectedRevision: cursor.revision,
  }, principal);
  record("coordinator.attention.next-only-claimed", { role, messageId: sourceEvent.messageId });
  await durableTurn({
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
      return coordinator.acknowledgePending(
        sourceEvent.sender.incarnationId,
        sourceEvent.messageId,
        pending.claimToken,
        "accepted",
        0,
        principal,
      );
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
  return { claimEpoch };
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

function acceptedFinalDisposition(coordinator, verifier, dependent, sourceEvent, attestation) {
  const principal = taskPrincipal(dependent);
  const pending = coordinator.claimPending(verifier.incarnationId, sourceEvent.messageId, 0, principal);
  coordinator.acknowledgePending(
    verifier.incarnationId, sourceEvent.messageId, pending.claimToken, "accepted", 0, principal,
  );
  const prepared = coordinator.prepareAdapterSubmission(
    verifier.incarnationId, sourceEvent.messageId, 1, principal,
  );
  coordinator.beginAdapterSubmission(prepared.submission.submissionId, 1, principal);
  coordinator.recordAdapterReceipt(
    prepared.submission.submissionId,
    1,
    { adapterOperationId: "fixture-dependent-resume", acceptedAt: NOW_ISO, evidenceRefs: ["fixture://dependent/receipt"] },
    principal,
  );
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

export async function runIntegratedCoordinatorLoop({ runtime, artifactsDirectory, record = () => {} }) {
  const databasePath = path.join(artifactsDirectory, "integrated-coordinator.sqlite");
  fs.rmSync(databasePath, { force: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const trustAnchor = {
    keyId: "threadmesh://independent-git-verifier/key/ephemeral",
    algorithm: "ed25519",
    actorId: "threadmesh-independent-git-verifier",
    trustDomain: "threadmesh://independent-git-verifier",
    policyId: "threadmesh://independent-git-verifier/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
  const coordinator = new SqliteCoordinator({
    filename: databasePath,
    clock: () => NOW,
    verificationTrustAnchors: [trustAnchor],
  });
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

    let implementation = await durableTurn({
      coordinator, runtime, role: "a", ref: refs.a, current: actors.a,
      phase: "implementation", chainId: requirement.chainId,
      messageId: "msg_m52_artifact", eventId: "event_m52_artifact_source",
      tool: "threadmesh_publish_artifact", arguments: { commitSha: sha("3") },
      result: { published: true }, record,
    });
    payloads.implementation.turnId = implementation.actions[0].turnId;
    payloads.implementation.toolCallDigest = implementation.actions[0].actionDigest;
    implementation = promoteStage(coordinator, implementation, "implementation", payloads.implementation, evidenceRevision, evidenceHead, taskPrincipal(actors.a));
    evidenceRevision = implementation.evidenceState.recordCount;
    evidenceHead = implementation.evidenceState.headDigest;
    strictOrder.push("a-implementation-promoted");
    const artifactEvent = event({
      eventType: "artifact-ready", messageId: "msg_m52_artifact",
      sender: actors.a, target: actors.r, relationshipId: grants.ar.relationshipId,
      content: "A committed implementation candidate is ready for review.",
    });
    submitLifecycleFromBoundAction({ coordinator, execution: implementation, expectedTool: "threadmesh_publish_artifact", lifecycleEvent: artifactEvent, principal: taskPrincipal(actors.a) });
    strictOrder.push("artifact-event-durable");

    const irrelevantTurnsBefore = runtime.turns.filter((entry) => entry.role === "irrelevant").length;
    const irrelevantRoute = evaluateAttentionRoute({
      event: artifactEvent,
      receiverTask: taskRef(actors.irrelevant),
      grant: grants.ai,
      currentGrant: grants.ai,
      sourceTask: actors.a,
      targetTask: actors.irrelevant,
      now: NOW,
    });
    if (irrelevantRoute.reasonCode !== "attention-target-not-relevant") {
      throw coded("threadmesh_integrated_irrelevant_control_failed");
    }

    const rObserved = nextReceivedEvent(coordinator, actors.r, artifactEvent.messageId);
    strictOrder.push("r-next-only-claim");
    const rAdmission = await acceptAndAdmit({ coordinator, runtime, role: "r", ref: refs.r, current: actors.r, sourceEvent: artifactEvent, observed: rObserved, chainId: requirement.chainId, record });
    strictOrder.push("r-decision-admission-exact-resume");
    let review = await durableTurn({
      coordinator, runtime, role: "r", ref: refs.r, current: actors.r,
      phase: "review", chainId: requirement.chainId,
      messageId: "msg_m52_artifact", eventId: rObserved.eventId,
      tool: "threadmesh_report_review_finding", arguments: { findingDigest },
      result: { blocking: true }, record,
    });
    payloads["review-failed"].turnId = review.actions[0].turnId;
    payloads["review-failed"].toolCallDigest = review.actions[0].actionDigest;
    review = promoteStage(coordinator, review, "review-failed", payloads["review-failed"], evidenceRevision, evidenceHead, taskPrincipal(actors.r));
    evidenceRevision = review.evidenceState.recordCount;
    evidenceHead = review.evidenceState.headDigest;
    strictOrder.push("r-review-promoted");
    const reviewEvent = event({
      eventType: "review-failed", messageId: "msg_m52_review",
      sender: actors.r, target: actors.a, relationshipId: grants.ra.relationshipId,
      content: "The candidate has a reproducible blocking counterexample.",
    });
    submitLifecycleFromBoundAction({ coordinator, execution: review, expectedTool: "threadmesh_report_review_finding", lifecycleEvent: reviewEvent, principal: taskPrincipal(actors.r) });
    bindAndCommitHandler(coordinator, actors.r, rAdmission.claimEpoch, review, record);
    drainProcessedMessageEvents(coordinator, actors.r, artifactEvent.messageId, actors.a.incarnationId);
    strictOrder.push("r-cursor-committed");

    const aObserved = nextReceivedEvent(coordinator, actors.a, reviewEvent.messageId);
    strictOrder.push("same-a-next-only-claim");
    const aAdmission = await acceptAndAdmit({ coordinator, runtime, role: "a", ref: refs.a, current: actors.a, sourceEvent: reviewEvent, observed: aObserved, chainId: requirement.chainId, record });
    strictOrder.push("same-a-decision-admission-exact-resume");
    let fix = await durableTurn({
      coordinator, runtime, role: "a", ref: refs.a, current: actors.a,
      phase: "fix", chainId: requirement.chainId,
      messageId: "msg_m52_review", eventId: aObserved.eventId,
      tool: "threadmesh_publish_dependency", arguments: { commitSha: sha("5") },
      result: { published: true }, record,
    });
    payloads.fix.turnId = fix.actions[0].turnId;
    payloads.fix.toolCallDigest = fix.actions[0].actionDigest;
    fix = promoteStage(coordinator, fix, "fix", payloads.fix, evidenceRevision, evidenceHead, taskPrincipal(actors.a));
    evidenceRevision = fix.evidenceState.recordCount;
    evidenceHead = fix.evidenceState.headDigest;
    strictOrder.push("same-a-fix-promoted");
    const fixEvent = event({
      eventType: "artifact-ready", messageId: "msg_m52_fix",
      sender: actors.a, target: actors.v, relationshipId: grants.av.relationshipId,
      content: "The same A task published the direct-descendant fix.",
    });
    submitLifecycleFromBoundAction({ coordinator, execution: fix, expectedTool: "threadmesh_publish_dependency", lifecycleEvent: fixEvent, principal: taskPrincipal(actors.a) });
    bindAndCommitHandler(coordinator, actors.a, aAdmission.claimEpoch, fix, record);
    drainProcessedMessageEvents(coordinator, actors.a, reviewEvent.messageId, actors.r.incarnationId);
    strictOrder.push("a-cursor-committed");

    const vObserved = nextReceivedEvent(coordinator, actors.v, fixEvent.messageId);
    strictOrder.push("v-next-only-claim");
    const vAdmission = await acceptAndAdmit({ coordinator, runtime, role: "v", ref: refs.v, current: actors.v, sourceEvent: fixEvent, observed: vObserved, chainId: requirement.chainId, record });
    strictOrder.push("v-decision-admission-exact-resume");
    const verification = createVerification({ requirement, payloads, verifier: actors.v, dependent: actors.dependent, trustAnchor, privateKey });
    const verificationArguments = {
      chainId: requirement.chainId,
      expectedEvidenceChainRevision: evidenceRevision,
      expectedEvidenceChainHead: evidenceHead,
    };
    let verifierExecution = await durableTurn({
      coordinator, runtime, role: "v", ref: refs.v, current: actors.v,
      phase: "verification", chainId: requirement.chainId,
      messageId: "msg_m52_fix", eventId: vObserved.eventId,
      tool: "threadmesh_verify_exact_chain", arguments: verificationArguments,
      result: verification, record,
    });
    strictOrder.push("v-verification-completed-bound");
    const verifiedEvent = {
      ...event({
        eventType: "dependency-satisfied", messageId: "msg_m52_fix",
        sender: actors.v, target: actors.dependent, relationshipId: grants.vd.relationshipId,
        content: "The exact fixed evidence chain passed fixture verification.",
      }),
      freshness: { expectedRunId: "run-dependent", expectedObjectiveVersion: 2, expectedCheckpoint: "waiting-for-verified-fix" },
    };
    submitLifecycleFromBoundAction({
      coordinator, execution: verifierExecution, expectedTool: "threadmesh_verify_exact_chain",
      lifecycleEvent: verifiedEvent, principal: taskPrincipal(actors.v),
      allowCompletedFinalVerification: true,
    });
    const finalDisposition = acceptedFinalDisposition(
      coordinator, actors.v, actors.dependent, verifiedEvent, verification.response.attestation,
    );
    const finalized = coordinator.finalizeGitEvidenceDependency(
      verifierExecution.executionId,
      {
        actionOrdinal: 0,
        verificationToolArguments: verificationArguments,
        ...verification,
        dependencyId: "dependency_m52_verified",
        expectedDependencyVersion: 1,
        event: verifiedEvent,
        disposition: finalDisposition,
        expectedEvidenceChainRevision: evidenceRevision,
        expectedEvidenceChainHead: evidenceHead,
        expectedRevision: 5,
      },
      taskPrincipal(actors.v),
    );
    verifierExecution = finalized;
    strictOrder.push("v7-finalize-promoted-satisfied");
    bindAndCommitHandler(coordinator, actors.v, vAdmission.claimEpoch, finalized, record);
    drainProcessedMessageEvents(coordinator, actors.v, fixEvent.messageId, actors.a.incarnationId);
    strictOrder.push("v-cursor-committed");

    const dependencyAfter = coordinator.getDependencyEdge("dependency_m52_verified", taskPrincipal(actors.dependent));
    const dependentAfter = coordinator.getTask(taskRef(actors.dependent), owner);
    const irrelevantTurnsAfter = runtime.turns.filter((entry) => entry.role === "irrelevant").length;
    const irrelevantCursor = coordinator.getAttentionCursor(taskRef(actors.irrelevant), taskPrincipal(actors.irrelevant)).cursor;
    if (
      dependencyBefore.status !== "waiting" || dependencyAfter.status !== "satisfied" ||
      dependentBefore.state !== "waiting" || dependentAfter.state !== "ready" ||
      irrelevantTurnsAfter !== irrelevantTurnsBefore || irrelevantCursor.committedCursor !== 0 ||
      refs.a.threadId !== actors.a.threadId
    ) throw coded("threadmesh_integrated_invariant_failed", JSON.stringify({
      dependencyBefore: dependencyBefore.status,
      dependencyAfter: dependencyAfter.status,
      dependentBefore: dependentBefore.state,
      dependentAfter: dependentAfter.state,
      irrelevantTurnsBefore,
      irrelevantTurnsAfter,
      irrelevantCursor: irrelevantCursor.committedCursor,
      originalAThread: refs.a.threadId,
      actorAThread: actors.a.threadId,
    }));
    record("coordinator.integrated.completed", { strictOrder, dependencyStatus: dependencyAfter.status });
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
        lifecycleSubmitAuthority: "observed-bound-action-only",
      },
      chain: {
        recordCount: finalized.evidenceState.recordCount,
        trustedComplete: finalized.evidenceState.trustedComplete,
        verificationMode: "deterministic-in-process-fixture-signing",
        signedIndependentAttestation: false,
        dependencyUnlocked: finalized.unlock,
      },
      liveClosureGates: {
        satisfied: false,
        pending: [
          "real Codex product run",
          "crash after native start before operation binding requires adapter reconcile surface",
          "restart-safe signed verifier result journal",
          "restart matrix at event-created, receipt, final verification, and satisfaction",
          "Kimi bounded dynamic-tool evidence support",
        ],
      },
      cleanup: {
        attempted: true,
        complete: true,
        retainedEvidence: [path.basename(databasePath)],
      },
    };
  } finally {
    coordinator.close();
  }
}
