import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LocalWorkspace, renderCheckpoint } from "../src/workspace/local-workspace.mjs";

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-workspace-test-"));
  const workspace = new LocalWorkspace(directory, { create: true, ...options });
  t.after(() => { workspace.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  workspace.join("backend", "codex", "Maintain the paginated orders API");
  workspace.join("client", "deepseek", "Build a client of the orders API");
  workspace.join("unrelated", "kimi", "Translate the privacy policy");
  return { workspace, directory };
}

test("real workspace uses coordinator delivery; inbox peeks persist and receiver decisions are separate", async t => {
  const { workspace } = fixture(t);
  const a = workspace.tools("backend"), b = workspace.tools("client");
  await assert.rejects(a.call("threadmesh_send", { to: "client", content: "x", reason: "y" }), /discover/);
  assert.equal((await a.call("threadmesh_peers")).peers.length, 2);
  const sent = await a.call("threadmesh_send", { to: "client", content: "Use next_cursor instead of page.", reason: "Your client consumes this API." });
  assert.equal(sent.queued, true);
  assert.deepEqual(await b.call("threadmesh_inbox"), await b.call("threadmesh_inbox"));
  assert.equal(workspace.inbox("unrelated").length, 0);
  await b.call("threadmesh_inbox", { messageId: sent.messageId, decision: "deferred" });
  assert.equal(workspace.inbox("client").length, 1);
  const receipt = await b.call("threadmesh_inbox", { messageId: sent.messageId, decision: "accepted" });
  assert.equal(receipt.decision_state, "accepted");
  assert.equal(receipt.outcome_state, "not-observed");
  assert.equal(workspace.inbox("client").length, 0);
  await assert.rejects(workspace.tools("unrelated").call("threadmesh_inbox", { receiptMessageId: sent.messageId }), /not_visible/);
});

test("workspace identity, inbox and portable checkpoint survive reopen", async t => {
  const { workspace, directory } = fixture(t);
  const a = workspace.tools("backend");
  await a.call("threadmesh_peers");
  await a.call("threadmesh_send", { to: "client", content: "Cursor API ready", reason: "Client dependency" });
  workspace.checkpoint("backend", { goal: "Maintain orders", constraints: "Keep public URLs stable", next: "Update contract tests", files: "src/orders.ts" });
  const reopened = new LocalWorkspace(directory);
  try {
    assert.deepEqual(reopened.member("backend").ref, workspace.member("backend").ref);
    assert.equal(reopened.inbox("client").length, 1);
    assert.match(renderCheckpoint(reopened.checkpoint("backend")), /Keep public URLs stable/);
    assert.throws(() => reopened.join("backend", "kimi", "other"), /owned_by_other/);
  } finally { reopened.close(); }
});

test("muting, unknown peers, cross-process send budget and expiry are enforced", async t => {
  let now = Date.now();
  const { workspace } = fixture(t, { clock: () => now });
  const a = workspace.tools("backend");
  await a.call("threadmesh_peers");
  workspace.mute("client", true);
  await assert.rejects(a.call("threadmesh_send", { to: "client", content: "x", reason: "y" }), /muted/);
  workspace.mute("client", false);
  for (let n = 0; n < 10; n++) {
    const tools = workspace.tools("backend");
    await tools.call("threadmesh_peers");
    await tools.call("threadmesh_send", { to: "client", content: String(n), reason: "dependency" });
  }
  const fresh = workspace.tools("backend");
  await fresh.call("threadmesh_peers");
  await assert.rejects(fresh.call("threadmesh_send", { to: "client", content: "x", reason: "y" }), /budget_exceeded/);
  now += 31 * 60 * 1000;
  assert.equal(workspace.inbox("client").length, 0);
});

test("workspace refuses missing consent, unsafe paths and duplicate live session connections", t => {
  const { workspace, directory } = fixture(t);
  assert.throws(() => new LocalWorkspace(path.join(directory, "missing")), /run_init/);
  const disconnect = workspace.connect("backend");
  assert.throws(() => workspace.connect("backend"), /already_connected/);
  disconnect();
  workspace.connect("backend")();
  assert.throws(() => workspace.checkpoint("backend", { goal: "x", next: "y", secret: "z" }), /fields_invalid/);
});
