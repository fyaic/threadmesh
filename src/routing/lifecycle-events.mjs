import {
  assertProtocolObject,
  codedError,
  verifyExternallyVerifiedDisposition,
} from "../protocol-validator.mjs";
import { evaluateRelationshipPolicy } from "../policy/relationship-policy.mjs";

export const LIFECYCLE_EVENT_TYPES = Object.freeze({
  COMPLETED: "completed",
  BLOCKED: "blocked",
  NEEDS_INPUT: "needs-input",
  REVIEW_FAILED: "review-failed",
  ARTIFACT_READY: "artifact-ready",
  DEPENDENCY_SATISFIED: "dependency-satisfied",
});

export const ATTENTION_ROUTE_REASON_CODES = Object.freeze({
  OFFER_AUTHORIZED: "attention-offer-authorized",
  TARGET_NOT_RELEVANT: "attention-target-not-relevant",
  EVENT_TYPE_NOT_SUBSCRIBED: "attention-event-type-not-subscribed",
  EVENT_EXPIRED: "attention-event-expired",
  STALE_RUN: "attention-stale-run",
  STALE_OBJECTIVE: "attention-stale-objective",
  STALE_CHECKPOINT: "attention-stale-checkpoint",
  STALE_INCARNATION: "attention-stale-incarnation",
  ROUTE_UNAUTHORIZED: "attention-route-unauthorized",
  ALREADY_OFFERED: "attention-already-offered",
});

export const DEPENDENCY_EFFECT_REASON_CODES = Object.freeze({
  NOT_APPLICABLE: "dependency-event-not-applicable",
  EDGE_REQUIRED: "dependency-edge-required",
  EDGE_MISMATCH: "dependency-edge-mismatch",
  EDGE_INACTIVE: "dependency-edge-inactive",
  DISPOSITION_MISMATCH: "dependency-disposition-mismatch",
  RECEIVER_NOT_ACCEPTED: "dependency-receiver-not-accepted",
  VERIFICATION_REQUIRED: "dependency-external-verification-required",
  ATTESTATION_UNTRUSTED: "dependency-attestation-untrusted",
  VERIFIED: "dependency-satisfied-verified",
  ALREADY_SATISFIED: "dependency-already-satisfied",
});

export const DEPENDENCY_EDGE_DIRECTION =
  "dependencyEdge.prerequisite -> event.sender; dependencyEdge.dependent -> event.target";

const EVENT_TYPES = new Set(Object.values(LIFECYCLE_EVENT_TYPES));
const EVENT_KEYS = new Set([
  "eventType",
  "messageId",
  "sender",
  "target",
  "relationshipId",
  "content",
  "reason",
  "evidenceRefs",
  "freshness",
  "causality",
  "createdAt",
  "expiresAt",
]);
const REQUIRED_EVENT_KEYS = [
  "eventType",
  "messageId",
  "sender",
  "target",
  "relationshipId",
  "content",
  "reason",
  "freshness",
  "createdAt",
  "expiresAt",
];

const MESSAGE_TYPES = Object.freeze({
  [LIFECYCLE_EVENT_TYPES.COMPLETED]: "result",
  [LIFECYCLE_EVENT_TYPES.BLOCKED]: "state-update",
  [LIFECYCLE_EVENT_TYPES.NEEDS_INPUT]: "question",
  [LIFECYCLE_EVENT_TYPES.REVIEW_FAILED]: "observation",
  [LIFECYCLE_EVENT_TYPES.ARTIFACT_READY]: "result",
  [LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED]: "state-update",
});

function lifecycleError(detail) {
  return codedError("threadmesh_lifecycle_event_invalid", detail);
}

function sameTaskRef(left, right) {
  return (
    left?.taskId === right?.taskId &&
    left?.incarnationId === right?.incarnationId
  );
}

function validOptionalTimestamp(value) {
  return value === undefined || Number.isFinite(Date.parse(value));
}

function dependencyEdgeMatchesEvent(edge, event) {
  return (
    edge?.edgeType === "dependency" &&
    typeof edge.dependencyId === "string" &&
    edge.dependencyId.length > 0 &&
    edge.dependencyId.length <= 200 &&
    Number.isInteger(edge.version) &&
    edge.version >= 1 &&
    sameTaskRef(edge.prerequisite, event.sender) &&
    sameTaskRef(edge.dependent, event.target) &&
    (edge.relationshipId === undefined || edge.relationshipId === event.relationshipId) &&
    (edge.expectedEventType === undefined || edge.expectedEventType === event.eventType) &&
    validOptionalTimestamp(edge.expiresAt) &&
    validOptionalTimestamp(edge.revokedAt)
  );
}

function makeResult({ state, reasonCode, event, ...detail }) {
  return Object.freeze({
    state,
    reasonCode,
    eventType: event.eventType,
    messageId: event.messageId,
    ...detail,
  });
}

