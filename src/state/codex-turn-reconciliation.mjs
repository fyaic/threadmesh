import { sha256Digest } from "../canonical-json.mjs";
import { codedError } from "../protocol-validator.mjs";

/** Internal bounds for read-only Codex persisted-turn reconciliation. */
export const CODEX_TURN_OBSERVATION_LIMITS = Object.freeze({
  pageSize: 100,
  maxPages: 100,
  maxTurns: 10_000,
  maxItemsPerTurn: 1_000,
  maxIdentifierBytes: 512,
});

const TURN_STATUSES = new Set([
  "inProgress", "completed", "interrupted", "failed",
]);
const TERMINAL_FAILURE_STATUSES = new Set(["interrupted", "failed"]);
const THREAD_STATUSES = new Set(["notLoaded", "idle", "active", "systemError"]);

function fail(code, detail) {
  throw codedError(code, detail);
}

function boundedString(value, label) {
  if (
    typeof value !== "string" || value.length === 0 ||
    Buffer.byteLength(value) > CODEX_TURN_OBSERVATION_LIMITS.maxIdentifierBytes ||
    /[\r\n\0]/u.test(value)
  ) fail("codex_app_server_persisted_turn_observation_invalid", label);
  return value;
}

function digest(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) {
    fail("codex_app_server_persisted_turn_observation_invalid", label);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("codex_app_server_persisted_turn_observation_invalid", label);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) fail("codex_app_server_persisted_turn_observation_invalid", label);
}

function runtimeThreadStatus(value) {
  const type = typeof value === "string" ? value : value?.type;
  if (!THREAD_STATUSES.has(type)) {
    fail("codex_app_server_persisted_turn_observation_invalid", "thread.status");
  }
  return type;
}

function clientIds(items, label) {
  if (!Array.isArray(items)) {
    fail("codex_app_server_persisted_turn_observation_invalid", `${label}.items`);
  }
  if (items.length > CODEX_TURN_OBSERVATION_LIMITS.maxItemsPerTurn) {
    fail("codex_app_server_persisted_turn_observation_limit", `${label}.items`);
  }
  const values = [];
  for (const item of items) {
    if (item?.type !== "userMessage" || item.clientId === null || item.clientId === undefined) {
      continue;
    }
    values.push(boundedString(item.clientId, `${label}.clientId`));
  }
  return [...new Set(values)].sort();
}

function normalizeTurns(turns, label) {
  if (!Array.isArray(turns)) {
    fail("codex_app_server_persisted_turn_observation_invalid", label);
  }
  if (turns.length > CODEX_TURN_OBSERVATION_LIMITS.maxTurns) {
    fail("codex_app_server_persisted_turn_observation_limit", label);
  }
  const seen = new Set();
  return turns.map((turn, index) => {
    const turnId = boundedString(turn?.id, `${label}[${index}].id`);
    if (seen.has(turnId)) {
      fail("codex_app_server_persisted_turn_observation_conflict", `duplicate:${turnId}`);
    }
    seen.add(turnId);
    if (!TURN_STATUSES.has(turn?.status)) {
      fail("codex_app_server_persisted_turn_observation_invalid", `${label}[${index}].status`);
    }
    return Object.freeze({
      turnId,
      status: turn.status,
      clientUserMessageIds: Object.freeze(clientIds(turn.items ?? [], `${label}[${index}]`)),
    });
  });
}

function mergeItemClientIds(turns, itemPages) {
  if (itemPages === null) return turns;
  if (!itemPages || typeof itemPages !== "object" || Array.isArray(itemPages)) {
    fail("codex_app_server_persisted_turn_observation_invalid", "itemPages");
  }
  const byId = new Map(turns.map((turn) => [turn.turnId, turn]));
  for (const [turnId, items] of Object.entries(itemPages)) {
    boundedString(turnId, "itemPages.turnId");
    const current = byId.get(turnId);
    if (!current) {
      fail("codex_app_server_persisted_turn_observation_conflict", `item-turn:${turnId}`);
    }
    const itemClientIds = clientIds(items, `itemPages.${turnId}`);
    if (
      current.clientUserMessageIds.length > 0 && itemClientIds.length > 0 &&
      current.clientUserMessageIds.join("\0") !== itemClientIds.join("\0")
    ) {
      fail("codex_app_server_persisted_turn_observation_conflict", `item-client-id:${turnId}`);
    }
    const merged = current.clientUserMessageIds.length > 0
      ? current.clientUserMessageIds
      : itemClientIds;
    byId.set(turnId, Object.freeze({ ...current, clientUserMessageIds: Object.freeze(merged) }));
  }
  return turns.map((turn) => byId.get(turn.turnId));
}

