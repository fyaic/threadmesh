import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { mcpConfig } from "../src/workspace/launch.mjs";

// Install the official preview into an isolated prefix; no model/API key required.
const runtime = process.argv[2];
if (!runtime) throw new Error("Usage: node scripts/validate-deepseek-workspace.mjs /absolute/prefix/node_modules");
const requireRuntime = createRequire(path.join(path.resolve(runtime), "_probe.cjs"));
const load = name => import(pathToFileURL(requireRuntime.resolve(name)).href);
const { Context } = await load("@deepseek-ai/cordis");
const { default: SystemPrompt } = await load("@deepseek-ai/dsh-system-prompt");
const { default: Tools } = await load("@deepseek-ai/dsh-tools");
const McpClient = await load("@deepseek-ai/dsh-mcp-client");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-dsh-native-"));
const workspace = new LocalWorkspace(directory, { create: true });
const ctx = new Context();
try {
  workspace.join("backend", "codex", "Maintain the orders API");
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(Tools);
  await ctx.plugin(McpClient, { serverName: "threadmesh", transport: "stdio", failOnStartupError: true,
    ...mcpConfig({ directory, name: "client", harness: "deepseek", goal: "Maintain the orders client" }) });
  const names = ctx.tools.schemas().map(tool => tool.name);
  assert.equal(names.filter(name => name.startsWith("mcp__threadmesh__")).length, 4);
  let seq = 0;
  const call = async (name, args = {}) => {
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: `native-${++seq}`,
      name: `mcp__threadmesh__${name}`, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  assert.equal((await call("threadmesh_peers")).peers[0].name, "backend");
  const backend = workspace.tools("backend");
  await backend.call("threadmesh_peers");
  const sent = await backend.call("threadmesh_send", { to: "client", content: "Use next_cursor, not page.", reason: "Your client consumes the changed API." });
  const first = await call("threadmesh_inbox");
  assert.deepEqual(await call("threadmesh_inbox"), first);
  assert.equal(first.messages[0].messageId, sent.messageId);
  assert.equal((await call("threadmesh_inbox", { messageId: sent.messageId, decision: "accepted" })).decision_state, "accepted");
  await call("threadmesh_checkpoint", { goal: "Maintain the orders client", constraints: "Use next_cursor", next: "Update pagination tests" });
  assert.equal(workspace.checkpoint("client").constraints, "Use next_cursor");
  await call("threadmesh_peers");
  await call("threadmesh_send", { to: "backend", content: "Client checkpoint saved", reason: "Acknowledging the API update", replyTo: sent.messageId });
  assert.equal(workspace.inbox("backend").length, 1);
  console.log(JSON.stringify({ officialRuntime: "@deepseek-ai/dsh", nativeMcpPlugin: "passed", toolCount: 4,
    bidirectionalDelivery: true, nonConsumingInbox: true, receiverDecision: "accepted", checkpoint: "saved",
    modelTested: false, limitation: "No DeepSeek provider credential used; this is native integration evidence, not autonomous model evidence." }, null, 2));
} finally {
  await ctx.fiber.dispose();
  workspace.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
