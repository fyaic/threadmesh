import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import extension from "../src/integrations/pi-entry.js";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";

test("Pi entry exposes four tools, refreshes advisory context, and only wakes an idle opted-in session", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-pi-extension-"));
  const room = new LocalWorkspace(directory, { create: true });
  room.join("backend", "codex", "Maintain the API");
  const before = Object.fromEntries(["THREADMESH_WORKSPACE", "THREADMESH_NAME", "THREADMESH_GOAL", "THREADMESH_WAKE_IDLE"].map(key => [key, process.env[key]]));
  Object.assign(process.env, { THREADMESH_WORKSPACE: directory, THREADMESH_NAME: "client", THREADMESH_GOAL: "Maintain API client", THREADMESH_WAKE_IDLE: "1" });
  const handlers = {}, tools = [], notifications = [];
  let idle = false;
  const context = { isIdle: () => idle, hasPendingMessages: () => false, ui: { setStatus() {} } };
  extension({ on: (name, handler) => { handlers[name] = handler; }, registerTool: tool => tools.push(tool),
    getActiveTools: () => tools.map(tool => tool.name), sendMessage: (...args) => notifications.push(args) });
  t.after(() => {
    handlers.session_shutdown(); room.close();
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  t.mock.timers.enable({ apis: ["setInterval"] });
  await handlers.session_start({}, context);
  assert.equal(tools.length, 4);
  const sender = room.tools("backend");
  await sender.call("threadmesh_peers");
  const sent = await sender.call("threadmesh_send", { to: "client", content: "Use next_cursor", reason: "API changed" });
  t.mock.timers.tick(2001);
  assert.equal(notifications.length, 0, "active turn must not be steered");
  idle = true;
  t.mock.timers.tick(2001);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0][1], { triggerTurn: true, deliverAs: "followUp" });
  assert.equal(notifications[0][0].customType, "threadmesh");
  t.mock.timers.tick(10000);
  assert.equal(notifications.length, 1, "the same unread message must not trigger a wake loop");
  assert.equal(room.inbox("client").length, 1, "notification does not consume mail");
  const turn = await handlers.before_agent_start({ systemPrompt: "Existing host instructions" }, context);
  assert.match(turn.systemPrompt, /^Existing host instructions/);
  assert.match(turn.systemPrompt, /Published peer goals/);
  assert.match(turn.message.content, /Use next_cursor/);
  const accept = tools.find(tool => tool.name === "threadmesh_inbox");
  const result = await accept.execute("call-1", { messageId: sent.messageId, decision: "accepted" });
  assert.equal(JSON.parse(result.content[0].text).outcome_state, "not-observed");
  process.env.THREADMESH_WAKE_IDLE = "0";
  await sender.call("threadmesh_peers");
  await sender.call("threadmesh_send", { to: "client", content: "Another update", reason: "Relevant change" });
  t.mock.timers.tick(2001);
  assert.equal(notifications.length, 1, "no idle wake without explicit opt-in");
});
