import assert from "node:assert/strict";
import test from "node:test";

import { createAutonomousEventPump } from
  "../src/activation/autonomous-event-pump.mjs";

function registration() {
  return {
    receiver: { taskId: "task-pump", incarnationId: "inc-pump-01" },
    principal: { kind: "task", taskId: "task-pump", incarnationId: "inc-pump-01" },
    role: "pump",
    cwd: "/tmp",
    ref: { kind: "codex-app-server", threadId: "thread-pump", snapshotDigest: `sha256:${"a".repeat(64)}` },
    routes: [{
      handlerId: "handler.pump.business.v1",
      eventType: "artifact-ready",
      subscribedEventTypes: ["artifact-ready"],
      grant: { relationshipId: "rel-pump" },
      businessTool: { name: "threadmesh_pump_business" },
      async onBusinessToolCall() {},
      async onLifecyclePublication() {},
    }],
  };
}

test("pump freezes startup registrations and one lifecycle start drains to idle", async () => {
  const coordinator = {
    getAttentionCursor() {
      return { cursor: { committedCursor: 0, revision: 0 }, activeClaim: null };
    },
    readAttentionEvents() { return { events: [] }; },
    verifyEventPumpDispatchRecords() {
      return { valid: true, scope: "durable-per-dispatch", recordCount: 0 };
    },
  };
  const mutableRegistration = registration();
  const pump = createAutonomousEventPump({
    coordinator, runtime: {}, scenarioId: "scenario-pump", chainId: "chain-pump",
    recoveryDirectory: "/tmp", maxEvents: 2,
  }).registerReceiver(mutableRegistration);

  const result = await pump.runUntilIdle();
  const registryDigest = pump.registryDigest;
  mutableRegistration.receiver.taskId = "task-mutated";
  mutableRegistration.ref.threadId = "thread-mutated";
  mutableRegistration.routes[0].grant.relationshipId = "rel-mutated";
  mutableRegistration.routes[0].subscribedEventTypes.push("review-failed");
  mutableRegistration.routes[0].businessTool.name = "threadmesh_mutated";
  mutableRegistration.routes[0].handlerId = "handler.mutated";

  assert.equal(Object.isFrozen(pump.registrations), true);
  assert.equal(Object.isFrozen(pump.registrations[0].routes[0].businessTool), true);
  assert.equal(pump.registryDigest, registryDigest);
  assert.equal(pump.registrations[0].receiver.taskId, "task-pump");
  assert.equal(pump.registrations[0].routes[0].relationshipId, "rel-pump");
  assert.equal(pump.registrations[0].routes[0].handlerId, "handler.pump.business.v1");
  assert.equal(result.state, "idle");
  assert.equal(result.processed, 0);
  assert.equal(result.durablePerDispatchRecordsValid, true);
  assert.equal(result.selectionChainValid, null);
  assert.equal(result.selectionChainScope, "global-chain-not-implemented");
  const alternateRegistration = registration();
  alternateRegistration.routes[0].handlerId = "handler.pump.business.v2";
  const alternate = createAutonomousEventPump({
    coordinator, runtime: {}, scenarioId: "scenario-pump", chainId: "chain-pump",
    recoveryDirectory: "/tmp", maxEvents: 2,
  }).registerReceiver(alternateRegistration).start();
  assert.notEqual(alternate.registryDigest, registryDigest);
  assert.throws(() => pump.registerReceiver(registration()), {
    code: "threadmesh_event_pump_registration_closed",
  });
});

test("settled completed-bound head blocks without looking ahead or starting another turn", async () => {
  let attentionReads = 0;
  let pendingReads = 0;
  const head = {
    cursor: 7,
    eventId: "event-settled-head",
    messageId: "msg-settled-head",
    senderIncarnationId: "inc-source-01",
  };
  const later = {
    cursor: 8,
    eventId: "event-later-same-receiver",
    messageId: "msg-later-same-receiver",
    senderIncarnationId: "inc-source-01",
  };
  const coordinator = {
    getAttentionCursor() {
      return {
        cursor: { committedCursor: 0, revision: 2 },
        activeClaim: { eventId: head.eventId, state: "completed-bound" },
      };
    },
    readAttentionEvents(_receiver, options) {
      attentionReads += 1;
      assert.equal(options.afterCursor, 0);
      assert.equal(options.limit, 1);
      return { events: [head, later] };
    },
    getEventPumpDispatch() { return null; },
    verifyEventPumpDispatchRecords() {
      return { valid: true, scope: "durable-per-dispatch", recordCount: 0 };
    },
    listPending() { pendingReads += 1; throw new Error("must not read later pending work"); },
  };
  const pump = createAutonomousEventPump({
    coordinator, runtime: {}, scenarioId: "scenario-settled", chainId: "chain-settled",
    recoveryDirectory: "/tmp", maxEvents: 2,
  }).registerReceiver(registration()).start();
  const result = await pump.runUntilIdle();

  assert.equal(result.state, "blocked-completed-bound");
  assert.equal(result.awaitingPromotion, true);
  assert.equal(result.processed, 0);
  assert.equal(attentionReads, 1);
  assert.equal(pendingReads, 0);
  assert.equal(result.dispatches, 0);
  assert.equal(result.selectionRecordCount, 0);
});

