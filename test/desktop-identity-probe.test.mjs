import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sessionFingerprint } from "../experiments/desktop/threadmesh-desktop-probe/scripts/probe.mjs";
import { inspectIdentity } from "../experiments/desktop/threadmesh-desktop-probe/scripts/identity.mjs";
import { respond } from "../experiments/desktop/threadmesh-desktop-probe/scripts/mcp.mjs";

test("vendor metadata correlates with hook fingerprint without granting authority", () => {
  const result = inspectIdentity({ session_id: "native-a", "com.zcode/request-context": { session_id: "native-a" } });
  assert.equal(result.sessionFingerprint, sessionFingerprint("native-a"));
  assert.equal(result.fields, "both_agree");
  assert.equal(result.authenticated, false);
  assert.ok(!JSON.stringify(result).includes("native-a"));
});

test("missing/conflicting metadata stays unknown; arguments never supply identity", () => {
  for (const meta of [undefined, {}, [], { session_id: "" }, { session_id: 1 },
    { session_id: "a", "com.zcode/request-context": { session_id: "b" } }]) {
    assert.equal(inspectIdentity(meta).status, "unknown");
    assert.equal(inspectIdentity(meta).sessionFingerprint, undefined);
  }
  const reply = respond({ jsonrpc: "2.0", id: 1, method: "tools/call", params: {
    name: "threadmesh_probe_identity", arguments: { _meta: { session_id: "forged" } },
  } });
  assert.equal(reply.error.code, -32602);
});

test("projection omits arbitrary private fields", () => {
  const result = inspectIdentity({ session_id: "native-a", token: "private-token",
    prompt: "private-prompt", "com.zcode/request-context": { session_id: "native-a", trace_id: "private-trace" } });
  assert.ok(!JSON.stringify(result).includes("private-"));
});

test("Codex distinguishes current hook SessionId from persisted ThreadId", () => {
  const meta = { threadId: "thread-a", "x-codex-turn-metadata": { thread_id: "thread-a", session_id: "session-a" } };
  const result = inspectIdentity(meta);
  assert.equal(result.source, "codex-vendor-metadata");
  assert.equal(result.sessionFingerprint, sessionFingerprint("session-a"));
  assert.equal(result.threadFingerprint, sessionFingerprint("thread-a"));
  assert.notEqual(result.sessionFingerprint, result.threadFingerprint);
  assert.equal(result.authenticated, false);
  const resumed = inspectIdentity({ threadId: "thread-a", "x-codex-turn-metadata": {
    thread_id: "thread-a", session_id: "session-resumed",
  } });
  assert.equal(resumed.threadFingerprint, result.threadFingerprint);
  assert.notEqual(resumed.sessionFingerprint, result.sessionFingerprint);
  for (const bad of [{ threadId: "thread-a" }, { ...meta, threadId: "other-thread" },
    { ...meta, session_id: "zcode-mixed" }, { ...meta, "x-codex-turn-metadata": "not-an-object" }]) {
    assert.equal(inspectIdentity(bad).status, "unknown");
  }
});

test("official SDK can invoke the self-contained packaged diagnostic with interleaved sessions", async t => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-plugin-copy-"));
  fs.cpSync(fileURLToPath(new URL("../experiments/desktop/threadmesh-desktop-probe", import.meta.url)), copy, { recursive: true });
  const config = JSON.parse(fs.readFileSync(path.join(copy, ".mcp.json"), "utf8"))
    .mcpServers["threadmesh-desktop-probe"];
  const transport = new StdioClientTransport({ command: process.execPath,
    args: config.args, cwd: path.resolve(copy, config.cwd),
    stderr: "pipe" });
  const client = new Client({ name: "threadmesh-fixture", version: "1" });
  t.after(async () => { await client.close(); fs.rmSync(copy, { recursive: true, force: true }); });
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name), ["threadmesh_probe_identity"]);
  for (const id of ["a", "b", "a"]) {
    const response = await client.callTool({ name: "threadmesh_probe_identity", arguments: {}, _meta: {
      session_id: id, "com.zcode/request-context": { session_id: id },
    } });
    const projected = JSON.parse(response.content[0].text);
    assert.equal(projected.sessionFingerprint, sessionFingerprint(id));
    assert.equal(projected.authenticated, false);
  }
  const missing = await client.callTool({ name: "threadmesh_probe_identity", arguments: {} });
  assert.equal(JSON.parse(missing.content[0].text).status, "unknown");
});
