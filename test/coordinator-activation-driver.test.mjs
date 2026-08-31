import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorActivation } from
  "../src/activation/coordinator-activation-driver.mjs";
import { sha256Digest } from "../src/canonical-json.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";
import {
  evaluateAttentionRoute,
  projectLifecycleEventToEnvelope,
} from "../src/routing/lifecycle-events.mjs";
import { createCodexPersistedTurnObservation } from
  "../src/state/codex-turn-reconciliation.mjs";
import {
  CodexLiveAgentRuntime,
  REGISTERED_PEER_DECISION_TOOL,
} from "../src/validation/live-agent-scenario.mjs";

const NOW = Date.parse("2026-09-01T08:00:00.000Z");
const owner = { kind: "user", principalId: "owner_activation" };
const sender = {
  taskId: "task_activation_sender", incarnationId: "inc_activation_sender_01",
  threadId: "thread-activation-sender", snapshotDigest: `sha256:${"a".repeat(64)}`,
};
const receiver = {
  taskId: "task_activation_receiver", incarnationId: "inc_activation_receiver_01",
  threadId: "thread-activation-receiver", snapshotDigest: `sha256:${"b".repeat(64)}`,
};
const senderPrincipal = {
  kind: "task", taskId: sender.taskId, incarnationId: sender.incarnationId,
};
const receiverPrincipal = {
  kind: "task", taskId: receiver.taskId, incarnationId: receiver.incarnationId,
};
const grant = {
  specVersion: "0.0-draft",
  grantId: "grant_activation",
  grantVersion: 1,
  relationshipId: "rel_activation",
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
const lifecycleEvent = {
  eventType: "artifact-ready",
  messageId: "msg_activation_artifact_01",
  sender: {
    taskId: sender.taskId, incarnationId: sender.incarnationId,
    actorType: "agent", harness: "codex",
  },
  target: {
    taskId: receiver.taskId, incarnationId: receiver.incarnationId,
    harness: "codex",
  },
  relationshipId: grant.relationshipId,
  content: "RAW_CONTENT_MUST_ONLY_APPEAR_IN_ADMITTED_RENDERING",
  reason: "A completed action published this lifecycle event.",
  freshness: { expectedObjectiveVersion: 1 },
  createdAt: "2026-09-01T08:00:00.000Z",
  expiresAt: "2026-09-01T09:00:00.000Z",
};
const businessTool = Object.freeze({
  type: "function",
  name: "threadmesh_activation_noop",
  description: "Record a harmless admitted activation effect.",
  inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
});

function completedBinding(actor, turnId, actions) {
  const receipt = {
    adapterOperationId: turnId,
    acceptedAt: new Date(NOW).toISOString(),
    evidenceRefs: [`fixture://turn/${turnId}`],
  };
  return {
    evidence: {
      threadId: actor.threadId,
      turnId,
      turnStatus: "completed",
      completedAt: new Date(NOW).toISOString(),
      durationMs: 1,
      userAgent: "threadmesh-activation-test/1",
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

function publishMessage(coordinator) {
  const eventBody = {
    eventType: lifecycleEvent.eventType,
    messageId: lifecycleEvent.messageId,
    target: { ...lifecycleEvent.target },
    relationshipId: lifecycleEvent.relationshipId,
    content: lifecycleEvent.content,
    reason: lifecycleEvent.reason,
    evidenceRefs: [],
    freshness: { ...lifecycleEvent.freshness },
    causality: null,
  };
  let execution = coordinator.createTurnExecutionIntent({
    intentId: "intent_activation_publication",
    scenarioId: "scenario_activation",
    chainId: "chain_activation",
    messageId: lifecycleEvent.messageId,
    eventId: "event_activation_source",
    actor: sender,
    adapterIdempotencyKey: "adapter_activation_publication",
    promptDigest: sha256Digest("publication"),
    allowedTools: ["threadmesh_publish_artifact"],
  }, 0, senderPrincipal);
  execution = coordinator.markTurnExecutionStarted(
    execution.executionId, { expectedRevision: 0 }, senderPrincipal,
  );
  execution = coordinator.bindStartedTurnExecutionOperation(
    execution.executionId, { turnId: "turn-activation-publication", expectedRevision: 1 },
    senderPrincipal,
  );
  const argumentsValue = {
    sourceEventId: "event_activation_source",
    event: eventBody,
    commitSha: "1".repeat(40),
  };
  execution = coordinator.recordModelSelectedTurnToolAction(
    execution.executionId,
    {
      turnId: "turn-activation-publication", callId: "call-activation-publication",
      ordinal: 0, name: "threadmesh_publish_artifact", arguments: argumentsValue,
      expectedRevision: 2, expectedActionHeadDigest: null,
    },
    senderPrincipal,
  );
  execution = coordinator.completeModelSelectedTurnToolAction(
    execution.executionId,
    {
      turnId: "turn-activation-publication", callId: "call-activation-publication",
      ordinal: 0, resultDigest: sha256Digest({ published: true }),
      resultStatus: "completed", expectedRevision: 3,
      expectedActionHeadDigest: execution.actionHeadDigest,
    },
    senderPrincipal,
  );
  execution = coordinator.bindCompletedTurnExecution(
    execution.executionId,
    {
      binding: completedBinding(sender, "turn-activation-publication", execution.actions),
      expectedRevision: 4,
    },
    senderPrincipal,
  );
  coordinator.publishLifecycleFromCompletedAction(execution.executionId, {
    expectedTool: "threadmesh_publish_artifact",
    event: lifecycleEvent,
    expectedMaterial: { commitSha: "1".repeat(40) },
  }, senderPrincipal);
}

function turn(actor, turnId, tool, args, output) {
  const receipt = {
    adapterOperationId: turnId,
    acceptedAt: new Date(NOW).toISOString(),
    evidenceRefs: [`fixture://turn/${turnId}`],
  };
  return {
    state: "completed",
    receipt,
    evidence: completedBinding(actor, turnId, []).evidence,
    toolCalls: [{
      ordinal: 0, turnId, callId: `call-${turnId}`, tool,
      argumentsDigest: sha256Digest(args), outputDigest: sha256Digest(output),
      resultStatus: "completed",
    }],
  };
}

function strictRuntime() {
  const state = {
    decisionTurns: 0,
    admittedTurns: 0,
    rawTurns: 0,
    decisionOffer: null,
    admittedRendering: null,
  };
  return {
    state,
    async runTurn() { state.rawTurns += 1; throw new Error("raw turn forbidden"); },
    async runReceiverDecisionTurn(options) {
      state.decisionTurns += 1;
      state.decisionOffer = options.offer;
      const turnId = "turn-activation-decision";
      const args = { messageId: lifecycleEvent.messageId, decision: "accepted" };
      await options.beforeTurnStart({ adapterIdempotencyKey:
        `idem_threadmesh_decision_${sha256Digest({
          scenarioId: "scenario_activation", role: "receiver",
          phase: "receiver-decision", messageId: lifecycleEvent.messageId,
          revision: 0,
          promptDigest: sha256Digest(
            (await import("../src/rendering/context-admission.mjs"))
              .renderRegisteredPeerOffer(options.offer),
          ),
        }).slice("sha256:".length)}` });
      await options.onTurnStarted({ turnId });
      const result = turn(receiver, turnId, "threadmesh_decide_offer", args, {
        state: "selection-staged",
        authority: "non-authoritative",
        selectionDigest: sha256Digest(args),
      });
      const completion = await options.onCompletedDecisionTurn({
        decision: { messageId: lifecycleEvent.messageId, decision: "accepted" },
        turn: result,
        recoveryJournal: { recordDigest: sha256Digest("decision-journal") },
        decisionActionJournal: {
          executionId: options.turnRecovery.executionId,
          adapterIdempotencyKey: "adapter-decision-action",
          recordDigest: sha256Digest("decision-action"),
        },
      });
      return { ...result, decisionCompletion: completion };
    },
    async runAdmittedToolTurn(options) {
      state.admittedTurns += 1;
      state.admittedRendering = options.prepared.rendering;
      const turnId = "turn-activation-business";
      const args = {};
      const output = { effect: "recorded" };
      await options.beforeTurnStart({ adapterIdempotencyKey:
        `idem_threadmesh_admitted_${sha256Digest({
          scenarioId: "scenario_activation", role: "receiver",
          phase: "admitted-business", sourcePreparedDigest: sha256Digest(options.prepared),
          allowedToolNames: [businessTool.name],
        }).slice("sha256:".length)}` });
      await options.onTurnStarted({ turnId });
      const selected = {
        threadId: receiver.threadId, turnId, callId: `call-${turnId}`, ordinal: 0,
        tool: businessTool.name, arguments: args, argumentsDigest: sha256Digest(args),
      };
      await options.beforeToolCall(selected);
      assert.deepEqual(await options.onToolCall(selected), output);
      await options.afterToolCall({
        ...selected, outputDigest: sha256Digest(output), resultStatus: "completed",
      });
      const result = turn(receiver, turnId, businessTool.name, args, output);
      result.admissionConfirmation = await options.onAdmissionReceipt({
        prepared: options.prepared,
        receipt: result.receipt,
        evidence: result.evidence,
        turn: result,
      });
      return result;
    },
  };
}

function noPlanCodexAdapter() {
  const ref = Object.freeze({
    kind: "codex-app-server",
    threadId: receiver.threadId,
    snapshotDigest: receiver.snapshotDigest,
    userAgent: "threadmesh-activation-test/1",
  });
  const state = { starts: 0, prompts: [], turns: [], clientIds: [] };
  return {
    state,
    async createDynamicToolThread() { return ref; },
    async observePersistedTurns() {
      const turns = state.turns.map((turnId, index) => ({
        id: turnId,
        status: "completed",
        items: [{ type: "userMessage", clientId: state.clientIds[index] }],
      }));
      return createCodexPersistedTurnObservation({
        threadId: ref.threadId,
        snapshotDigest: ref.snapshotDigest,
        threadStatus: turns.length === 0 ? "idle" : "notLoaded",
        readTurns: turns,
        listedTurns: turns,
      });
    },
    async runAutonomousToolTurn(options) {
      state.starts += 1;
      state.prompts.push(options.prompt);
      const turnId = `turn-activation-codex-${state.starts}`;
      state.turns.push(turnId);
      state.clientIds.push(options.adapterIdempotencyKey);
      await options.beforeTurnStart({
        threadId: ref.threadId,
        snapshotDigest: ref.snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      await options.onTurnStarted({
        threadId: ref.threadId,
        turnId,
        snapshotDigest: ref.snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      const decision = options.dynamicTools[0].name === "threadmesh_decide_offer";
      const args = decision
        ? { messageId: lifecycleEvent.messageId, decision: "accepted" }
        : {};
      const selected = {
        threadId: ref.threadId,
        turnId,
        callId: `call-${turnId}`,
        ordinal: 0,
        tool: options.dynamicTools[0].name,
        arguments: args,
        argumentsDigest: sha256Digest(args),
      };
      await options.beforeToolCall(selected);
      const output = await options.onToolCall(selected);
      const completed = {
        ...selected,
        outputDigest: sha256Digest(output),
        resultStatus: "completed",
      };
      delete completed.arguments;
      await options.afterToolCall(completed);
      return {
        state: "completed",
        text: "done",
        truncated: false,
        receipt: {
          adapterOperationId: turnId,
          acceptedAt: new Date(NOW).toISOString(),
          evidenceRefs: [
            `codex-app-server://thread/${ref.threadId}/turn/${turnId}`,
          ],
        },
        evidence: {
          threadId: ref.threadId,
          turnId,
          turnStatus: "completed",
          completedAt: new Date(NOW).toISOString(),
          durationMs: 1,
          userAgent: ref.userAgent,
          snapshotDigest: ref.snapshotDigest,
          serverRequestDeniedCount: 0,
          serverRequestHandledCount: 0,
          notificationCount: 1,
          deltaCount: 1,
        },
        toolCalls: [completed],
        nonThreadMeshToolCalls: 0,
      };
    },
  };
}

test("coordinator activation accepts, admits, executes, confirms, and stops", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-activation-driver-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const coordinator = new SqliteCoordinator({
    filename: path.join(directory, "coordinator.sqlite"), clock: () => NOW,
  });
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
        ...(actor === receiver
          ? { userAgent: "threadmesh-activation-test/1" }
          : {}),
      },
    }, owner);
  }
  coordinator.issueGrant(grant, {
    decisionId: "decision_activation_grant",
    authenticationId: "authn_activation_grant",
    decidedAt: grant.createdAt,
  }, owner);
  publishMessage(coordinator);
  const routeProjection = evaluateAttentionRoute({
    event: lifecycleEvent,
    receiverTask: receiver,
    subscribedEventTypes: ["artifact-ready"],
    seenMessageIds: [],
    grant,
    currentGrant: grant,
    sourceTask: sender,
    targetTask: { ...receiver, objectiveVersion: 1 },
    now: NOW,
  });
  assert.deepEqual(routeProjection.envelope, projectLifecycleEventToEnvelope(lifecycleEvent));
  const adapter = noPlanCodexAdapter();
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  const ref = await runtime.createRole({
    role: "receiver",
    cwd: directory,
    tools: [REGISTERED_PEER_DECISION_TOOL, businessTool],
    phaseTools: {
      "receiver-decision": [REGISTERED_PEER_DECISION_TOOL],
      "admitted-business": [businessTool],
    },
    protectedPhases: {
      "receiver-decision": "receiver-decision",
      "admitted-business": "admitted-tool",
    },
    instructions: "Use only the currently admitted ThreadMesh tool.",
    scenarioId: "scenario_activation",
  });
  const result = await runCoordinatorActivation({
    coordinator,
    runtime,
    receiver,
    principal: receiverPrincipal,
    role: "receiver",
    cwd: directory,
    ref,
    routeProjection,
    scenarioId: "scenario_activation",
    chainId: "chain_activation",
    recoveryDirectory: directory,
    businessTool,
    async onBusinessToolCall() { return { effect: "recorded" }; },
  });

  assert.equal(result.state, "completed");
  assert.equal(result.decision, "accepted");
  assert.equal(result.admitted, true);
  assert.equal(result.claim.state, "completed-bound");
  assert.equal(adapter.state.starts, 2);
  assert.equal(adapter.state.prompts[0].includes("RAW_CONTENT_MUST_ONLY_APPEAR"), false);
  assert.match(adapter.state.prompts[1], /RAW_CONTENT_MUST_ONLY_APPEAR/u);
  const admission = coordinator.recoverContextAdmission(
    sender.incarnationId, lifecycleEvent.messageId, receiverPrincipal,
  );
  assert.equal(admission.state, "completed");
  assert.equal(coordinator.getAttentionCursor(receiver, receiverPrincipal)
    .activeClaim.state, "completed-bound");
  assert.equal(
    coordinator.db.prepare("SELECT COUNT(*) AS count FROM lifecycle_action_publications")
      .get().count,
    1,
  );
});
