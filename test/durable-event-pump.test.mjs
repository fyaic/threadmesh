import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { createAutonomousEventPump } from
  "../src/activation/autonomous-event-pump.mjs";
import { sha256Digest } from "../src/canonical-json.mjs";
import {
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";
import { renderRegisteredPeerOffer } from
  "../src/rendering/context-admission.mjs";

const START = Date.parse("2026-09-01T08:00:00.000Z");
const owner = { kind: "user", principalId: "owner_durable_pump" };
const sender = { taskId: "task_pump_source", incarnationId: "inc_pump_source_01" };
const receiver = { taskId: "task_pump_target", incarnationId: "inc_pump_target_01" };
const senderPrincipal = { kind: "task", ...sender };
const receiverPrincipal = { kind: "task", ...receiver };
const receiverRef = {
  kind: "codex-app-server",
  threadId: "thread-pump-target",
  snapshotDigest: `sha256:${"b".repeat(64)}`,
};
const senderRef = {
  kind: "codex-app-server",
  threadId: "thread-pump-source",
  snapshotDigest: `sha256:${"a".repeat(64)}`,
};
const activationReceiver = {
  ...receiver,
  threadId: receiverRef.threadId,
  snapshotDigest: receiverRef.snapshotDigest,
};
const grant = {
  specVersion: "0.0-draft",
  grantId: "grant_durable_pump",
  grantVersion: 1,
  relationshipId: "rel_durable_pump",
  relationshipType: "peer",
  source: sender,
  target: receiver,
  allowedIntents: ["suggest"],
  allowedDeliveryModes: ["checkpoint-offer"],
  summaryVisibility: "coordination",
  structuredGateResponses: false,
  createdAt: "2026-09-01T07:00:00.000Z",
  expiresAt: "2026-09-01T10:00:00.000Z",
};

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-durable-pump-"));
  return {
    directory,
    filename: path.join(directory, "coordinator.sqlite"),
    recoveryDirectory: path.join(directory, "recovery"),
    cleanup() { fs.rmSync(directory, { recursive: true, force: true }); },
  };
}

function open(filename, clock) {
  return new SqliteCoordinator({ filename, clock: () => clock.value });
}

function setup(coordinator) {
  coordinator.registerTask({
    ...sender, harness: "codex", state: "idle", runtime: { objectiveVersion: 1 },
    adapterRef: {
      kind: "codex-app-server", threadId: "thread-pump-source",
      snapshotDigest: `sha256:${"a".repeat(64)}`,
    },
  }, owner);
  coordinator.registerTask({
    ...receiver, harness: "codex", state: "idle", runtime: { objectiveVersion: 1 },
    adapterRef: {
      kind: "codex-app-server", threadId: "thread-pump-target",
      snapshotDigest: `sha256:${"b".repeat(64)}`,
    },
  }, owner);
  coordinator.issueGrant(grant, {
    decisionId: "decision_durable_pump",
    authenticationId: "authn_durable_pump",
    decidedAt: grant.createdAt,
  }, owner);
  publishEvent(coordinator, {
    suffix: "01",
    sourceEventId: "event_durable_pump_source_01",
    commitSha: "1".repeat(40),
    eventType: "artifact-ready",
    messageId: "msg_durable_pump_01",
    sender: { ...sender, actorType: "agent", harness: "codex" },
    target: { ...receiver, harness: "codex" },
    relationshipId: grant.relationshipId,
    content: "Durable selection fixture artifact.",
    reason: "Exercise exact-head pump recovery.",
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
  });
}

function submitLaterEvent(coordinator) {
  publishEvent(coordinator, {
    suffix: "02",
    sourceEventId: "event_durable_pump_source_02",
    commitSha: "2".repeat(40),
    eventType: "artifact-ready",
    messageId: "msg_durable_pump_02",
    sender: { ...sender, actorType: "agent", harness: "codex" },
    target: { ...receiver, harness: "codex" },
    relationshipId: grant.relationshipId,
    content: "Later same-receiver event must remain behind the completed-bound head.",
    reason: "Exercise next-only recovery.",
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: "2026-09-01T08:00:00.001Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
  });
}

