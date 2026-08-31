import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  SqliteCoordinator,
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  createEffectiveGrant,
  gitEvidenceVerificationResultDigest,
} from "../src/coordinator/sqlite-coordinator.mjs";
import {
  verificationAttestationDigest,
} from "../src/protocol-validator.mjs";
import { projectLifecycleEventToEnvelope } from "../src/routing/lifecycle-events.mjs";
import {
  independentGitClaimDigest,
  verifyIndependentGitVerification,
} from "../src/validation/independent-git-verifier.mjs";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const owner = Object.freeze({ kind: "user", principalId: "owner_unlock" });
const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });
const findingDigest = sha256Digest({
  resourcePath: "artifact.txt",
  counterexample: "BAD_COUNTEREXAMPLE",
});

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-unlock-"));
  return {
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function actor(role, character) {
  return {
    taskId: `task_${role}`,
    incarnationId: `inc_${role}_01`,
    threadId: `thread-${role}`,
    snapshotDigest: `sha256:${character.repeat(64)}`,
  };
}

function taskPrincipal(value) {
  return { kind: "task", taskId: value.taskId, incarnationId: value.incarnationId };
}

function taskRef(value) {
  return { taskId: value.taskId, incarnationId: value.incarnationId };
}

function signer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    trustAnchor: {
      keyId: "threadmesh://independent-git-verifier/key/ephemeral",
      algorithm: "ed25519",
      actorId: "threadmesh-independent-git-verifier",
      trustDomain: "threadmesh://independent-git-verifier",
      policyId: "threadmesh://independent-git-verifier/policy/1",
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    },
  };
}

function bindingId(prefix, chain, implementationSha, fixSha, findingValueDigest) {
  return `${prefix}_${sha256Digest({
    chain,
    implementationSha,
    fixSha,
    findingDigest: findingValueDigest,
  }).slice(7, 31)}`;
}

function completedBinding(current, turnId, actions) {
  const receipt = {
    adapterOperationId: turnId,
    acceptedAt: new Date(NOW).toISOString(),
    evidenceRefs: ["codex://turn/receipt"],
  };
  return {
    evidence: {
      threadId: current.threadId,
      turnId,
      turnStatus: "completed",
      completedAt: new Date(NOW).toISOString(),
      durationMs: 10,
      userAgent: "codex-app-server-test",
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
      turnId,
      callId: action.callId,
      tool: action.name,
      argumentsDigest: action.argumentsDigest,
      outputDigest: action.resultDigest,
      resultStatus: "completed",
    })),
    nonThreadMeshToolCalls: 0,
  };
}

function createExecution(coordinator, current, {
  suffix,
  chainId,
  messageId,
  eventId = `event_${suffix}`,
  toolName,
  arguments: args,
  resultDigest,
}) {
  const principal = taskPrincipal(current);
  let execution = coordinator.createTurnExecutionIntent({
    intentId: `intent_${suffix}`,
    scenarioId: "scenario_trusted_unlock",
    chainId,
    messageId,
    eventId,
    actor: current,
    adapterIdempotencyKey: `adapter_${suffix}`,
    promptDigest: digest(`prompt-${suffix}`),
    allowedTools: [toolName],
  }, 0, principal);
  execution = coordinator.markTurnExecutionStarted(
    execution.executionId, { expectedRevision: 0 }, principal,
  );
  const turnId = `turn_${suffix}`;
  execution = coordinator.bindStartedTurnExecutionOperation(
    execution.executionId, { turnId, expectedRevision: 1 }, principal,
  );
  execution = coordinator.recordModelSelectedTurnToolAction(
    execution.executionId,
    {
      turnId,
      callId: `call_${suffix}`,
      ordinal: 0,
      name: toolName,
      arguments: args,
      expectedRevision: 2,
      expectedActionHeadDigest: null,
    },
    principal,
  );
  execution = coordinator.completeModelSelectedTurnToolAction(
    execution.executionId,
    {
      turnId,
      callId: `call_${suffix}`,
      ordinal: 0,
      resultDigest,
      resultStatus: "completed",
      expectedRevision: 3,
      expectedActionHeadDigest: execution.actions[0].selectionDigest,
    },
    principal,
  );
  execution = coordinator.bindCompletedTurnExecution(
    execution.executionId,
    {
      binding: completedBinding(current, turnId, execution.actions),
      expectedRevision: 4,
    },
    principal,
  );
  return execution;
}

