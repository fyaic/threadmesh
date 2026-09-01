import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { verificationAttestationDigest } from "../protocol-validator.mjs";
import {
  LIFECYCLE_EVENT_TYPES,
  DEPENDENCY_EFFECT_REASON_CODES,
  evaluateAttentionRoute,
  projectLifecycleEventToEnvelope,
} from "../routing/lifecycle-events.mjs";
import { AttentionWakeCursorConsumer } from "../routing/attention-wake.mjs";
import {
  projectAttentionSnapshot,
  renderAttentionSnapshot,
} from "../inspector/attention-snapshot.mjs";

const NOW = Date.parse("2026-08-31T09:00:00.000Z");
const CREATED_AT = "2026-08-31T09:00:00.000Z";
const EXPIRES_AT = "2026-08-31T09:05:00.000Z";
const OWNER = Object.freeze({ kind: "user", principalId: "threadmesh-demo-owner" });

const TASKS = Object.freeze({
  implementation: Object.freeze({
    taskId: "task_demo_implementation",
    incarnationId: "inc_demo_implementation01",
    harness: "demo-implementation",
  }),
  review: Object.freeze({
    taskId: "task_demo_review",
    incarnationId: "inc_demo_review000001",
    harness: "demo-review",
  }),
  fix: Object.freeze({
    taskId: "task_demo_fix",
    incarnationId: "inc_demo_fix0000001",
    harness: "demo-fix",
  }),
  dependent: Object.freeze({
    taskId: "task_demo_dependent",
    incarnationId: "inc_demo_dependent0001",
    harness: "demo-dependent",
  }),
  activeReceiver: Object.freeze({
    taskId: "task_demo_active_receiver",
    incarnationId: "inc_demo_active_receiver01",
    harness: "demo-active-receiver",
  }),
});

const STEPS = Object.freeze([
  Object.freeze({
    eventType: LIFECYCLE_EVENT_TYPES.ARTIFACT_READY,
    messageId: "msg_demo_artifact_initial01",
    relationshipId: "rel_demo_implementation_review",
    grantId: "grant_demo_implementation_review",
    source: "implementation",
    target: "review",
    content: "Implementation artifact v1 is ready for review.",
    reason: "Review can begin from the isolated v1 artifact.",
  }),
  Object.freeze({
    eventType: LIFECYCLE_EVENT_TYPES.REVIEW_FAILED,
    messageId: "msg_demo_review_failed0001",
    relationshipId: "rel_demo_review_fix",
    grantId: "grant_demo_review_fix",
    source: "review",
    target: "fix",
    content: "Review found a deterministic validation failure in artifact v1.",
    reason: "A fix task is authorized to address the recorded review failure.",
  }),
  Object.freeze({
    eventType: LIFECYCLE_EVENT_TYPES.ARTIFACT_READY,
    messageId: "msg_demo_artifact_fixed0001",
    relationshipId: "rel_demo_fix_review",
    grantId: "grant_demo_fix_review",
    source: "fix",
    target: "review",
    content: "Implementation artifact v2 is ready after the review fix.",
    reason: "Review can validate the fixed artifact without a manual relay.",
  }),
  Object.freeze({
    eventType: LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED,
    messageId: "msg_demo_dependency_ready01",
    relationshipId: "rel_demo_review_dependent",
    grantId: "grant_demo_review_dependent",
    source: "review",
    target: "dependent",
    content: "The reviewed v2 artifact satisfies the downstream dependency.",
    reason: "The dependent task may proceed after trusted verification.",
  }),
]);

const ACTIVE_CHECKPOINT_STEP = Object.freeze({
  eventType: LIFECYCLE_EVENT_TYPES.COMPLETED,
  messageId: "msg_demo_active_checkpoint01",
  relationshipId: "rel_demo_review_active_receiver",
  grantId: "grant_demo_review_active_receiver",
  source: "review",
  target: "activeReceiver",
  content: "Review completed while the receiving session is still working.",
  reason: "Retain the result for the receiver's next safe checkpoint.",
});

const GRANT_STEPS = Object.freeze([...STEPS, ACTIVE_CHECKPOINT_STEP]);

const DEPENDENCY_EDGE = Object.freeze({
  dependencyId: "dependency_demo_reviewed_artifact",
  version: 1,
  edgeType: "dependency",
  prerequisite: taskRef(TASKS.review),
  dependent: taskRef(TASKS.dependent),
  relationshipId: STEPS.at(-1).relationshipId,
  expectedEventType: LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED,
  freshness: {
    expectedRunId: "run_demo_dependent",
    expectedObjectiveVersion: 1,
    expectedCheckpoint: "checkpoint_demo_dependent",
  },
  createdAt: CREATED_AT,
  expiresAt: "2026-08-31T10:00:00.000Z",
});

