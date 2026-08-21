export const DISPOSITION_TRANSITIONS = Object.freeze({
  delivery: Object.freeze({
    "control-plane-accepted": Object.freeze(["durably-received", "failed", "expired"]),
    "durably-received": Object.freeze([
      "receiver-notified",
      "checkpoint-offered",
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ]),
    "receiver-notified": Object.freeze([
      "checkpoint-offered",
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ]),
    "checkpoint-offered": Object.freeze([
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ]),
    "context-admitted": Object.freeze(["adapter-submitted", "failed", "expired"]),
    "adapter-submitted": Object.freeze([]),
    failed: Object.freeze([]),
    expired: Object.freeze([]),
  }),
  decision: Object.freeze({
    pending: Object.freeze([
      "accepted",
      "rejected",
      "deferred",
      "stale",
      "expired",
      "unsupported",
      "revoked",
    ]),
    deferred: Object.freeze(["accepted", "rejected", "stale", "expired", "revoked"]),
    accepted: Object.freeze(["revoked"]),
    rejected: Object.freeze([]),
    stale: Object.freeze([]),
    expired: Object.freeze([]),
    unsupported: Object.freeze([]),
    revoked: Object.freeze([]),
  }),
  outcome: Object.freeze({
    "not-observed": Object.freeze(["effect-observed", "externally-verified", "failed"]),
    "effect-observed": Object.freeze(["externally-verified"]),
    "externally-verified": Object.freeze([]),
    failed: Object.freeze([]),
  }),
});

export const DECISION_REASON_CODES = Object.freeze({
  accepted: Object.freeze(["accepted"]),
  rejected: Object.freeze([
    "policy-denied",
    "receiver-rejected",
    "structured-gate-required",
    "backpressure",
    "evidence-insufficient",
    "other",
  ]),
  deferred: Object.freeze(["receiver-deferred", "backpressure", "other"]),
  stale: Object.freeze(["stale-incarnation", "stale-run", "stale-objective"]),
  expired: Object.freeze(["expired"]),
  unsupported: Object.freeze([
    "unsupported-intent",
    "unsupported-delivery-mode",
    "structured-gate-required",
  ]),
  revoked: Object.freeze(["revoked"]),
});

export function isDispositionTransitionAllowed(machine, from, to) {
  return DISPOSITION_TRANSITIONS[machine]?.[from]?.includes(to) === true;
}

export function isDecisionReasonAllowed(decision, reasonCode) {
  return DECISION_REASON_CODES[decision]?.includes(reasonCode) === true;
}
