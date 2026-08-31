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
  };
  const pump = createAutonomousEventPump({
    coordinator, runtime: {}, scenarioId: "scenario-pump", chainId: "chain-pump",
    recoveryDirectory: "/tmp", maxEvents: 2,
  }).registerReceiver(registration());

  const result = await pump.runUntilIdle();

  assert.equal(Object.isFrozen(pump.registrations), true);
  assert.equal(result.state, "idle");
  assert.equal(result.processed, 0);
  assert.equal(result.selectionChainValid, true);
  assert.throws(() => pump.registerReceiver(registration()), {
    code: "threadmesh_event_pump_registration_closed",
  });
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
  pump.registerReceiver(registration());
  assert.throws(() => pump.registerReceiver(registration()), {
    code: "threadmesh_event_pump_registration_conflict",
  });
});
