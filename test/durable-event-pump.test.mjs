import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { createAutonomousEventPump } from
  "../src/activation/autonomous-event-pump.mjs";
import {
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";
import { projectLifecycleEventToEnvelope } from
  "../src/routing/lifecycle-events.mjs";

const START = Date.parse("2026-09-01T08:00:00.000Z");
const owner = { kind: "user", principalId: "owner_durable_pump" };
const sender = { taskId: "task_pump_source", incarnationId: "inc_pump_source_01" };
const receiver = { taskId: "task_pump_target", incarnationId: "inc_pump_target_01" };
const senderPrincipal = { kind: "task", ...sender };
const receiverPrincipal = { kind: "task", ...receiver };
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
  const envelope = projectLifecycleEventToEnvelope({
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
  coordinator.submit(envelope, senderPrincipal);
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
      receiver, { eventCursor: event.cursor, eventId: event.eventId }, receiverPrincipal,
    );
    assert.equal(selected.state, "selected");
    assert.equal(selected.ownerId, "pump-owner-first");
    assert.equal(coordinator.getAttentionCursor(receiver, receiverPrincipal).cursor.committedCursor, 0);

    const contender = open(temporary.filename, clock);
    try {
      const busy = contender.claimEventPumpDispatch(receiver, {
        eventCursor: event.cursor,
        eventId: event.eventId,
        eventDigest: selected.eventDigest,
        registryDigest: selected.registryDigest,
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
    assert.equal(result.selectionChainValid, true);

    const settled = coordinator.getEventPumpDispatch(
      receiver, { eventCursor: event.cursor, eventId: event.eventId }, receiverPrincipal,
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
