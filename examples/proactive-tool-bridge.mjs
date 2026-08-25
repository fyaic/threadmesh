import {
  createProactiveToolBridge,
  createThreadMeshClient,
  THREADMESH_PROACTIVE_TOOL_NAMES,
} from "@fyaic/threadmesh";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const endpoint = required("THREADMESH_URL");

function client(token, idPrefix) {
  return createThreadMeshClient({
    authorization: `Bearer ${token}`,
    idPrefix,
    send: async (request, { authorization }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`ThreadMesh transport failed: ${response.status}`);
      return response.json();
    },
  });
}

const sender = client(required("THREADMESH_SENDER_TOKEN"), "proactive-sender");
const receiver = client(required("THREADMESH_RECEIVER_TOKEN"), "proactive-receiver");
const source = {
  taskId: required("THREADMESH_SOURCE_TASK_ID"),
  incarnationId: required("THREADMESH_SOURCE_INCARNATION_ID"),
  harness: required("THREADMESH_SOURCE_HARNESS"),
};
const target = {
  taskId: required("THREADMESH_TARGET_TASK_ID"),
  incarnationId: required("THREADMESH_TARGET_INCARNATION_ID"),
  harness: required("THREADMESH_TARGET_HARNESS"),
};
const relationshipId = required("THREADMESH_RELATIONSHIP_ID");

// Create one bridge per model turn. Give `bridge.tools` to the harness's native
// dynamic-tool API and route native calls to `bridge.handleToolCall`.
const bridge = createProactiveToolBridge({
  client: sender,
  source,
  relationships: [{ relationshipId, target }],
});

// This deterministic example stands in for a model selecting the tools. The
// production harness, not ThreadMesh, owns the model loop and its instructions.
const discovered = await bridge.handleToolCall({
  tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
  arguments: {},
});
const targetSummary = discovered.tasks[0];
let sent = null;
if (targetSummary.coordination?.intents?.includes("suggest")) {
  sent = await bridge.handleToolCall({
    tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
    arguments: {
      targetTaskId: target.taskId,
      content: required("THREADMESH_EXAMPLE_CONTENT"),
      reason: required("THREADMESH_EXAMPLE_REASON"),
    },
  });
}

// The receiving harness keeps a separate checkpoint and consent boundary.
const page = await receiver.pollMailbox({ receiver: target });
const received = page.messages.find(({ envelope }) => envelope.messageId === sent?.messageId);
const receiverDecision = received
  ? await receiver.decide({ message: received, decision: "accepted" })
  : null;

console.log(JSON.stringify({
  toolNames: bridge.tools.map(({ name }) => name),
  usage: bridge.usage(),
  sent: sent?.sent === true,
  receiverDecision: receiverDecision?.disposition?.decision ?? "not-requested",
}, null, 2));