function observationBody(observation) {
  return {
    threadId: observation.threadId,
    snapshotDigest: observation.snapshotDigest,
    threadStatus: observation.threadStatus,
    turns: observation.turns.map((turn) => ({
      turnId: turn.turnId,
      status: turn.status,
      clientUserMessageIds: [...turn.clientUserMessageIds],
    })),
    itemsListSupported: observation.itemsListSupported,
  };
}

export function createCodexPersistedTurnObservation({
  threadId,
  snapshotDigest,
  threadStatus,
  readTurns,
  listedTurns,
  itemPages = null,
  itemsListSupported = false,
}) {
  boundedString(threadId, "threadId");
  digest(snapshotDigest, "snapshotDigest");
  if (typeof itemsListSupported !== "boolean") {
    fail("codex_app_server_persisted_turn_observation_invalid", "itemsListSupported");
  }
  if (
    (itemsListSupported && (itemPages === null || itemPages === undefined)) ||
    (!itemsListSupported && itemPages !== null)
  ) fail("codex_app_server_persisted_turn_observation_invalid", "itemPages support");
  const normalizedRead = normalizeTurns(readTurns, "readTurns");
  const normalizedListed = normalizeTurns(listedTurns, "listedTurns");
  const listedById = new Map(normalizedListed.map((turn) => [turn.turnId, turn]));
  if (
    normalizedRead.length !== normalizedListed.length ||
    normalizedRead.some((turn) => listedById.get(turn.turnId)?.status !== turn.status)
  ) fail("codex_app_server_persisted_turn_observation_conflict", "read/list mismatch");
  const crossCheckedTurns = normalizedRead.map((readTurn) => {
    const listedTurn = listedById.get(readTurn.turnId);
    if (
      readTurn.clientUserMessageIds.length > 0 &&
      listedTurn.clientUserMessageIds.length > 0 &&
      readTurn.clientUserMessageIds.join("\0") !== listedTurn.clientUserMessageIds.join("\0")
    ) {
      fail(
        "codex_app_server_persisted_turn_observation_conflict",
        `read/list client-id:${readTurn.turnId}`,
      );
    }
    return Object.freeze({
      ...readTurn,
      clientUserMessageIds: readTurn.clientUserMessageIds.length > 0
        ? readTurn.clientUserMessageIds
        : listedTurn.clientUserMessageIds,
    });
  });
  const turns = mergeItemClientIds(crossCheckedTurns, itemPages);
  const body = {
    threadId,
    snapshotDigest,
    threadStatus: runtimeThreadStatus(threadStatus),
    turns,
    itemsListSupported,
  };
  const observation = {
    ...body,
    observationDigest: sha256Digest(observationBody(body)),
  };
  return Object.freeze({
    ...observation,
    turns: Object.freeze(turns),
  });
}

function assertObservation(value) {
  exactKeys(value, [
    "threadId", "snapshotDigest", "threadStatus", "turns",
    "itemsListSupported", "observationDigest",
  ], "observation");
  const normalizedTurns = value.turns.map((turn) => ({
    id: turn.turnId,
    status: turn.status,
    items: turn.clientUserMessageIds.map((clientId) => ({
      type: "userMessage", clientId,
    })),
  }));
  const rebuilt = createCodexPersistedTurnObservation({
    threadId: value.threadId,
    snapshotDigest: value.snapshotDigest,
    threadStatus: value.threadStatus,
    readTurns: normalizedTurns,
    listedTurns: value.turns.map((turn) => ({
      id: turn.turnId,
      status: turn.status,
      items: [],
    })),
    itemPages: value.itemsListSupported
      ? Object.fromEntries(normalizedTurns.map((turn) => [turn.id, turn.items]))
      : null,
    itemsListSupported: value.itemsListSupported,
  });
  if (rebuilt.observationDigest !== value.observationDigest) {
    fail("codex_app_server_persisted_turn_observation_conflict", "observation digest");
  }
  return value;
}

