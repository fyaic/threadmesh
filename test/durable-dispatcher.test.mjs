import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createEffectiveGrant,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";
import { DurableDispatcher } from "../src/dispatcher/durable-dispatcher.mjs";

const NOW = Date.parse("2026-08-20T09:00:00Z");
const owner = { kind: "user", principalId: "owner" };
const sender = {
  kind: "task",
  taskId: "task_dispatch_sender",
  incarnationId: "inc_dispatch_sender01",
};
const receiver = {
  kind: "task",
  taskId: "task_dispatch_receiver",
  incarnationId: "inc_dispatch_receiver01",
};

function setup(filename = ":memory:", { stateChanging = false } = {}) {
  const coordinator = new SqliteCoordinator({ filename, clock: () => NOW });
  coordinator.registerTask(
    {
      taskId: sender.taskId,
      incarnationId: sender.incarnationId,
      harness: "sender-harness",
      state: "running",
    },
    owner,
  );
  coordinator.registerTask(
    {
      taskId: receiver.taskId,
      incarnationId: receiver.incarnationId,
      harness: "native-mock",
      state: "running",
      adapterRef: { kind: "native-mock", endpoint: "local://receiver" },
      ...(stateChanging ? { runtime: { objectiveVersion: 3 } } : {}),
    },
    owner,
  );
  const grant = createEffectiveGrant(
    {
      specVersion: "0.0-draft",
      grantId: "grant_dispatch_sender_receiver",
      grantVersion: 1,
      relationshipId: "rel_dispatch_sender_receiver",
      relationshipType: stateChanging ? "supervisor" : "peer",
      source: { taskId: sender.taskId, incarnationId: sender.incarnationId },
      target: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
      allowedIntents: [stateChanging ? "steer" : "suggest"],
      allowedDeliveryModes: [stateChanging ? "active-steer" : "checkpoint-offer"],
      summaryVisibility: "coordination",
      structuredGateResponses: false,
      createdAt: "2026-08-20T08:00:00Z",
      expiresAt: "2026-08-20T10:00:00Z",
    },
    {
      decisionId: "decision_dispatch_sender_receiver",
      authenticationId: "authn_dispatch_owner01",
      decidedAt: "2026-08-20T08:00:00Z",
    },
    owner,
  );
  coordinator.installGrant(grant, owner);
  coordinator.submit(
    {
      specVersion: "0.0-draft",
      messageId: "msg_dispatch_sender01",
      messageType: stateChanging ? "action-request" : "suggestion",
      intent: stateChanging ? "steer" : "suggest",
      claimStatus: "sender-asserted",
      sender: {
        taskId: sender.taskId,
        incarnationId: sender.incarnationId,
        actorType: "agent",
        harness: "sender-harness",
      },
      target: {
        taskId: receiver.taskId,
        incarnationId: receiver.incarnationId,
        harness: "native-mock",
      },
      relationshipId: "rel_dispatch_sender_receiver",
      content: "Review the changed dependency before continuing.",
      reason: "The prior assumption is stale.",
      ...(stateChanging
        ? { freshness: { expectedObjectiveVersion: 3 } }
        : {}),
      delivery: {
        requestedMode: stateChanging ? "active-steer" : "checkpoint-offer",
        requiresDisposition: true,
      },
      createdAt: "2026-08-20T09:00:00Z",
      expiresAt: "2026-08-20T09:10:00Z",
    },
    sender,
  );
  coordinator.respond(
    sender.incarnationId,
    "msg_dispatch_sender01",
    "accepted",
    0,
    receiver,
  );
  return coordinator;
}

test("dispatches once with a stable adapter key and records the exact receipt", async () => {
  const coordinator = setup();
  const calls = [];
  const dispatcher = new DurableDispatcher({
    coordinator,
    adapters: [
      {
        kind: "native-mock",
        supports: () => true,
        async submit(call) {
          calls.push(call);
          return {
            adapterOperationId: "native-operation-1",
            acceptedAt: "2026-08-20T09:00:01Z",
            evidenceRefs: ["mock://native-operation-1"],
          };
        },
      },
    ],
  });
  try {
    const first = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(first.state, "receipt-recorded");
    assert.equal(first.disposition.delivery, "adapter-submitted");
    assert.equal(calls.length, 1);
    assert.match(calls[0].adapterIdempotencyKey, /^adp_/);

    const replay = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(replay.state, "receipt-recorded");
    assert.equal(replay.replay, true);
    assert.equal(calls.length, 1);
  } finally {
    coordinator.close();
  }
});

test("dispatches a freshness-bound steer with one stable native key", async () => {
  const coordinator = setup(":memory:", { stateChanging: true });
  const keys = [];
  const dispatcher = new DurableDispatcher({
    coordinator,
    adapters: [
      {
        kind: "native-mock",
        supports: ({ envelope }) => envelope.intent === "steer",
        async submit({ adapterIdempotencyKey }) {
          keys.push(adapterIdempotencyKey);
          return {
            adapterOperationId: "native-steer-operation-1",
            acceptedAt: "2026-08-20T09:00:01Z",
          };
        },
      },
    ],
  });
  try {
    const result = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(result.state, "receipt-recorded");
    assert.equal(result.disposition.delivery, "adapter-submitted");
    assert.equal(keys.length, 1);
    assert.match(keys[0], /^adp_/);
  } finally {
    coordinator.close();
  }
});

test("quarantines an ambiguous adapter error and never retries it", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-dispatcher-"));
  const filename = path.join(directory, "coordinator.sqlite");
  let coordinator = setup(filename);
  let calls = 0;
  const adapter = {
    kind: "native-mock",
    async submit() {
      calls += 1;
      throw new Error("connection reset after request bytes may have crossed");
    },
  };
  let dispatcher = new DurableDispatcher({ coordinator, adapters: [adapter] });
  try {
    const first = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(first.state, "outcome-unknown");
    assert.equal(first.retrySuppressed, true);
    assert.equal(calls, 1);

    coordinator.close();
    coordinator = new SqliteCoordinator({ filename, clock: () => NOW });
    dispatcher = new DurableDispatcher({ coordinator, adapters: [adapter] });
    const replay = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(replay.state, "outcome-unknown");
    assert.equal(replay.replay, true);
    assert.equal(calls, 1);
  } finally {
    coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("fails before the irreversible boundary when no adapter supports the target", async () => {
  const coordinator = setup();
  const dispatcher = new DurableDispatcher({ coordinator, adapters: [] });
  try {
    const result = await dispatcher.dispatch(
      {
        senderIncarnationId: sender.incarnationId,
        messageId: "msg_dispatch_sender01",
        expectedRevision: 1,
      },
      receiver,
    );
    assert.equal(result.state, "failed");
    assert.equal(result.adapterCalled, false);
    assert.equal(result.disposition.delivery, "failed");
    assert.equal(
      result.disposition.deliveryFailureReason,
      "adapter-kind-unsupported",
    );
  } finally {
    coordinator.close();
  }
});
