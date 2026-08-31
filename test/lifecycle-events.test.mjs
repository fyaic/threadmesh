import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ATTENTION_ROUTE_REASON_CODES,
  DEPENDENCY_EDGE_DIRECTION,
  DEPENDENCY_EFFECT_REASON_CODES,
  LIFECYCLE_EVENT_TYPES,
  assertLifecycleEvent,
  evaluateAttentionRoute,
  evaluateDependencyEffect,
  projectLifecycleEventToEnvelope,
} from "../src/routing/lifecycle-events.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) =>
  JSON.parse(
    fs.readFileSync(path.join(root, "spec", "conformance", "fixtures", name), "utf8"),
  );

const NOW = Date.parse("2026-08-20T09:00:00Z");
const sender = {
  taskId: "task_sender",
  incarnationId: "inc_sender01",
  actorType: "agent",
  harness: "codex",
};
const target = {
  taskId: "task_receiver",
  incarnationId: "inc_receiver01",
  harness: "kimi-code",
};

function lifecycleEvent(overrides = {}) {
  return {
    eventType: LIFECYCLE_EVENT_TYPES.COMPLETED,
    messageId: "msg_lifecycle_completed01",
    sender: { ...sender },
    target: { ...target },
    relationshipId: "rel_sender_receiver",
    content: "Implementation and checks completed.",
    reason: "The reviewer can begin without waiting for a manual relay.",
    freshness: {
      expectedRunId: "run_receiver01",
      expectedObjectiveVersion: 4,
      expectedCheckpoint: "checkpoint-4",
    },
    createdAt: "2026-08-20T08:59:00Z",
    expiresAt: "2026-08-20T09:10:00Z",
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    grantId: "grant_sender_receiver",
    grantVersion: 1,
    relationshipId: "rel_sender_receiver",
    relationshipType: "peer",
    source: { taskId: sender.taskId, incarnationId: sender.incarnationId },
    target: { taskId: target.taskId, incarnationId: target.incarnationId },
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    structuredGateResponses: false,
    expiresAt: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function attention(overrides = {}) {
  const effectiveGrant = overrides.grant === undefined ? grant() : overrides.grant;
  return evaluateAttentionRoute({
    event: lifecycleEvent(),
    receiverTask: { ...target },
    grant: effectiveGrant,
    currentGrant: effectiveGrant,
    sourceTask: { ...sender, retiredAt: null },
    targetTask: {
      ...target,
      retiredAt: null,
      runId: "run_receiver01",
      objectiveVersion: 4,
      checkpoint: "checkpoint-4",
    },
    now: NOW,
    ...overrides,
  });
}

test("defines exactly the six product lifecycle events", () => {
  assert.deepEqual(Object.values(LIFECYCLE_EVENT_TYPES), [
    "completed",
    "blocked",
    "needs-input",
    "review-failed",
    "artifact-ready",
    "dependency-satisfied",
  ]);
});

test("strictly validates events and projects them onto the existing envelope", () => {
  for (const eventType of Object.values(LIFECYCLE_EVENT_TYPES)) {
    const event = lifecycleEvent({ eventType });
    assert.equal(assertLifecycleEvent(event), event);
    const envelope = projectLifecycleEventToEnvelope(event);
    assert.equal(envelope.intent, "suggest");
    assert.equal(envelope.delivery.requestedMode, "checkpoint-offer");
    assert.equal(envelope.delivery.requiresDisposition, true);
    assert.match(envelope.content, new RegExp(`lifecycle event: ${eventType}`));
  }
  assert.throws(
    () => assertLifecycleEvent(lifecycleEvent({ unexpected: true })),
    { code: "threadmesh_lifecycle_event_invalid" },
  );
  assert.throws(
    () => assertLifecycleEvent(lifecycleEvent({ eventType: "new-protocol-intent" })),
    { code: "threadmesh_lifecycle_event_invalid" },
  );
});

test("offers a fresh, relevant, explicitly authorized event", () => {
  const result = attention();
  assert.equal(result.state, "offered");
  assert.equal(result.reasonCode, ATTENTION_ROUTE_REASON_CODES.OFFER_AUTHORIZED);
  assert.equal(result.offer, true);
  assert.equal(result.envelope.intent, "suggest");
  assert.equal(result.grantId, "grant_sender_receiver");
});

test("ignores events for another receiver or an unsubscribed lifecycle type", () => {
  const otherReceiver = attention({
    receiverTask: { taskId: "task_other", incarnationId: "inc_other001" },
  });
  assert.deepEqual(
    [otherReceiver.state, otherReceiver.reasonCode, otherReceiver.offer],
    ["ignored", ATTENTION_ROUTE_REASON_CODES.TARGET_NOT_RELEVANT, false],
  );

  const unsubscribed = attention({ subscribedEventTypes: ["blocked"] });
  assert.deepEqual(
    [unsubscribed.state, unsubscribed.reasonCode, unsubscribed.offer],
    ["ignored", ATTENTION_ROUTE_REASON_CODES.EVENT_TYPE_NOT_SUBSCRIBED, false],
  );
});

test("does not offer expired or target-stale events", () => {
  const expired = attention({
    event: lifecycleEvent({ expiresAt: "2026-08-20T09:00:00Z" }),
  });
  assert.equal(expired.state, "stale");
  assert.equal(expired.reasonCode, ATTENTION_ROUTE_REASON_CODES.EVENT_EXPIRED);

  const stale = attention({
    event: lifecycleEvent({
      freshness: { expectedRunId: "run_old", expectedObjectiveVersion: 4 },
    }),
  });
  assert.equal(stale.state, "stale");
  assert.equal(stale.reasonCode, ATTENTION_ROUTE_REASON_CODES.STALE_RUN);
});

test("revoked and unauthorized relationships fail closed", () => {
  const revokedGrant = grant({ revokedAt: "2026-08-20T08:59:30Z" });
  const revoked = attention({ grant: revokedGrant, currentGrant: revokedGrant });
  assert.equal(revoked.state, "denied");
  assert.equal(revoked.reasonCode, ATTENTION_ROUTE_REASON_CODES.ROUTE_UNAUTHORIZED);
  assert.equal(revoked.policyReasonCode, "grant-revoked");

  const unauthorizedGrant = grant({ allowedIntents: ["notify"] });
  const unauthorized = attention({
    grant: unauthorizedGrant,
    currentGrant: unauthorizedGrant,
  });
  assert.equal(unauthorized.state, "denied");
  assert.equal(unauthorized.policyReasonCode, "intent-not-allowed");
});

test("duplicate offers are visible and idempotent", () => {
  const duplicate = attention({
    seenMessageIds: new Set(["msg_lifecycle_completed01"]),
  });
  assert.equal(duplicate.state, "idempotent");
  assert.equal(duplicate.reasonCode, ATTENTION_ROUTE_REASON_CODES.ALREADY_OFFERED);
  assert.equal(duplicate.offer, false);
  assert.equal(duplicate.idempotent, true);
});

function dependencyEvent(overrides = {}) {
  return lifecycleEvent({
    eventType: LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED,
    messageId: "msg_suggest01",
    sender: {
      taskId: "task_sender_validation",
      incarnationId: "inc_sender_validation01",
      actorType: "agent",
      harness: "codex",
    },
    target: {
      taskId: "task_validation",
      incarnationId: "inc_validation01",
      harness: "kimi-code",
    },
    relationshipId: "rel_sender_validation",
    ...overrides,
  });
}

function dependencyEdge(overrides = {}) {
  return {
    dependencyId: "dependency_sender_before_validation",
    version: 1,
    edgeType: "dependency",
    prerequisite: {
      taskId: "task_sender_validation",
      incarnationId: "inc_sender_validation01",
    },
    dependent: { taskId: "task_validation", incarnationId: "inc_validation01" },
    relationshipId: "rel_sender_validation",
    expectedEventType: "dependency-satisfied",
    expiresAt: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function dependencyEffect(overrides = {}) {
  const hasEdgeOverride = Object.hasOwn(overrides, "dependencyEdge");
  const edge = hasEdgeOverride ? overrides.dependencyEdge : dependencyEdge();
  return evaluateDependencyEffect({
    event: dependencyEvent(),
    disposition: fixture("disposition-valid-externally-verified.json"),
    trustAnchors: [fixture("verification-trust-anchor.json")],
    dependencyEdge: edge,
    currentDependencyEdge: edge,
    now: NOW,
    ...overrides,
  });
}

test("only an accepted, externally verified trusted event unlocks a dependency", () => {
  assert.equal(
    DEPENDENCY_EDGE_DIRECTION,
    "dependencyEdge.prerequisite -> event.sender; dependencyEdge.dependent -> event.target",
  );
  const result = dependencyEffect();
  assert.equal(result.state, "satisfied");
  assert.equal(result.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.VERIFIED);
  assert.equal(result.satisfied, true);
  assert.equal(result.unlock, true);
  assert.equal(result.dependencyId, "dependency_sender_before_validation");
});

test("requires a live persisted prerequisite-to-dependent product edge", () => {
  const noEdge = dependencyEffect({
    dependencyEdge: null,
    currentDependencyEdge: null,
  });
  assert.equal(noEdge.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.EDGE_REQUIRED);
  assert.equal(noEdge.unlock, false);

  const peer = dependencyEdge({ edgeType: "peer" });
  const peerResult = dependencyEffect({
    dependencyEdge: peer,
    currentDependencyEdge: peer,
  });
  assert.equal(peerResult.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH);

  const backwards = dependencyEdge({
    prerequisite: { taskId: "task_validation", incarnationId: "inc_validation01" },
    dependent: {
      taskId: "task_sender_validation",
      incarnationId: "inc_sender_validation01",
    },
  });
  const backwardsResult = dependencyEffect({
    dependencyEdge: backwards,
    currentDependencyEdge: backwards,
  });
  assert.equal(
    backwardsResult.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH,
  );

  const wrongRelationship = dependencyEdge({ relationshipId: "rel_other_edge01" });
  const wrongRelationshipResult = dependencyEffect({
    dependencyEdge: wrongRelationship,
    currentDependencyEdge: wrongRelationship,
  });
  assert.equal(
    wrongRelationshipResult.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH,
  );

  const edge = dependencyEdge();
  const mutatedCurrent = dependencyEdge({
    dependent: { taskId: "task_other", incarnationId: "inc_other001" },
  });
  const mutatedCurrentResult = dependencyEffect({
    dependencyEdge: edge,
    currentDependencyEdge: mutatedCurrent,
  });
  assert.equal(
    mutatedCurrentResult.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.EDGE_MISMATCH,
  );

  const revoked = dependencyEdge({ revokedAt: "2026-08-20T08:59:30Z" });
  const revokedResult = dependencyEffect({
    dependencyEdge: revoked,
    currentDependencyEdge: revoked,
  });
  assert.equal(revokedResult.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.EDGE_INACTIVE);
  assert.equal(revokedResult.unlock, false);
});

test("unverified, rejected, and untrusted events cannot unlock dependencies", () => {
  const verified = fixture("disposition-valid-externally-verified.json");
  const unverified = structuredClone(verified);
  unverified.outcome = { state: "not-observed" };
  const noVerification = evaluateDependencyEffect({
    event: dependencyEvent(),
    disposition: unverified,
    trustAnchors: [],
    dependencyEdge: dependencyEdge(),
    now: NOW,
  });
  assert.equal(
    noVerification.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.VERIFICATION_REQUIRED,
  );
  assert.equal(noVerification.unlock, false);

  const rejected = structuredClone(unverified);
  rejected.delivery.state = "checkpoint-offered";
  rejected.decision = {
    state: "rejected",
    decidedAt: "2026-08-20T09:00:50Z",
    decidedBy: {
      actorType: "agent",
      task: { taskId: "task_validation", incarnationId: "inc_validation01" },
    },
    reasonCode: "receiver-rejected",
  };
  const rejectedResult = evaluateDependencyEffect({
    event: dependencyEvent(),
    disposition: rejected,
    trustAnchors: [],
    dependencyEdge: dependencyEdge(),
    now: NOW,
  });
  assert.equal(
    rejectedResult.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.RECEIVER_NOT_ACCEPTED,
  );
  assert.equal(rejectedResult.unlock, false);

  const untrusted = evaluateDependencyEffect({
    event: dependencyEvent(),
    disposition: verified,
    trustAnchors: [],
    dependencyEdge: dependencyEdge(),
    now: NOW,
  });
  assert.equal(
    untrusted.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.ATTESTATION_UNTRUSTED,
  );
  assert.equal(untrusted.unlock, false);

  const wrongSender = evaluateDependencyEffect({
    event: dependencyEvent({
      sender: {
        taskId: "task_spoofed",
        incarnationId: "inc_spoofed01",
        actorType: "agent",
        harness: "codex",
      },
    }),
    disposition: verified,
    trustAnchors: [fixture("verification-trust-anchor.json")],
    dependencyEdge: dependencyEdge({
      prerequisite: { taskId: "task_spoofed", incarnationId: "inc_spoofed01" },
    }),
    now: NOW,
  });
  assert.equal(
    wrongSender.reasonCode,
    DEPENDENCY_EFFECT_REASON_CODES.DISPOSITION_MISMATCH,
  );
  assert.equal(wrongSender.unlock, false);
});

test("dependency effects are idempotent and other event types are inert", () => {
  const disposition = fixture("disposition-valid-externally-verified.json");
  const trustAnchors = [fixture("verification-trust-anchor.json")];
  const repeated = evaluateDependencyEffect({
    event: dependencyEvent(),
    disposition,
    trustAnchors,
    dependencyEdge: dependencyEdge(),
    now: NOW,
    previouslySatisfied: true,
  });
  assert.equal(repeated.state, "satisfied");
  assert.equal(repeated.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.ALREADY_SATISFIED);
  assert.equal(repeated.unlock, false);
  assert.equal(repeated.idempotent, true);

  const irrelevant = evaluateDependencyEffect({
    event: dependencyEvent({ eventType: LIFECYCLE_EVENT_TYPES.ARTIFACT_READY }),
    disposition,
    trustAnchors,
  });
  assert.equal(irrelevant.state, "not-applicable");
  assert.equal(irrelevant.reasonCode, DEPENDENCY_EFFECT_REASON_CODES.NOT_APPLICABLE);
  assert.equal(irrelevant.unlock, false);
});
