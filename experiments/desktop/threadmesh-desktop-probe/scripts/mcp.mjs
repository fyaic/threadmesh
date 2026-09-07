import { pathToFileURL } from "node:url";
import { inspectIdentity } from "./identity.mjs";

// Minimal no-dependency MCP diagnostic endpoint, NOT a workspace server. Kept
// self-contained so copying the plugin does not depend on the repository's SDK.
// Exercised through the repository's official MCP SDK client in tests.
const versions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export function respond(request) {
  if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
  }
  if (request.id === undefined) return null;
  if (typeof request.id !== "string" && typeof request.id !== "number") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request id" } };
  }
  const reply = (result) => ({ jsonrpc: "2.0", id: request.id, result });
  const error = (code, message) => ({ jsonrpc: "2.0", id: request.id, error: { code, message } });
  if (request.method === "initialize") {
    return reply({ protocolVersion: versions.includes(request.params?.protocolVersion)
      ? request.params.protocolVersion : versions[0],
    capabilities: { tools: {} }, serverInfo: { name: "threadmesh-desktop-probe", version: "0.0.2" },
    instructions: "Developer identity diagnostic only. No peer access, messaging, joining, or wake. " +
      "An observed fingerprint is correlation, never authentication or permission." });
  }
  if (request.method === "ping") return reply({});
  if (request.method === "tools/list") return reply({ tools: [{
    name: "threadmesh_probe_identity",
    description: "Inspect host-supplied MCP identity metadata only when asked to test the desktop probe. " +
      "Unknown on unsupported hosts; never proves authorization or delivery.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }] });
  if (request.method !== "tools/call") return error(-32601, "Method not found");
  if (request.params?.name !== "threadmesh_probe_identity") return error(-32602, "Unknown tool");
  const args = request.params.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) {
    return error(-32602, "This diagnostic accepts no arguments");
  }
  return reply({ content: [{ type: "text", text: JSON.stringify(inspectIdentity(request.params._meta)) }] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let pending = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(10)) !== -1) {
      if (newline > 1024 * 1024) process.exit(1);
      const line = pending.subarray(0, newline).toString("utf8");
      pending = pending.subarray(newline + 1);
      if (!line.trim()) continue;
      let response;
      try { response = respond(JSON.parse(line)); }
      catch { response = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }; }
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
    if (pending.length > 1024 * 1024) process.exit(1);
  }
}
