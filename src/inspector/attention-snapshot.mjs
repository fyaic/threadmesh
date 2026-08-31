import {
  ATTENTION_ROUTE_REASON_CODES,
  DEPENDENCY_EFFECT_REASON_CODES,
  LIFECYCLE_EVENT_TYPES,
} from "../routing/lifecycle-events.mjs";
import { codedError } from "../protocol-validator.mjs";
import { DISPOSITION_TRANSITIONS } from "../state/disposition-transitions.mjs";

/**
 * A deliberately small, content-free projection for the attention-router
 * demo. Callers provide records that have already passed authorization and
 * redaction; this module still rejects content-shaped data so it cannot become
 * an accidental transcript or secret display surface.
 */
export const ATTENTION_SNAPSHOT_LIMITS = Object.freeze({
  sessions: 24,
  dependencies: 48,
  events: 48,
  routes: 48,
  string: 120,
});

const DEPENDENCY_STATUSES = new Set(["waiting", "eligible", "satisfied", "blocked"]);
const ROUTE_STATES = new Set(["offered", "ignored", "stale", "denied", "idempotent"]);
const EVENT_TYPES = new Set(Object.values(LIFECYCLE_EVENT_TYPES));
const ROUTE_REASONS = new Set(Object.values(ATTENTION_ROUTE_REASON_CODES));
const EFFECT_REASONS = new Set(Object.values(DEPENDENCY_EFFECT_REASON_CODES));
const EFFECT_STATES = new Set(["satisfied", "not-satisfied", "not-applicable"]);
const DELIVERY_STATES = new Set(Object.keys(DISPOSITION_TRANSITIONS.delivery));
const DECISION_STATES = new Set(Object.keys(DISPOSITION_TRANSITIONS.decision));
const OUTCOME_STATES = new Set([
  ...Object.keys(DISPOSITION_TRANSITIONS.outcome),
  // This records the durable pre-call adapter boundary, not a disposition
  // transition. It remains visible because it requires reconciliation.
  "outcome-unknown",
]);
const VERIFICATION_STATES = new Set([
  "not-observed",
  "effect-observed",
  "externally-verified",
  "verification-required",
  "attestation-untrusted",
  "failed",
]);
const RECOVERY_HINTS = new Set([
  "Reconcile the external submission before retrying or changing dependency state.",
  "Resolve the blocking dependency, then publish a new verified lifecycle event.",
]);
const FORBIDDEN_KEY = /(?:content|body|text|prompt|secret|token|password|credential|authorization|api[_-]?key|private[_-]?key)/i;
const ABSOLUTE_PATH = /^(?:\/|[A-Za-z]:[\\/]|\\\\)/;

function snapshotError(detail) {
  return codedError("threadmesh_attention_snapshot_invalid", detail);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, allowed, label) {
  if (!isPlainObject(value)) throw snapshotError(`${label} must be an object`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw snapshotError(`${label} contains forbidden field: ${key}`);
    }
    if (!allowed.has(key)) throw snapshotError(`${label} has unknown field: ${key}`);
  }
}

function assertRequired(value, keys, label) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw snapshotError(`${label} is missing ${key}`);
  }
}

function assertSafeString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw snapshotError(`${label} must be a non-empty string`);
  }
  if (ABSOLUTE_PATH.test(value)) throw snapshotError(`${label} must not be an absolute path`);
  return value;
}

function boundedString(value, label) {
  const text = assertSafeString(value, label);
  return text.length <= ATTENTION_SNAPSHOT_LIMITS.string
    ? text
    : `${text.slice(0, ATTENTION_SNAPSHOT_LIMITS.string - 1)}…`;
}

function boundedNullableString(value, label) {
  if (value === null || value === undefined) return null;
  return boundedString(value, label);
}

function assertProjectedString(value, label) {
  const text = assertSafeString(value, label);
  if (text.length > ATTENTION_SNAPSHOT_LIMITS.string) {
    throw snapshotError(`${label} exceeds the snapshot string limit`);
  }
  return text;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw snapshotError(`${label} must be an array`);
}

function assertNoSensitiveValue(value, label) {
  if (typeof value === "string" && ABSOLUTE_PATH.test(value)) {
    throw snapshotError(`${label} must not be an absolute path`);
  }
  if (!isPlainObject(value) && !Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      throw snapshotError(`${label} contains forbidden field: ${key}`);
    }
    assertNoSensitiveValue(nested, `${label}.${key}`);
  }
}

