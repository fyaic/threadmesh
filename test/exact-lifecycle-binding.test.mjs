import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { canonicalJson, sha256Digest } from "../src/canonical-json.mjs";
import {
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";
import {
  evaluateAttentionRoute,
  projectLifecycleEventToEnvelope,
} from "../src/routing/lifecycle-events.mjs";

const NOW = Date.parse("2026-09-01T08:00:00.000Z");
const owner = { kind: "user", principalId: "owner_v8" };
const sender = {
  taskId: "task_v8_sender", incarnationId: "inc_v8_sender_01",
  threadId: "thread-v8-sender", snapshotDigest: `sha256:${"a".repeat(64)}`,
};
const receiver = {
  taskId: "task_v8_receiver", incarnationId: "inc_v8_receiver_01",
  threadId: "thread-v8-receiver", snapshotDigest: `sha256:${"b".repeat(64)}`,
};
const senderPrincipal = { kind: "task", taskId: sender.taskId, incarnationId: sender.incarnationId };
const receiverPrincipal = {
  kind: "task", taskId: receiver.taskId, incarnationId: receiver.incarnationId,
};
const grant = {
  specVersion: "0.0-draft",
  grantId: "grant_v8_lifecycle",
  grantVersion: 1,
  relationshipId: "rel_v8_lifecycle",
  relationshipType: "peer",
  source: { taskId: sender.taskId, incarnationId: sender.incarnationId },
  target: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
  allowedIntents: ["suggest"],
  allowedDeliveryModes: ["checkpoint-offer"],
  summaryVisibility: "coordination",
  structuredGateResponses: false,
  createdAt: "2026-09-01T07:00:00.000Z",
  expiresAt: "2026-09-01T10:00:00.000Z",
};

function principal(actor) {
  return { kind: "task", taskId: actor.taskId, incarnationId: actor.incarnationId };
}

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-v8-binding-"));
  return {
    directory,
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function event(overrides = {}) {
  return {
    eventType: "artifact-ready",
    messageId: "msg_v8_artifact_01",
    sender: {
      taskId: sender.taskId, incarnationId: sender.incarnationId,
      actorType: "agent", harness: "codex",
    },
    target: {
      taskId: receiver.taskId, incarnationId: receiver.incarnationId,
      harness: "codex",
    },
    relationshipId: grant.relationshipId,
    content: "Implementation artifact is ready for receiver review.",
    reason: "A completed model-selected publish action emitted it.",
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
    ...overrides,
  };
}

function actionEventBody(value) {
  return {
    eventType: value.eventType,
    messageId: value.messageId,
    target: { ...value.target },
    relationshipId: value.relationshipId,
    content: value.content,
    reason: value.reason,
    evidenceRefs: [...(value.evidenceRefs ?? [])],
    freshness: { ...value.freshness },
    causality: value.causality ? { ...value.causality } : null,
  };
}

function setup(filename) {
  const coordinator = new SqliteCoordinator({ filename, clock: () => NOW });
  for (const actor of [sender, receiver]) {
    coordinator.registerTask({
      taskId: actor.taskId,
      incarnationId: actor.incarnationId,
      harness: "codex",
      state: "idle",
      runtime: { objectiveVersion: 1 },
      adapterRef: {
        kind: "codex-app-server",
        threadId: actor.threadId,
        snapshotDigest: actor.snapshotDigest,
      },
    }, owner);
  }
  coordinator.issueGrant(grant, {
    decisionId: "decision_v8_grant",
    authenticationId: "authn_v8_grant",
    decidedAt: grant.createdAt,
  }, owner);
  return coordinator;
}

function completedBinding(actor, turnId, actions) {
  const receipt = {
    adapterOperationId: turnId,
    acceptedAt: new Date(NOW).toISOString(),
    evidenceRefs: [`codex://turn/${turnId}`],
  };
  return {
    evidence: {
      threadId: actor.threadId,
      turnId,
      turnStatus: "completed",
      completedAt: new Date(NOW).toISOString(),
      durationMs: 1,
      userAgent: "codex-v8-test",
      snapshotDigest: actor.snapshotDigest,
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
      resultStatus: action.resultStatus,
    })),
    nonThreadMeshToolCalls: 0,
  };
}

function completedExecution({
  coordinator, actor, suffix, messageId, eventId, tool, argumentsValue,
  resultDigest, withAction = true,
}) {
  const actorPrincipal = principal(actor);
  let execution = coordinator.createTurnExecutionIntent({
    intentId: `exec_v8_${suffix}`,
    scenarioId: "scenario_v8_binding",
    chainId: "chain_v8_binding",
    messageId,
    eventId,
    actor,
    adapterIdempotencyKey: `adapter_v8_${suffix}`,
    promptDigest: sha256Digest({ prompt: suffix }),
    allowedTools: [tool],
  }, 0, actorPrincipal);
  execution = coordinator.markTurnExecutionStarted(
    execution.executionId, { expectedRevision: 0 }, actorPrincipal,
  );
  const turnId = `turn-v8-${suffix}`;
  execution = coordinator.bindStartedTurnExecutionOperation(
    execution.executionId, { turnId, expectedRevision: 1 }, actorPrincipal,
  );
  let revision = 2;
  if (withAction) {
    execution = coordinator.recordModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId, callId: `call-v8-${suffix}`, ordinal: 0, name: tool,
        arguments: argumentsValue, expectedRevision: revision,
        expectedActionHeadDigest: null,
      },
      actorPrincipal,
    );
    revision += 1;
    execution = coordinator.completeModelSelectedTurnToolAction(
      execution.executionId,
      {
        turnId, callId: `call-v8-${suffix}`, ordinal: 0,
        resultDigest, resultStatus: "completed", expectedRevision: revision,
        expectedActionHeadDigest: execution.actionHeadDigest,
      },
      actorPrincipal,
    );
    revision += 1;
  }
  execution = coordinator.bindCompletedTurnExecution(
    execution.executionId,
    { binding: completedBinding(actor, turnId, execution.actions), expectedRevision: revision },
    actorPrincipal,
  );
  return execution;
}

