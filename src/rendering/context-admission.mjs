import { canonicalJson, sha256Digest } from "../canonical-json.mjs";

const OFFER_PREFIX = "THREADMESH_REGISTERED_PEER_OFFER_JSON_V1";

function renderingError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function patternedIdentity(value, pattern, field) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw renderingError("threadmesh_registered_peer_offer_invalid", field);
  }
  return value;
}

function boundedTaskId(value, field) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200) {
    throw renderingError("threadmesh_registered_peer_offer_invalid", field);
  }
  return value;
}

/**
 * Render only coordinator/registry-verifiable structure for a receiver-owned
 * decision. Sender-controlled free text is deliberately not projected until
 * the receiver has accepted and the coordinator has prepared an admission.
 */
export function renderRegisteredPeerOffer(offer) {
  const envelope = offer?.envelope;
  const disposition = offer?.disposition;
  const currentDecision = disposition?.decision;
  if (
    !offer || typeof offer !== "object" || Array.isArray(offer) ||
    !envelope || typeof envelope !== "object" || Array.isArray(envelope) ||
    !disposition || typeof disposition !== "object" || Array.isArray(disposition) ||
    !["pending", "deferred"].includes(currentDecision) ||
    !Number.isInteger(disposition.revision) || disposition.revision < 0
  ) throw renderingError("threadmesh_registered_peer_offer_invalid");

  const messageId = patternedIdentity(
    envelope.messageId,
    /^msg_[A-Za-z0-9][A-Za-z0-9._:-]{6,196}$/u,
    "messageId",
  );
  const relationshipId = patternedIdentity(
    envelope.relationshipId,
    /^rel_[A-Za-z0-9][A-Za-z0-9._:-]{2,196}$/u,
    "relationshipId",
  );
  const sourceTask = boundedTaskId(envelope.sender?.taskId, "sender.taskId");
  const sourceIncarnation = patternedIdentity(
    envelope.sender?.incarnationId,
    /^inc_[A-Za-z0-9][A-Za-z0-9._:-]{6,196}$/u,
    "sender.incarnationId",
  );
  const targetTask = boundedTaskId(envelope.target?.taskId, "target.taskId");
  const targetIncarnation = patternedIdentity(
    envelope.target?.incarnationId,
    /^inc_[A-Za-z0-9][A-Za-z0-9._:-]{6,196}$/u,
    "target.incarnationId",
  );
  const intent = envelope.intent;
  const deliveryMode = envelope.delivery?.requestedMode;
  if (!["notify", "suggest", "steer", "interrupt"].includes(intent) ||
      ![
        "store-only", "side-channel", "checkpoint-offer", "wake-idle",
        "active-steer", "interrupt-request",
      ].includes(deliveryMode)) {
    throw renderingError("threadmesh_registered_peer_offer_invalid", "intent/deliveryMode");
  }

  return `${OFFER_PREFIX}\n${canonicalJson({
    type: "threadmesh.peer-offer",
    authority: "receiver-decision-required",
    provenance: {
      messageId,
      sourceIncarnation,
      relationshipId,
      sourceTaskRefDigest: sha256Digest({
        taskId: sourceTask,
        incarnationId: sourceIncarnation,
      }),
    },
    target: {
      incarnationId: targetIncarnation,
      taskRefDigest: sha256Digest({
        taskId: targetTask,
        incarnationId: targetIncarnation,
      }),
    },
    intent,
    deliveryMode,
    decision: {
      current: currentDecision,
      revision: disposition.revision,
      tool: "threadmesh_decide_offer",
      allowed: ["accepted", "deferred", "rejected"],
      requiredArguments: ["messageId", "decision"],
    },
  })}`;
}

export function renderRegisteredPeerContext(envelope) {
  return `THREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1\n${canonicalJson({
    type: "threadmesh.peer-suggestion",
    authority: "untrusted-peer",
    provenance: {
      messageId: envelope.messageId,
      sourceTask: envelope.sender.taskId,
      sourceIncarnation: envelope.sender.incarnationId,
      relationshipId: envelope.relationshipId,
      actorType: envelope.sender.actorType,
      claimStatus: envelope.claimStatus,
    },
    reason: envelope.reason,
    content: envelope.content,
  })}`;
}