function projectSource(value, label) {
  const allowed = new Set(["taskId", "incarnationId", "harness", "actorType"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["taskId", "incarnationId"], label);
  return Object.freeze({
    taskId: boundedString(value.taskId, `${label}.taskId`),
    incarnationId: boundedString(value.incarnationId, `${label}.incarnationId`),
    ...(value.harness === undefined ? {} : { harness: boundedString(value.harness, `${label}.harness`) }),
    ...(value.actorType === undefined ? {} : { actorType: boundedString(value.actorType, `${label}.actorType`) }),
  });
}

function projectProvenance(value, label) {
  const allowed = new Set(["authorship", "claimStatus"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["authorship", "claimStatus"], label);
  return Object.freeze({
    authorship: boundedString(value.authorship, `${label}.authorship`),
    claimStatus: boundedString(value.claimStatus, `${label}.claimStatus`),
  });
}

function projectSession(value) {
  const label = "session";
  const allowed = new Set(["sessionId", "workstream", "status", "taskId"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["sessionId", "workstream", "status"], label);
  return {
    sessionId: boundedString(value.sessionId, "session.sessionId"),
    workstream: boundedString(value.workstream, "session.workstream"),
    status: boundedString(value.status, "session.status"),
    ...(value.taskId === undefined ? {} : { taskId: boundedString(value.taskId, "session.taskId") }),
  };
}

function projectDependency(value) {
  const label = "dependency";
  const allowed = new Set(["dependencyId", "fromSessionId", "toSessionId", "status"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["dependencyId", "fromSessionId", "toSessionId", "status"], label);
  if (!DEPENDENCY_STATUSES.has(value.status)) {
    throw snapshotError(`dependency.status is unsupported: ${value.status}`);
  }
  return {
    dependencyId: boundedString(value.dependencyId, "dependency.dependencyId"),
    fromSessionId: boundedString(value.fromSessionId, "dependency.fromSessionId"),
    toSessionId: boundedString(value.toSessionId, "dependency.toSessionId"),
    status: value.status,
  };
}

function projectEvent(value) {
  const label = "event";
  const allowed = new Set(["eventId", "dependencyId", "eventType", "payloadSummary", "source", "provenance", "occurredAt"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["eventId", "dependencyId", "eventType", "source", "provenance", "occurredAt"], label);
  if (!EVENT_TYPES.has(value.eventType)) {
    throw snapshotError(`event.eventType is unsupported: ${value.eventType}`);
  }
  return {
    eventId: boundedString(value.eventId, "event.eventId"),
    dependencyId: boundedString(value.dependencyId, "event.dependencyId"),
    eventType: value.eventType,
    ...(value.payloadSummary === undefined
      ? {}
      : { payloadSummary: boundedString(value.payloadSummary, "event.payloadSummary") }),
    source: projectSource(value.source, "event.source"),
    provenance: projectProvenance(value.provenance, "event.provenance"),
    occurredAt: boundedString(value.occurredAt, "event.occurredAt"),
  };
}

function projectReceiverDisposition(value) {
  const label = "route.receiverDisposition";
  const allowed = new Set(["delivery", "decision", "decisionReasonCode", "outcome"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["delivery", "decision", "outcome"], label);
  if (!DELIVERY_STATES.has(value.delivery)) throw snapshotError(`route.receiverDisposition.delivery is unsupported: ${value.delivery}`);
  if (!DECISION_STATES.has(value.decision)) throw snapshotError(`route.receiverDisposition.decision is unsupported: ${value.decision}`);
  if (!OUTCOME_STATES.has(value.outcome)) throw snapshotError(`route.receiverDisposition.outcome is unsupported: ${value.outcome}`);
  return Object.freeze({
    delivery: boundedString(value.delivery, `${label}.delivery`),
    decision: boundedString(value.decision, `${label}.decision`),
    ...(value.decisionReasonCode === undefined
      ? {}
      : { decisionReasonCode: boundedString(value.decisionReasonCode, `${label}.decisionReasonCode`) }),
    outcome: boundedString(value.outcome, `${label}.outcome`),
  });
}

function projectEffect(value) {
  const label = "route.dependencyEffect";
  const allowed = new Set(["state", "reasonCode", "unlock"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["state", "reasonCode", "unlock"], label);
  if (!EFFECT_STATES.has(value.state)) {
    throw snapshotError(`route.dependencyEffect.state is unsupported: ${value.state}`);
  }
  if (!EFFECT_REASONS.has(value.reasonCode)) {
    throw snapshotError(`route.dependencyEffect.reasonCode is unsupported: ${value.reasonCode}`);
  }
  if (typeof value.unlock !== "boolean") throw snapshotError("route.dependencyEffect.unlock must be boolean");
  return Object.freeze({ state: value.state, reasonCode: value.reasonCode, unlock: value.unlock });
}

function projectRoute(value) {
  const label = "route";
  const allowed = new Set([
    "routeId", "dependencyId", "eventId", "state", "reasonCode", "receiverDisposition",
    "verificationState", "dependencyEffect",
  ]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["routeId", "dependencyId", "eventId", "state", "reasonCode", "receiverDisposition", "verificationState", "dependencyEffect"], label);
  if (!ROUTE_STATES.has(value.state)) throw snapshotError(`route.state is unsupported: ${value.state}`);
  if (!ROUTE_REASONS.has(value.reasonCode)) throw snapshotError(`route.reasonCode is unsupported: ${value.reasonCode}`);
  if (!VERIFICATION_STATES.has(value.verificationState)) {
    throw snapshotError(`route.verificationState is unsupported: ${value.verificationState}`);
  }
  return {
    routeId: boundedString(value.routeId, "route.routeId"),
    dependencyId: boundedString(value.dependencyId, "route.dependencyId"),
    eventId: boundedString(value.eventId, "route.eventId"),
    state: value.state,
    reasonCode: value.reasonCode,
    receiverDisposition: projectReceiverDisposition(value.receiverDisposition),
    verificationState: boundedString(value.verificationState, "route.verificationState"),
    dependencyEffect: projectEffect(value.dependencyEffect),
  };
}

function stableCompare(left, right, keys) {
  for (const key of keys) {
    const leftValue = String(left[key]);
    const rightValue = String(right[key]);
    const compared = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    if (compared !== 0) return compared;
  }
  return 0;
}

function bound(records, limit, compare) {
  const sorted = [...records].sort(compare);
  return { records: sorted.slice(0, limit), dropped: Math.max(0, sorted.length - limit) };
}

function defaultRecoveryHint(dependency, route) {
  if (route?.receiverDisposition.outcome === "outcome-unknown") {
    return "Reconcile the external submission before retrying or changing dependency state.";
  }
  if (dependency.status === "blocked" || route?.dependencyEffect.state === "not-satisfied") {
    return "Resolve the blocking dependency, then publish a new verified lifecycle event.";
  }
  return null;
}

function assertDependencyConsistency(dependency, route) {
  if (!route?.dependencyEffect.unlock) return;
  if (
    dependency.status !== "satisfied" ||
    route.dependencyEffect.state !== "satisfied" ||
    route.verificationState !== "externally-verified" ||
    route.receiverDisposition.decision !== "accepted"
  ) {
    throw snapshotError(
      `dependency ${dependency.dependencyId} cannot be unlocked before satisfaction, acceptance, and external verification`,
    );
  }
}

function assertLinkedRecords(dependencies, events, routes) {
  const dependenciesById = new Set(dependencies.map((dependency) => dependency.dependencyId));
  const eventsById = new Set(events.map((event) => event.eventId));
  for (const event of events) {
    if (!dependenciesById.has(event.dependencyId)) {
      throw snapshotError(`event references unknown dependency: ${event.dependencyId}`);
    }
  }
  for (const route of routes) {
    if (!dependenciesById.has(route.dependencyId)) {
      throw snapshotError(`route references unknown dependency: ${route.dependencyId}`);
    }
    if (!eventsById.has(route.eventId)) {
      throw snapshotError(`route references unknown event: ${route.eventId}`);
    }
  }
}

/**
 * Project already-authorized, already-redacted attention records into a stable
 * terminal-safe snapshot. It performs no I/O and never inspects raw content.
 */
export function projectAttentionSnapshot(input) {
  const rootFields = new Set(["sessions", "dependencies", "events", "routes"]);
  assertExactKeys(input, rootFields, "input");
  assertRequired(input, ["sessions", "dependencies", "events", "routes"], "input");
  assertNoSensitiveValue(input, "input");
  for (const key of rootFields) assertArray(input[key], `input.${key}`);

  const sessions = input.sessions.map(projectSession);
  const dependencies = input.dependencies.map(projectDependency);
  const events = input.events.map(projectEvent);
  const routes = input.routes.map(projectRoute);
  assertLinkedRecords(dependencies, events, routes);

  const boundedSessions = bound(sessions, ATTENTION_SNAPSHOT_LIMITS.sessions, (a, b) => stableCompare(a, b, ["workstream", "sessionId"]));
  const boundedDependencies = bound(dependencies, ATTENTION_SNAPSHOT_LIMITS.dependencies, (a, b) => stableCompare(a, b, ["dependencyId"]));
  const boundedEvents = bound(events, ATTENTION_SNAPSHOT_LIMITS.events, (a, b) => stableCompare(a, b, ["dependencyId", "occurredAt", "eventId"]));
  const boundedRoutes = bound(routes, ATTENTION_SNAPSHOT_LIMITS.routes, (a, b) => stableCompare(a, b, ["dependencyId", "routeId"]));
  const selectedEventIds = new Set(boundedEvents.records.map((event) => event.eventId));
  const selectedDependencyIds = new Set(boundedDependencies.records.map((dependency) => dependency.dependencyId));
  const routesByDependency = new Map();
  for (const route of boundedRoutes.records) {
    if (selectedDependencyIds.has(route.dependencyId) && selectedEventIds.has(route.eventId)) {
      routesByDependency.set(route.dependencyId, route);
    }
  }
  const eventsByDependency = new Map();
  for (const event of boundedEvents.records) {
    if (selectedDependencyIds.has(event.dependencyId)) eventsByDependency.set(event.dependencyId, event);
  }

  const projectedDependencies = boundedDependencies.records.map((dependency) => {
    const route = routesByDependency.get(dependency.dependencyId) ?? null;
    assertDependencyConsistency(dependency, route);
    return Object.freeze({
      ...dependency,
      recentEvent: eventsByDependency.get(dependency.dependencyId) ?? null,
      route: route
        ? Object.freeze({
            routeId: route.routeId,
            eventId: route.eventId,
            state: route.state,
            reasonCode: route.reasonCode,
          })
        : null,
      receiverDisposition: route?.receiverDisposition ?? null,
      verificationState: route?.verificationState ?? "not-observed",
      dependencyEffect: route?.dependencyEffect ?? null,
      recoveryHint: defaultRecoveryHint(dependency, route),
    });
  });

  return Object.freeze({
    kind: "threadmesh-attention-snapshot",
    version: 1,
    sessions: Object.freeze(boundedSessions.records.map((session) => Object.freeze(session))),
    dependencies: Object.freeze(projectedDependencies),
    truncation: Object.freeze({
      sessions: boundedSessions.dropped,
      dependencies: boundedDependencies.dropped,
      events: boundedEvents.dropped,
      routes: boundedRoutes.dropped,
    }),
  });
}

export const createAttentionSnapshot = projectAttentionSnapshot;

function display(value) {
  return value === null || value === undefined ? "—" : value;
}

function assertProjectedSource(value, label) {
  const allowed = new Set(["taskId", "incarnationId", "harness", "actorType"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["taskId", "incarnationId"], label);
  for (const key of allowed) {
    if (value[key] !== undefined) assertProjectedString(value[key], `${label}.${key}`);
  }
}

function assertProjectedProvenance(value, label) {
  const allowed = new Set(["authorship", "claimStatus"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["authorship", "claimStatus"], label);
  for (const key of allowed) assertProjectedString(value[key], `${label}.${key}`);
}

function assertProjectedEvent(value, label) {
  if (value === null) return;
  const allowed = new Set(["eventId", "dependencyId", "eventType", "payloadSummary", "source", "provenance", "occurredAt"]);
  assertExactKeys(value, allowed, label);
  assertRequired(
    value,
    ["eventId", "dependencyId", "eventType", "source", "provenance", "occurredAt"],
    label,
  );
  for (const key of ["eventId", "dependencyId", "occurredAt"]) {
    assertProjectedString(value[key], `${label}.${key}`);
  }
  if (value.payloadSummary !== undefined) {
    assertProjectedString(value.payloadSummary, `${label}.payloadSummary`);
  }
  if (!EVENT_TYPES.has(value.eventType)) throw snapshotError(`${label}.eventType is unsupported: ${value.eventType}`);
  assertProjectedSource(value.source, `${label}.source`);
  assertProjectedProvenance(value.provenance, `${label}.provenance`);
}

function assertProjectedRoute(value, label) {
  if (value === null) return;
  const allowed = new Set(["routeId", "eventId", "state", "reasonCode"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, [...allowed], label);
  for (const key of ["routeId", "eventId"]) assertProjectedString(value[key], `${label}.${key}`);
  if (!ROUTE_STATES.has(value.state)) throw snapshotError(`${label}.state is unsupported: ${value.state}`);
  if (!ROUTE_REASONS.has(value.reasonCode)) throw snapshotError(`${label}.reasonCode is unsupported: ${value.reasonCode}`);
}

function assertProjectedReceiverDisposition(value, label) {
  if (value === null) return;
  const allowed = new Set(["delivery", "decision", "decisionReasonCode", "outcome"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, ["delivery", "decision", "outcome"], label);
  if (!DELIVERY_STATES.has(value.delivery)) throw snapshotError(`${label}.delivery is unsupported: ${value.delivery}`);
  if (!DECISION_STATES.has(value.decision)) throw snapshotError(`${label}.decision is unsupported: ${value.decision}`);
  if (!OUTCOME_STATES.has(value.outcome)) throw snapshotError(`${label}.outcome is unsupported: ${value.outcome}`);
  for (const key of allowed) {
    if (value[key] !== undefined) assertProjectedString(value[key], `${label}.${key}`);
  }
}

function assertProjectedEffect(value, label) {
  if (value === null) return;
  const allowed = new Set(["state", "reasonCode", "unlock"]);
  assertExactKeys(value, allowed, label);
  assertRequired(value, [...allowed], label);
  if (!EFFECT_STATES.has(value.state)) throw snapshotError(`${label}.state is unsupported: ${value.state}`);
  if (!EFFECT_REASONS.has(value.reasonCode)) throw snapshotError(`${label}.reasonCode is unsupported: ${value.reasonCode}`);
  if (typeof value.unlock !== "boolean") throw snapshotError(`${label}.unlock must be boolean`);
}

function assertProjectedSnapshot(snapshot) {
  const allowed = new Set(["kind", "version", "sessions", "dependencies", "truncation"]);
  assertExactKeys(snapshot, allowed, "snapshot");
  if (snapshot?.kind !== "threadmesh-attention-snapshot" || snapshot?.version !== 1) {
    throw snapshotError("snapshot has unsupported kind or version");
  }
  assertArray(snapshot.sessions, "snapshot.sessions");
  assertArray(snapshot.dependencies, "snapshot.dependencies");
  if (snapshot.sessions.length > ATTENTION_SNAPSHOT_LIMITS.sessions || snapshot.dependencies.length > ATTENTION_SNAPSHOT_LIMITS.dependencies) {
    throw snapshotError("snapshot is not bounded");
  }
  for (const [index, session] of snapshot.sessions.entries()) {
    const projected = projectSession(session);
    for (const key of Object.keys(projected)) assertProjectedString(session[key], `snapshot.sessions[${index}].${key}`);
  }
  for (const [index, dependency] of snapshot.dependencies.entries()) {
    const label = `snapshot.dependencies[${index}]`;
    const allowedDependency = new Set([
      "dependencyId", "fromSessionId", "toSessionId", "status", "recentEvent", "route",
      "receiverDisposition", "verificationState", "dependencyEffect", "recoveryHint",
    ]);
    assertExactKeys(dependency, allowedDependency, label);
    assertRequired(dependency, [...allowedDependency], label);
    for (const key of ["dependencyId", "fromSessionId", "toSessionId", "verificationState"]) {
      assertProjectedString(dependency[key], `${label}.${key}`);
    }
    if (!DEPENDENCY_STATUSES.has(dependency.status)) throw snapshotError(`${label}.status is unsupported: ${dependency.status}`);
    if (!VERIFICATION_STATES.has(dependency.verificationState)) throw snapshotError(`${label}.verificationState is unsupported: ${dependency.verificationState}`);
    assertProjectedEvent(dependency.recentEvent, `${label}.recentEvent`);
    assertProjectedRoute(dependency.route, `${label}.route`);
    assertProjectedReceiverDisposition(dependency.receiverDisposition, `${label}.receiverDisposition`);
    assertProjectedEffect(dependency.dependencyEffect, `${label}.dependencyEffect`);
    if (dependency.recoveryHint !== null && !RECOVERY_HINTS.has(dependency.recoveryHint)) {
      throw snapshotError(`${label}.recoveryHint is not a supported recovery hint`);
    }
    if (dependency.route === null && (dependency.receiverDisposition !== null || dependency.dependencyEffect !== null)) {
      throw snapshotError(`${label} has route details without a route`);
    }
    if (dependency.route === null && dependency.verificationState !== "not-observed") {
      throw snapshotError(`${label} has verification state without a route`);
    }
    if (dependency.recentEvent && dependency.recentEvent.dependencyId !== dependency.dependencyId) {
      throw snapshotError(`${label} recent event does not match dependency`);
    }
    if (dependency.route && dependency.recentEvent === null) throw snapshotError(`${label} route has no recent event`);
    if (dependency.route && (dependency.receiverDisposition === null || dependency.dependencyEffect === null)) {
      throw snapshotError(`${label} route has incomplete route details`);
    }
    if (dependency.route && dependency.route.eventId !== dependency.recentEvent.eventId) {
      throw snapshotError(`${label} route does not match recent event`);
    }
    assertDependencyConsistency(dependency, dependency.route
      ? {
          receiverDisposition: dependency.receiverDisposition,
          verificationState: dependency.verificationState,
          dependencyEffect: dependency.dependencyEffect,
        }
      : null);
  }
  const truncationFields = new Set(["sessions", "dependencies", "events", "routes"]);
  assertExactKeys(snapshot.truncation, truncationFields, "snapshot.truncation");
  for (const key of truncationFields) {
    if (!Number.isInteger(snapshot.truncation[key]) || snapshot.truncation[key] < 0) {
      throw snapshotError(`snapshot.truncation.${key} must be a non-negative integer`);
    }
  }
}

/** Render a snapshot without ANSI state, clocks, or terminal-width dependence. */
export function renderAttentionSnapshot(snapshot) {
  assertProjectedSnapshot(snapshot);
  // Use a newly projected copy after full validation; the renderer never reads
  // a caller-owned nested object directly.
  const canonical = projectAttentionSnapshot({
    sessions: snapshot.sessions,
    dependencies: snapshot.dependencies.map(({ dependencyId, fromSessionId, toSessionId, status }) => ({
      dependencyId, fromSessionId, toSessionId, status,
    })),
    events: snapshot.dependencies.flatMap((dependency) => dependency.recentEvent ? [dependency.recentEvent] : []),
    routes: snapshot.dependencies.flatMap((dependency) => dependency.route ? [{
      routeId: dependency.route.routeId,
      dependencyId: dependency.dependencyId,
      eventId: dependency.route.eventId,
      state: dependency.route.state,
      reasonCode: dependency.route.reasonCode,
      receiverDisposition: dependency.receiverDisposition,
      verificationState: dependency.verificationState,
      dependencyEffect: dependency.dependencyEffect,
    }] : []),
  });
  snapshot = Object.freeze({
    ...canonical,
    truncation: Object.freeze({ ...snapshot.truncation }),
  });
  const lines = ["ThreadMesh attention snapshot", "Sessions:"];
  lines.push(...snapshot.sessions.map((session) => `- ${session.workstream} (${session.sessionId}): ${session.status}`));
  lines.push("Dependencies:");
  for (const dependency of snapshot.dependencies) {
    lines.push(`- ${dependency.dependencyId}: ${dependency.fromSessionId} -> ${dependency.toSessionId} [${dependency.status}]`);
    const event = dependency.recentEvent;
    lines.push(`  event: ${event ? `${event.eventType} from ${event.source.taskId} (${event.provenance.authorship}/${event.provenance.claimStatus})` : "—"}`);
    if (event?.payloadSummary) lines.push(`  summary: ${event.payloadSummary}`);
    lines.push(`  route: ${dependency.route ? `${dependency.route.state} (${dependency.route.reasonCode})` : "—"}`);
    const disposition = dependency.receiverDisposition;
    lines.push(`  receiver: ${disposition ? `${disposition.delivery}; ${disposition.decision}; ${disposition.outcome}` : "—"}`);
    lines.push(`  verification: ${display(dependency.verificationState)}`);
    lines.push(`  effect: ${dependency.dependencyEffect ? `${dependency.dependencyEffect.state} (${dependency.dependencyEffect.reasonCode})` : "—"}`);
    if (dependency.recoveryHint) lines.push(`  recovery: ${dependency.recoveryHint}`);
  }
  lines.push(`Truncated: sessions=${snapshot.truncation.sessions}, dependencies=${snapshot.truncation.dependencies}, events=${snapshot.truncation.events}, routes=${snapshot.truncation.routes}`);
  return `${lines.join("\n")}\n`;
}
