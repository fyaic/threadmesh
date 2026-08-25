import { createThreadMeshClient } from "@fyaic/threadmesh";

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

const owner = client(required("THREADMESH_OWNER_TOKEN"), "owner");
const sender = client(required("THREADMESH_SENDER_TOKEN"), "sender");
const receiver = client(required("THREADMESH_RECEIVER_TOKEN"), "receiver");

const source = {
  taskId: required("THREADMESH_SOURCE_TASK_ID"),
  incarnationId: required("THREADMESH_SOURCE_INCARNATION_ID"),
  harness: "example-harness",
};
const target = {
  taskId: required("THREADMESH_TARGET_TASK_ID"),
  incarnationId: required("THREADMESH_TARGET_INCARNATION_ID"),
  harness: "example-harness",
};
const relationshipId = required("THREADMESH_RELATIONSHIP_ID");

// An owner or policy principal registers task incarnations. Relationship grants
// are intentionally provisioned outside the harness integration path.
await owner.registerTask({ ...source, state: "running" });
await owner.registerTask({ ...target, state: "waiting" });

// A sender sees only the target summary already published for this exact grant.
const related = await sender.discoverRelated({ task: target, relationshipId });
if (related.coordination.intents.includes("suggest")) {
  await sender.sendSuggestion({
    messageId: `msg_example_${Date.now()}`,
    from: source,
    to: target,
    relationshipId,
    content: "The upstream artifact checksum is sha256:example.",
    reason: "The receiver declared this upstream artifact as a dependency.",
    ttlMs: 5 * 60 * 1000,
  });
}

// Poll at a harness checkpoint. Content is not model-visible until the receiver
// accepts it and applies its own provenance-preserving rendering policy.
const page = await receiver.pollMailbox({ receiver: target });
for (const message of page.messages) {
  const decision = message.envelope.intent === "suggest" ? "accepted" : "rejected";
  await receiver.decide({ message, decision });
}

console.log(JSON.stringify({ handled: page.messages.length, nextCursor: page.nextCursor }));
