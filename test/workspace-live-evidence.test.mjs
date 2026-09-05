import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { deliveredSends, nativeSendOutcomes, receiverContinuation, receiverArtifactWrites } from "../scripts/workspace-live-evidence.mjs";

test("live evidence distinguishes native queued results from attempts and tool errors", () => {
  const result = { content: [{ type: "text", text: JSON.stringify({ queued: true, messageId: "private-id" }) }] };
  const rows = [
    { session: "backend", elapsedMs: 1, event: { type: "tool_execution_start", toolName: "threadmesh_send" } },
    { session: "backend", elapsedMs: 2, event: { type: "tool_execution_end", toolName: "threadmesh_send", isError: true, result } },
    { session: "backend", elapsedMs: 3, event: { type: "item.completed", item: { type: "mcp_tool_call", server: "threadmesh", tool: "threadmesh_send", status: "completed", result } } },
    { session: "backend", elapsedMs: 4, event: { type: "tool_execution_end", toolName: "threadmesh_send", result } },
  ];
  const outcomes = nativeSendOutcomes(rows);
  assert.equal(outcomes.length, 3);
  assert.deepEqual(outcomes.map(row => row.queued), [false, true, true]);
  assert.equal(outcomes[1].messageId, "private-id");
});

test("budget reservation without an actual envelope is not delivery evidence", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-delivery-evidence-"));
  const workspace = new LocalWorkspace(directory, { create: true });
  try {
    workspace.join("backend", "codex", "API");
    workspace.join("client", "pi", "Client");
    workspace.db.prepare("INSERT INTO workspace_sends VALUES (?,?,?,?,?)").run("reserved-only", "backend", "client", Date.now(), null);
    assert.deepEqual(deliveredSends(workspace, "backend", "client"), []);
    const tools = workspace.tools("backend");
    await tools.call("threadmesh_peers", {});
    const result = await tools.call("threadmesh_send", { to: "client", content: "New cursor contract", reason: "Client pagination depends on this API" });
    assert.equal(result.queued, true);
    assert.deepEqual(deliveredSends(workspace, "backend", "client").map(row => row.message_id), [result.messageId]);
  } finally { workspace.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test("a receiver end without a post-delivery start is not continuation evidence", () => {
  const row = (elapsedMs, type) => ({ session: "client", elapsedMs, event: { type } });
  const rows = [row(10, "agent_start"), row(50, "agent_end"), row(80, "agent_end")];
  assert.equal(receiverContinuation(rows, "client", 60), null);
  rows.push(row(90, "agent_start"));
  assert.equal(receiverContinuation(rows, "client", 60), null);
  rows.push(row(120, "agent_end"));
  assert.deepEqual(receiverContinuation(rows, "client", 60), { startedMs: 90, completedMs: 120 });
});

test("receiver artifact provenance rejects source writes, failed edits and unrelated paths", () => {
  const cwd = path.resolve("fixture/client");
  const target = path.join(cwd, "client.mjs");
  const pair = (session, toolCallId, file, failed = false) => [
    { session, elapsedMs: 100, event: { type: "tool_execution_start", toolName: "edit", toolCallId, args: { path: file } } },
    { session, elapsedMs: 110, event: { type: "tool_execution_end", toolName: "edit", toolCallId, isError: failed } },
  ];
  const rows = [...pair("backend", "source", target), ...pair("client", "wrong", "other.mjs"), ...pair("client", "failed", target, true)];
  assert.deepEqual(receiverArtifactWrites(rows, "client", cwd, target, 90), []);
  rows.push(...pair("client", "success", "client.mjs"));
  assert.deepEqual(receiverArtifactWrites(rows, "client", cwd, target, 90), [{ tool: "edit", startedMs: 100, completedMs: 110 }]);
  assert.deepEqual(receiverArtifactWrites(rows, "client", cwd, target, 110), []);
});

test("public projection includes Codex delivery outcomes without native identities", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-public-projection-"));
  try {
    fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify({ pass: true, artifact: "client.mjs" }));
    fs.writeFileSync(path.join(directory, "client.mjs"), "export const complete = true;\n");
    fs.writeFileSync(path.join(directory, "events.json"), JSON.stringify([
      { session: "client", elapsedMs: 1, event: { type: "response", data: { sessionId: "native-private-session" } } },
      { session: "backend", elapsedMs: 2, event: { type: "item.completed", item: { type: "mcp_tool_call", server: "threadmesh", tool: "threadmesh_send", status: "completed",
        result: { content: [{ type: "text", text: JSON.stringify({ queued: true, messageId: "private-message-id" }) }] } } } },
    ]));
    const result = spawnSync(process.execPath, ["scripts/project-first-use-evidence.mjs", directory], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const projected = JSON.parse(result.stdout);
    assert.equal(projected.sendOutcomes[0].queued, true);
    assert.doesNotMatch(result.stdout, /native-private-session|private-message-id/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
