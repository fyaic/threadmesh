import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { mcpConfig, deepseekPatch, launchPlan, installKimiConfig } from "../src/workspace/launch.mjs";

test("two real MCP processes discover/send/peek/decide using official SDK transport", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-mcp-test-"));
  new LocalWorkspace(directory, { create: true }).close();
  const clients = [];
  try {
    for (const [name, harness, goal] of [["backend", "codex", "Maintain the API"], ["client", "deepseek", "Consume the API"]]) {
      const client = new Client({ name: `test-${name}`, version: "1" });
      await client.connect(new StdioClientTransport(mcpConfig({ directory, name, harness, goal })));
      clients.push(client);
    }
    const [a, b] = clients;
    assert.equal((await a.listTools()).tools.length, 4);
    assert.equal((await a.callTool({ name: "threadmesh_send", arguments: { to: "client", content: "x", reason: "y" } })).isError, true);
    await a.callTool({ name: "threadmesh_peers", arguments: {} });
    const sent = JSON.parse((await a.callTool({ name: "threadmesh_send", arguments: {
      to: "client", content: "The orders API now uses a next_cursor token.", reason: "Client pagination needs this change.",
    } })).content[0].text);
    assert.equal(sent.queued, true);
    const first = await b.callTool({ name: "threadmesh_inbox", arguments: {} });
    assert.deepEqual(first, await b.callTool({ name: "threadmesh_inbox", arguments: {} }));
    const receipt = JSON.parse((await b.callTool({ name: "threadmesh_inbox", arguments: {
      messageId: sent.messageId, decision: "accepted",
    } })).content[0].text);
    assert.equal(receipt.decision_state, "accepted");
    assert.equal(receipt.outcome_state, "not-observed");
  } finally {
    await Promise.all(clients.map(client => client.close()));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("native launch configuration preserves literal paths and existing Kimi servers", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-config-test-"));
  try {
    const config = mcpConfig({ directory, name: "backend", harness: "deepseek", goal: "Use `literal` $values" });
    assert.equal(deepseekPatch(config)[0].insert[0].config.failOnStartupError, true);
    const plan = launchPlan({ agent: "deepseek", directory, name: "backend", goal: "API", profile: "headless", extra: ["do my task"] });
    assert.deepEqual(plan.args.slice(0, 2), ["--profile", "headless"]);
    const kimiDir = path.join(directory, ".kimi-code"); fs.mkdirSync(kimiDir);
    fs.writeFileSync(path.join(kimiDir, "mcp.json"), JSON.stringify({ mcpServers: { existing: { command: "existing" } } }));
    const filename = installKimiConfig(directory, config);
    assert.equal(JSON.parse(fs.readFileSync(filename)).mcpServers.existing.command, "existing");
    assert.equal(installKimiConfig(directory, config), filename);
    assert.throws(() => installKimiConfig(directory, { command: "other" }), /different ThreadMesh/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
