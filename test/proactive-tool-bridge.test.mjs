import assert from "node:assert/strict";
import test from "node:test";

import {
  createProactiveToolBridge,
  THREADMESH_PROACTIVE_TOOL_NAMES,
  ThreadMeshClientError,
} from "../src/sdk/index.mjs";

const SOURCE = Object.freeze({
  taskId: "task_bridge_source",
  incarnationId: "inc_bridge_source01",
  harness: "example-sender",
});
const TARGET = Object.freeze({
  taskId: "task_bridge_target",
  incarnationId: "inc_bridge_target01",
  harness: "example-receiver",
});
const RELATIONSHIP_ID = "rel_bridge_dependency01";

function summary({ suggest = true } = {}) {
  return {
    task: TARGET,
    state: "waiting",
    blockerHint: "Waiting for the verified artifact checksum.",
    coordination: {
      intents: suggest ? ["suggest"] : ["notify"],
      deliveryModes: suggest ? ["checkpoint-offer"] : ["side-channel"],
    },
  };
}

function fakeClient(overrides = {}) {
  return {
    discoverRelated: async () => summary(),
    sendSuggestion: async () => ({
      disposition: { delivery: "control-plane-accepted", decision: "pending" },
    }),
    ...overrides,
  };
}

function bridge(client = fakeClient(), overrides = {}) {
  return createProactiveToolBridge({
    client,
    source: SOURCE,
    relationships: [{ relationshipId: RELATIONSHIP_ID, target: TARGET }],
    createMessageId: () => "msg_bridge_dependency01",
    ...overrides,
  });
}

test("proactive bridge discovers a host-bounded relationship before sending once", async () => {
  const calls = [];
  const value = bridge(fakeClient({
    discoverRelated: async (input) => {
      calls.push(["discover", input]);
      return summary();
    },
    sendSuggestion: async (input) => {
      calls.push(["send", input]);
      return { disposition: { delivery: "control-plane-accepted", decision: "pending" } };
    },
  }), {
    source: { ...SOURCE, privateState: "must-not-enter-envelope" },
    relationships: [{
      relationshipId: RELATIONSHIP_ID,
      target: { ...TARGET, privateState: "must-not-enter-envelope" },
    }],
  });

  assert.deepEqual(value.tools.map(({ name }) => name), [
    THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
  ]);
  assert.deepEqual(
    value.tools[1].inputSchema.properties.targetTaskId.enum,
    [TARGET.taskId],
  );

  const discovered = await value.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
  });
  assert.equal(discovered.tasks[0].blockerHint, "Waiting for the verified artifact checksum.");

  const sent = await value.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
    arguments: {
      targetTaskId: TARGET.taskId,
      content: "Verified checksum: sha256:abc123.",
      reason: "The receiver explicitly declared this dependency.",
    },
  });
  assert.deepEqual(sent, {
    sent: true,
    messageId: "msg_bridge_dependency01",
    targetTaskId: TARGET.taskId,
    relationshipId: RELATIONSHIP_ID,
    delivery: "control-plane-accepted",
    decision: "pending",
  });
  assert.deepEqual(calls[0], ["discover", { task: TARGET, relationshipId: RELATIONSHIP_ID }]);
  assert.deepEqual(calls[1][1], {
    messageId: "msg_bridge_dependency01",
    from: SOURCE,
    to: TARGET,
    relationshipId: RELATIONSHIP_ID,
    content: "Verified checksum: sha256:abc123.",
    reason: "The receiver explicitly declared this dependency.",
    ttlMs: 5 * 60 * 1000,
    deliveryMode: "checkpoint-offer",
  });
  assert.deepEqual(value.usage(), {
    discoveryCalls: 1,
    sendCalls: 1,
    discoveryCompleted: true,
    sentTaskIds: [TARGET.taskId],
  });
});

test("proactive bridge rejects send-before-discovery and duplicate tool calls", async () => {
  const value = bridge();
  await assert.rejects(
    value.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: { targetTaskId: TARGET.taskId, content: "x", reason: "x" },
    }),
    { code: "threadmesh_proactive_bridge_discovery_required" },
  );
  await value.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    arguments: {},
  });
  await assert.rejects(
    value.handleToolCall({ tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover, arguments: {} }),
    { code: "threadmesh_proactive_bridge_discovery_budget_exceeded" },
  );
  await value.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
    arguments: { targetTaskId: TARGET.taskId, content: "x", reason: "x" },
  });
  await assert.rejects(
    value.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: { targetTaskId: TARGET.taskId, content: "y", reason: "y" },
    }),
    { code: "threadmesh_proactive_bridge_send_budget_exceeded" },
  );
});

test("proactive bridge fails closed for unknown, malformed, or non-suggestable targets", async () => {
  const unknown = bridge();
  await unknown.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    arguments: {},
  });
  await assert.rejects(
    unknown.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: { targetTaskId: "task_unknown", content: "x", reason: "x" },
    }),
    { code: "threadmesh_proactive_bridge_target_unknown" },
  );
  await assert.rejects(
    unknown.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: { targetTaskId: TARGET.taskId, content: "x", reason: "x" },
    }),
    { code: "threadmesh_proactive_bridge_send_budget_exceeded" },
  );

  const malformed = bridge();
  await malformed.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    arguments: {},
  });
  await assert.rejects(
    malformed.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: {
        targetTaskId: TARGET.taskId,
        content: "x".repeat(20_001),
        reason: "x",
      },
    }),
    { code: "threadmesh_proactive_bridge_suggestion_invalid" },
  );

  const notSuggestable = bridge(fakeClient({
    discoverRelated: async () => summary({ suggest: false }),
  }));
  await notSuggestable.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    arguments: {},
  });
  await assert.rejects(
    notSuggestable.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      arguments: { targetTaskId: TARGET.taskId, content: "x", reason: "x" },
    }),
    { code: "threadmesh_proactive_bridge_target_not_suggestable" },
  );
});

test("proactive bridge reserves budgets before concurrent transport calls", async () => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const value = bridge(fakeClient({
    discoverRelated: async () => {
      await waiting;
      return summary();
    },
  }));
  const first = value.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
    arguments: {},
  });
  await assert.rejects(
    value.handleToolCall({ tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover, arguments: {} }),
    { code: "threadmesh_proactive_bridge_discovery_budget_exceeded" },
  );
  release();
  await first;
});

test("proactive bridge preserves stable client errors and validates host configuration", async () => {
  const remote = new ThreadMeshClientError("threadmesh_task_summary_not_found", {
    rpcCode: -32004,
  });
  const value = bridge(fakeClient({ discoverRelated: async () => { throw remote; } }));
  await assert.rejects(
    value.handleToolCall({
      tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
      arguments: {},
    }),
    (error) => error === remote,
  );
  assert.equal(value.usage().discoveryCalls, 1);
  assert.equal(value.usage().discoveryCompleted, false);

  assert.throws(
    () => createProactiveToolBridge({
      client: fakeClient(),
      source: SOURCE,
      relationships: [
        { relationshipId: "rel_one", target: TARGET },
        { relationshipId: "rel_two", target: TARGET },
      ],
    }),
    { code: "threadmesh_proactive_bridge_relationships_invalid" },
  );
});
