import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { launchPlan, installKimiConfig } from "../src/workspace/launch.mjs";
import { liveScenario } from "./workspace-live-scenarios.mjs";

// Opt-in paid/model test. Uses the user's authenticated Codex and Pi installations.
// One ordinary kickoff per session; no sender/recipient/tool sequence in either task.
const scenario = liveScenario(process.argv[3]);
const senderHarness = process.argv[2] || "codex";
if (!["codex", "kimi", "pi"].includes(senderHarness)) throw new Error("Sender must be codex, kimi or pi");
const { sender, receiver, unrelated, prompts } = scenario;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-workspace-"));
const directory = path.join(root, "room");
const workspace = new LocalWorkspace(directory, { create: true });
const children = [];
const events = [];
const started = Date.now();
const piModel = ["--provider", process.env.THREADMESH_LIVE_PI_PROVIDER || "zai", "--model", process.env.THREADMESH_LIVE_PI_MODEL || "glm-5.3"];
for (const name of [receiver, sender]) fs.mkdirSync(path.join(root, name));
scenario.setup(root);
workspace.join(receiver, "pi", scenario.receiverGoal);
workspace.join(sender, senderHarness, scenario.senderGoal);
workspace.join(unrelated, "kimi", scenario.unrelatedGoal);
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
  const b = start(receiver, launchPlan({ agent: "pi", directory, name: receiver, goal: workspace.member(receiver).goal,
    cwd: path.join(root, receiver), wakeIdle: true,
    extra: [...piModel, "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, "sessions")] }));
  await until(() => workspace.db.prepare("SELECT name FROM workspace_connections WHERE name=?").get(receiver), "Pi extension connects before spending model quota", 10000);
  b.stdin.write(JSON.stringify({ id: "only-receiver-kickoff", type: "prompt", message: prompts[receiver] }) + "\n");
  await until(() => events.some(row => row.session === receiver && row.event.type === "agent_end"), "initial receiver turn");
  const plan = launchPlan({ agent: senderHarness, directory, name: sender, goal: workspace.member(sender).goal,
    cwd: path.join(root, sender), extra: senderHarness === "kimi"
      ? ["--output-format", "stream-json", "--prompt", prompts[sender]]
      : senderHarness === "pi"
        ? [...piModel, "--print", "--mode", "json", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, "sender-sessions"), prompts[sender]]
        : ["exec", "--ignore-user-config", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", prompts[sender]] });
  if (plan.kimiConfig) installKimiConfig(plan.cwd, plan.kimiConfig);
  const a = start(sender, plan);
  a.stdin.end();
  await until(() => a.exitCode !== null, "source model turn");
  assert.equal(a.exitCode, 0, "source harness must complete");
  await until(() => workspace.db.prepare("SELECT count(*) AS n FROM workspace_sends WHERE source=? AND target=?").get(sender, receiver).n > 0, "model chooses useful peer message", 10000);
  await until(() => events.filter(row => row.session === receiver && row.event.type === "agent_end").length >= 2, "idle receiver resumes without a second user prompt");
  await scenario.verify(root);
  assert.equal(workspace.inbox(unrelated).length, 0);
  report = { pass: true, elapsedMs: Date.now() - started, source: senderHarness, receiver: "Pi", kickoffsPerSession: 1,
    nativeIdleWake: true, businessAssertion: scenario.businessAssertion, unrelatedMessages: 0,
    prompts, caveat: "One controlled live run, generic coordination guidance enabled. Not an initiative success rate or speed comparison." };
} catch (error) {
  report = { pass: false, elapsedMs: Date.now() - started, error: error.message, prompts };
  process.exitCode = 1;
} finally {
  report = { ...report, scenario: scenario.name, sourceWorkstream: sender, receiverWorkstream: receiver, artifact: scenario.artifact };
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  fs.writeFileSync(path.join(root, "events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  workspace.close();
  console.log(JSON.stringify({ ...report, artifacts: root }, null, 2));
}