function routeProjection(sourceEvent) {
  return evaluateAttentionRoute({
    event: sourceEvent,
    receiverTask: receiver,
    subscribedEventTypes: ["artifact-ready"],
    seenMessageIds: [],
    grant,
    currentGrant: grant,
    sourceTask: sender,
    targetTask: { ...receiver, objectiveVersion: 1 },
    now: NOW,
  });
}

function stagedDecisionDigest(messageId, decision) {
  return sha256Digest({
    state: "selection-staged",
    authority: "non-authoritative",
    selectionDigest: sha256Digest({ messageId, decision }),
  });
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("lifecycle source binds to intent event/message id and rejects a third value", () => {
  for (const [suffix, sourceEventId, accepted] of [
    ["message_source", "msg_v8_artifact_01", true],
    ["third_source", "event_unbound_third_value", false],
  ]) {
    const temporary = temporaryDatabase();
    const coordinator = setup(temporary.filename);
    try {
      const sourceEvent = event();
      const execution = completedExecution({
        coordinator, actor: sender, suffix,
        messageId: sourceEvent.messageId, eventId: `evt_v8_${suffix}`,
        tool: "threadmesh_publish_artifact",
        argumentsValue: {
          sourceEventId,
          event: actionEventBody(sourceEvent),
          commitSha: "1".repeat(40),
        },
        resultDigest: sha256Digest({ published: true }),
      });
      const publish = () => coordinator.publishLifecycleFromCompletedAction(
        execution.executionId,
        {
          expectedTool: "threadmesh_publish_artifact",
          event: sourceEvent,
          expectedMaterial: { commitSha: "1".repeat(40) },
        },
        senderPrincipal,
      );
      if (accepted) assert.equal(publish().replay, false);
      else expectCode(publish, "threadmesh_lifecycle_publication_action_mismatch");
    } finally {
      coordinator.close();
      temporary.cleanup();
    }
  }
});

function turnIntentHeaderDigest(intent) {
  return sha256Digest({
    intentId: intent.intentId,
    scenarioId: intent.scenarioId,
    chainId: intent.chainId,
    messageId: intent.messageId,
    eventId: intent.eventId,
    actor: intent.actor,
    adapterIdempotencyKey: intent.adapterIdempotencyKey,
    promptDigest: intent.promptDigest,
    allowedTools: intent.allowedTools,
  });
}

function tamperedCopyFails(source, directory, name, mutate) {
  const filename = path.join(directory, `${name}.sqlite`);
  fs.copyFileSync(source, filename);
  const database = new Database(filename);
  mutate(database);
  database.close();
  assert.throws(
    () => new SqliteCoordinator({ filename, clock: () => NOW }),
    (error) => typeof error?.code === "string" && error.code.startsWith("threadmesh_"),
  );
}

test("v8 atomically binds lifecycle publication, receiver decision, and admitted turn", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    coordinator = setup(temporary.filename);
    const sourceEvent = event();
    const publishArgs = {
      sourceEventId: "evt_v8_source_01",
      event: actionEventBody(sourceEvent),
      commitSha: "1".repeat(40),
    };
    const publicationExecution = completedExecution({
      coordinator, actor: sender, suffix: "publish", messageId: sourceEvent.messageId,
      eventId: "evt_v8_source_01", tool: "threadmesh_publish_artifact",
      argumentsValue: publishArgs, resultDigest: sha256Digest({ published: true }),
    });
    const published = coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact",
        event: sourceEvent,
        expectedMaterial: { commitSha: "1".repeat(40) },
      },
      senderPrincipal,
    );
    assert.equal(published.replay, false);
    assert.equal(coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
        expectedMaterial: { commitSha: "1".repeat(40) },
      }, senderPrincipal,
    ).replay, true);
    expectCode(() => coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact",
        event: event({ content: "conflicting body" }),
        expectedMaterial: { commitSha: "1".repeat(40) },
      }, senderPrincipal,
    ), "threadmesh_lifecycle_publication_action_mismatch");
    expectCode(() => coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact",
        event: event({ createdAt: "2026-09-01T08:00:01.000Z" }),
        expectedMaterial: { commitSha: "1".repeat(40) },
      }, senderPrincipal,
    ), "threadmesh_lifecycle_publication_conflict");
    expectCode(() => coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
        expectedMaterial: { commitSha: "9".repeat(40) },
      }, senderPrincipal,
    ), "threadmesh_lifecycle_publication_action_mismatch");

    const observed = coordinator.waitTask(receiver, { afterCursor: 0, limit: 20 }, receiverPrincipal)
      .events.find((entry) => entry.messageId === sourceEvent.messageId &&
        entry.eventType === "message-durably-received");
    const cursor = coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor;
    const claim = coordinator.claimAttentionEvent(receiver, {
      claimEpoch: "claim_v8_receiver_01",
      eventCursor: observed.cursor,
      eventId: observed.eventId,
      expectedRevision: cursor.revision,
    }, receiverPrincipal).claim;
    const mailbox = coordinator.claimPending(
      sender.incarnationId, sourceEvent.messageId, 0, receiverPrincipal,
    );
    const decisionProjection = {
      messageId: sourceEvent.messageId,
      receiver: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
      decision: { state: "accepted", reasonCode: "accepted", decisionRevision: 1 },
    };
    let decisionExecution = completedExecution({
      coordinator, actor: receiver, suffix: "decision", messageId: sourceEvent.messageId,
      eventId: observed.eventId, tool: "threadmesh_decide_offer",
      argumentsValue: { messageId: sourceEvent.messageId, decision: "accepted" },
      resultDigest: stagedDecisionDigest(sourceEvent.messageId, "accepted"),
    });
    const decision = coordinator.commitReceiverDecision(claim.claimEpoch, {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: decisionExecution.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "accepted",
      expectedDispositionRevision: 0,
    }, receiverPrincipal);
    assert.equal(decision.replay, false);
    assert.equal(coordinator.commitReceiverDecision(claim.claimEpoch, {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: decisionExecution.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "accepted",
      expectedDispositionRevision: 0,
    }, receiverPrincipal).replay, true);

    const admission = coordinator.prepareContextAdmission(
      sender.incarnationId, sourceEvent.messageId, 1, receiverPrincipal,
    );
    const businessExecution = completedExecution({
      coordinator, actor: receiver, suffix: "business", messageId: sourceEvent.messageId,
      eventId: admission.admissionToken, tool: "threadmesh_handle_admitted_context",
      argumentsValue: {}, resultDigest: sha256Digest({ handled: true }), withAction: false,
    });
    expectCode(() => coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: decisionExecution.executionId,
        expectedRevision: 1,
        admissionToken: admission.admissionToken,
      }, receiverPrincipal,
    ), "threadmesh_context_admission_turn_receipt_mismatch");
    const storedAdmission = coordinator.db.prepare(
      `SELECT adapter_ref_json, adapter_ref_digest FROM admission_claims
       WHERE sender_incarnation_id = ? AND message_id = ?`,
    ).get(sender.incarnationId, sourceEvent.messageId);
    const alteredRef = {
      ...JSON.parse(storedAdmission.adapter_ref_json),
      snapshotDigest: `sha256:${"c".repeat(64)}`,
    };
    coordinator.db.prepare(
      `UPDATE admission_claims SET adapter_ref_json = ?, adapter_ref_digest = ?
       WHERE sender_incarnation_id = ? AND message_id = ?`,
    ).run(
      JSON.stringify(alteredRef), sha256Digest(alteredRef),
      sender.incarnationId, sourceEvent.messageId,
    );
    expectCode(() => coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: businessExecution.executionId,
        expectedRevision: 1,
        admissionToken: admission.admissionToken,
      }, receiverPrincipal,
    ), "threadmesh_adapter_evidence_mismatch");
    coordinator.db.prepare(
      `UPDATE admission_claims SET adapter_ref_json = ?, adapter_ref_digest = ?
       WHERE sender_incarnation_id = ? AND message_id = ?`,
    ).run(
      storedAdmission.adapter_ref_json, storedAdmission.adapter_ref_digest,
      sender.incarnationId, sourceEvent.messageId,
    );
    const confirmed = coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId,
      sourceEvent.messageId,
      {
        executionId: businessExecution.executionId,
        expectedRevision: 1,
        admissionToken: admission.admissionToken,
      },
      receiverPrincipal,
    );
    assert.equal(confirmed.replay, false);
    assert.equal(coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: businessExecution.executionId,
        expectedRevision: 1,
        admissionToken: admission.admissionToken,
      }, receiverPrincipal,
    ).replay, true);
    expectCode(() => coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: businessExecution.executionId,
        expectedRevision: 1,
        admissionToken: "sha256:" + "f".repeat(64),
      }, receiverPrincipal,
    ), "threadmesh_context_admission_turn_binding_conflict");
    coordinator.bindCompletedAttentionHandler(claim.claimEpoch, {
      turnExecutionId: businessExecution.executionId,
      expectedRevision: 0,
    }, receiverPrincipal);

    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM lifecycle_action_publications",
    ).pluck().get(), 1);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM attention_route_decision_bindings",
    ).pluck().get(), 1);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM context_admission_turn_bindings",
    ).pluck().get(), 1);
    coordinator.attachTask(receiver, {
      kind: "codex-app-server",
      threadId: "thread-v8-receiver-rotated",
      snapshotDigest: `sha256:${"e".repeat(64)}`,
    }, 0, receiverPrincipal);
    coordinator.close();
    coordinator = new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW });
    assert.equal(coordinator.storageInfo().schemaVersion, 8);
    coordinator.close();
    coordinator = null;

    tamperedCopyFails(temporary.filename, temporary.directory, "missing-publication-audit", (db) => {
      db.prepare(
        "DELETE FROM audit_events WHERE message_id = ? AND event_type = 'message-durably-received'",
      ).run(sourceEvent.messageId);
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "publication-action-tamper", (db) => {
      const executionId = publicationExecution.executionId;
      const header = db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
      ).get(executionId);
      const actionRow = db.prepare(
        "SELECT * FROM turn_tool_actions WHERE execution_id = ? AND ordinal = 0",
      ).get(executionId);
      const publication = db.prepare(
        "SELECT * FROM lifecycle_action_publications WHERE execution_id = ?",
      ).get(executionId);
      const intent = JSON.parse(header.intent_json);
      const completed = JSON.parse(header.receipt_json);
      const args = JSON.parse(actionRow.args_json);
      const fakeTool = "threadmesh_fake_publication";
      const selectionDigest = sha256Digest({
        executionId,
        turnId: actionRow.turn_id,
        callId: actionRow.call_id,
        ordinal: 0,
        name: fakeTool,
        argumentsDigest: actionRow.args_digest,
        args,
        previousActionDigest: null,
      });
      const actionDigest = sha256Digest({
        selectionDigest,
        resultDigest: actionRow.result_digest,
        resultStatus: actionRow.result_status,
      });
      intent.allowedTools = [fakeTool];
      intent.toolActions[0].name = fakeTool;
      intent.completedTurn.toolCalls[0].tool = fakeTool;
      completed.toolCalls[0].tool = fakeTool;
      db.prepare(
        `UPDATE turn_tool_actions SET tool_name = ?, selection_digest = ?,
           action_digest = ? WHERE execution_id = ? AND ordinal = 0`,
      ).run(fakeTool, selectionDigest, actionDigest, executionId);
      db.prepare(
        `UPDATE turn_execution_intents SET tool_allowlist_json = ?,
           tool_allowlist_digest = ?, action_head_digest = ?, intent_json = ?,
           intent_digest = ?, receipt_json = ? WHERE execution_id = ?`,
      ).run(
        canonicalJson([fakeTool]), sha256Digest([fakeTool]), selectionDigest,
        canonicalJson(intent), turnIntentHeaderDigest(intent), canonicalJson(completed),
        executionId,
      );
      const publicationDigest = sha256Digest({
        executionId,
        actionOrdinal: 0,
        actionDigest,
        senderIncarnationId: publication.sender_incarnation_id,
        messageId: publication.message_id,
        eventDigest: publication.event_digest,
        envelopeDigest: publication.envelope_digest,
      });
      db.prepare(
        `UPDATE lifecycle_action_publications SET action_digest = ?,
           publication_digest = ? WHERE execution_id = ?`,
      ).run(actionDigest, publicationDigest, executionId);
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "decision-token-tamper", (db) => {
      const claimRow = db.prepare(
        "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const bindingRow = db.prepare(
        "SELECT * FROM attention_route_decision_bindings WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const fakeToken = "sha256:" + "d".repeat(64);
      const tokenDigest = sha256Digest(fakeToken);
      db.prepare("UPDATE mailbox_claims SET claim_token = ? WHERE message_id = ?")
        .run(fakeToken, sourceEvent.messageId);
      const bindingDigest = sha256Digest({
        claimEpoch: claim.claimEpoch,
        eventDigest: claimRow.event_digest,
        routeProjectionDigest: bindingRow.route_projection_digest,
        receiverDecisionExecutionId: bindingRow.receiver_decision_execution_id,
        decisionActionOrdinal: bindingRow.decision_action_ordinal,
        decisionActionDigest: bindingRow.decision_action_digest,
        decisionProjectionDigest: bindingRow.decision_projection_digest,
        mailboxClaimTokenDigest: tokenDigest,
      });
      db.prepare(
        `UPDATE attention_route_decision_bindings
         SET mailbox_claim_token_digest = ?, binding_digest = ? WHERE claim_epoch = ?`,
      ).run(tokenDigest, bindingDigest, claim.claimEpoch);
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "decision-action-tamper", (db) => {
      const executionId = decisionExecution.executionId;
      const header = db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
      ).get(executionId);
      const actionRow = db.prepare(
        "SELECT * FROM turn_tool_actions WHERE execution_id = ? AND ordinal = 0",
      ).get(executionId);
      const intent = JSON.parse(header.intent_json);
      const completed = JSON.parse(header.receipt_json);
      const args = JSON.parse(actionRow.args_json);
      const fakeTool = "threadmesh_fake_decision";
      const selectionDigest = sha256Digest({
        executionId,
        turnId: actionRow.turn_id,
        callId: actionRow.call_id,
        ordinal: 0,
        name: fakeTool,
        argumentsDigest: actionRow.args_digest,
        args,
        previousActionDigest: null,
      });
      const actionDigest = sha256Digest({
        selectionDigest,
        resultDigest: actionRow.result_digest,
        resultStatus: actionRow.result_status,
      });
      intent.allowedTools = [fakeTool];
      intent.toolActions[0].name = fakeTool;
      intent.completedTurn.toolCalls[0].tool = fakeTool;
      completed.toolCalls[0].tool = fakeTool;
      db.prepare(
        `UPDATE turn_tool_actions SET tool_name = ?, selection_digest = ?,
           action_digest = ? WHERE execution_id = ? AND ordinal = 0`,
      ).run(fakeTool, selectionDigest, actionDigest, executionId);
      db.prepare(
        `UPDATE turn_execution_intents SET tool_allowlist_json = ?,
           tool_allowlist_digest = ?, action_head_digest = ?, intent_json = ?,
           intent_digest = ?, receipt_json = ? WHERE execution_id = ?`,
      ).run(
        canonicalJson([fakeTool]), sha256Digest([fakeTool]), selectionDigest,
        canonicalJson(intent), turnIntentHeaderDigest(intent), canonicalJson(completed),
        executionId,
      );
      const bindingRow = db.prepare(
        "SELECT * FROM attention_route_decision_bindings WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const claimRow = db.prepare(
        "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const bindingDigest = sha256Digest({
        claimEpoch: claim.claimEpoch,
        eventDigest: claimRow.event_digest,
        routeProjectionDigest: bindingRow.route_projection_digest,
        receiverDecisionExecutionId: executionId,
        decisionActionOrdinal: 0,
        decisionActionDigest: actionDigest,
        decisionProjectionDigest: bindingRow.decision_projection_digest,
        mailboxClaimTokenDigest: bindingRow.mailbox_claim_token_digest,
      });
      db.prepare(
        `UPDATE attention_route_decision_bindings
         SET decision_action_digest = ?, binding_digest = ? WHERE claim_epoch = ?`,
      ).run(actionDigest, bindingDigest, claim.claimEpoch);
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "decision-audit-tamper", (db) => {
      db.prepare(
        `UPDATE audit_events SET detail_json = ?
         WHERE message_id = ? AND event_type = 'receiver-decided'`,
      ).run(canonicalJson({ decision: "accepted", reasonCode: "receiver-deferred" }),
        sourceEvent.messageId);
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "decision-receiver-tamper", (db) => {
      const executionId = decisionExecution.executionId;
      const header = db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
      ).get(executionId);
      const actionRow = db.prepare(
        "SELECT * FROM turn_tool_actions WHERE execution_id = ? AND ordinal = 0",
      ).get(executionId);
      const intent = JSON.parse(header.intent_json);
      const completed = JSON.parse(header.receipt_json);
      const bindingRow = db.prepare(
        "SELECT * FROM attention_route_decision_bindings WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const claimRow = db.prepare(
        "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const projection = JSON.parse(bindingRow.decision_projection_json);
      projection.receiver = {
        taskId: "task_forged_receiver",
        incarnationId: "inc_forged_receiver_01",
      };
      const projectionDigest = sha256Digest(projection);
      const actionDigest = sha256Digest({
        selectionDigest: actionRow.selection_digest,
        resultDigest: projectionDigest,
        resultStatus: actionRow.result_status,
      });
      intent.toolActions[0].resultDigest = projectionDigest;
      intent.completedTurn.toolCalls[0].outputDigest = projectionDigest;
      completed.toolCalls[0].outputDigest = projectionDigest;
      db.prepare(
        `UPDATE turn_tool_actions SET result_digest = ?, action_digest = ?
         WHERE execution_id = ? AND ordinal = 0`,
      ).run(projectionDigest, actionDigest, executionId);
      db.prepare(
        `UPDATE turn_execution_intents SET intent_json = ?, receipt_json = ?
         WHERE execution_id = ?`,
      ).run(canonicalJson(intent), canonicalJson(completed), executionId);
      const nextBindingDigest = sha256Digest({
        claimEpoch: claim.claimEpoch,
        eventDigest: claimRow.event_digest,
        routeProjectionDigest: bindingRow.route_projection_digest,
        receiverDecisionExecutionId: executionId,
        decisionActionOrdinal: 0,
        decisionActionDigest: actionDigest,
        decisionProjectionDigest: projectionDigest,
        mailboxClaimTokenDigest: bindingRow.mailbox_claim_token_digest,
      });
      db.prepare(
        `UPDATE attention_route_decision_bindings SET decision_action_digest = ?,
           decision_projection_json = ?, decision_projection_digest = ?,
           binding_digest = ? WHERE claim_epoch = ?`,
      ).run(
        actionDigest, canonicalJson(projection), projectionDigest,
        nextBindingDigest, claim.claimEpoch,
      );
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "decision-reason-tamper", (db) => {
      const executionId = decisionExecution.executionId;
      const header = db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
      ).get(executionId);
      const actionRow = db.prepare(
        "SELECT * FROM turn_tool_actions WHERE execution_id = ? AND ordinal = 0",
      ).get(executionId);
      const intent = JSON.parse(header.intent_json);
      const completed = JSON.parse(header.receipt_json);
      const bindingRow = db.prepare(
        "SELECT * FROM attention_route_decision_bindings WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const claimRow = db.prepare(
        "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
      ).get(claim.claimEpoch);
      const projection = JSON.parse(bindingRow.decision_projection_json);
      projection.decision.reasonCode = "receiver-deferred";
      const projectionDigest = sha256Digest(projection);
      const actionDigest = sha256Digest({
        selectionDigest: actionRow.selection_digest,
        resultDigest: projectionDigest,
        resultStatus: actionRow.result_status,
      });
      intent.toolActions[0].resultDigest = projectionDigest;
      intent.completedTurn.toolCalls[0].outputDigest = projectionDigest;
      completed.toolCalls[0].outputDigest = projectionDigest;
      db.prepare(
        `UPDATE turn_tool_actions SET result_digest = ?, action_digest = ?
         WHERE execution_id = ? AND ordinal = 0`,
      ).run(projectionDigest, actionDigest, executionId);
      db.prepare(
        `UPDATE turn_execution_intents SET intent_json = ?, receipt_json = ?
         WHERE execution_id = ?`,
      ).run(canonicalJson(intent), canonicalJson(completed), executionId);
      db.prepare(
        `UPDATE audit_events SET detail_json = ?
         WHERE message_id = ? AND event_type = 'receiver-decided'`,
      ).run(
        canonicalJson({ decision: "accepted", reasonCode: "receiver-deferred" }),
        sourceEvent.messageId,
      );
      db.prepare(
        "UPDATE dispositions SET decision_reason_code = ? WHERE message_id = ?",
      ).run("receiver-deferred", sourceEvent.messageId);
      const nextBindingDigest = sha256Digest({
        claimEpoch: claim.claimEpoch,
        eventDigest: claimRow.event_digest,
        routeProjectionDigest: bindingRow.route_projection_digest,
        receiverDecisionExecutionId: executionId,
        decisionActionOrdinal: 0,
        decisionActionDigest: actionDigest,
        decisionProjectionDigest: projectionDigest,
        mailboxClaimTokenDigest: bindingRow.mailbox_claim_token_digest,
      });
      db.prepare(
        `UPDATE attention_route_decision_bindings SET decision_action_digest = ?,
           decision_projection_json = ?, decision_projection_digest = ?,
           binding_digest = ? WHERE claim_epoch = ?`,
      ).run(
        actionDigest, canonicalJson(projection), projectionDigest,
        nextBindingDigest, claim.claimEpoch,
      );
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "admission-turn-tamper", (db) => {
      const executionId = businessExecution.executionId;
      const header = db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
      ).get(executionId);
      const intent = JSON.parse(header.intent_json);
      const completed = JSON.parse(header.receipt_json);
      const fakeTurnId = "turn-v8-synchronized-forgery";
      intent.turnStart.turnId = fakeTurnId;
      intent.completedTurn.evidence.turnId = fakeTurnId;
      completed.evidence.turnId = fakeTurnId;
      completed.receipt.adapterOperationId = fakeTurnId;
      completed.adapterReceiptDigest = sha256Digest(completed.receipt);
      intent.completedTurn.adapterReceiptDigest = completed.adapterReceiptDigest;
      db.prepare(
        `UPDATE turn_execution_intents SET turn_id = ?, intent_json = ?,
           intent_digest = ?, receipt_json = ?, receipt_digest = ?
         WHERE execution_id = ?`,
      ).run(
        fakeTurnId, canonicalJson(intent), turnIntentHeaderDigest(intent),
        canonicalJson(completed), completed.adapterReceiptDigest, executionId,
      );
      const admissionRow = db.prepare(
        "SELECT * FROM context_admission_turn_bindings WHERE execution_id = ?",
      ).get(executionId);
      const next = {
        senderIncarnationId: admissionRow.sender_incarnation_id,
        messageId: admissionRow.message_id,
        executionId,
        turnId: fakeTurnId,
        expectedRevision: admissionRow.expected_revision,
        admissionTokenDigest: admissionRow.admission_token_digest,
        adapterRefDigest: admissionRow.adapter_ref_digest,
        completedBindingDigest: sha256Digest(completed),
        turnReceiptDigest: sha256Digest(completed.receipt),
        adapterEvidenceDigest: sha256Digest(completed.evidence),
      };
      db.prepare(
        `UPDATE context_admission_turn_bindings SET turn_id = ?,
           completed_binding_digest = ?, turn_receipt_digest = ?,
           adapter_evidence_digest = ?, binding_digest = ? WHERE execution_id = ?`,
      ).run(
        fakeTurnId, next.completedBindingDigest, next.turnReceiptDigest,
        next.adapterEvidenceDigest, sha256Digest(next), executionId,
      );
    });
    tamperedCopyFails(temporary.filename, temporary.directory, "historical-admission-claim-tamper", (db) => {
      const stored = db.prepare(
        "SELECT adapter_ref_json FROM admission_claims WHERE message_id = ?",
      ).pluck().get(sourceEvent.messageId);
      const altered = { ...JSON.parse(stored), threadId: "thread-forged-history" };
      db.prepare(
        "UPDATE admission_claims SET adapter_ref_json = ? WHERE message_id = ?",
      ).run(canonicalJson(altered), sourceEvent.messageId);
    });
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("v8 fails closed before decision completion and on wrong actor/ref/turn evidence", () => {
  const coordinator = setup(":memory:");
  try {
    const sourceEvent = event();
    const publicationExecution = completedExecution({
      coordinator, actor: sender, suffix: "negative-publish", messageId: sourceEvent.messageId,
      eventId: "evt_v8_negative_source", tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_negative_source", event: actionEventBody(sourceEvent),
        commitSha: "2".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.publishLifecycleFromCompletedAction(publicationExecution.executionId, {
      expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
      expectedMaterial: { commitSha: "2".repeat(40) },
    }, senderPrincipal);
    const observed = coordinator.waitTask(receiver, { afterCursor: 0, limit: 20 }, receiverPrincipal)
      .events.find((entry) => entry.messageId === sourceEvent.messageId &&
        entry.eventType === "message-durably-received");
    const cursor = coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor;
    coordinator.claimAttentionEvent(receiver, {
      claimEpoch: "claim_v8_negative_01", eventCursor: observed.cursor,
      eventId: observed.eventId, expectedRevision: cursor.revision,
    }, receiverPrincipal);
    const mailbox = coordinator.claimPending(sender.incarnationId, sourceEvent.messageId, 0, receiverPrincipal);
    let incomplete = coordinator.createTurnExecutionIntent({
      intentId: "exec_v8_incomplete_decision", scenarioId: "scenario_v8_binding",
      chainId: "chain_v8_binding",
      messageId: sourceEvent.messageId, eventId: observed.eventId, actor: receiver,
      adapterIdempotencyKey: "adapter_v8_incomplete_decision",
      promptDigest: sha256Digest({ prompt: "incomplete" }),
      allowedTools: ["threadmesh_decide_offer"],
    }, 0, receiverPrincipal);
    incomplete = coordinator.markTurnExecutionStarted(
      incomplete.executionId, { expectedRevision: 0 }, receiverPrincipal,
    );
    expectCode(() => coordinator.commitReceiverDecision("claim_v8_negative_01", {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: incomplete.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "accepted", expectedDispositionRevision: 0,
    }, receiverPrincipal), "threadmesh_receiver_decision_execution_mismatch");
    assert.equal(coordinator.db.prepare(
      "SELECT state FROM mailbox_claims WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "claimed");

    expectCode(() => coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact",
        event: event({
          messageId: "msg_v8_wrong_actor",
          sender: {
            taskId: receiver.taskId, incarnationId: receiver.incarnationId,
            actorType: "agent", harness: "codex",
          },
        }),
        expectedMaterial: { commitSha: "2".repeat(40) },
      }, senderPrincipal,
    ), "threadmesh_lifecycle_publication_action_mismatch");
  } finally {
    coordinator.close();
  }
});

test("v8 admitted handler rejects legacy acknowledge without an exact decision binding", () => {
  const coordinator = setup(":memory:");
  try {
    const sourceEvent = event();
    const publicationExecution = completedExecution({
      coordinator, actor: sender, suffix: "legacy-bypass-publish",
      messageId: sourceEvent.messageId, eventId: "evt_v8_legacy_bypass",
      tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_legacy_bypass", event: actionEventBody(sourceEvent),
        commitSha: "5".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.publishLifecycleFromCompletedAction(publicationExecution.executionId, {
      expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
      expectedMaterial: { commitSha: "5".repeat(40) },
    }, senderPrincipal);
    const observed = coordinator.waitTask(receiver, { afterCursor: 0, limit: 20 }, receiverPrincipal)
      .events.find((entry) => entry.messageId === sourceEvent.messageId &&
        entry.eventType === "message-durably-received");
    const cursor = coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor;
    const claim = coordinator.claimAttentionEvent(receiver, {
      claimEpoch: "claim_v8_legacy_bypass", eventCursor: observed.cursor,
      eventId: observed.eventId, expectedRevision: cursor.revision,
    }, receiverPrincipal).claim;
    const mailbox = coordinator.claimPending(
      sender.incarnationId, sourceEvent.messageId, 0, receiverPrincipal,
    );
    coordinator.acknowledgePending(
      sender.incarnationId, sourceEvent.messageId, mailbox.claimToken,
      "accepted", 0, receiverPrincipal,
    );
    const admission = coordinator.prepareContextAdmission(
      sender.incarnationId, sourceEvent.messageId, 1, receiverPrincipal,
    );
    const businessExecution = completedExecution({
      coordinator, actor: receiver, suffix: "legacy-bypass-business",
      messageId: sourceEvent.messageId, eventId: admission.admissionToken,
      tool: "threadmesh_handle_admitted_context", argumentsValue: {},
      resultDigest: sha256Digest({ handled: true }), withAction: false,
    });
    coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: businessExecution.executionId, expectedRevision: 1,
        admissionToken: admission.admissionToken,
      }, receiverPrincipal,
    );
    expectCode(() => coordinator.bindCompletedAttentionHandler(
      claim.claimEpoch,
      { turnExecutionId: businessExecution.executionId, expectedRevision: 0 },
      receiverPrincipal,
    ), "threadmesh_attention_handler_decision_binding_missing");
  } finally {
    coordinator.close();
  }
});

test("v8 lifecycle publication cannot adopt a preexisting requester kickoff", () => {
  const coordinator = setup(":memory:");
  try {
    const sourceEvent = event();
    const execution = completedExecution({
      coordinator, actor: sender, suffix: "kickoff-origin", messageId: sourceEvent.messageId,
      eventId: "evt_v8_kickoff_origin", tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_kickoff_origin", event: actionEventBody(sourceEvent),
        commitSha: "6".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.submit(projectLifecycleEventToEnvelope(sourceEvent), senderPrincipal);
    expectCode(() => coordinator.publishLifecycleFromCompletedAction(
      execution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
        expectedMaterial: { commitSha: "6".repeat(40) },
      }, senderPrincipal,
    ), "threadmesh_lifecycle_publication_conflict");
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM lifecycle_action_publications",
    ).pluck().get(), 0);
  } finally {
    coordinator.close();
  }
});

test("v8 preserves a bound deferred decision across a legal later acceptance", () => {
  const temporary = temporaryDatabase();
  let coordinator;
  try {
    coordinator = setup(temporary.filename);
    const sourceEvent = event();
    const publicationExecution = completedExecution({
      coordinator, actor: sender, suffix: "deferred-publish", messageId: sourceEvent.messageId,
      eventId: "evt_v8_deferred", tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_deferred", event: actionEventBody(sourceEvent),
        commitSha: "7".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.publishLifecycleFromCompletedAction(publicationExecution.executionId, {
      expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
      expectedMaterial: { commitSha: "7".repeat(40) },
    }, senderPrincipal);
    const observed = coordinator.waitTask(receiver, { afterCursor: 0, limit: 20 }, receiverPrincipal)
      .events.find((entry) => entry.messageId === sourceEvent.messageId &&
        entry.eventType === "message-durably-received");
    const cursor = coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor;
    const claim = coordinator.claimAttentionEvent(receiver, {
      claimEpoch: "claim_v8_deferred", eventCursor: observed.cursor,
      eventId: observed.eventId, expectedRevision: cursor.revision,
    }, receiverPrincipal).claim;
    const mailbox = coordinator.claimPending(
      sender.incarnationId, sourceEvent.messageId, 0, receiverPrincipal,
    );
    const deferredProjection = {
      messageId: sourceEvent.messageId,
      receiver: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
      decision: {
        state: "deferred", reasonCode: "receiver-deferred", decisionRevision: 1,
      },
    };
    const decisionExecution = completedExecution({
      coordinator, actor: receiver, suffix: "deferred-decision",
      messageId: sourceEvent.messageId, eventId: observed.eventId,
      tool: "threadmesh_decide_offer",
      argumentsValue: { messageId: sourceEvent.messageId, decision: "deferred" },
      resultDigest: stagedDecisionDigest(sourceEvent.messageId, "deferred"),
    });
    coordinator.commitReceiverDecision(claim.claimEpoch, {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: decisionExecution.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "deferred", expectedDispositionRevision: 0,
    }, receiverPrincipal);
    coordinator.respond(
      sender.incarnationId, sourceEvent.messageId, "accepted", 1, receiverPrincipal,
    );
    coordinator.close();
    coordinator = new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW });
    assert.equal(coordinator.db.prepare(
      "SELECT decision_state FROM dispositions WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "accepted");
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("v8 binding insert failures roll back publication, acknowledge, and admission effects", () => {
  const coordinator = setup(":memory:");
  try {
    const sourceEvent = event();
    const publicationExecution = completedExecution({
      coordinator, actor: sender, suffix: "atomic-publish", messageId: sourceEvent.messageId,
      eventId: "evt_v8_atomic_source", tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_atomic_source", event: actionEventBody(sourceEvent),
        commitSha: "4".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.db.exec(`
      CREATE TRIGGER fail_v8_publication BEFORE INSERT ON lifecycle_action_publications
      BEGIN SELECT RAISE(ABORT, 'forced-publication-failure'); END;
    `);
    assert.throws(() => coordinator.publishLifecycleFromCompletedAction(
      publicationExecution.executionId,
      {
        expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
        expectedMaterial: { commitSha: "4".repeat(40) },
      }, senderPrincipal,
    ));
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM messages WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), 0);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM audit_events WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), 0);
    coordinator.db.exec("DROP TRIGGER fail_v8_publication");
    coordinator.publishLifecycleFromCompletedAction(publicationExecution.executionId, {
      expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
      expectedMaterial: { commitSha: "4".repeat(40) },
    }, senderPrincipal);

    const observed = coordinator.waitTask(receiver, { afterCursor: 0, limit: 20 }, receiverPrincipal)
      .events.find((entry) => entry.messageId === sourceEvent.messageId &&
        entry.eventType === "message-durably-received");
    const cursor = coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor;
    coordinator.claimAttentionEvent(receiver, {
      claimEpoch: "claim_v8_atomic_01", eventCursor: observed.cursor,
      eventId: observed.eventId, expectedRevision: cursor.revision,
    }, receiverPrincipal);
    const mailbox = coordinator.claimPending(sender.incarnationId, sourceEvent.messageId, 0, receiverPrincipal);
    const decisionProjection = {
      messageId: sourceEvent.messageId,
      receiver: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
      decision: { state: "accepted", reasonCode: "accepted", decisionRevision: 1 },
    };
    const decisionExecution = completedExecution({
      coordinator, actor: receiver, suffix: "atomic-decision", messageId: sourceEvent.messageId,
      eventId: observed.eventId, tool: "threadmesh_decide_offer",
      argumentsValue: { messageId: sourceEvent.messageId, decision: "accepted" },
      resultDigest: stagedDecisionDigest(sourceEvent.messageId, "accepted"),
    });
    coordinator.db.exec(`
      CREATE TRIGGER fail_v8_decision BEFORE INSERT ON attention_route_decision_bindings
      BEGIN SELECT RAISE(ABORT, 'forced-decision-failure'); END;
    `);
    assert.throws(() => coordinator.commitReceiverDecision("claim_v8_atomic_01", {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: decisionExecution.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "accepted", expectedDispositionRevision: 0,
    }, receiverPrincipal));
    assert.equal(coordinator.db.prepare(
      "SELECT decision_state FROM dispositions WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "pending");
    assert.equal(coordinator.db.prepare(
      "SELECT state FROM mailbox_claims WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "claimed");
    coordinator.db.exec("DROP TRIGGER fail_v8_decision");
    coordinator.commitReceiverDecision("claim_v8_atomic_01", {
      routeProjection: routeProjection(sourceEvent),
      receiverDecisionExecutionId: decisionExecution.executionId,
      mailboxClaimToken: mailbox.claimToken,
      decision: "accepted", expectedDispositionRevision: 0,
    }, receiverPrincipal);

    const admission = coordinator.prepareContextAdmission(
      sender.incarnationId, sourceEvent.messageId, 1, receiverPrincipal,
    );
    const businessExecution = completedExecution({
      coordinator, actor: receiver, suffix: "atomic-business", messageId: sourceEvent.messageId,
      eventId: admission.admissionToken, tool: "threadmesh_handle_admitted_context",
      argumentsValue: {}, resultDigest: sha256Digest({ handled: true }), withAction: false,
    });
    coordinator.db.exec(`
      CREATE TRIGGER fail_v8_admission BEFORE INSERT ON context_admission_turn_bindings
      BEGIN SELECT RAISE(ABORT, 'forced-admission-failure'); END;
    `);
    assert.throws(() => coordinator.confirmContextAdmissionFromTurn(
      sender.incarnationId, sourceEvent.messageId,
      {
        executionId: businessExecution.executionId, expectedRevision: 1,
        admissionToken: admission.admissionToken,
      }, receiverPrincipal,
    ));
    assert.equal(coordinator.db.prepare(
      "SELECT state FROM admission_claims WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "in-flight");
    assert.equal(coordinator.db.prepare(
      "SELECT delivery_state FROM dispositions WHERE message_id = ?",
    ).pluck().get(sourceEvent.messageId), "durably-received");
    coordinator.db.exec("DROP TRIGGER fail_v8_admission");
  } finally {
    coordinator.close();
  }
});

test("v7 migrates append-only to v8 and restart detects binding tamper", () => {
  const temporary = temporaryDatabase();
  let coordinator = setup(temporary.filename);
  try {
    const v7 = SQLITE_SCHEMA_MIGRATIONS.find((entry) => entry.version === 7);
    const v7Checksum = coordinator.db.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 7",
    ).pluck().get();
    assert.equal(v7Checksum, v7.checksum);
    coordinator.db.exec(`
      DROP TABLE context_admission_turn_bindings;
      DROP TABLE attention_route_decision_bindings;
      DROP TABLE lifecycle_action_publications;
      DELETE FROM schema_migrations WHERE version = 8;
      PRAGMA user_version = 7;
    `);
    coordinator.close();
    coordinator = new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW });
    assert.equal(coordinator.storageInfo().schemaVersion, SQLITE_SCHEMA_VERSION);
    assert.equal(coordinator.db.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 7",
    ).pluck().get(), v7Checksum);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM schema_migrations",
    ).pluck().get(), 8);

    const sourceEvent = event();
    const execution = completedExecution({
      coordinator, actor: sender, suffix: "tamper", messageId: sourceEvent.messageId,
      eventId: "evt_v8_tamper", tool: "threadmesh_publish_artifact",
      argumentsValue: {
        sourceEventId: "evt_v8_tamper", event: actionEventBody(sourceEvent),
        commitSha: "3".repeat(40),
      }, resultDigest: sha256Digest({ published: true }),
    });
    coordinator.publishLifecycleFromCompletedAction(execution.executionId, {
      expectedTool: "threadmesh_publish_artifact", event: sourceEvent,
      expectedMaterial: { commitSha: "3".repeat(40) },
    }, senderPrincipal);
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    database.prepare(
      "UPDATE lifecycle_action_publications SET event_digest = ?",
    ).run(sha256Digest({ tampered: true }));
    database.close();
    expectCode(
      () => new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW }),
      "threadmesh_lifecycle_binding_storage_tampered",
    );
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});
