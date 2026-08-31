import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCodexNativeTurnReconciliation,
  createCodexPersistedTurnObservation,
  freezeCodexNativeTurnBaseline,
  projectCodexTerminalTurnReconciliation,
} from "../src/state/codex-turn-reconciliation.mjs";

const snapshotDigest = `sha256:${"a".repeat(64)}`;
const clientUserMessageId = "request-reconcile-01";

function turn(id, status = "completed", clientId = null) {
  return {
    id,
    status,
    items: clientId === null ? [] : [{ type: "userMessage", clientId }],
  };
}

function observation({
  readTurns = [],
  listedTurns = readTurns,
  threadStatus = "idle",
  threadId = "thread-reconcile-01",
  snapshot = snapshotDigest,
} = {}) {
  return createCodexPersistedTurnObservation({
    threadId,
    snapshotDigest: snapshot,
    threadStatus,
    readTurns,
    listedTurns,
  });
}

test("keeps zero/completed deltas observational and never infers a missing client id", () => {
  const initial = observation({ readTurns: [turn("turn-old", "completed", "old-request")] });
  const baseline = freezeCodexNativeTurnBaseline(initial, { clientUserMessageId });
  assert.equal(
    classifyCodexNativeTurnReconciliation({ baseline, observation: initial }).state,
    "ambiguous",
  );

  const completed = classifyCodexNativeTurnReconciliation({
    baseline,
    observation: observation({
      readTurns: [
        turn("turn-new", "completed", clientUserMessageId),
        turn("turn-old", "completed", "old-request"),
      ],
    }),
  });
  assert.equal(completed.state, "ambiguous");
  assert.equal(completed.reasonCode, "codex-native-turn-completed-observation-only");
  assert.equal(completed.candidateTurnId, "turn-new");
  assert.equal(completed.correlation, "client-id");

  const missing = classifyCodexNativeTurnReconciliation({
    baseline,
    observation: observation({
      readTurns: [turn("turn-new", "interrupted"), turn("turn-old", "completed", "old-request")],
    }),
  });
  assert.deepEqual(missing, {
    state: "ambiguous",
    reasonCode: "codex-native-turn-client-id-missing",
    candidateTurnId: "turn-new",
  });
});

test("classifies exact interrupted and failed observations as terminal, never completed", () => {
  const baseline = freezeCodexNativeTurnBaseline(observation(), { clientUserMessageId });
  for (const status of ["interrupted", "failed"]) {
    const classified = classifyCodexNativeTurnReconciliation({
      baseline,
      observation: observation({ readTurns: [turn(`turn-${status}`, status, clientUserMessageId)] }),
    });
    assert.equal(classified.state, "found-terminal");
    assert.equal(classified.turnStatus, status);
    assert.equal(classified.candidateTurnId, `turn-${status}`);
    assert.equal(classified.reasonCode, "codex-native-turn-terminal");
    const projected = projectCodexTerminalTurnReconciliation({
      baseline,
      observation: observation({ readTurns: [turn(`turn-${status}`, status, clientUserMessageId)] }),
    });
    assert.equal(projected.turnId, `turn-${status}`);
    assert.equal(projected.reasonCode, "threadmesh_codex_native_turn_terminal");
    assert.deepEqual(projected.evidenceRefs, [
      projected.baselineDigest,
      projected.observationDigest,
    ]);
  }
  const inProgress = classifyCodexNativeTurnReconciliation({
    baseline,
    observation: observation({ readTurns: [turn("turn-running", "inProgress", clientUserMessageId)] }),
  });
  assert.equal(inProgress.state, "ambiguous");
  assert.equal(inProgress.reasonCode, "codex-native-turn-still-in-progress");
  assert.throws(
    () => projectCodexTerminalTurnReconciliation({
      baseline,
      observation: observation({ readTurns: [turn("turn-running", "inProgress", clientUserMessageId)] }),
    }),
    (error) => error?.code === "codex_app_server_native_turn_reconciliation_ambiguous",
  );
});