function taskRef(task) {
  return { taskId: task.taskId, incarnationId: task.incarnationId };
}

function taskPrincipal(task) {
  return { kind: "task", ...taskRef(task) };
}

function eventFor(step) {
  const source = TASKS[step.source];
  const target = TASKS[step.target];
  return {
    eventType: step.eventType,
    messageId: step.messageId,
    sender: { ...source, actorType: "agent" },
    target: { ...target },
    relationshipId: step.relationshipId,
    content: step.content,
    reason: step.reason,
    freshness: {
      expectedRunId: `run_demo_${step.target}`,
      expectedObjectiveVersion: 1,
      expectedCheckpoint: `checkpoint_demo_${step.target}`,
    },
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
}

function installDemoState(coordinator) {
  for (const [name, task] of Object.entries(TASKS)) {
    coordinator.registerTask({
      ...task,
      state: name === "activeReceiver" ? "running" : "waiting",
      runtime: {
        runId: `run_demo_${name}`,
        objectiveVersion: 1,
        checkpoint: `checkpoint_demo_${name}`,
      },
      adapterRef: {
        kind: "codex-app-server",
        threadId: `thread_demo_${name}`,
        snapshotDigest: `sha256:${"c".repeat(64)}`,
      },
    }, OWNER);
  }

  const grants = new Map();
  for (const step of GRANT_STEPS) {
    const grant = coordinator.issueGrant({
      specVersion: "0.0-draft",
      grantId: step.grantId,
      grantVersion: 1,
      relationshipId: step.relationshipId,
      relationshipType: "peer",
      source: taskRef(TASKS[step.source]),
      target: taskRef(TASKS[step.target]),
      allowedIntents: ["suggest"],
      allowedDeliveryModes: ["checkpoint-offer"],
      summaryVisibility: "coordination",
      structuredGateResponses: false,
      createdAt: CREATED_AT,
      expiresAt: "2026-08-31T10:00:00.000Z",
    }, {
      decisionId: `decision_${step.relationshipId.slice(4)}`,
      authenticationId: "authn_demo_owner0001",
      decidedAt: CREATED_AT,
    }, OWNER);
    grants.set(step.relationshipId, grant);
  }
  coordinator.createDependencyEdge(DEPENDENCY_EDGE, OWNER);
  return grants;
}

function retainForActiveCheckpoint(coordinator, grant) {
  const event = eventFor(ACTIVE_CHECKPOINT_STEP);
  const source = TASKS[ACTIVE_CHECKPOINT_STEP.source];
  const target = TASKS[ACTIVE_CHECKPOINT_STEP.target];
  const receiverBefore = coordinator.getTask(taskRef(target), OWNER);
  const route = evaluateAttentionRoute({
    event,
    receiverTask: taskRef(target),
    grant,
    currentGrant: grant,
    sourceTask: { ...source, retiredAt: null },
    targetTask: {
      ...target,
      retiredAt: null,
      runId: `run_demo_${ACTIVE_CHECKPOINT_STEP.target}`,
      objectiveVersion: 1,
      checkpoint: `checkpoint_demo_${ACTIVE_CHECKPOINT_STEP.target}`,
    },
    now: NOW,
  });
  if (!route.offer) throw new Error(`demo_active_checkpoint_route_failed:${route.reasonCode}`);

  const submitted = coordinator.submit(
    projectLifecycleEventToEnvelope(event),
    taskPrincipal(source),
  );
  const retained = coordinator.inspectMessage(
    source.incarnationId,
    event.messageId,
    taskPrincipal(target),
  );
  const receiverAfter = coordinator.getTask(taskRef(target), OWNER);
  if (
    receiverBefore.state !== "running" ||
    receiverAfter.state !== "running" ||
    retained.disposition.decision !== "pending"
  ) {
    throw new Error("demo_active_receiver_was_interrupted");
  }

  const quietRoute = evaluateAttentionRoute({
    event,
    receiverTask: taskRef(target),
    subscribedEventTypes: [LIFECYCLE_EVENT_TYPES.BLOCKED],
    grant,
    currentGrant: grant,
    sourceTask: { ...source, retiredAt: null },
    targetTask: {
      ...target,
      retiredAt: null,
      runId: `run_demo_${ACTIVE_CHECKPOINT_STEP.target}`,
      objectiveVersion: 1,
      checkpoint: `checkpoint_demo_${ACTIVE_CHECKPOINT_STEP.target}`,
    },
    now: NOW,
  });
  if (quietRoute.offer) throw new Error("demo_unsubscribed_event_was_offered");

  return {
    eventType: event.eventType,
    requestedDeliveryMode: route.envelope.delivery.requestedMode,
    delivery: submitted.disposition.delivery,
    receiverDecision: retained.disposition.decision,
    receiverStateBefore: receiverBefore.state,
    receiverStateAfter: receiverAfter.state,
    steerRequests: 0,
    interruptRequests: 0,
    nativeTurnStarts: 0,
    unsubscribedOffers: quietRoute.offer ? 1 : 0,
    unsubscribedReasonCode: quietRoute.reasonCode,
  };
}

function createDemoVerifier() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const keyId = "threadmesh-demo://verifier/keys/1";
  const policyId = "threadmesh-demo://policy/trusted-verifiers/v1";
  return {
    privateKey,
    trustAnchors: [{
      keyId,
      algorithm: "ed25519",
      actorId: "threadmesh-demo-verifier",
      trustDomain: "threadmesh-demo://verifier",
      policyId,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    }],
  };
}

