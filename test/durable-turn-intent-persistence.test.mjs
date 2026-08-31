import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  createCodexPersistedTurnObservation,
  freezeCodexNativeTurnBaseline,
  projectCodexTerminalTurnReconciliation,
} from "../src/state/codex-turn-reconciliation.mjs";
import { sha256Digest } from "../src/canonical-json.mjs";
import {
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";

const NOW = Date.parse("2026-08-31T12:00:00.000Z");
const owner = Object.freeze({ kind: "user", principalId: "owner_turn_state" });
const digest = (value) => sha256Digest({ value });
const sha = (character) => character.repeat(40);

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-turn-state-"));
  return {
    directory,
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function signer() {
  const { publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId: "threadmesh://turn-test/key/1",
    algorithm: "ed25519",
    actorId: "turn-test-verifier",
    trustDomain: "threadmesh://turn-test",
    policyId: "threadmesh://turn-test/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
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

function principal(value) {
  return { kind: "task", taskId: value.taskId, incarnationId: value.incarnationId };
}

function setup(filename) {
  const trustAnchor = signer();
  const actors = {
    implementer: actor("implementer", "a"),
    reviewer: actor("reviewer", "b"),
    verifier: actor("verifier", "c"),
  };
  const coordinator = new SqliteCoordinator({
    filename,
    clock: () => NOW,
    verificationTrustAnchors: [trustAnchor],
  });
  for (const current of Object.values(actors)) {
    coordinator.registerTask({
      taskId: current.taskId,
      incarnationId: current.incarnationId,
      harness: "codex",
      state: "idle",
      adapterRef: {
        kind: "codex-app-server",
        threadId: current.threadId,
        snapshotDigest: current.snapshotDigest,
      },
    }, owner);
  }
  const requirementInput = {
    chainId: "chain_turn_execution_01",
    validatedBaseSha: sha("1"),
    fixtureSeedSha: sha("2"),
    fixtureDefinitionDigest: digest("fixture"),
    trustedTestBlobDigest: digest("tests"),
    ...actors,
    preconfiguredTrustAnchorDigest: sha256Digest(trustAnchor),
  };
  const requirement = coordinator.createGitEvidenceRequirement(requirementInput, owner);
  coordinator.db.prepare(
    `INSERT INTO messages (
       sender_incarnation_id, message_id, target_task_id,
       target_incarnation_id, relationship_id, grant_id, grant_version,
       envelope_digest, envelope_json, expires_at, created_at, claim_status
     ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, '{}', ?, ?, 'unverified')`,
  ).run(
    "inc_sender_01", "msg_attention_01", actors.implementer.taskId,
    actors.implementer.incarnationId, "rel_attention", "grant_attention",
    digest("envelope"), "2026-09-01T00:00:00.000Z",
    new Date(NOW).toISOString(),
  );
  coordinator.db.prepare(
    `INSERT INTO audit_events (
       event_id, sender_incarnation_id, message_id, event_type,
       revision, detail_json, occurred_at
     ) VALUES ('evt_attention_01', 'inc_sender_01', 'msg_attention_01',
       'message-submitted', 0, '{}', ?)`,
  ).run(new Date(NOW).toISOString());
  return { coordinator, actors, trustAnchor, requirement };
}

function proposal(current, suffix = "01") {
  return {
    intentId: `intent_turn_${suffix}`,
    scenarioId: "scenario_attention_01",
    chainId: "chain_turn_execution_01",
    messageId: "msg_attention_01",
    eventId: "evt_attention_01",
    actor: current,
    adapterIdempotencyKey: `adapter_turn_${suffix}`,
    promptDigest: digest(`prompt-${suffix}`),
    allowedTools: [
      "threadmesh_fixture_write",
      "threadmesh_publish_artifact",
      "threadmesh_publish_dependency",
    ],
  };
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

function expectCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("persists pre-start, operation, model action, receipt, evidence reference, and attention promotion", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    const current = context.actors.implementer;
    const actorPrincipal = principal(current);
    let execution = coordinator.createTurnExecutionIntent(proposal(current), 0, actorPrincipal);
    assert.equal(execution.intent.state, "proposed");
    execution = coordinator.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    assert.equal(execution.acquired, true);
    const replayedStart = coordinator.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    assert.equal(replayedStart.acquired, false);
    assert.equal(replayedStart.replay, true);

    execution = coordinator.bindStartedTurnExecutionOperation(
      execution.executionId, { turnId: "turn-native-01", expectedRevision: 1 }, actorPrincipal,
    );
    execution = coordinator.recordModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-native-01",
        callId: "call-write-01",
        ordinal: 0,
        name: "threadmesh_fixture_write",
        arguments: { dependencyId: "dep-01", version: 1 },
        expectedRevision: 2,
        expectedActionHeadDigest: null,
      },
      actorPrincipal,
    );
    const fixtureSelection = execution.actions[0];
    execution = coordinator.completeModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-native-01", callId: "call-write-01", ordinal: 0,
        resultDigest: digest("write-result"), resultStatus: "completed",
        expectedRevision: 3,
        expectedActionHeadDigest: fixtureSelection.selectionDigest,
      },
      actorPrincipal,
    );
    const fixtureAction = execution.actions[0];
    execution = coordinator.recordModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-native-01",
        callId: "call-publish-01",
        ordinal: 1,
        name: "threadmesh_publish_artifact",
        arguments: { commitSha: sha("3") },
        expectedRevision: 4,
        expectedActionHeadDigest: fixtureAction.selectionDigest,
      },
      actorPrincipal,
    );
    const publishSelection = execution.actions[1];
    execution = coordinator.completeModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-native-01", callId: "call-publish-01", ordinal: 1,
        resultDigest: digest("publish-result"), resultStatus: "completed",
        expectedRevision: 5,
        expectedActionHeadDigest: publishSelection.selectionDigest,
      },
      actorPrincipal,
    );
    const action = execution.actions[1];
    execution = coordinator.bindCompletedTurnExecution(
      execution.executionId,
      {
        binding: completedBinding(current, "turn-native-01", execution.actions),
        expectedRevision: 6,
      },
      actorPrincipal,
    );
    assert.equal(execution.intent.state, "completed-turn-bound");

    const evidencePayload = {
      actor: current,
      turnId: "turn-native-01",
      toolCallDigest: action.actionDigest,
      commitSha: sha("3"),
      parentSha: sha("2"),
      treeSha: sha("4"),
      diffDigest: digest("diff"),
      testEvidenceDigest: digest("test-evidence"),
    };
    expectCode(
      () => coordinator.promoteTurnExecutionWithGitEvidenceRecord(
        execution.executionId,
        {
          stage: "implementation",
          payload: { ...evidencePayload, toolCallDigest: fixtureAction.actionDigest },
          expectedRevision: 7, expectedEvidenceChainRevision: 0,
          expectedEvidenceChainHead: null,
        },
        actorPrincipal,
      ),
      "threadmesh_turn_execution_stage_tool_mismatch",
    );
    execution = coordinator.promoteTurnExecutionWithGitEvidenceRecord(
      execution.executionId,
      {
        stage: "implementation",
        expectedRevision: 7,
        payload: evidencePayload,
        expectedEvidenceChainRevision: 0,
        expectedEvidenceChainHead: null,
      },
      actorPrincipal,
    );
    assert.equal(execution.intent.state, "promoted");
    const promotionReplay = coordinator.promoteTurnExecutionWithGitEvidenceRecord(
      execution.executionId,
      {
        stage: "implementation", payload: evidencePayload,
        expectedRevision: 7, expectedEvidenceChainRevision: 0,
        expectedEvidenceChainHead: null,
      },
      actorPrincipal,
    );
    assert.equal(promotionReplay.replay, true);
    expectCode(
      () => coordinator.promoteTurnExecutionWithGitEvidenceRecord(
        execution.executionId,
        {
          stage: "implementation",
          payload: { ...evidencePayload, diffDigest: digest("altered") },
          expectedRevision: 7, expectedEvidenceChainRevision: 0,
          expectedEvidenceChainHead: null,
        },
        actorPrincipal,
      ),
      "threadmesh_turn_execution_promotion_conflict",
    );

    const claimed = coordinator.claimAttentionEvent(
      current,
      {
        claimEpoch: "claim_attention_01",
        eventCursor: 1,
        eventId: "evt_attention_01",
        expectedRevision: 0,
      },
      actorPrincipal,
    );
    assert.equal(claimed.acquired, true);
    const bound = coordinator.bindCompletedAttentionHandler(
      "claim_attention_01",
      { turnExecutionId: execution.executionId, expectedRevision: 0 },
      actorPrincipal,
    );
    assert.equal(bound.claim.state, "completed-bound");
    assert.equal(coordinator.getAttentionCursor(current, actorPrincipal).cursor.committedCursor, 0);
    const abandonedBound = coordinator.abandonAttentionHandler(
      "claim_attention_01", { expectedRevision: 1 }, actorPrincipal,
    );
    assert.equal(abandonedBound.claim.turnExecutionId, execution.executionId);
    const reopenedBound = coordinator.reopenAbandonedAttentionHandler(
      "claim_attention_01", { expectedRevision: 2 }, actorPrincipal,
    );
    assert.equal(reopenedBound.claim.state, "completed-bound");
    assert.equal(reopenedBound.claim.turnExecutionId, execution.executionId);
    expectCode(
      () => coordinator.bindCompletedAttentionHandler(
        "claim_attention_01",
        { turnExecutionId: "intent_second_completed_turn", expectedRevision: 3 },
        actorPrincipal,
      ),
      "threadmesh_attention_claim_revision_conflict",
    );
    const promoted = coordinator.promoteAttentionHandler(
      "claim_attention_01",
      { expectedClaimRevision: 3, expectedCursorRevision: 1 },
      actorPrincipal,
    );
    assert.equal(promoted.cursor.committedCursor, 1);
    coordinator.db.prepare(
      `INSERT INTO audit_events (
         event_id, sender_incarnation_id, message_id, event_type,
         revision, detail_json, occurred_at
       ) VALUES (?, 'inc_sender_01', 'msg_attention_01',
         'delivery-updated', ?, '{}', ?)`,
    ).run("evt_attention_02", 1, new Date(NOW).toISOString());
    coordinator.db.prepare(
      `INSERT INTO audit_events (
         event_id, sender_incarnation_id, message_id, event_type,
         revision, detail_json, occurred_at
       ) VALUES (?, 'inc_sender_01', 'msg_attention_01',
         'decision-updated', ?, '{}', ?)`,
    ).run("evt_attention_03", 2, new Date(NOW).toISOString());
    expectCode(
      () => coordinator.advanceAttentionCursor(
        current,
        {
          eventCursor: 3,
          eventId: "evt_attention_03",
          classificationDigest: digest("irrelevant-3"),
          expectedRevision: 2,
        },
        actorPrincipal,
      ),
      "threadmesh_attention_event_not_next",
    );
    const skipped = coordinator.advanceAttentionCursor(
      current,
      {
        eventCursor: 2,
        eventId: "evt_attention_02",
        classificationDigest: digest("irrelevant-2"),
        expectedRevision: 2,
      },
      actorPrincipal,
    );
    assert.equal(skipped.cursor.committedCursor, 2);

    coordinator.close();
    coordinator = new SqliteCoordinator({
      filename: temporary.filename,
      clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    assert.equal(coordinator.getTurnExecution(execution.executionId, owner).intent.state, "promoted");
    assert.equal(coordinator.getAttentionCursor(current, owner).cursor.committedCursor, 2);
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("unknown outcome is reconcile-only and two coordinators cannot claim the same receiver cursor", () => {
  const temporary = temporaryDatabase();
  let first;
  let second;
  try {
    const context = setup(temporary.filename);
    first = context.coordinator;
    const current = context.actors.implementer;
    const actorPrincipal = principal(current);
    let execution = first.createTurnExecutionIntent(proposal(current, "unknown"), 0, actorPrincipal);
    second = new SqliteCoordinator({
      filename: temporary.filename,
      clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    execution = first.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    const lostStartRace = second.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    assert.equal(lostStartRace.acquired, false);
    execution = first.markTurnExecutionOutcomeUnknown(
      execution.executionId,
      { reasonCode: "threadmesh_native_turn_timeout", expectedRevision: 1 },
      actorPrincipal,
    );
    expectCode(
      () => first.bindStartedTurnExecutionOperation(
        execution.executionId, { turnId: "turn-late", expectedRevision: 2 }, actorPrincipal,
      ),
      "threadmesh_durable_turn_intent_not_started",
    );
    execution = first.reconcileTurnExecution(
      execution.executionId,
      {
        result: { state: "not-found", reasonCode: "threadmesh_native_turn_not_found" },
        expectedRevision: 2,
      },
      actorPrincipal,
    );
    assert.equal(execution.intent.state, "abandoned");

    const won = first.claimAttentionEvent(
      current,
      {
        claimEpoch: "claim_race_first",
        eventCursor: 1,
        eventId: "evt_attention_01",
        expectedRevision: 0,
      },
      actorPrincipal,
    );
    assert.equal(won.acquired, true);
    const abandoned = first.abandonAttentionHandler(
      "claim_race_first", { expectedRevision: 0 }, actorPrincipal,
    );
    assert.equal(abandoned.claim.state, "abandoned");
    expectCode(
      () => second.claimAttentionEvent(
        current,
        {
          claimEpoch: "claim_race_second",
          eventCursor: 1,
          eventId: "evt_attention_01",
          expectedRevision: 0,
        },
        actorPrincipal,
      ),
      "threadmesh_attention_claim_conflict",
    );
    const reopened = first.reopenAbandonedAttentionHandler(
      "claim_race_first", { expectedRevision: 1 }, actorPrincipal,
    );
    assert.equal(reopened.claim.state, "claimed");
  } finally {
    second?.close();
    first?.close();
    temporary.cleanup();
  }
});

test("terminal reconciliation survives restart, replays exactly, and rejects conflicting evidence", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    const current = context.actors.implementer;
    const actorPrincipal = principal(current);
    const proposed = proposal(current, "terminal-recovery");
    let execution = coordinator.createTurnExecutionIntent(proposed, 0, actorPrincipal);
    execution = coordinator.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    execution = coordinator.markTurnExecutionOutcomeUnknown(
      execution.executionId,
      { reasonCode: "threadmesh_start_response_lost", expectedRevision: 1 },
      actorPrincipal,
    );
    const baselineObservation = createCodexPersistedTurnObservation({
      threadId: current.threadId,
      snapshotDigest: current.snapshotDigest,
      threadStatus: "idle",
      readTurns: [],
      listedTurns: [],
    });
    const baseline = freezeCodexNativeTurnBaseline(baselineObservation, {
      clientUserMessageId: proposed.adapterIdempotencyKey,
    });
    const terminalTurn = {
      id: "turn-terminal-recovery",
      status: "interrupted",
      items: [{ type: "userMessage", clientId: proposed.adapterIdempotencyKey }],
    };
    const terminalObservation = createCodexPersistedTurnObservation({
      threadId: current.threadId,
      snapshotDigest: current.snapshotDigest,
      threadStatus: "notLoaded",
      readTurns: [terminalTurn],
      listedTurns: [terminalTurn],
    });
    const result = projectCodexTerminalTurnReconciliation({
      baseline,
      observation: terminalObservation,
    });
    for (const untrustedTurn of [
      { ...terminalTurn, status: "completed" },
      { ...terminalTurn, items: [] },
    ]) {
      const untrustedObservation = createCodexPersistedTurnObservation({
        threadId: current.threadId,
        snapshotDigest: current.snapshotDigest,
        threadStatus: "notLoaded",
        readTurns: [untrustedTurn],
        listedTurns: [untrustedTurn],
      });
      expectCode(
        () => projectCodexTerminalTurnReconciliation({
          baseline,
          observation: untrustedObservation,
        }),
        "codex_app_server_native_turn_reconciliation_ambiguous",
      );
    }
    expectCode(
      () => coordinator.reconcileTurnExecution(
        execution.executionId,
        {
          result: {
            ...result,
            clientUserMessageIdDigest: sha256Digest("another-client-key"),
          },
          expectedRevision: 2,
        },
        actorPrincipal,
      ),
      "threadmesh_turn_execution_terminal_projection_required",
    );
    const otherKey = "adapter_turn_other-key";
    const otherBaseline = freezeCodexNativeTurnBaseline(baselineObservation, {
      clientUserMessageId: otherKey,
    });
    const otherTerminalTurn = {
      ...terminalTurn,
      items: [{ type: "userMessage", clientId: otherKey }],
    };
    const otherObservation = createCodexPersistedTurnObservation({
      threadId: current.threadId,
      snapshotDigest: current.snapshotDigest,
      threadStatus: "notLoaded",
      readTurns: [otherTerminalTurn],
      listedTurns: [otherTerminalTurn],
    });
    expectCode(
      () => coordinator.reconcileCodexTerminalTurnExecution(
        execution.executionId,
        { baseline: otherBaseline, observation: otherObservation, expectedRevision: 2 },
        actorPrincipal,
      ),
      "threadmesh_durable_turn_intent_reconcile_invalid",
    );
    assert.equal(
      coordinator.getTurnExecution(execution.executionId, owner).revision,
      2,
    );
    execution = coordinator.reconcileCodexTerminalTurnExecution(
      execution.executionId,
      { baseline, observation: terminalObservation, expectedRevision: 2 },
      actorPrincipal,
    );
    assert.equal(execution.intent.state, "abandoned");
    assert.equal(execution.intent.turnStart.turnId, result.turnId);
    assert.deepEqual(execution.intent.abandonment.evidenceRefs, result.evidenceRefs);
    assert.equal(execution.actions.length, 0);
    assert.equal(execution.row.receipt_json, null);

    coordinator.close();
    coordinator = new SqliteCoordinator({
      filename: temporary.filename,
      clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    const replay = coordinator.reconcileCodexTerminalTurnExecution(
      execution.executionId,
      { baseline, observation: terminalObservation, expectedRevision: 2 },
      actorPrincipal,
    );
    assert.equal(replay.replay, true);
    assert.equal(replay.revision, 3);
    expectCode(
      () => coordinator.reconcileCodexTerminalTurnExecution(
        execution.executionId,
        {
          baseline,
          observation: createCodexPersistedTurnObservation({
            threadId: current.threadId,
            snapshotDigest: current.snapshotDigest,
            threadStatus: "notLoaded",
            readTurns: [{ ...terminalTurn, status: "failed" }],
            listedTurns: [{ ...terminalTurn, status: "failed" }],
          }),
          expectedRevision: 3,
        },
        actorPrincipal,
      ),
      "threadmesh_turn_execution_reconciliation_conflict",
    );

    const tampered = { ...result, evidenceRefs: ["sha256:tampered"] };
    coordinator.db.prepare(
      `UPDATE turn_execution_intents
       SET reconciliation_json = ?, reconciliation_digest = ?
       WHERE execution_id = ?`,
    ).run(JSON.stringify(tampered), sha256Digest(tampered), execution.executionId);
    coordinator.close();
    coordinator = null;
    expectCode(
      () => new SqliteCoordinator({
        filename: temporary.filename,
        clock: () => NOW,
        verificationTrustAnchors: [context.trustAnchor],
      }),
      "threadmesh_turn_execution_storage_tampered",
    );
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("selection admission survives every callback fault boundary and unknown recovery cannot invent a tool", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    const current = context.actors.implementer;
    const actorPrincipal = principal(current);
    let execution = coordinator.createTurnExecutionIntent(
      proposal(current, "fault-boundary"), 0, actorPrincipal,
    );
    execution = coordinator.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    execution = coordinator.bindStartedTurnExecutionOperation(
      execution.executionId,
      { turnId: "turn-fault-boundary", expectedRevision: 1 },
      actorPrincipal,
    );
    execution = coordinator.recordModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-fault-boundary", callId: "call-fault-boundary",
        ordinal: 0, name: "threadmesh_publish_artifact",
        arguments: { commitSha: sha("7") }, expectedRevision: 2,
        expectedActionHeadDigest: null,
      },
      actorPrincipal,
    );
    assert.equal(execution.actions[0].resultDigest, null);
    assert.equal(execution.actions[0].actionDigest, null);
    coordinator.close();
    coordinator = new SqliteCoordinator({
      filename: temporary.filename, clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    execution = coordinator.getTurnExecution(execution.executionId, actorPrincipal);
    assert.equal(execution.actions[0].resultStatus, null);
    const recoveredAction = {
      ...execution.actions[0],
      resultDigest: digest("recovered-tool-result"),
      resultStatus: "completed",
    };
    expectCode(
      () => coordinator.bindCompletedTurnExecution(
        execution.executionId,
        {
          binding: completedBinding(current, "turn-fault-boundary", [recoveredAction]),
          expectedRevision: 3,
        },
        actorPrincipal,
      ),
      "threadmesh_durable_turn_intent_tool_action_not_completed",
    );
    execution = coordinator.markTurnExecutionOutcomeUnknown(
      execution.executionId,
      { reasonCode: "threadmesh_tool_result_lost", expectedRevision: 3 },
      actorPrincipal,
    );
    coordinator.close();
    coordinator = new SqliteCoordinator({
      filename: temporary.filename, clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    expectCode(
      () => coordinator.completeModelSelectedTurnToolAction(
        execution.executionId,
        {
          turnId: "turn-fault-boundary", callId: "call-fault-boundary",
          ordinal: 0, resultDigest: recoveredAction.resultDigest,
          resultStatus: "completed", expectedRevision: 4,
          expectedActionHeadDigest: execution.actionHeadDigest,
        },
        actorPrincipal,
      ),
      "threadmesh_durable_turn_intent_not_started",
    );
    const validBinding = completedBinding(
      current, "turn-fault-boundary", [recoveredAction],
    );
    const inventedBinding = {
      ...validBinding,
      toolCalls: [...validBinding.toolCalls, {
        ...validBinding.toolCalls[0], ordinal: 1, callId: "invented-call",
      }],
    };
    expectCode(
      () => coordinator.reconcileTurnExecution(
        execution.executionId,
        { result: { state: "found", binding: inventedBinding }, expectedRevision: 4 },
        actorPrincipal,
      ),
      "threadmesh_durable_turn_intent_tool_calls_invalid",
    );
    execution = coordinator.reconcileTurnExecution(
      execution.executionId,
      { result: { state: "found", binding: validBinding }, expectedRevision: 4 },
      actorPrincipal,
    );
    assert.equal(execution.intent.state, "completed-turn-bound");
    assert.equal(execution.actions[0].resultDigest, recoveredAction.resultDigest);
    assert.match(execution.actions[0].actionDigest, /^sha256:[a-f0-9]{64}$/u);
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("v5 migrates append-only to exact v6 and header/action tampering fails restart", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    const current = context.actors.implementer;
    const actorPrincipal = principal(current);
    let execution = coordinator.createTurnExecutionIntent(proposal(current), 0, actorPrincipal);
    execution = coordinator.markTurnExecutionStarted(
      execution.executionId, { expectedRevision: 0 }, actorPrincipal,
    );
    execution = coordinator.bindStartedTurnExecutionOperation(
      execution.executionId, { turnId: "turn-tamper", expectedRevision: 1 }, actorPrincipal,
    );
    execution = coordinator.recordModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId: "turn-tamper", callId: "call-tamper", ordinal: 0,
        name: "threadmesh_publish_dependency", arguments: { safe: true },
        resultDigest: digest("result"), resultStatus: "completed",
        expectedRevision: 2, expectedActionHeadDigest: null,
      },
      actorPrincipal,
    );
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    database.prepare("DELETE FROM turn_tool_actions WHERE execution_id = ? AND ordinal = 0")
      .run(execution.executionId);
    database.close();
    expectCode(
      () => new SqliteCoordinator({
        filename: temporary.filename,
        clock: () => NOW,
        verificationTrustAnchors: [context.trustAnchor],
      }),
      "threadmesh_turn_execution_storage_tampered",
    );
    const v5 = SQLITE_SCHEMA_MIGRATIONS.find(({ version }) => version === 5);
    assert.equal(SQLITE_SCHEMA_VERSION, 9);
    assert.equal(v5.checksum, "sha256:ec846132a72bb7001029548400bff8c5781fadcdec7b8eedc5aec43b2422ec8e");
    assert.ok(SQLITE_SCHEMA_MIGRATIONS.find(({ version }) => version === 6).manifest.constraints);
    assert.equal(
      SQLITE_SCHEMA_MIGRATIONS.find(({ version }) => version === 6).checksum,
      "sha256:66bdfb81983288ea288970214c831731ecd8227907867958339454a2015f4563",
    );
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("upgrades a real v5 fixture without changing its checksum or task data", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    const v5Checksum = database.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 5",
    ).pluck().get();
    const taskCount = database.prepare("SELECT COUNT(*) FROM tasks").pluck().get();
    database.exec(`
      DROP TABLE attention_handler_claims;
      DROP TABLE attention_cursor_commits;
      DROP TABLE attention_receiver_cursors;
      DROP TABLE turn_tool_actions;
      DROP TABLE turn_execution_intents;
      DELETE FROM schema_migrations WHERE version = 6;
      PRAGMA user_version = 5;
    `);
    database.close();
    coordinator = new SqliteCoordinator({
      filename: temporary.filename,
      clock: () => NOW,
      verificationTrustAnchors: [context.trustAnchor],
    });
    assert.equal(coordinator.storageInfo().schemaVersion, SQLITE_SCHEMA_VERSION);
    assert.equal(coordinator.db.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 5",
    ).pluck().get(), v5Checksum);
    assert.equal(coordinator.db.prepare("SELECT COUNT(*) FROM tasks").pluck().get(), taskCount);
    assert.equal(v5Checksum, "sha256:ec846132a72bb7001029548400bff8c5781fadcdec7b8eedc5aec43b2422ec8e");
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("rejects v6 index drift even when the expected index name remains", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    const context = setup(temporary.filename);
    coordinator = context.coordinator;
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    database.exec(`
      DROP INDEX turn_tool_actions_execution_ordinal;
      CREATE INDEX turn_tool_actions_execution_ordinal
        ON turn_tool_actions (execution_id, call_id);
    `);
    database.close();
    expectCode(
      () => new SqliteCoordinator({
        filename: temporary.filename,
        clock: () => NOW,
        verificationTrustAnchors: [context.trustAnchor],
      }),
      "threadmesh_storage_schema_incompatible",
    );
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});