function createIndependentVerification(context) {
  const { requirement, payloads, signing, actors, dependent } = context;
  const request = {
    repoPath: "/private/bounded/repository",
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
      messageId: "msg_trusted_unlock",
      senderIncarnationId: actors.verifier.incarnationId,
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
  const serviceAttestation = {
    specVersion: "0.0-draft",
    attestationId: bindingId(
      "att_git", request.chain, request.implementation.sha,
      request.fix.sha, request.finding.digest,
    ),
    verifier: {
      actorType: "service",
      actorId: signing.trustAnchor.actorId,
      authenticationId: "authn_git_unlock_service",
      trustDomain: signing.trustAnchor.trustDomain,
    },
    subject: {
      ...request.subject,
      claimType: "artifact-state",
      claimDigest: independentGitClaimDigest({ chain: proof.chain, proof }),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof),
    verifiedAt: new Date(NOW).toISOString(),
    trustPolicy: {
      policyId: signing.trustAnchor.policyId,
      decisionId: bindingId(
        "decision_git", request.chain, request.implementation.sha,
        request.fix.sha, request.finding.digest,
      ),
      decision: "trusted",
      decidedAt: new Date(NOW).toISOString(),
    },
  };
  serviceAttestation.signedPayloadDigest =
    verificationAttestationDigest(serviceAttestation);
  serviceAttestation.proof = {
    algorithm: "ed25519",
    keyId: signing.trustAnchor.keyId,
    signature: sign(
      null,
      Buffer.from(serviceAttestation.signedPayloadDigest, "utf8"),
      signing.privateKey,
    ).toString("base64url"),
  };
  const verification = {
    request,
    response: { trustAnchor: signing.trustAnchor, attestation: serviceAttestation, proof },
  };
  verifyIndependentGitVerification({
    ...verification,
    expectedTrustAnchor: signing.trustAnchor,
  });
  return verification;
}

function lifecycleEvent(context) {
  return {
    eventType: "dependency-satisfied",
    messageId: "msg_trusted_unlock",
    sender: { ...taskRef(context.actors.verifier), actorType: "agent", harness: "codex" },
    target: { ...taskRef(context.dependent), harness: "codex" },
    relationshipId: "rel_trusted_unlock",
    content: "The exact fixed chain passed independent verification.",
    reason: "The dependent may continue from the verified chain.",
    freshness: {
      expectedRunId: "run-dependent",
      expectedObjectiveVersion: 2,
      expectedCheckpoint: "waiting-for-verified-fix",
    },
    createdAt: "2026-08-31T11:59:00.000Z",
    expiresAt: "2026-08-31T13:00:00.000Z",
  };
}

function acceptedDisposition(context, sourceEvent, serviceAttestation) {
  return {
    specVersion: "0.0-draft",
    dispositionId: "dsp_git_unlock",
    messageId: sourceEvent.messageId,
    receiver: taskRef(context.dependent),
    revision: 3,
    delivery: { state: "adapter-submitted", observedAt: "2026-08-31T12:00:00.000Z" },
    decision: {
      state: "accepted",
      decidedAt: "2026-08-31T11:59:30.000Z",
      decidedBy: { actorType: "agent", task: taskRef(context.dependent) },
      reasonCode: "accepted",
    },
    outcome: {
      state: "externally-verified",
      observedAt: "2026-08-31T12:00:00.000Z",
      evidenceRefs: ["threadmesh://git-evidence/final"],
      verificationAttestations: [structuredClone(serviceAttestation)],
    },
    updatedAt: "2026-08-31T12:00:00.000Z",
  };
}

function setup(filename) {
  const signing = signer();
  const actors = {
    implementer: actor("implementer", "a"),
    reviewer: actor("reviewer", "b"),
    verifier: actor("verifier", "c"),
  };
  const dependent = actor("dependent", "d");
  const coordinator = new SqliteCoordinator({
    filename,
    clock: () => NOW,
    verificationTrustAnchors: [signing.trustAnchor],
  });
  for (const current of [...Object.values(actors), dependent]) {
    coordinator.registerTask({
      taskId: current.taskId,
      incarnationId: current.incarnationId,
      harness: "codex",
      state: current === dependent ? "waiting" : "idle",
      ...(current === dependent ? {
        runtime: {
          runId: "run-dependent",
          objectiveVersion: 2,
          checkpoint: "waiting-for-verified-fix",
        },
      } : {}),
      adapterRef: {
        kind: "codex-app-server",
        threadId: current.threadId,
        snapshotDigest: current.snapshotDigest,
      },
    }, owner);
  }
  const grant = createEffectiveGrant({
    specVersion: "0.0-draft",
    grantId: "grant_trusted_unlock",
    grantVersion: 1,
    relationshipId: "rel_trusted_unlock",
    relationshipType: "peer",
    source: {
      taskId: actors.verifier.taskId,
      incarnationId: actors.verifier.incarnationId,
    },
    target: {
      taskId: dependent.taskId,
      incarnationId: dependent.incarnationId,
    },
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    expiresAt: "2026-08-31T13:00:00.000Z",
  }, {
    decisionId: "decision_grant_trusted_unlock",
    authenticationId: "authn_grant_trusted_unlock",
    decidedAt: "2026-08-31T11:00:00.000Z",
  }, owner);
  coordinator.installGrant(grant, owner);
  const dependencyId = "dependency_trusted_unlock";
  coordinator.createDependencyEdge({
    dependencyId,
    version: 1,
    edgeType: "dependency",
    prerequisite: {
      taskId: actors.verifier.taskId,
      incarnationId: actors.verifier.incarnationId,
    },
    dependent: {
      taskId: dependent.taskId,
      incarnationId: dependent.incarnationId,
    },
    relationshipId: "rel_trusted_unlock",
    expectedEventType: "dependency-satisfied",
    freshness: {
      expectedRunId: "run-dependent",
      expectedObjectiveVersion: 2,
      expectedCheckpoint: "waiting-for-verified-fix",
    },
    createdAt: "2026-08-31T11:00:00.000Z",
    expiresAt: "2026-08-31T13:00:00.000Z",
  }, owner);
  const requirement = coordinator.createGitEvidenceRequirement({
    chainId: "chain_trusted_unlock",
    validatedBaseSha: sha("1"),
    fixtureSeedSha: sha("2"),
    fixtureDefinitionDigest: digest("fixture"),
    trustedTestBlobDigest: digest("trusted-test"),
    ...actors,
    preconfiguredTrustAnchorDigest: sha256Digest(signing.trustAnchor),
  }, owner).requirement;
  coordinator.bindGitEvidenceDependency(
    requirement.chainId, { dependencyId, expectedVersion: 1 }, owner,
  );
  const payloads = {
    implementation: {
      actor: actors.implementer,
      turnId: "turn_implementation",
      toolCallDigest: null,
      commitSha: sha("3"),
      parentSha: sha("2"),
      treeSha: sha("4"),
      diffDigest: digest("implementation-diff"),
      testEvidenceDigest: digest("implementation-test"),
    },
    "review-failed": {
      actor: actors.reviewer,
      turnId: "turn_review",
      toolCallDigest: null,
      implementationSha: sha("3"),
      findingDigest,
      reproductionEvidenceDigest: digest("reproduction"),
    },
    fix: {
      actor: actors.implementer,
      turnId: "turn_fix",
      toolCallDigest: null,
      commitSha: sha("5"),
      parentSha: sha("3"),
      treeSha: sha("6"),
      diffDigest: digest("fix-diff"),
      resolvesFindingDigest: findingDigest,
      testEvidenceDigest: digest("fix-test"),
    },
  };
  const tools = {
    implementation: "threadmesh_publish_artifact",
    "review-failed": "threadmesh_report_review_finding",
    fix: "threadmesh_publish_dependency",
  };
  let evidenceRevision = 0;
  let evidenceHead = null;
  for (const stage of ["implementation", "review-failed", "fix"]) {
    const current = stage === "review-failed" ? actors.reviewer : actors.implementer;
    const execution = createExecution(coordinator, current, {
      suffix: stage.replace("-", "_"),
      chainId: requirement.chainId,
      messageId: `msg_${stage}`,
      toolName: tools[stage],
      arguments: { stage },
      resultDigest: digest(`${stage}-result`),
    });
    payloads[stage].turnId = execution.actions[0].turnId;
    payloads[stage].toolCallDigest = execution.actions[0].actionDigest;
    const promoted = coordinator.promoteTurnExecutionWithGitEvidenceRecord(
      execution.executionId,
      {
        stage,
        payload: payloads[stage],
        expectedEvidenceChainRevision: evidenceRevision,
        expectedEvidenceChainHead: evidenceHead,
        expectedRevision: 5,
      },
      taskPrincipal(current),
    );
    evidenceRevision = promoted.evidenceState.recordCount;
    evidenceHead = promoted.evidenceState.headDigest;
  }
  return {
    coordinator, signing, actors, dependent, dependencyId,
    requirement, payloads, evidenceHead,
  };
}

function prepareAcceptedMessage(context, sourceEvent) {
  const sender = taskPrincipal(context.actors.verifier);
  const receiver = taskPrincipal(context.dependent);
  context.coordinator.submit(projectLifecycleEventToEnvelope(sourceEvent), sender);
  context.coordinator.respond(
    sourceEvent.sender.incarnationId, sourceEvent.messageId,
    "accepted", 0, receiver,
  );
  const prepared = context.coordinator.prepareAdapterSubmission(
    sourceEvent.sender.incarnationId, sourceEvent.messageId, 1, receiver,
  );
  context.coordinator.beginAdapterSubmission(
    prepared.submission.submissionId, 1, receiver,
  );
  context.coordinator.recordAdapterReceipt(
    prepared.submission.submissionId,
    1,
    {
      adapterOperationId: "operation_trusted_unlock",
      acceptedAt: "2026-08-31T12:00:00.000Z",
      evidenceRefs: ["codex://dependent/receipt"],
    },
    receiver,
  );
}

function prepareFinalization(context) {
  const verification = createIndependentVerification(context);
  const verificationToolArguments = {
    sourceEventId: "event_verification",
    messageId: "msg_trusted_unlock",
    eventType: "dependency-satisfied",
    targetTaskId: context.dependent.taskId,
    targetIncarnationId: context.dependent.incarnationId,
    relationshipId: "rel_trusted_unlock",
    chainId: context.requirement.chainId,
    expectedEvidenceChainRevision: 3,
    expectedEvidenceChainHead: context.evidenceHead,
  };
  const execution = createExecution(context.coordinator, context.actors.verifier, {
    suffix: "verification",
    chainId: context.requirement.chainId,
    messageId: "msg_trusted_unlock",
    toolName: "threadmesh_verify_exact_chain",
    arguments: verificationToolArguments,
    resultDigest: gitEvidenceVerificationResultDigest({
      ...verification,
      expectedTrustAnchor: context.signing.trustAnchor,
    }),
  });
  const sourceEvent = lifecycleEvent(context);
  const disposition = acceptedDisposition(
    context, sourceEvent, verification.response.attestation,
  );
  prepareAcceptedMessage(context, sourceEvent);
  return { verification, verificationToolArguments, execution, sourceEvent, disposition };
}

function finalizeArgs(context, prepared, overrides = {}) {
  return {
    actionOrdinal: 0,
    verificationToolArguments: prepared.verificationToolArguments,
    ...prepared.verification,
    expectedTrustAnchor: context.signing.trustAnchor,
    dependencyId: context.dependencyId,
    expectedDependencyVersion: 1,
    event: prepared.sourceEvent,
    disposition: prepared.disposition,
    expectedEvidenceChainRevision: 3,
    expectedEvidenceChainHead: context.evidenceHead,
    expectedRevision: 5,
    ...overrides,
  };
}

function prepareDependentAttentionHandler(context, prepared, decision = "accepted") {
  const principal = taskPrincipal(context.dependent);
  const observed = context.coordinator.waitTask(
    taskRef(context.dependent), { afterCursor: 0, limit: 50 }, principal,
  ).events.find((entry) =>
    entry.messageId === prepared.sourceEvent.messageId &&
    entry.eventType === "message-durably-received");
  assert.ok(observed);
  const claimEpoch = `claim_dependent_${decision}`;
  context.coordinator.claimAttentionEvent(
    taskRef(context.dependent),
    {
      claimEpoch,
      eventCursor: observed.cursor,
      eventId: observed.eventId,
      expectedRevision: 0,
    },
    principal,
  );
  const execution = createExecution(context.coordinator, context.dependent, {
    suffix: `dependent_decision_${decision}`,
    chainId: context.requirement.chainId,
    messageId: prepared.sourceEvent.messageId,
    eventId: observed.eventId,
    toolName: "threadmesh_decide_offer",
    arguments: { messageId: prepared.sourceEvent.messageId, decision },
    resultDigest: digest(`dependent-${decision}`),
  });
  context.coordinator.bindCompletedAttentionHandler(
    claimEpoch,
    { turnExecutionId: execution.executionId, expectedRevision: 0 },
    principal,
  );
  return { claimEpoch, principal };
}

test("atomically finalizes an exact model-selected verifier chain and replays after restart", () => {
  const temporary = temporaryDatabase();
  let context = setup(temporary.filename);
  try {
    const prepared = prepareFinalization(context);
    assert.throws(
      () => context.coordinator.satisfyDependencyEdge({
        dependencyId: context.dependencyId,
        expectedVersion: 1,
        event: prepared.sourceEvent,
        disposition: prepared.disposition,
      }, taskPrincipal(context.dependent)),
      { code: "threadmesh_dependency_git_evidence_finalize_required" },
    );
    const finalized = context.coordinator.finalizeGitEvidenceDependency(
      prepared.execution.executionId,
      finalizeArgs(context, prepared),
      taskPrincipal(context.actors.verifier),
    );
    assert.equal(finalized.replay, false);
    assert.equal(finalized.unlock, true);
    assert.equal(finalized.evidenceState.trustedComplete, true);
    assert.equal(finalized.intent.state, "promoted");
    assert.equal(
      context.coordinator.getDependencyEdge(
        context.dependencyId, taskPrincipal(context.dependent),
      ).status,
      "satisfied",
    );
    const replay = context.coordinator.finalizeGitEvidenceDependency(
      prepared.execution.executionId,
      finalizeArgs(context, prepared),
      taskPrincipal(context.actors.verifier),
    );
    assert.equal(replay.replay, true);
    assert.equal(replay.unlock, false);
    context.coordinator.close();
    context = {
      ...context,
      coordinator: new SqliteCoordinator({
        filename: temporary.filename,
        clock: () => NOW,
        verificationTrustAnchors: [context.signing.trustAnchor],
      }),
    };
    assert.equal(
      context.coordinator.inspectGitEvidenceChain(
        context.requirement.chainId, owner,
      ).trustedComplete,
      true,
    );
    assert.equal(
      context.coordinator.getDependencyEdge(
        context.dependencyId, taskPrincipal(context.dependent),
      ).status,
      "satisfied",
    );
  } finally {
    context.coordinator.close();
    temporary.cleanup();
  }
});

test("commits dependent attention only from its bound accepted decision and finalized effect", () => {
  for (const decision of ["accepted", "deferred"]) {
    const temporary = temporaryDatabase();
    const context = setup(temporary.filename);
    try {
      const prepared = prepareFinalization(context);
      const handler = prepareDependentAttentionHandler(context, prepared, decision);
      context.coordinator.finalizeGitEvidenceDependency(
        prepared.execution.executionId,
        finalizeArgs(context, prepared),
        taskPrincipal(context.actors.verifier),
      );
      if (decision === "deferred") {
        assert.throws(
          () => context.coordinator.commitFinalizedDependencyAttentionHandler(
            handler.claimEpoch,
            {
              dependencyId: context.dependencyId,
              expectedClaimRevision: 1,
              expectedCursorRevision: 1,
            },
            handler.principal,
          ),
          { code: "threadmesh_finalized_dependency_attention_decision_mismatch" },
        );
        assert.equal(
          context.coordinator.getAttentionCursor(
            taskRef(context.dependent), handler.principal,
          ).cursor.committedCursor,
          0,
        );
      } else {
        const committed = context.coordinator.commitFinalizedDependencyAttentionHandler(
          handler.claimEpoch,
          {
            dependencyId: context.dependencyId,
            expectedClaimRevision: 1,
            expectedCursorRevision: 1,
          },
          handler.principal,
        );
        assert.equal(committed.replay, false);
        assert.equal(committed.claim.state, "promoted");
        assert.equal(committed.cursor.committedCursor, 1);
        assert.equal(
          context.coordinator.getTurnExecution(
            committed.claim.turnExecutionId, handler.principal,
          ).intent.state,
          "completed-turn-bound",
        );
        const replay = context.coordinator.commitFinalizedDependencyAttentionHandler(
          handler.claimEpoch,
          {
            dependencyId: context.dependencyId,
            expectedClaimRevision: 1,
            expectedCursorRevision: 2,
          },
          handler.principal,
        );
        assert.equal(replay.replay, true);
        assert.equal(replay.cursor.committedCursor, 1);
      }
    } finally {
      context.coordinator.close();
      temporary.cleanup();
    }
  }
});

test("unbound, mismatched, revoked, stale, altered, and unpromoted inputs fail closed", () => {
  for (const variant of [
    "unbound", "wrong-edge", "revoked", "stale", "altered-result",
    "started-turn", "unpromoted-prefix",
  ]) {
    const temporary = temporaryDatabase();
    const context = setup(temporary.filename);
    try {
      const prepared = prepareFinalization(context);
      if (variant === "unbound") {
        context.coordinator.db.prepare(
          "DELETE FROM git_evidence_dependency_bindings WHERE chain_id = ?",
        ).run(context.requirement.chainId);
      }
      if (variant === "stale") {
        context.coordinator.db.prepare(
          `UPDATE task_metadata SET checkpoint = 'changed'
           WHERE task_id = ? AND incarnation_id = ?`,
        ).run(context.dependent.taskId, context.dependent.incarnationId);
      }
      if (variant === "revoked") {
        context.coordinator.revokeDependencyEdge(context.dependencyId, 1, owner);
      }
      if (variant === "unpromoted-prefix") {
        const implementationDigest = context.payloads.implementation.toolCallDigest;
        context.coordinator.db.prepare(
          `UPDATE turn_execution_intents
           SET state = 'completed-turn-bound',
               intent_json = json_remove(json_set(
                 intent_json, '$.state', 'completed-turn-bound'
               ), '$.promotion')
           WHERE execution_id = (
             SELECT execution_id FROM turn_tool_actions
             WHERE action_digest = ?
           )`,
        ).run(implementationDigest);
      }
      if (variant === "started-turn") {
        context.coordinator.db.prepare(
          `UPDATE turn_execution_intents SET state = 'started', receipt_json = NULL,
             receipt_digest = NULL, intent_json = json_set(intent_json,
             '$.state', 'started', '$.completedTurn', NULL)
           WHERE execution_id = ?`,
        ).run(prepared.execution.executionId);
      }
      const args = finalizeArgs(context, prepared,
        variant === "wrong-edge" ? { dependencyId: "dependency_other" } :
          variant === "altered-result" ? {
            response: { ...prepared.verification.response, proof: { altered: true } },
          } : {});
      assert.throws(
        () => context.coordinator.finalizeGitEvidenceDependency(
          prepared.execution.executionId,
          args,
          taskPrincipal(context.actors.verifier),
        ),
      );
      assert.equal(
        context.coordinator.inspectGitEvidenceChain(
          context.requirement.chainId, owner,
        ).revision,
        3,
        variant,
      );
      assert.equal(
        context.coordinator.getDependencyEdge(
          context.dependencyId, taskPrincipal(context.dependent),
        ).status,
        variant === "revoked" ? "revoked" : "waiting",
        variant,
      );
    } finally {
      context.coordinator.close();
      temporary.cleanup();
    }
  }
});

test("chain and edge bindings are unique and generic satisfaction cannot bypass them", () => {
  const temporary = temporaryDatabase();
  const context = setup(temporary.filename);
  try {
    assert.equal(
      context.coordinator.bindGitEvidenceDependency(
        context.requirement.chainId,
        { dependencyId: context.dependencyId, expectedVersion: 1 },
        owner,
      ).replay,
      true,
    );
    assert.throws(
      () => context.coordinator.bindGitEvidenceDependency(
        context.requirement.chainId,
        { dependencyId: "dependency_other", expectedVersion: 1 },
        owner,
      ),
      { code: "threadmesh_dependency_edge_not_found" },
    );
    context.coordinator.createDependencyEdge({
      dependencyId: "dependency_other",
      version: 1,
      edgeType: "dependency",
      prerequisite: taskRef(context.actors.verifier),
      dependent: taskRef(context.dependent),
      relationshipId: "rel_trusted_unlock",
      expectedEventType: "dependency-satisfied",
      freshness: {},
      createdAt: "2026-08-31T11:00:00.000Z",
      expiresAt: "2026-08-31T13:00:00.000Z",
    }, owner);
    assert.throws(
      () => context.coordinator.bindGitEvidenceDependency(
        context.requirement.chainId,
        { dependencyId: "dependency_other", expectedVersion: 1 },
        owner,
      ),
      { code: "threadmesh_git_evidence_dependency_binding_conflict" },
    );
    const prepared = prepareFinalization(context);
    const policy = { kind: "policy", principalId: "policy_bypass" };
    assert.throws(
      () => context.coordinator.satisfyDependencyEdge({
        dependencyId: context.dependencyId,
        expectedVersion: 1,
        event: prepared.sourceEvent,
        disposition: prepared.disposition,
      }, policy),
      { code: "threadmesh_dependency_git_evidence_finalize_required" },
    );
  } finally {
    context.coordinator.close();
    temporary.cleanup();
  }
});

test("v6 migrates append-only to v7 without changing the committed v6 checksum", () => {
  const temporary = temporaryDatabase();
  let coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.registerTask({
    taskId: "task_v6_preserved",
    incarnationId: "inc_v6_preserved_01",
    harness: "codex",
    state: "idle",
  }, owner);
  coordinator.close();
  const database = new Database(temporary.filename);
  database.pragma("foreign_keys = OFF");
  database.exec(`
    DROP TABLE git_evidence_dependency_finalizations;
    DROP TABLE git_evidence_dependency_bindings;
    DELETE FROM schema_migrations WHERE version = 7;
    PRAGMA user_version = 6;
  `);
  const v6Checksum = database.prepare(
    "SELECT checksum FROM schema_migrations WHERE version = 6",
  ).pluck().get();
  database.close();
  try {
    coordinator = new SqliteCoordinator({
      filename: temporary.filename,
      clock: () => NOW,
    });
    assert.equal(SQLITE_SCHEMA_VERSION, 7);
    assert.equal(
      v6Checksum,
      "sha256:66bdfb81983288ea288970214c831731ecd8227907867958339454a2015f4563",
    );
    assert.equal(
      SQLITE_SCHEMA_MIGRATIONS.find(({ version }) => version === 6).checksum,
      v6Checksum,
    );
    assert.equal(coordinator.storageInfo().schemaVersion, 7);
    assert.equal(
      coordinator.db.prepare(
        "SELECT state FROM tasks WHERE task_id = 'task_v6_preserved'",
      ).pluck().get(),
      "idle",
    );
    assert.deepEqual(
      coordinator.db.prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name LIKE 'git_evidence_dependency_%'
         ORDER BY name`,
      ).pluck().all(),
      [
        "git_evidence_dependency_bindings",
        "git_evidence_dependency_finalizations",
      ],
    );
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("restart rejects a tampered finalization binding", () => {
  const temporary = temporaryDatabase();
  const context = setup(temporary.filename);
  const prepared = prepareFinalization(context);
  context.coordinator.finalizeGitEvidenceDependency(
    prepared.execution.executionId,
    finalizeArgs(context, prepared),
    taskPrincipal(context.actors.verifier),
  );
  context.coordinator.close();
  const database = new Database(temporary.filename);
  database.prepare(
    `UPDATE git_evidence_dependency_finalizations
     SET effect_digest = ? WHERE chain_id = ?`,
  ).run(digest("tampered-effect"), context.requirement.chainId);
  database.close();
  try {
    assert.throws(
      () => new SqliteCoordinator({
        filename: temporary.filename,
        clock: () => NOW,
        verificationTrustAnchors: [context.signing.trustAnchor],
      }),
      { code: "threadmesh_git_evidence_dependency_storage_tampered" },
    );
  } finally {
    temporary.cleanup();
  }
});

test("historical replay remains valid after the bound edge naturally expires", () => {
  const temporary = temporaryDatabase();
  const context = setup(temporary.filename);
  const prepared = prepareFinalization(context);
  context.coordinator.finalizeGitEvidenceDependency(
    prepared.execution.executionId,
    finalizeArgs(context, prepared),
    taskPrincipal(context.actors.verifier),
  );
  context.coordinator.close();
  const reopened = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => Date.parse("2026-08-31T14:00:00.000Z"),
    verificationTrustAnchors: [context.signing.trustAnchor],
  });
  try {
    assert.equal(
      reopened.getDependencyEdge(
        context.dependencyId, taskPrincipal(context.dependent),
      ).status,
      "satisfied",
    );
    assert.equal(
      reopened.inspectGitEvidenceChain(context.requirement.chainId, owner)
        .trustedComplete,
      true,
    );
  } finally {
    reopened.close();
    temporary.cleanup();
  }
});

test("restart rejects tampered satisfaction and disposition timestamps", () => {
  for (const variant of ["satisfaction", "disposition"]) {
    const temporary = temporaryDatabase();
    const context = setup(temporary.filename);
    const prepared = prepareFinalization(context);
    context.coordinator.finalizeGitEvidenceDependency(
      prepared.execution.executionId,
      finalizeArgs(context, prepared),
      taskPrincipal(context.actors.verifier),
    );
    context.coordinator.close();
    const database = new Database(temporary.filename);
    if (variant === "satisfaction") {
      database.prepare(
        `UPDATE dependency_satisfactions SET satisfied_at = ?
         WHERE dependency_id = ?`,
      ).run("2026-08-31T12:01:00.000Z", context.dependencyId);
    } else {
      database.prepare(
        `UPDATE dependency_satisfactions
         SET disposition_json = json_set(disposition_json, '$.updatedAt', ?)
         WHERE dependency_id = ?`,
      ).run("2026-08-31T12:01:00.000Z", context.dependencyId);
    }
    database.close();
    try {
      assert.throws(
        () => new SqliteCoordinator({
          filename: temporary.filename,
          clock: () => Date.parse("2026-08-31T14:00:00.000Z"),
          verificationTrustAnchors: [context.signing.trustAnchor],
        }),
        { code: "threadmesh_git_evidence_dependency_storage_tampered" },
        variant,
      );
    } finally {
      temporary.cleanup();
    }
  }
});

test("a late satisfaction write failure rolls back final evidence and turn promotion", () => {
  const temporary = temporaryDatabase();
  const context = setup(temporary.filename);
  try {
    const prepared = prepareFinalization(context);
    context.coordinator.db.exec(`
      CREATE TRIGGER reject_trusted_unlock_satisfaction
      BEFORE INSERT ON dependency_satisfactions
      BEGIN
        SELECT RAISE(ABORT, 'injected-late-failure');
      END;
    `);
    assert.throws(
      () => context.coordinator.finalizeGitEvidenceDependency(
        prepared.execution.executionId,
        finalizeArgs(context, prepared),
        taskPrincipal(context.actors.verifier),
      ),
      /injected-late-failure/u,
    );
    assert.equal(
      context.coordinator.inspectGitEvidenceChain(
        context.requirement.chainId, owner,
      ).revision,
      3,
    );
    assert.equal(
      context.coordinator.getTurnExecution(
        prepared.execution.executionId,
        taskPrincipal(context.actors.verifier),
      ).intent.state,
      "completed-turn-bound",
    );
    assert.equal(
      context.coordinator.db.prepare(
        "SELECT COUNT(*) FROM git_evidence_dependency_finalizations",
      ).pluck().get(),
      0,
    );
  } finally {
    context.coordinator.close();
    temporary.cleanup();
  }
});