function baselineBody(baseline) {
  return {
    threadId: baseline.threadId,
    snapshotDigest: baseline.snapshotDigest,
    threadStatus: baseline.threadStatus,
    turns: baseline.turns.map((turn) => ({
      turnId: turn.turnId,
      status: turn.status,
      clientUserMessageIds: [...turn.clientUserMessageIds],
    })),
    clientUserMessageId: baseline.clientUserMessageId,
    observationDigest: baseline.observationDigest,
  };
}

export function freezeCodexNativeTurnBaseline(
  observation,
  { clientUserMessageId } = {},
) {
  assertObservation(observation);
  boundedString(clientUserMessageId, "clientUserMessageId");
  if (observation.threadStatus !== "idle" && observation.threadStatus !== "notLoaded") {
    fail("codex_app_server_native_turn_baseline_not_idle");
  }
  const body = {
    threadId: observation.threadId,
    snapshotDigest: observation.snapshotDigest,
    threadStatus: observation.threadStatus,
    turns: Object.freeze(observation.turns.map((turn) => Object.freeze({
      turnId: turn.turnId,
      status: turn.status,
      clientUserMessageIds: Object.freeze([...turn.clientUserMessageIds]),
    }))),
    clientUserMessageId,
    observationDigest: observation.observationDigest,
  };
  return Object.freeze({
    ...body,
    baselineDigest: sha256Digest(baselineBody(body)),
  });
}

function assertBaseline(value) {
  exactKeys(value, [
    "threadId", "snapshotDigest", "threadStatus", "turns",
    "clientUserMessageId", "observationDigest",
    "baselineDigest",
  ], "baseline");
  boundedString(value.threadId, "baseline.threadId");
  digest(value.snapshotDigest, "baseline.snapshotDigest");
  digest(value.observationDigest, "baseline.observationDigest");
  boundedString(value.clientUserMessageId, "baseline.clientUserMessageId");
  runtimeThreadStatus(value.threadStatus);
  if (value.threadStatus !== "idle" && value.threadStatus !== "notLoaded") {
    fail("codex_app_server_native_turn_baseline_not_idle");
  }
  if (
    !Array.isArray(value.turns) ||
    value.turns.length > CODEX_TURN_OBSERVATION_LIMITS.maxTurns
  ) fail("codex_app_server_persisted_turn_observation_invalid", "baseline.turns");
  const turnIds = new Set();
  for (const [index, turn] of value.turns.entries()) {
    exactKeys(
      turn,
      ["turnId", "status", "clientUserMessageIds"],
      `baseline.turns[${index}]`,
    );
    boundedString(turn.turnId, `baseline.turns[${index}].turnId`);
    if (turnIds.has(turn.turnId) || !TURN_STATUSES.has(turn.status)) {
      fail("codex_app_server_persisted_turn_observation_invalid", "baseline.turns");
    }
    turnIds.add(turn.turnId);
    if (
      !Array.isArray(turn.clientUserMessageIds) ||
      turn.clientUserMessageIds.length > CODEX_TURN_OBSERVATION_LIMITS.maxItemsPerTurn ||
      new Set(turn.clientUserMessageIds).size !== turn.clientUserMessageIds.length ||
      [...turn.clientUserMessageIds].sort().join("\0") !==
        turn.clientUserMessageIds.join("\0")
    ) fail("codex_app_server_persisted_turn_observation_invalid", "baseline.clientUserMessageIds");
    for (const clientId of turn.clientUserMessageIds) {
      boundedString(clientId, `baseline.turns[${index}].clientUserMessageIds`);
    }
  }
  if (sha256Digest(baselineBody(value)) !== value.baselineDigest) {
    fail("codex_app_server_persisted_turn_observation_conflict", "baseline digest");
  }
  return value;
}

/**
 * Validate a baseline restored from runner-private durable storage.
 * This deliberately exposes validation, not baseline construction or trust.
 */
export function validateCodexNativeTurnBaseline(value) {
  assertBaseline(value);
  return Object.freeze({
    ...value,
    turns: Object.freeze(value.turns.map((turn) => Object.freeze({
      ...turn,
      clientUserMessageIds: Object.freeze([...turn.clientUserMessageIds]),
    }))),
  });
}