test("identity, history mutation, client mismatch, and multiple deltas fail closed", () => {
  const initial = observation({ readTurns: [turn("turn-old", "completed", "old-request")] });
  const baseline = freezeCodexNativeTurnBaseline(initial, { clientUserMessageId });
  const cases = [
    ["codex-native-turn-thread-not-idle", observation({
      threadStatus: "active",
      readTurns: [turn("turn-old", "completed", "old-request")],
    })],
    ["codex-native-turn-identity-mismatch", observation({
      threadId: "thread-other",
      readTurns: [turn("turn-old", "completed", "old-request")],
    })],
    ["codex-native-turn-baseline-truncated", observation()],
    ["codex-native-turn-baseline-mutated", observation({
      readTurns: [turn("turn-old", "interrupted", "old-request")],
    })],
    ["codex-native-turn-client-id-mismatch", observation({
      readTurns: [turn("turn-new", "completed", "wrong-request"), turn("turn-old", "completed", "old-request")],
    })],
    ["codex-native-turn-multiple-new-turns", observation({
      readTurns: [
        turn("turn-new-2", "completed", clientUserMessageId),
        turn("turn-new-1", "completed", clientUserMessageId),
        turn("turn-old", "completed", "old-request"),
      ],
    })],
  ];
  for (const [reasonCode, current] of cases) {
    const classified = classifyCodexNativeTurnReconciliation({ baseline, observation: current });
    assert.equal(classified.state, "ambiguous");
    assert.equal(classified.reasonCode, reasonCode);
  }
});

test("baseline and read/list projections are strict, digest-bound, and idle-only", () => {
  for (const threadStatus of ["active", "systemError"]) {
    assert.throws(
      () => freezeCodexNativeTurnBaseline(observation({ threadStatus }), { clientUserMessageId }),
      (error) => error?.code === "codex_app_server_native_turn_baseline_not_idle",
    );
  }
  assert.throws(
    () => observation({
      readTurns: [turn("turn-1", "completed", "client-a")],
      listedTurns: [turn("turn-1", "completed", "client-b")],
    }),
    (error) => error?.code === "codex_app_server_persisted_turn_observation_conflict",
  );
  const baseline = freezeCodexNativeTurnBaseline(observation(), { clientUserMessageId });
  assert.throws(
    () => classifyCodexNativeTurnReconciliation({
      baseline: { ...baseline, clientUserMessageId: "tampered" },
      observation: observation(),
    }),
    (error) => error?.code === "codex_app_server_persisted_turn_observation_conflict",
  );
});

test("supported item pages remain valid through freeze and terminal projection", () => {
  const baselineObservation = createCodexPersistedTurnObservation({
    threadId: "thread-reconcile-01",
    snapshotDigest,
    threadStatus: "idle",
    readTurns: [],
    listedTurns: [],
    itemPages: {},
    itemsListSupported: true,
  });
  const baseline = freezeCodexNativeTurnBaseline(baselineObservation, {
    clientUserMessageId,
  });
  const terminalTurn = turn("turn-supported-items", "interrupted", clientUserMessageId);
  const terminalObservation = createCodexPersistedTurnObservation({
    threadId: "thread-reconcile-01",
    snapshotDigest,
    threadStatus: "notLoaded",
    readTurns: [terminalTurn],
    listedTurns: [{ ...terminalTurn, items: [] }],
    itemPages: { "turn-supported-items": terminalTurn.items },
    itemsListSupported: true,
  });
  const projected = projectCodexTerminalTurnReconciliation({
    baseline,
    observation: terminalObservation,
  });
  assert.equal(projected.state, "found-terminal");
  assert.equal(projected.turnId, "turn-supported-items");
  assert.deepEqual(projected.evidenceRefs, [
    baseline.baselineDigest,
    terminalObservation.observationDigest,
  ]);
});
