const STATE_CHANGING_INTENTS = new Set(["steer", "interrupt"]);
const ELEVATED_RELATIONSHIPS = new Set(["supervisor", "parent"]);

function deny(internalReasonCode, reasonCode = "policy-denied") {
  return Object.freeze({
    decision: "deny",
    reasonCode,
    publicErrorCode: "threadmesh_policy_denied",
    internalReasonCode,
  });
}

function refMatches(task, ref) {
  return (
    task?.taskId === ref?.taskId &&
    task?.incarnationId === ref?.incarnationId
  );
}

/**
 * Evaluate one directional relationship grant without throwing or consulting
 * ambient state. Callers supply registry and current-grant snapshots taken in
 * the same transaction as the protected operation.
 *
 * Detailed causes are deliberately separated from the public error code. A
 * transport caller receives one stable denial and cannot probe whether a
 * relationship is missing, revoked, expired, or superseded. Trusted audit and
 * tests may use internalReasonCode.
 */
export function evaluateRelationshipPolicy({
  envelope,
  grant,
  currentGrant = grant,
  sourceTask,
  targetTask,
  now,
}) {
  if (!envelope || !Number.isFinite(now)) {
    return deny("policy-input-invalid");
  }
  if (!sourceTask || !targetTask) return deny("task-not-registered");
  if (
    sourceTask.retiredAt ||
    targetTask.retiredAt ||
    !refMatches(sourceTask, envelope.sender) ||
    !refMatches(targetTask, envelope.target)
  ) {
    return deny("stale-incarnation", "stale-incarnation");
  }
  if (!grant) return deny("grant-missing");
  if (grant.revokedAt) return deny("grant-revoked");
  if (
    !currentGrant ||
    currentGrant.revokedAt ||
    currentGrant.grantId !== grant.grantId ||
    currentGrant.grantVersion !== grant.grantVersion
  ) {
    return deny("grant-superseded");
  }
  if (
    grant.relationshipId !== envelope.relationshipId ||
    !refMatches(grant.source, envelope.sender) ||
    !refMatches(grant.target, envelope.target)
  ) {
    return deny("grant-scope-mismatch");
  }
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= now) {
    return deny("grant-expired");
  }
  if (grant.structuredGateResponses !== false) {
    return deny("structured-gate-unsupported");
  }
  if (
    STATE_CHANGING_INTENTS.has(envelope.intent) &&
    !ELEVATED_RELATIONSHIPS.has(grant.relationshipType)
  ) {
    return deny("relationship-authority-insufficient");
  }
  if (!grant.allowedIntents.includes(envelope.intent)) {
    return deny("intent-not-allowed");
  }
  if (!grant.allowedDeliveryModes.includes(envelope.delivery.requestedMode)) {
    return deny("delivery-mode-not-allowed");
  }
  return Object.freeze({
    decision: "allow",
    reasonCode: "accepted",
    publicErrorCode: null,
    internalReasonCode: "grant-authorized",
    grantId: grant.grantId,
    grantVersion: grant.grantVersion,
  });
}

export function isStateChangingIntent(intent) {
  return STATE_CHANGING_INTENTS.has(intent);
}