function register(pump) {
  return pump.registerReceiver({
    receiver,
    principal: receiverPrincipal,
    role: "reviewer",
    cwd: "/tmp",
    ref: {
      kind: "codex-app-server", threadId: "thread-pump-target",
      snapshotDigest: `sha256:${"b".repeat(64)}`,
    },
    routes: [{
      handlerId: "handler_durable_pump_review",
      eventType: "artifact-ready",
      subscribedEventTypes: ["review-failed"],
      grant,
      businessPhase: "review",
      businessTool: { name: "threadmesh_report_review_finding" },
      async onBusinessToolCall() {
        throw new Error("irrelevant route must not start a business turn");
      },
      async onLifecyclePublication() {
        throw new Error("irrelevant route must not publish lifecycle work");
      },
    }],
  });
}

function completedBinding(turnId, actions = [], ref = receiverRef) {
  const receipt = {
    adapterOperationId: turnId,
    acceptedAt: new Date(START).toISOString(),
    evidenceRefs: [`fixture://turn/${turnId}`],
  };
  return {
    evidence: {
      threadId: ref.threadId,
      turnId,
      turnStatus: "completed",
      completedAt: new Date(START).toISOString(),
      durationMs: 1,
      userAgent: "threadmesh-durable-pump-test/1",
      snapshotDigest: ref.snapshotDigest,
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

function publishEvent(coordinator, sourceEvent) {
  const {
    suffix, sourceEventId, commitSha,
    ...event
  } = sourceEvent;
  const eventBody = {
    eventType: event.eventType,
    messageId: event.messageId,
    target: { ...event.target },
    relationshipId: event.relationshipId,
    content: event.content,
    reason: event.reason,
    evidenceRefs: [],
    freshness: { ...event.freshness },
    causality: null,
  };
  const actor = {
    ...sender,
    threadId: senderRef.threadId,
    snapshotDigest: senderRef.snapshotDigest,
  };
  const executionId = `intent_durable_pump_publication_${suffix}`;
  const turnId = `turn-durable-pump-publication-${suffix}`;
  let execution = coordinator.createTurnExecutionIntent({
    intentId: executionId,
    scenarioId: "scenario_durable_pump_publication",
    chainId: "chain_durable_pump_publication",
    messageId: event.messageId,
    eventId: sourceEventId,
    actor,
    adapterIdempotencyKey: `adapter_durable_pump_publication_${suffix}`,
    promptDigest: sha256Digest({ suffix }),
    allowedTools: ["threadmesh_publish_artifact"],
  }, 0, senderPrincipal);
  execution = coordinator.markTurnExecutionStarted(
    executionId, { expectedRevision: 0 }, senderPrincipal,
  );
  execution = coordinator.bindStartedTurnExecutionOperation(
    executionId, { turnId, expectedRevision: 1 }, senderPrincipal,
  );
  const argumentsValue = {
    sourceEventId,
    event: eventBody,
    commitSha,
  };
  execution = coordinator.recordModelSelectedTurnToolAction(executionId, {
    turnId,
    callId: `call-durable-pump-publication-${suffix}`,
    ordinal: 0,
    name: "threadmesh_publish_artifact",
    arguments: argumentsValue,
    expectedRevision: 2,
    expectedActionHeadDigest: null,
  }, senderPrincipal);
  execution = coordinator.completeModelSelectedTurnToolAction(executionId, {
    turnId,
    callId: `call-durable-pump-publication-${suffix}`,
    ordinal: 0,
    resultDigest: sha256Digest({ published: true, suffix }),
    resultStatus: "completed",
    expectedRevision: 3,
    expectedActionHeadDigest: execution.actionHeadDigest,
  }, senderPrincipal);
  execution = coordinator.bindCompletedTurnExecution(executionId, {
    binding: completedBinding(turnId, execution.actions, senderRef),
    expectedRevision: 4,
  }, senderPrincipal);
  coordinator.publishLifecycleFromCompletedAction(executionId, {
    expectedTool: "threadmesh_publish_artifact",
    event,
    expectedMaterial: { commitSha },
  }, senderPrincipal);
}

function completedTurn(turnId, tool, argumentsValue, output) {
  const binding = completedBinding(turnId);
  return {
    state: "completed",
    receipt: binding.receipt,
    evidence: binding.evidence,
    toolCalls: [{
      ordinal: 0,
      turnId,
      callId: `call-${turnId}`,
      tool,
      argumentsDigest: sha256Digest(argumentsValue),
      outputDigest: sha256Digest(output),
      resultStatus: "completed",
    }],
  };
}

function offeredRuntime({ scenarioId, role, businessPhase, businessTool, businessOutput }) {
  const state = { decisionTurns: 0, businessTurns: 0, rawTurns: 0 };
  return {
    state,
    async runTurn() {
      state.rawTurns += 1;
      throw new Error("raw turn forbidden");
    },
    async runReceiverDecisionTurn(options) {
      state.decisionTurns += 1;
      const turnId = "turn-durable-pump-decision";
      const argumentsValue = {
        messageId: "msg_durable_pump_01",
        decision: "accepted",
      };
      await options.beforeTurnStart({
        adapterIdempotencyKey: `idem_threadmesh_decision_${sha256Digest({
          scenarioId,
          role,
          phase: "receiver-decision",
          messageId: argumentsValue.messageId,
          revision: 0,
          promptDigest: sha256Digest(renderRegisteredPeerOffer(options.offer)),
        }).slice("sha256:".length)}`,
      });
      await options.onTurnStarted({ turnId });
      const turn = completedTurn(
        turnId,
        "threadmesh_decide_offer",
        argumentsValue,
        {
          state: "selection-staged",
          authority: "non-authoritative",
          selectionDigest: sha256Digest(argumentsValue),
        },
      );
      turn.decisionCompletion = await options.onCompletedDecisionTurn({
        decision: argumentsValue,
        turn,
        recoveryJournal: { recordDigest: sha256Digest("durable-decision-journal") },
        decisionActionJournal: {
          executionId: options.turnRecovery.executionId,
          adapterIdempotencyKey: "durable-decision-action",
          recordDigest: sha256Digest("durable-decision-action"),
        },
      });
      return turn;
    },
    async runAdmittedToolTurn(options) {
      state.businessTurns += 1;
      const turnId = "turn-durable-pump-business";
      const argumentsValue = {};
      await options.beforeTurnStart({
        adapterIdempotencyKey: `idem_threadmesh_admitted_${sha256Digest({
          scenarioId,
          role,
          phase: businessPhase,
          sourcePreparedDigest: sha256Digest(options.prepared),
          allowedToolNames: [businessTool.name],
        }).slice("sha256:".length)}`,
      });
      await options.onTurnStarted({ turnId });
      const selected = {
        threadId: receiverRef.threadId,
        turnId,
        callId: `call-${turnId}`,
        ordinal: 0,
        tool: businessTool.name,
        arguments: argumentsValue,
        argumentsDigest: sha256Digest(argumentsValue),
      };
      await options.beforeToolCall(selected);
      assert.deepEqual(await options.onToolCall(selected), businessOutput);
      await options.afterToolCall({
        ...selected,
        outputDigest: sha256Digest(businessOutput),
        resultStatus: "completed",
      });
      const turn = completedTurn(
        turnId, businessTool.name, argumentsValue, businessOutput,
      );
      turn.admissionConfirmation = await options.onAdmissionReceipt({
        prepared: options.prepared,
        receipt: turn.receipt,
        evidence: turn.evidence,
        turn,
      });
      return turn;
    },
  };
}

function registerOffered(pump, businessTool, businessOutput) {
  return pump.registerReceiver({
    receiver: activationReceiver,
    principal: receiverPrincipal,
    role: "reviewer",
    cwd: "/tmp",
    ref: receiverRef,
    routes: [{
      handlerId: "handler_durable_pump_offered",
      eventType: "artifact-ready",
      subscribedEventTypes: ["artifact-ready"],
      grant,
      businessPhase: "offered-review",
      businessTool,
      async onBusinessToolCall() { return businessOutput; },
      async onLifecyclePublication() {},
    }],
  });
}

test("durable pre-dispatch selection restarts at the exact head and takes over an expired lease", async () => {
  const temporary = fixture();
  const clock = { value: START };
  let coordinator = open(temporary.filename, clock);
  try {
    setup(coordinator);
    const first = register(createAutonomousEventPump({
      coordinator,
      runtime: {},
      scenarioId: "scenario_durable_pump",
      chainId: "chain_durable_pump",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-first",
      leaseMs: 100,
      faultInjector: async (stage) => {
        if (stage === "post-record-pre-turn") {
          const error = new Error("injected post-record failure");
          error.code = "test_post_record_failure";
          throw error;
        }
      },
    })).start();
    await assert.rejects(() => first.drainOnce(), { code: "test_post_record_failure" });

    const event = coordinator.readAttentionEvents(
      receiver, { afterCursor: 0, limit: 1 }, receiverPrincipal,
    ).events[0];
    const selected = coordinator.getEventPumpDispatch(
      receiver, {
        eventCursor: event.cursor,
        eventId: event.eventId,
        pumpIdentityDigest: first.pumpIdentityDigest,
      }, receiverPrincipal,
    );
    assert.equal(selected.state, "selected");
    assert.equal(selected.ownerId, "pump-owner-first");
    assert.throws(() => coordinator.settleEventPumpDispatch(
      selected.dispatchId,
      {
        ownerId: selected.ownerId,
        leaseEpoch: selected.leaseEpoch,
        pumpIdentityDigest: `sha256:${"8".repeat(64)}`,
        outcome: "skipped",
      },
      receiverPrincipal,
    ), { code: "threadmesh_event_pump_identity_conflict" });
    assert.equal(coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor.committedCursor, 0);

    const contender = open(temporary.filename, clock);
    try {
      const changedScenarioId = "scenario_durable_pump_changed";
      assert.throws(() => contender.claimEventPumpDispatch(receiver, {
        eventCursor: event.cursor,
        eventId: event.eventId,
        eventDigest: selected.eventDigest,
        registryDigest: selected.registryDigest,
        scenarioId: changedScenarioId,
        chainId: selected.chainId,
        pumpIdentityDigest: sha256Digest({
          version: 1,
          scenarioId: changedScenarioId,
          chainId: selected.chainId,
          registryDigest: selected.registryDigest,
        }),
        handlerId: selected.handlerId,
        routeDigest: selected.routeDigest,
        ownerId: "pump-owner-wrong-identity",
        leaseMs: 100,
      }, receiverPrincipal), {
        code: "threadmesh_event_pump_identity_conflict",
      });
      const busy = contender.claimEventPumpDispatch(receiver, {
        eventCursor: event.cursor,
        eventId: event.eventId,
        eventDigest: selected.eventDigest,
        registryDigest: selected.registryDigest,
        scenarioId: selected.scenarioId,
        chainId: selected.chainId,
        pumpIdentityDigest: selected.pumpIdentityDigest,
        handlerId: selected.handlerId,
        routeDigest: selected.routeDigest,
        ownerId: "pump-owner-contender",
        leaseMs: 100,
      }, receiverPrincipal);
      assert.equal(busy.acquired, false);
      assert.equal(busy.busy, true);
      assert.equal(busy.dispatch.ownerId, "pump-owner-first");
      assert.equal(busy.dispatch.leaseEpoch, 1);
    } finally {
      contender.close();
    }

    coordinator.close();
    coordinator = null;
    clock.value += 101;
    coordinator = open(temporary.filename, clock);
    const second = register(createAutonomousEventPump({
      coordinator,
      runtime: {},
      scenarioId: "scenario_durable_pump",
      chainId: "chain_durable_pump",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-second",
      leaseMs: 100,
    })).start();
    const result = await second.runUntilIdle();
    assert.equal(result.state, "idle");
    assert.equal(result.processed, 1);
    assert.equal(result.dispatches, 0);
    assert.equal(result.skips, 1);
    assert.equal(result.durablePerDispatchRecordsValid, true);
    assert.equal(result.selectionChainValid, null);
    assert.equal(result.selectionChainScope, "global-chain-not-implemented");

    const settled = coordinator.getEventPumpDispatch(
      receiver, {
        eventCursor: event.cursor,
        eventId: event.eventId,
        pumpIdentityDigest: second.pumpIdentityDigest,
      }, receiverPrincipal,
    );
    assert.equal(settled.state, "skipped");
    assert.equal(settled.ownerId, "pump-owner-second");
    assert.equal(settled.leaseEpoch, 2);
    assert.equal(settled.handlerId, "handler_durable_pump_review");
    assert.equal(settled.selectionRecord.eventId, event.eventId);
    assert.equal(coordinator.getAttentionCursor(
      receiver, receiverPrincipal,
    ).cursor.committedCursor, event.cursor);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM event_pump_checkpoints WHERE dispatch_id = ?",
    ).pluck().get(settled.dispatchId), 3);

    coordinator.close();
    coordinator = open(temporary.filename, clock);
    const replay = register(createAutonomousEventPump({
      coordinator,
      runtime: {},
      scenarioId: "scenario_durable_pump",
      chainId: "chain_durable_pump",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-third",
    })).start();
    assert.equal((await replay.runUntilIdle()).processed, 0);
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("offered dispatch restarts once and completed-bound head never looks ahead", async () => {
  const temporary = fixture();
  const clock = { value: START };
  const scenarioId = "scenario_durable_pump_offered";
  const role = "reviewer";
  const businessPhase = "offered-review";
  const businessTool = Object.freeze({
    type: "function",
    name: "threadmesh_durable_pump_review",
    description: "Record one deterministic durable pump review.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  });
  const businessOutput = Object.freeze({ findingDigest: `sha256:${"e".repeat(64)}` });
  let coordinator = open(temporary.filename, clock);
  try {
    setup(coordinator);
    submitLaterEvent(coordinator);
    const firstRuntime = offeredRuntime({
      scenarioId, role, businessPhase, businessTool, businessOutput,
    });
    const first = registerOffered(createAutonomousEventPump({
      coordinator,
      runtime: firstRuntime,
      scenarioId,
      chainId: "chain_durable_pump_offered",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-offered-first",
      leaseMs: 100,
      faultInjector: async (stage) => {
        if (stage === "post-record-pre-turn") {
          throw Object.assign(new Error("offered crash"), { code: "offered_crash" });
        }
      },
    }), businessTool, businessOutput).start();
    await assert.rejects(() => first.drainOnce(), { code: "offered_crash" });
    assert.deepEqual(firstRuntime.state, {
      decisionTurns: 0, businessTurns: 0, rawTurns: 0,
    });

    const events = coordinator.readAttentionEvents(
      receiver, { afterCursor: 0, limit: 2 }, receiverPrincipal,
    ).events;
    assert.equal(events.length, 2);
    coordinator.close();
    coordinator = null;
    clock.value += 101;

    coordinator = open(temporary.filename, clock);
    const secondRuntime = offeredRuntime({
      scenarioId, role, businessPhase, businessTool, businessOutput,
    });
    const second = registerOffered(createAutonomousEventPump({
      coordinator,
      runtime: secondRuntime,
      scenarioId,
      chainId: "chain_durable_pump_offered",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-offered-second",
      leaseMs: 100,
      maxEvents: 2,
    }), businessTool, businessOutput).start();
    const completed = await second.runUntilIdle();
    assert.equal(completed.state, "blocked-completed-bound");
    assert.equal(completed.processed, 1);
    assert.equal(completed.dispatches, 1);
    assert.deepEqual(secondRuntime.state, {
      decisionTurns: 1, businessTurns: 1, rawTurns: 0,
    });
    const firstDispatch = coordinator.getEventPumpDispatch(receiver, {
      eventCursor: events[0].cursor,
      eventId: events[0].eventId,
      pumpIdentityDigest: second.pumpIdentityDigest,
    }, receiverPrincipal);
    assert.equal(firstDispatch.state, "completed-bound");
    assert.equal(firstDispatch.leaseEpoch, 2);
    assert.equal(coordinator.getEventPumpDispatch(receiver, {
      eventCursor: events[1].cursor,
      eventId: events[1].eventId,
      pumpIdentityDigest: second.pumpIdentityDigest,
    }, receiverPrincipal), null);

    coordinator.close();
    coordinator = open(temporary.filename, clock);
    const thirdRuntime = offeredRuntime({
      scenarioId, role, businessPhase, businessTool, businessOutput,
    });
    const third = registerOffered(createAutonomousEventPump({
      coordinator,
      runtime: thirdRuntime,
      scenarioId,
      chainId: "chain_durable_pump_offered",
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-offered-third",
      leaseMs: 100,
      maxEvents: 2,
    }), businessTool, businessOutput).start();
    const replay = await third.runUntilIdle();
    assert.equal(replay.state, "blocked-completed-bound");
    assert.equal(replay.processed, 0);
    assert.deepEqual(thirdRuntime.state, {
      decisionTurns: 0, businessTurns: 0, rawTurns: 0,
    });
    assert.equal(coordinator.getEventPumpDispatch(receiver, {
      eventCursor: events[1].cursor,
      eventId: events[1].eventId,
      pumpIdentityDigest: third.pumpIdentityDigest,
    }, receiverPrincipal), null);
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("scenario and chain identity drift cannot adopt a durable selected dispatch", async () => {
  const temporary = fixture();
  const clock = { value: START };
  const originalScenarioId = "scenario_durable_identity_original";
  const originalChainId = "chain_durable_identity_original";
  const role = "reviewer";
  const businessPhase = "offered-review";
  const businessTool = Object.freeze({
    type: "function",
    name: "threadmesh_durable_identity_review",
    description: "Record one identity-bound review.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  });
  const businessOutput = Object.freeze({ findingDigest: `sha256:${"f".repeat(64)}` });
  let coordinator = open(temporary.filename, clock);
  try {
    setup(coordinator);
    const firstRuntime = offeredRuntime({
      scenarioId: originalScenarioId,
      role,
      businessPhase,
      businessTool,
      businessOutput,
    });
    const first = registerOffered(createAutonomousEventPump({
      coordinator,
      runtime: firstRuntime,
      scenarioId: originalScenarioId,
      chainId: originalChainId,
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-identity-first",
      leaseMs: 100,
      faultInjector: async (stage) => {
        if (stage === "post-record-pre-turn") {
          throw Object.assign(new Error("identity crash"), { code: "identity_crash" });
        }
      },
    }), businessTool, businessOutput).start();
    await assert.rejects(() => first.drainOnce(), { code: "identity_crash" });
    assert.deepEqual(firstRuntime.state, {
      decisionTurns: 0, businessTurns: 0, rawTurns: 0,
    });
    coordinator.close();
    coordinator = null;
    clock.value += 101;

    for (const identity of [
      {
        scenarioId: "scenario_durable_identity_changed",
        chainId: originalChainId,
      },
      {
        scenarioId: originalScenarioId,
        chainId: "chain_durable_identity_changed",
      },
    ]) {
      coordinator = open(temporary.filename, clock);
      const rejectedRuntime = offeredRuntime({
        ...identity, role, businessPhase, businessTool, businessOutput,
      });
      const rejected = registerOffered(createAutonomousEventPump({
        coordinator,
        runtime: rejectedRuntime,
        ...identity,
        recoveryDirectory: temporary.recoveryDirectory,
        ownerId: `pump-owner-rejected-${identity.scenarioId}-${identity.chainId}`,
        leaseMs: 100,
      }), businessTool, businessOutput).start();
      await assert.rejects(() => rejected.drainOnce(), {
        code: "threadmesh_event_pump_identity_conflict",
      });
      assert.deepEqual(rejectedRuntime.state, {
        decisionTurns: 0, businessTurns: 0, rawTurns: 0,
      });
      coordinator.close();
      coordinator = null;
    }

    coordinator = open(temporary.filename, clock);
    const recoveryRuntime = offeredRuntime({
      scenarioId: originalScenarioId,
      role,
      businessPhase,
      businessTool,
      businessOutput,
    });
    const recovery = registerOffered(createAutonomousEventPump({
      coordinator,
      runtime: recoveryRuntime,
      scenarioId: originalScenarioId,
      chainId: originalChainId,
      recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-identity-recovery",
      leaseMs: 100,
    }), businessTool, businessOutput).start();
    const completed = await recovery.runUntilIdle();
    assert.equal(completed.state, "blocked-completed-bound");
    assert.equal(completed.processed, 1);
    assert.deepEqual(recoveryRuntime.state, {
      decisionTurns: 1, businessTurns: 1, rawTurns: 0,
    });
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("restart verifies the append-only dispatch checkpoint digest chain", async () => {
  const temporary = fixture();
  const clock = { value: START };
  let coordinator = open(temporary.filename, clock);
  try {
    setup(coordinator);
    const pump = register(createAutonomousEventPump({
      coordinator, runtime: {}, scenarioId: "scenario_durable_pump_tamper",
      chainId: "chain_durable_pump_tamper", recoveryDirectory: temporary.recoveryDirectory,
      ownerId: "pump-owner-tamper", leaseMs: 100,
      faultInjector: async (stage) => {
        if (stage === "post-record-pre-turn") throw Object.assign(new Error("stop"), { code: "stop" });
      },
    })).start();
    await assert.rejects(() => pump.drainOnce(), { code: "stop" });
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    database.prepare(
      "UPDATE event_pump_checkpoints SET owner_id = 'tampered-owner' WHERE sequence = 1",
    ).run();
    database.close();
    assert.throws(() => open(temporary.filename, clock), {
      code: "threadmesh_event_pump_storage_tampered",
    });
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});

test("restart rejects pump identity, registry, route, or handler mutation", async () => {
  for (const [column, value] of [
    ["registry_digest", `sha256:${"c".repeat(64)}`],
    ["scenario_id", "scenario_tampered"],
    ["chain_id", "chain_tampered"],
    ["pump_identity_digest", `sha256:${"9".repeat(64)}`],
    ["route_digest", `sha256:${"d".repeat(64)}`],
    ["handler_id", "handler_tampered"],
  ]) {
    const temporary = fixture();
    const clock = { value: START };
    let coordinator = open(temporary.filename, clock);
    try {
      setup(coordinator);
      const pump = register(createAutonomousEventPump({
        coordinator, runtime: {}, scenarioId: `scenario_intent_tamper_${column}`,
        chainId: `chain_intent_tamper_${column}`,
        recoveryDirectory: temporary.recoveryDirectory,
        ownerId: `pump-owner-${column}`, leaseMs: 100,
        faultInjector: async (stage) => {
          if (stage === "post-record-pre-turn") {
            throw Object.assign(new Error("stop"), { code: "stop" });
          }
        },
      })).start();
      await assert.rejects(() => pump.drainOnce(), { code: "stop" });
      coordinator.close();
      coordinator = null;
      const database = new Database(temporary.filename);
      database.prepare(`UPDATE event_pump_dispatches SET ${column} = ?`).run(value);
      database.close();
      assert.throws(() => open(temporary.filename, clock), {
        code: "threadmesh_event_pump_storage_tampered",
      });
    } finally {
      coordinator?.close();
      temporary.cleanup();
    }
  }
});

test("v9 rejects event-pump DDL, index, and foreign-key drift", () => {
  const mutations = [
    (database) => database.exec(
      "ALTER TABLE event_pump_dispatches ADD COLUMN unexpected TEXT",
    ),
    (database) => database.exec(`
      DROP INDEX event_pump_dispatches_state_lease;
      CREATE INDEX event_pump_dispatches_state_lease
        ON event_pump_dispatches (owner_id, lease_expires_at);
    `),
    (database) => database.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE event_pump_checkpoints;
      CREATE TABLE event_pump_checkpoints (
        dispatch_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        state TEXT NOT NULL,
        pump_identity_digest TEXT NOT NULL,
        dispatch_intent_digest TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        lease_epoch INTEGER NOT NULL,
        lease_expires_at TEXT NOT NULL,
        turn_execution_id TEXT,
        selection_digest TEXT,
        previous_checkpoint_digest TEXT,
        checkpoint_digest TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (dispatch_id, sequence),
        UNIQUE (dispatch_id, checkpoint_digest),
        FOREIGN KEY (dispatch_id)
          REFERENCES event_pump_dispatches (dispatch_id)
      );
    `),
  ];
  for (const mutate of mutations) {
    const temporary = fixture();
    let coordinator = open(temporary.filename, { value: START });
    try {
      coordinator.close();
      coordinator = null;
      const database = new Database(temporary.filename);
      mutate(database);
      database.close();
      assert.throws(() => open(temporary.filename, { value: START }), {
        code: "threadmesh_storage_schema_incompatible",
      });
    } finally {
      coordinator?.close();
      temporary.cleanup();
    }
  }
});

test("v8 migrates append-only to the durable event-pump schema", () => {
  const temporary = fixture();
  let coordinator = open(temporary.filename, { value: START });
  try {
    setup(coordinator);
    coordinator.close();
    coordinator = null;
    const database = new Database(temporary.filename);
    const v8Checksum = database.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 8",
    ).pluck().get();
    const taskCount = database.prepare("SELECT COUNT(*) FROM tasks").pluck().get();
    database.exec(`
      DROP TABLE event_pump_checkpoints;
      DROP TABLE event_pump_dispatches;
      DELETE FROM schema_migrations WHERE version = 9;
      PRAGMA user_version = 8;
    `);
    database.close();

    coordinator = open(temporary.filename, { value: START });
    assert.equal(SQLITE_SCHEMA_VERSION, 9);
    assert.equal(coordinator.storageInfo().schemaVersion, 9);
    assert.equal(coordinator.db.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 8",
    ).pluck().get(), v8Checksum);
    assert.equal(v8Checksum, SQLITE_SCHEMA_MIGRATIONS.find(
      ({ version }) => version === 8,
    ).checksum);
    assert.equal(coordinator.db.prepare(
      "SELECT COUNT(*) FROM schema_migrations",
    ).pluck().get(), 9);
    assert.equal(coordinator.db.prepare("SELECT COUNT(*) FROM tasks").pluck().get(), taskCount);
    assert.deepEqual(coordinator.db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name LIKE 'event_pump_%' ORDER BY name`,
    ).pluck().all(), ["event_pump_checkpoints", "event_pump_dispatches"]);
  } finally {
    coordinator?.close();
    temporary.cleanup();
  }
});