function result(state, reasonCode, fields = {}) {
  return Object.freeze({ state, reasonCode, ...fields });
}

export function classifyCodexNativeTurnReconciliation({ baseline, observation }) {
  assertBaseline(baseline);
  assertObservation(observation);
  if (
    baseline.threadId !== observation.threadId ||
    baseline.snapshotDigest !== observation.snapshotDigest
  ) return result("ambiguous", "codex-native-turn-identity-mismatch");
  if (observation.threadStatus !== "idle" && observation.threadStatus !== "notLoaded") {
    return result("ambiguous", "codex-native-turn-thread-not-idle");
  }
  const currentById = new Map(observation.turns.map((turn) => [turn.turnId, turn]));
  if (baseline.turns.some((turn) => !currentById.has(turn.turnId))) {
    return result("ambiguous", "codex-native-turn-baseline-truncated");
  }
  if (baseline.turns.some((turn) => {
    const current = currentById.get(turn.turnId);
    return current.status !== turn.status ||
      current.clientUserMessageIds.join("\0") !== turn.clientUserMessageIds.join("\0");
  })) {
    return result("ambiguous", "codex-native-turn-baseline-mutated");
  }
  const baselineIds = new Set(baseline.turns.map((turn) => turn.turnId));
  const delta = observation.turns.filter((turn) => !baselineIds.has(turn.turnId));
  if (delta.length === 0) {
    return result("ambiguous", "codex-native-turn-no-observable-delta");
  }
  if (delta.length !== 1) {
    return result("ambiguous", "codex-native-turn-multiple-new-turns", {
      candidateCount: delta.length,
    });
  }
  const candidate = delta[0];
  let correlation;
  if (candidate.clientUserMessageIds.length > 0) {
    if (
      candidate.clientUserMessageIds.length !== 1 ||
      candidate.clientUserMessageIds[0] !== baseline.clientUserMessageId
    ) {
      return result("ambiguous", "codex-native-turn-client-id-mismatch", {
        candidateTurnId: candidate.turnId,
      });
    }
    correlation = "client-id";
  } else {
    return result("ambiguous", "codex-native-turn-client-id-missing", {
      candidateTurnId: candidate.turnId,
    });
  }
  if (candidate.status === "completed") {
    return result("ambiguous", "codex-native-turn-completed-observation-only", {
      candidateTurnId: candidate.turnId,
      turnStatus: candidate.status,
      correlation,
      observationDigest: observation.observationDigest,
    });
  }
  if (TERMINAL_FAILURE_STATUSES.has(candidate.status)) {
    return result("found-terminal", "codex-native-turn-terminal", {
      candidateTurnId: candidate.turnId,
      turnStatus: candidate.status,
      correlation,
      baselineDigest: baseline.baselineDigest,
      observationDigest: observation.observationDigest,
      clientUserMessageIdDigest: sha256Digest(baseline.clientUserMessageId),
    });
  }
  return result("ambiguous", "codex-native-turn-still-in-progress", {
    candidateTurnId: candidate.turnId,
  });
}

export function projectCodexTerminalTurnReconciliation({ baseline, observation }) {
  const classified = classifyCodexNativeTurnReconciliation({ baseline, observation });
  if (classified.state !== "found-terminal" || classified.correlation !== "client-id") {
    fail("codex_app_server_native_turn_reconciliation_ambiguous", classified.reasonCode);
  }
  const proof = {
    baselineDigest: classified.baselineDigest,
    observationDigest: classified.observationDigest,
    clientUserMessageIdDigest: classified.clientUserMessageIdDigest,
  };
  return Object.freeze({
    state: "found-terminal",
    turnId: classified.candidateTurnId,
    turnStatus: classified.turnStatus,
    reasonCode: "threadmesh_codex_native_turn_terminal",
    evidenceRefs: Object.freeze([proof.baselineDigest, proof.observationDigest]),
    ...proof,
    correlationDigest: sha256Digest({
      threadId: baseline.threadId,
      turnId: classified.candidateTurnId,
      snapshotDigest: baseline.snapshotDigest,
      ...proof,
    }),
  });
}