function projectUnchecked(event) {
  const evidenceRefs = event.evidenceRefs ?? [];
  return {
    specVersion: "0.0-draft",
    messageId: event.messageId,
    messageType: MESSAGE_TYPES[event.eventType],
    intent: "suggest",
    claimStatus:
      evidenceRefs.length > 0 ? "evidence-referenced" : "sender-asserted",
    sender: { ...event.sender },
    target: { ...event.target },
    relationshipId: event.relationshipId,
    content: `ThreadMesh lifecycle event: ${event.eventType}\n\n${event.content}`,
    reason: event.reason,
    ...(evidenceRefs.length > 0 ? { evidenceRefs: [...evidenceRefs] } : {}),
    freshness: { ...event.freshness },
    ...(event.causality ? { causality: { ...event.causality } } : {}),
    delivery: {
      requestedMode: "checkpoint-offer",
      requiresDisposition: true,
    },
    createdAt: event.createdAt,
    expiresAt: event.expiresAt,
  };
}

/**
 * Validate the product-level event and its lossless projection onto the current
 * protocol envelope. No lifecycle-specific protocol intent is introduced.
 */
export function assertLifecycleEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw lifecycleError("event must be an object");
  }
  for (const key of Object.keys(event)) {
    if (!EVENT_KEYS.has(key)) throw lifecycleError(`unknown property: ${key}`);
  }
  for (const key of REQUIRED_EVENT_KEYS) {
    if (!Object.hasOwn(event, key)) throw lifecycleError(`missing property: ${key}`);
  }
  if (!EVENT_TYPES.has(event.eventType)) {
    throw lifecycleError(`unsupported eventType: ${event.eventType}`);
  }
  try {
    assertProtocolObject("envelope", projectUnchecked(event));
  } catch (error) {
    throw lifecycleError(error.message);
  }
  return event;
}

export function projectLifecycleEventToEnvelope(event) {
  assertLifecycleEvent(event);
  return Object.freeze(projectUnchecked(event));
}

function freshnessFailure(event, targetTask, now) {
  if (Date.parse(event.expiresAt) <= now) {
    return ATTENTION_ROUTE_REASON_CODES.EVENT_EXPIRED;
  }
  if (
    event.freshness.expectedRunId !== undefined &&
    event.freshness.expectedRunId !== targetTask?.runId
  ) {
    return ATTENTION_ROUTE_REASON_CODES.STALE_RUN;
  }
  if (
    event.freshness.expectedObjectiveVersion !== undefined &&
    event.freshness.expectedObjectiveVersion !== targetTask?.objectiveVersion
  ) {
    return ATTENTION_ROUTE_REASON_CODES.STALE_OBJECTIVE;
  }
  if (
    event.freshness.expectedCheckpoint !== undefined &&
    event.freshness.expectedCheckpoint !== targetTask?.checkpoint
  ) {
    return ATTENTION_ROUTE_REASON_CODES.STALE_CHECKPOINT;
  }
  return null;
}

/**
 * Decide whether an event may be offered to a receiver. This function does not
 * accept the event on the receiver's behalf and cannot unlock dependencies.
 */
export function evaluateAttentionRoute({
  event,
  receiverTask,
  subscribedEventTypes = Object.values(LIFECYCLE_EVENT_TYPES),
  seenMessageIds = [],
  grant,
  currentGrant = grant,
  sourceTask,
  targetTask,
  now,
}) {
  assertLifecycleEvent(event);
  if (!Number.isFinite(now)) throw lifecycleError("now must be finite epoch milliseconds");
  if (!sameTaskRef(event.target, receiverTask)) {
    return makeResult({
      state: "ignored",
      reasonCode: ATTENTION_ROUTE_REASON_CODES.TARGET_NOT_RELEVANT,
      event,
      offer: false,
    });
  }
  if (
    !Array.isArray(subscribedEventTypes) ||
    !subscribedEventTypes.every((type) => EVENT_TYPES.has(type))
  ) {
    throw lifecycleError("subscribedEventTypes must contain known event types");
  }
  if (!subscribedEventTypes.includes(event.eventType)) {
    return makeResult({
      state: "ignored",
      reasonCode: ATTENTION_ROUTE_REASON_CODES.EVENT_TYPE_NOT_SUBSCRIBED,
      event,
      offer: false,
    });
  }

  const envelope = projectLifecycleEventToEnvelope(event);
  const policy = evaluateRelationshipPolicy({
    envelope,
    grant,
    currentGrant,
    sourceTask,
    targetTask,
    now,
  });
  if (policy.decision !== "allow") {
    const staleIncarnation = policy.internalReasonCode === "stale-incarnation";
    return makeResult({
      state: staleIncarnation ? "stale" : "denied",
      reasonCode: staleIncarnation
        ? ATTENTION_ROUTE_REASON_CODES.STALE_INCARNATION
        : ATTENTION_ROUTE_REASON_CODES.ROUTE_UNAUTHORIZED,
      event,
      offer: false,
      policyReasonCode: policy.internalReasonCode,
    });
  }

  const staleReason = freshnessFailure(event, targetTask, now);
  if (staleReason) {
    return makeResult({
      state: "stale",
      reasonCode: staleReason,
      event,
      offer: false,
    });
  }
  const seen =
    seenMessageIds instanceof Set
      ? seenMessageIds.has(event.messageId)
      : Array.isArray(seenMessageIds) && seenMessageIds.includes(event.messageId);
  if (seen) {
    return makeResult({
      state: "idempotent",
      reasonCode: ATTENTION_ROUTE_REASON_CODES.ALREADY_OFFERED,
      event,
      offer: false,
      idempotent: true,
    });
  }
  if (!(seenMessageIds instanceof Set) && !Array.isArray(seenMessageIds)) {
    throw lifecycleError("seenMessageIds must be an array or Set");
  }
  return makeResult({
    state: "offered",
    reasonCode: ATTENTION_ROUTE_REASON_CODES.OFFER_AUTHORIZED,
    event,
    offer: true,
    envelope,
    grantId: policy.grantId,
    grantVersion: policy.grantVersion,
  });
}

