import {
  createProactiveToolBridge,
  createThreadMeshClient,
} from "@fyaic/threadmesh";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function task(name) {
  const value = JSON.parse(required(name));
  return {
    taskId: value.taskId,
    incarnationId: value.incarnationId,
    harness: value.harness,
  };
}

export default function threadMeshPiExtension(pi) {
  const endpoint = required("THREADMESH_URL");
  const client = createThreadMeshClient({
    authorization: `Bearer ${required("THREADMESH_SENDER_TOKEN")}`,
    idPrefix: "pi-extension",
    send: async (request, { authorization }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error("threadmesh_pi_transport_failed");
      return response.json();
    },
  });
  const bridge = createProactiveToolBridge({
    client,
    source: task("THREADMESH_SOURCE_JSON"),
    relationships: [{
      relationshipId: required("THREADMESH_RELATIONSHIP_ID"),
      target: task("THREADMESH_TARGET_JSON"),
    }],
  });

  for (const descriptor of bridge.tools) {
    pi.registerTool({
      name: descriptor.name,
      label: descriptor.name,
      description: descriptor.description,
      parameters: descriptor.inputSchema,
      async execute(_toolCallId, parameters) {
        try {
          const result = await bridge.handleToolCall({
            tool: descriptor.name,
            arguments: parameters,
          });
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
            details: { ok: true, result },
          };
        } catch (error) {
          const code = typeof error?.code === "string" &&
            /^[a-z0-9_]{1,128}$/.test(error.code)
            ? error.code
            : "unknown_error";
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: false, code }) }],
            details: { ok: false, code },
            isError: true,
          };
        }
      },
    });
  }
}