function makeVerifiedDisposition(event, persisted, verifier) {
  const trustAnchor = verifier.trustAnchors[0];
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: "att_demo_dependency0001",
    verifier: {
      actorType: "service",
      actorId: "threadmesh-demo-verifier",
      authenticationId: "authn_demo_verifier01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      messageId: event.messageId,
      senderIncarnationId: event.sender.incarnationId,
      receiver: taskRef(event.target),
      claimType: "artifact-state",
      claimDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    method: "independent-reproduction",
    evidenceDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    verifiedAt: "2026-08-31T09:02:00.000Z",
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: "decision_demo_verifier01",
      decision: "trusted",
      decidedAt: "2026-08-31T09:02:00.000Z",
    },
  };
  const signedPayloadDigest = verificationAttestationDigest(attestation);
  const signature = sign(null, Buffer.from(signedPayloadDigest, "utf8"), verifier.privateKey)
    .toString("base64url");
  const verifiedAttestation = {
    ...attestation,
    signedPayloadDigest,
    proof: { algorithm: "ed25519", keyId: trustAnchor.keyId, signature },
  };
  return {
      specVersion: "0.0-draft",
      dispositionId: "dsp_demo_dependency0001",
      messageId: event.messageId,
      receiver: taskRef(event.target),
      revision: persisted.revision + 1,
      delivery: {
        state: persisted.delivery,
        observedAt: "2026-08-31T09:01:30.000Z",
      },
      decision: {
        state: persisted.decision,
        decidedAt: "2026-08-31T09:01:00.000Z",
        decidedBy: { actorType: "agent", task: taskRef(event.target) },
        reasonCode: persisted.decisionReasonCode,
      },
      outcome: {
        state: "externally-verified",
        observedAt: "2026-08-31T09:02:00.000Z",
        evidenceRefs: ["threadmesh-demo://verifier/evidence/dependency-v2"],
        verificationAttestations: [verifiedAttestation],
      },
      updatedAt: "2026-08-31T09:02:00.000Z",
  };
}