/**
 * Evaluate the semantic effect after delivery. Delivery, acceptance, observed
 * effect, and trusted verification remain separate states by design.
 */
export function evaluateDependencyEffect({
  event,
  disposition,
  trustAnchors,
  dependencyEdge,
  currentDependencyEdge = dependencyEdge,
  now,
  previouslySatisfied = false,
}) {
  assertLifecycleEvent(event);
  if (event.eventType !== LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED) {
    return makeResult({
      state: "not-applicable",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.NOT_APPLICABLE,
      event,
      satisfied: false,
      unlock: false,
    });
  }
  if (!Number.isFinite(now)) throw lifecycleError("now must be finite epoch milliseconds");
  if (!dependencyEdge) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.EDGE_REQUIRED,
      event,
      satisfied: false,
      unlock: false,
    });
  }
  // This product edge is deliberately distinct from a relationship grant.
  // The protocol schema keeps its existing meaning: grant.source depends on
  // grant.target, and that grant authorizes only source -> target envelopes.
  // A prerequisite -> dependent lifecycle event therefore binds to an explicit
  // product edge; evaluateAttentionRoute validates its transport grant separately.
  if (!dependencyEdgeMatchesEvent(dependencyEdge, event)) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH,
      event,
      satisfied: false,
      unlock: false,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (
    dependencyEdge.revokedAt ||
    !currentDependencyEdge ||
    currentDependencyEdge.revokedAt ||
    currentDependencyEdge.dependencyId !== dependencyEdge.dependencyId ||
    currentDependencyEdge.version !== dependencyEdge.version ||
    (dependencyEdge.expiresAt && Date.parse(dependencyEdge.expiresAt) <= now) ||
    (currentDependencyEdge.expiresAt && Date.parse(currentDependencyEdge.expiresAt) <= now)
  ) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.EDGE_INACTIVE,
      event,
      satisfied: false,
      unlock: false,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (!dependencyEdgeMatchesEvent(currentDependencyEdge, event)) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH,
      event,
      satisfied: false,
      unlock: false,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  assertProtocolObject("disposition", disposition);
  if (
    disposition.messageId !== event.messageId ||
    !sameTaskRef(disposition.receiver, event.target)
  ) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.DISPOSITION_MISMATCH,
      event,
      satisfied: false,
      unlock: false,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (disposition.decision.state !== "accepted") {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.RECEIVER_NOT_ACCEPTED,
      event,
      satisfied: false,
      unlock: false,
      decisionState: disposition.decision.state,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (disposition.outcome.state !== "externally-verified") {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.VERIFICATION_REQUIRED,
      event,
      satisfied: false,
      unlock: false,
      outcomeState: disposition.outcome.state,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (
    disposition.outcome.verificationAttestations.some(
      (attestation) =>
        attestation.subject.senderIncarnationId !== event.sender.incarnationId,
    )
  ) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.DISPOSITION_MISMATCH,
      event,
      satisfied: false,
      unlock: false,
      verificationErrorCode: "threadmesh_verification_subject_mismatch",
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  try {
    verifyExternallyVerifiedDisposition(disposition, trustAnchors);
  } catch (error) {
    return makeResult({
      state: "not-satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.ATTESTATION_UNTRUSTED,
      event,
      satisfied: false,
      unlock: false,
      verificationErrorCode: error.code ?? "threadmesh_verification_failed",
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  if (previouslySatisfied) {
    return makeResult({
      state: "satisfied",
      reasonCode: DEPENDENCY_EFFECT_REASON_CODES.ALREADY_SATISFIED,
      event,
      satisfied: true,
      unlock: false,
      idempotent: true,
      dependencyId: dependencyEdge.dependencyId,
    });
  }
  return makeResult({
    state: "satisfied",
    reasonCode: DEPENDENCY_EFFECT_REASON_CODES.VERIFIED,
    event,
    satisfied: true,
    unlock: true,
    dependencyId: dependencyEdge.dependencyId,
  });
}
