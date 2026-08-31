import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENTION_WAKE_REASON_CODES,
  AttentionWakeCursorConsumer,
} from "../src/routing/attention-wake.mjs";

function event(cursor, messageId, eventType = "completed") {
  return {
    cursor,
    eventId: `audit-${cursor}`,
    eventType,
    senderIncarnationId: "inc_source_1",
    messageId,
  };
}

function reader(events, calls = []) {
  return ({ afterCursor, limit }) => {
    calls.push({ afterCursor, limit });
    const page = events.filter((entry) => entry.cursor > afterCursor).slice(0, limit);
    return { events: page, nextCursor: page.at(-1)?.cursor ?? afterCursor };
  };
}

test("reconciles durable cursor pages after a dropped wake", async () => {
  const handled = [];
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(3, "message-3")]),
    handleEvent: (entry) => { handled.push(entry.messageId); },
  });
  const result = await consumer.reconcile();
  assert.deepEqual(handled, ["message-3"]);
  assert.equal(result.wakeDisposition, "absent");
  assert.equal(result.reasonCode, ATTENTION_WAKE_REASON_CODES.RECONCILED);
  assert.equal(result.nextCursor, 3);
  assert.equal(consumer.checkpoint(), 3);
});

test("does not repeat an offer or effect for duplicate durable message events", async () => {
  const handled = [];
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(1, "same-message"), event(2, "same-message")]),
    handleEvent: (entry) => { handled.push(entry.messageId); },
  });
  const result = await consumer.reconcile({ wake: { cursor: 2 } });
  assert.deepEqual(handled, ["same-message"]);
  assert.equal(result.duplicates, 1);
  assert.equal(result.nextCursor, 2);
});

test("advances past irrelevant events without offering them", async () => {
  const handled = [];
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(1, "audit-1", "message-durably-received"), event(2, "event-2")]),
    handleEvent: (entry) => { handled.push(entry.messageId); },
  });
  const result = await consumer.reconcile();
  assert.deepEqual(handled, ["event-2"]);
  assert.equal(result.irrelevant, 1);
  assert.equal(result.nextCursor, 2);
});

test("treats an old wake cursor as stale while reconciling newer durable events", async () => {
  const handled = [];
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(3, "message-3")]),
    handleEvent: (entry) => { handled.push(entry.messageId); },
    afterCursor: 2,
  });
  const result = await consumer.reconcile({ wake: { cursor: 1 } });
  assert.equal(result.wakeDisposition, "stale");
  assert.equal(result.reasonCode, ATTENTION_WAKE_REASON_CODES.RECONCILED);
  assert.deepEqual(handled, ["message-3"]);
  const empty = await consumer.reconcile({ wake: { cursor: 1 } });
  assert.equal(empty.reasonCode, ATTENTION_WAKE_REASON_CODES.STALE_HINT);
});

test("rejects a read page whose cursor could skip durable events", async () => {
  const consumer = new AttentionWakeCursorConsumer({
    readPage: () => ({ events: [event(1, "message-1")], nextCursor: 2 }),
    handleEvent: () => {},
  });
  await assert.rejects(
    () => consumer.reconcile(),
    { code: "threadmesh_attention_wake_invalid" },
  );
});

test("retries the same durable event after a handler failure", async () => {
  let attempts = 0;
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(1, "message-retry")]),
    handleEvent: () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient-handler-failure");
      return { state: "handled", reasonCode: "handler-recovered" };
    },
  });
  await assert.rejects(
    () => consumer.reconcile(),
    /transient-handler-failure/,
  );
  assert.equal(consumer.checkpoint(), 0);

  const recovered = await consumer.reconcile();
  assert.equal(recovered.nextCursor, 1);
  assert.equal(recovered.handled.length, 1);
  assert.equal(attempts, 2);
});

test("stops exactly at event budget and resumes from the durable checkpoint", async () => {
  const calls = [];
  const handled = [];
  const consumer = new AttentionWakeCursorConsumer({
    readPage: reader([event(1, "message-1"), event(2, "message-2"), event(3, "message-3")], calls),
    handleEvent: (entry) => { handled.push(entry.messageId); },
    pageLimit: 2,
    maxEvents: 2,
  });
  const first = await consumer.reconcile({ wake: { cursor: 3 } });
  assert.equal(first.state, "budget-exhausted");
  assert.equal(first.reasonCode, ATTENTION_WAKE_REASON_CODES.EVENT_BUDGET_EXHAUSTED);
  assert.equal(first.nextCursor, 2);
  assert.deepEqual(calls, [{ afterCursor: 0, limit: 2 }]);

  const resumed = new AttentionWakeCursorConsumer({
    readPage: reader([event(1, "message-1"), event(2, "message-2"), event(3, "message-3")]),
    handleEvent: (entry) => { handled.push(entry.messageId); },
    afterCursor: first.nextCursor,
    maxEvents: 3,
  });
  const second = await resumed.reconcile();
  assert.equal(second.nextCursor, 3);
  assert.deepEqual(handled, ["message-1", "message-2", "message-3"]);
});
