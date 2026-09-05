import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { launchPlan, installKimiConfig } from "../src/workspace/launch.mjs";

// Opt-in paid/model test. Uses the user's authenticated Codex and Pi installations.
// One ordinary kickoff per session; no sender/recipient/tool sequence in either task.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-workspace-"));
const directory = path.join(root, "room");
const workspace = new LocalWorkspace(directory, { create: true });
const children = [];
const events = [];
const started = Date.now();
const senderHarness = process.argv[2] || "codex";
const piModel = ["--provider", process.env.THREADMESH_LIVE_PI_PROVIDER || "zai", "--model", process.env.THREADMESH_LIVE_PI_MODEL || "glm-5.3"];
if (!["codex", "kimi", "pi"].includes(senderHarness)) throw new Error("Sender must be codex, kimi or pi");
const prompts = {
  client: "You maintain client.mjs. Inspect it and make sure it follows the current API contract in ../backend/contract.json (the shared source of truth). Keep the exported fetchAll(fetchPage) API returning a flat array. Leave the file ready for use. This task continues as the project evolves.",
  backend: "Revise contract.json to use cursor pagination: requests take cursor (null for first page); responses contain items and next_cursor (null at the end). Remove next_page. Keep the /orders endpoint and item schema unchanged. Finish the backend contract update.",
};
for (const name of ["client", "backend"]) fs.mkdirSync(path.join(root, name));
const contract = JSON.stringify({ endpoint: "/orders", request: { page: "integer starting at 1" }, response: { items: "array of { id: string }", next_page: "integer or null" } }, null, 2);
fs.writeFileSync(path.join(root, "backend", "contract.json"), contract);
fs.writeFileSync(path.join(root, "client", "client.mjs"), "export async function fetchAll(fetchPage) {\n  const items = []; let page = 1;\n  do { const data = await fetchPage({ page }); items.push(...data.items); page = data.next_page; } while (page != null);\n  return items;\n}\n");
workspace.join("client", "pi", "Maintain the /orders JavaScript client and its pagination behavior");
workspace.join("backend", senderHarness, "Maintain the /orders backend API contract");
workspace.join("legal", "kimi", "Translate the privacy policy into French");
function start(name, plan) {
  const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  let pending = "";
  child.stdout.on("data", chunk => {
    pending += chunk;
    let boundary;
    while ((boundary = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, boundary); pending = pending.slice(boundary + 1);
      try {
        const event = JSON.parse(line);
        events.push({ session: name, elapsedMs: Date.now() - started, event });
        if (["agent_start", "agent_end", "tool_execution_start", "error", "turn.completed", "turn.failed"].includes(event.type))
          console.log(JSON.stringify({ session: name, type: event.type, tool: event.toolName, elapsedMs: Date.now() - started }));
      } catch { /* Native banners are not protocol evidence. */ }
    }
  });
  const stderr = fs.createWriteStream(path.join(root, `${name}.stderr.log`), { mode: 0o600 });
  child.stderr.pipe(stderr);
  child.once("error", error => events.push({ session: name, event: { type: "spawn_error", message: error.message } }));
  return child;
}
async function until(predicate, label, timeout = 300000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
console.log(JSON.stringify({ artifacts: root, prompts, note: "Live model run, not a deterministic preview" }));
let report;
try {
  const b = start("client", launchPlan({ agent: "pi", directory, name: "client", goal: workspace.member("client").goal,
    cwd: path.join(root, "client"), wakeIdle: true,
    extra: [...piModel, "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, "sessions")] }));
  await until(() => workspace.db.prepare("SELECT name FROM workspace_connections WHERE name='client'").get(), "Pi extension connects before spending model quota", 10000);
  b.stdin.write(JSON.stringify({ id: "only-client-kickoff", type: "prompt", message: prompts.client }) + "\n");
  await until(() => events.some(row => row.session === "client" && row.event.type === "agent_end"), "initial client turn");
  const plan = launchPlan({ agent: senderHarness, directory, name: "backend", goal: workspace.member("backend").goal,
    cwd: path.join(root, "backend"), extra: senderHarness === "kimi"
      ? ["--output-format", "stream-json", "--prompt", prompts.backend]
      : senderHarness === "pi"
        ? [...piModel, "--print", "--mode", "json", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, "sender-sessions"), prompts.backend]
        : ["exec", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", prompts.backend] });
  if (plan.kimiConfig) installKimiConfig(plan.cwd, plan.kimiConfig);
  const a = start("backend", plan);
  a.stdin.end();
  await until(() => a.exitCode !== null, "backend model turn");
  assert.equal(a.exitCode, 0, "backend harness must complete");
  await until(() => workspace.db.prepare("SELECT count(*) AS n FROM workspace_sends WHERE source='backend' AND target='client'").get().n > 0, "model chooses useful peer message", 10000);
  await until(() => events.filter(row => row.session === "client" && row.event.type === "agent_end").length >= 2, "idle receiver resumes without a second user prompt");
  // Independent business assertion: two pages and the exact new request shape.
  const { fetchAll } = await import(pathToFileURL(path.join(root, "client", "client.mjs")).href);
  const calls = [];
  const result = await fetchAll(async args => {
    calls.push(args);
    if (calls.length > 2) throw new Error("Pagination did not terminate");
    assert.deepEqual(args, { cursor: calls.length === 1 ? null : "batch-two" });
    return calls.length === 1 ? { items: [{ id: "one" }], next_cursor: "batch-two" } : { items: [{ id: "two" }], next_cursor: null };
  });
  assert.deepEqual(result, [{ id: "one" }, { id: "two" }]);
  assert.equal(workspace.inbox("legal").length, 0);
  report = { pass: true, elapsedMs: Date.now() - started, source: senderHarness, receiver: "Pi", kickoffsPerSession: 1,
    nativeIdleWake: true, businessAssertion: "client follows both cursor pages and terminates", unrelatedMessages: 0,
    prompts, caveat: "One controlled live run, generic coordination guidance enabled. Not an initiative success rate or speed comparison." };
} catch (error) {
  report = { pass: false, elapsedMs: Date.now() - started, error: error.message, prompts };
  process.exitCode = 1;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  fs.writeFileSync(path.join(root, "events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  workspace.close();
  console.log(JSON.stringify({ ...report, artifacts: root }, null, 2));
}