async function routeAndAccept(coordinator, step, grant, cursors) {
  const event = eventFor(step);
  const source = TASKS[step.source];
  const target = TASKS[step.target];
  const route = evaluateAttentionRoute({
    event,
    receiverTask: taskRef(target),
    grant,
    currentGrant: grant,
    sourceTask: { ...source, retiredAt: null },
    targetTask: {
      ...target,
      retiredAt: null,
      runId: `run_demo_${step.target}`,
      objectiveVersion: 1,
      checkpoint: `checkpoint_demo_${step.target}`,
    },
    now: NOW,
  });
  if (!route.offer) throw new Error(`demo_attention_route_failed:${route.reasonCode}`);

  coordinator.submit(projectLifecycleEventToEnvelope(event), taskPrincipal(source));
  let disposition;
  const consumer = new AttentionWakeCursorConsumer({
    afterCursor: cursors.get(step.target) ?? 0,
    readPage: (options) => coordinator.waitTask(
      taskRef(target),
      options,
      taskPrincipal(target),
    ),
    isRelevant: (auditEvent) =>
      auditEvent.eventType === "message-durably-received" &&
      auditEvent.messageId === event.messageId,
    handleEvent: () => {
      const message = coordinator.inspectMessage(
        source.incarnationId,
        event.messageId,
        taskPrincipal(target),
      );
      const claim = coordinator.claimPending(
        source.incarnationId,
        event.messageId,
        message.disposition.revision,
        taskPrincipal(target),
      );
      disposition = coordinator.acknowledgePending(
        source.incarnationId,
        event.messageId,
        claim.claimToken,
        "accepted",
        message.disposition.revision,
        taskPrincipal(target),
      );
      return { state: "accepted", reasonCode: "receiver-accepted" };
    },
  });
  // No wake hint is supplied: the durable cursor path must recover the event
  // even when the best-effort wake is dropped.
  const reconciliation = await consumer.reconcile();
  cursors.set(step.target, reconciliation.nextCursor);
  if (!disposition) throw new Error("demo_durable_event_not_reconciled");

  if (event.eventType === LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED) {
    const prepared = coordinator.prepareAdapterSubmission(
      source.incarnationId,
      event.messageId,
      disposition.revision,
      taskPrincipal(target),
    );
    coordinator.beginAdapterSubmission(
      prepared.submission.submissionId,
      disposition.revision,
      taskPrincipal(target),
    );
    const recorded = coordinator.recordAdapterReceipt(
      prepared.submission.submissionId,
      disposition.revision,
      {
        adapterOperationId: "operation_demo_dependency_delivery01",
        acceptedAt: "2026-08-31T09:01:30.000Z",
        evidenceRefs: ["threadmesh-demo://adapter/receipts/dependency-delivery"],
      },
      taskPrincipal(target),
    );
    disposition = recorded.disposition;
  }
  return { event, route, disposition, reconciliation };
}

/**
 * Run a deterministic, no-model attention-routing scenario in an isolated
 * SQLite state directory. The returned object intentionally excludes the
 * ephemeral path and cryptographic material so repeated successful runs have
 * byte-for-byte stable JSON output.
 */