test("pump refreshes coordinator grant authority again immediately before admission", async () => {
  const now = Date.parse("2026-09-01T08:00:00.000Z");
  const source = { taskId: "task_source_refresh", incarnationId: "inc_source_refresh_01" };
  const target = { taskId: "task_pump_receiver", incarnationId: "inc_pump_receiver_01" };
  const grant = {
    grantId: "grant-pump",
    grantVersion: 1,
    relationshipId: "rel_pump_refresh",
    relationshipType: "peer",
    source,
    target,
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: "2026-09-01T07:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
  };
  const envelope = {
    specVersion: "0.0-draft",
    messageId: "msg_pump_grant_refresh",
    messageType: "result",
    intent: "suggest",
    claimStatus: "sender-asserted",
    sender: { ...source, actorType: "agent", harness: "codex" },
    target: { ...target, harness: "codex" },
    relationshipId: grant.relationshipId,
    content: "ThreadMesh lifecycle event: artifact-ready\n\nBounded artifact ready.",
    reason: "Completed action publication.",
    freshness: { expectedObjectiveVersion: 1 },
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T09:00:00.000Z",
  };
  let grantReads = 0;
  let runtimeStarts = 0;
  const coordinator = {
    clock: () => now,
    getAttentionCursor() {
      return { cursor: { committedCursor: 0, revision: 0 }, activeClaim: null };
    },
    readAttentionEvents() {
      return { events: [{
        cursor: 1,
        eventId: "event-grant-refresh",
        messageId: envelope.messageId,
        senderIncarnationId: source.incarnationId,
      }] };
    },
    getEventPumpDispatch() { return null; },
    getEventPumpRouteAuthority() {
      grantReads += 1;
      if (grantReads === 2) {
        const error = new Error("grant revoked");
        error.code = "threadmesh_event_pump_grant_snapshot_invalid";
        throw error;
      }
      return {
        event: { eventDigest: `sha256:${"b".repeat(64)}` },
        envelope,
        grant,
        sourceTask: { ...source, objectiveVersion: 1 },
        targetTask: { ...target, objectiveVersion: 1 },
        authorityDigest: `sha256:${"c".repeat(64)}`,
      };
    },
    claimEventPumpDispatch() {
      return {
        acquired: true,
        dispatch: { dispatchId: "dispatch-refresh", leaseEpoch: 1 },
      };
    },
  };
  const registered = registration();
  registered.receiver = target;
  registered.principal = { kind: "task", ...target };
  registered.routes[0].grant = grant;
  const pump = createAutonomousEventPump({
    coordinator,
    runtime: { runReceiverDecisionTurn() { runtimeStarts += 1; } },
    scenarioId: "scenario-grant-refresh",
    chainId: "chain-grant-refresh",
    recoveryDirectory: "/tmp",
    maxEvents: 2,
  }).registerReceiver(registered).start();

  await assert.rejects(() => pump.runUntilIdle(), {
    code: "threadmesh_event_pump_grant_snapshot_invalid",
  });
  assert.equal(grantReads, 2);
  assert.equal(runtimeStarts, 0);
  assert.equal(pump.selectionRecords.length, 0);
});

test("pump rejects unbounded and duplicate startup registration", () => {
  const base = {
    coordinator: {}, runtime: {}, scenarioId: "scenario-pump", chainId: "chain-pump",
    recoveryDirectory: "/tmp",
  };
  assert.throws(() => createAutonomousEventPump({ ...base, maxEvents: 0 }), {
    code: "threadmesh_event_pump_input_invalid",
  });
  const pump = createAutonomousEventPump({ ...base, maxEvents: 1 });
  const missingHandler = registration();
  delete missingHandler.routes[0].handlerId;
  assert.throws(() => pump.registerReceiver(missingHandler), {
    code: "threadmesh_event_pump_registration_invalid",
  });
  pump.registerReceiver(registration());
  assert.throws(() => pump.registerReceiver(registration()), {
    code: "threadmesh_event_pump_registration_conflict",
  });
});