export async function runAttentionRouterDemo({ temporaryParent = os.tmpdir(), onStep } = {}) {
  const stateDirectory = fs.mkdtempSync(path.join(temporaryParent, "threadmesh-demo-"));
  const filename = path.join(stateDirectory, "attention-router.sqlite");
  let coordinator;
  let failure;
  let result;
  let cleanup = { attempted: false, complete: false };

  try {
    const verifier = createDemoVerifier();
    coordinator = new SqliteCoordinator({
      filename,
      clock: () => NOW,
      verificationTrustAnchors: verifier.trustAnchors,
    });
    const grants = installDemoState(coordinator);
    const results = [];
    const cursors = new Map();
    for (const step of STEPS) {
      await onStep?.(step);
      const result = await routeAndAccept(
        coordinator,
        step,
        grants.get(step.relationshipId),
        cursors,
      );
      results.push({
        eventType: result.event.eventType,
        from: step.source,
        to: step.target,
        route: result.route.reasonCode,
        receiverDecision: result.disposition.decision,
        wake: result.reconciliation.reasonCode,
      });
    }
    const activeCheckpoint = retainForActiveCheckpoint(
      coordinator,
      grants.get(ACTIVE_CHECKPOINT_STEP.relationshipId),
    );

    const dependency = results.at(-1);
    const dependencyEvent = eventFor(STEPS.at(-1));
    const finalTransportDisposition = coordinator.getDisposition(
      dependencyEvent.sender.incarnationId,
      dependencyEvent.messageId,
      taskPrincipal(TASKS.dependent),
    );
    const verifiedDisposition = makeVerifiedDisposition(
      dependencyEvent,
      finalTransportDisposition,
      verifier,
    );
    const satisfaction = coordinator.satisfyDependencyEdge({
      dependencyId: DEPENDENCY_EDGE.dependencyId,
      expectedVersion: DEPENDENCY_EDGE.version,
      event: dependencyEvent,
      disposition: verifiedDisposition,
    }, taskPrincipal(TASKS.dependent));
    if (!satisfaction.unlock) throw new Error("demo_dependency_not_verified");
    for (const name of ["implementation", "review", "fix"]) {
      const task = coordinator.getTask(taskRef(TASKS[name]), OWNER);
      coordinator.updateTaskState(taskRef(TASKS[name]), "completed", task.revision, OWNER);
    }

    coordinator.close();
    coordinator = new SqliteCoordinator({
      filename,
      clock: () => NOW,
      verificationTrustAnchors: verifier.trustAnchors,
    });
    const recoveredDependency = coordinator.getDependencyEdge(
      DEPENDENCY_EDGE.dependencyId,
      OWNER,
    );
    const recoveredDisposition = coordinator.getDisposition(
      dependencyEvent.sender.incarnationId,
      dependencyEvent.messageId,
      taskPrincipal(TASKS.dependent),
    );
    const recoveredTasks = Object.fromEntries(
      Object.entries(TASKS).map(([name, task]) => [
        name,
        coordinator.getTask(taskRef(task), OWNER),
      ]),
    );
    if (
      recoveredDependency.status !== "satisfied" ||
      recoveredDisposition.outcome !== "externally-verified" ||
      recoveredTasks.dependent.state !== "ready"
    ) {
      throw new Error("demo_dependency_restart_recovery_failed");
    }

    const inspector = projectAttentionSnapshot({
      sessions: Object.entries(recoveredTasks).map(([workstream, task]) => ({
        sessionId: task.taskId,
        taskId: task.taskId,
        workstream,
        status: task.state,
      })),
      dependencies: [{
        dependencyId: recoveredDependency.dependencyId,
        fromSessionId: TASKS.review.taskId,
        toSessionId: TASKS.dependent.taskId,
        status: "satisfied",
      }],
      events: [{
        eventId: dependencyEvent.messageId,
        dependencyId: recoveredDependency.dependencyId,
        eventType: dependencyEvent.eventType,
        payloadSummary: "Reviewed artifact v2 passed trusted external verification.",
        source: { ...dependencyEvent.sender },
        provenance: {
          authorship: "agent-authored",
          claimStatus: "sender-asserted",
        },
        occurredAt: dependencyEvent.createdAt,
      }],
      routes: [{
        routeId: `route_${dependencyEvent.messageId}`,
        dependencyId: recoveredDependency.dependencyId,
        eventId: dependencyEvent.messageId,
        state: "offered",
        reasonCode: results.at(-1).route,
        receiverDisposition: {
          delivery: recoveredDisposition.delivery,
          decision: recoveredDisposition.decision,
          decisionReasonCode: recoveredDisposition.decisionReasonCode,
          outcome: recoveredDisposition.outcome,
        },
        verificationState: "externally-verified",
        dependencyEffect: {
          state: "satisfied",
          reasonCode: DEPENDENCY_EFFECT_REASON_CODES.VERIFIED,
          unlock: true,
        },
      }],
    });

    result = {
      state: "passed",
      scenario: "attention-router",
      sequence: results,
      dependency: {
        eventType: dependency.eventType,
        state: "satisfied",
        reasonCode: DEPENDENCY_EFFECT_REASON_CODES.VERIFIED,
        unlock: true,
      },
      counters: {
        manualRelayActions: 0,
        modelPollingTurns: 0,
        incorrectUnlocks: 0,
        durableReconciliations: results.length,
      },
      comparison: {
        classification: "modeled-workflow-accounting",
        workflowHandoffs: results.length,
        manual: {
          initialKickoffs: 1,
          relayActions: results.length,
          statusChecks: results.length,
          totalUserActionsLowerBound: 1 + (results.length * 2),
        },
        threadmesh: {
          initialKickoffs: 1,
          relayActions: 0,
          statusChecks: 0,
          totalUserActions: 1,
        },
        notMeasured: ["elapsed-time", "model-tokens"],
      },
      safety: {
        activeCheckpoint,
        droppedWakeHints: results.length,
        durableReconciliations: results.length,
      },
      inspector,
      cleanup,
    };
  } catch (error) {
    failure = error;
  } finally {
    try {
      coordinator?.close();
      cleanup = { attempted: true, complete: true };
      fs.rmSync(stateDirectory, { recursive: true, force: true });
    } catch (error) {
      cleanup = {
        attempted: true,
        complete: false,
        errorCode: error?.code ?? "threadmesh_demo_cleanup_failed",
      };
    }
  }

  if (!failure && cleanup.complete) {
    return { ...result, cleanup };
  }
  const error = failure ?? new Error("threadmesh_demo_cleanup_failed");
  error.demo = {
    state: "failed",
    scenario: "attention-router",
    errorCode: error.code ?? "threadmesh_demo_failed",
    counters: { manualRelayActions: 0, modelPollingTurns: 0, incorrectUnlocks: 0 },
    cleanup,
  };
  throw error;
}

export function renderAttentionRouterDemo(result) {
  return renderAttentionSnapshot(result.inspector);
}
