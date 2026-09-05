import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { launchPlan, installKimiConfig } from "../src/workspace/launch.mjs";
import { liveScenario } from "./workspace-live-scenarios.mjs";
import { deliveredSends, nativeSendOutcomes, receiverContinuation, receiverArtifactWrites } from "./workspace-live-evidence.mjs";

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
const observations = {};
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
async function receiverState(child, id) {
  child.stdin.write(JSON.stringify({ id, type: "get_state" }) + "\n");
  await until(() => events.some(row => row.event.type === "response" && row.event.id === id), "read receiver native state", 10000);
  const response = events.find(row => row.event.type === "response" && row.event.id === id).event;
  assert.equal(response.success, true, "receiver state query must succeed");
  assert.equal(typeof response.data?.sessionId, "string", "native session identity must be observable");
  return response.data;
}
console.log(JSON.stringify({ artifacts: root, prompts, note: "Live model run, not a deterministic preview" }));
let report, stage = "receiver-setup";
try {
  const b = start(receiver, launchPlan({ agent: "pi", directory, name: receiver, goal: workspace.member(receiver).goal,
    cwd: path.join(root, receiver), wakeIdle: true,
    extra: [...piModel, "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, "sessions")] }));
  await until(() => workspace.db.prepare("SELECT name FROM workspace_connections WHERE name=?").get(receiver), "Pi extension connects before spending model quota", 10000);
  stage = "receiver-initial-task";
  b.stdin.write(JSON.stringify({ id: "only-receiver-kickoff", type: "prompt", message: prompts[receiver] }) + "\n");
  await until(() => events.some(row => row.session === receiver && row.event.type === "agent_end"), "initial receiver turn");
  const initialReceiverState = await receiverState(b, "receiver-before-source");
  const initialReceiverEndMs = events.find(row => row.session === receiver && row.event.type === "agent_end").elapsedMs;
  observations.initialReceiverCompletedMs = initialReceiverEndMs;
  const initialArtifact = fs.readFileSync(path.join(root, scenario.artifact), "utf8");
  stage = "source-task";
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
  observations.sourceTurnCompleted = true;
  stage = "source-initiative";
  if (scenario.expectsContact === false) {
    // Bounded idle observation, not a claim that no future model would ever send.
    await new Promise(resolve => setTimeout(resolve, 10000));
    assert.equal(workspace.db.prepare("SELECT count(*) AS n FROM workspace_sends WHERE source=?").get(sender).n, 0, "unrelated source work must not contact any peer");
    assert.equal(nativeSendOutcomes(events).filter(row => row.session === sender).length, 0, "failed native send calls are still unwanted contact attempts");
    assert.equal(events.filter(row => row.session === receiver && row.event.type === "agent_start").length, 1, "unrelated change must not wake the idle receiver");
    assert.equal(fs.readFileSync(path.join(root, scenario.artifact), "utf8"), initialArtifact);
    const finalReceiverState = await receiverState(b, "receiver-after-no-contact");
    assert.equal(finalReceiverState.sessionId, initialReceiverState.sessionId);
    await scenario.verify(root);
    report = { pass: true, elapsedMs: Date.now() - started, source: senderHarness, receiver: "Pi",
      crossHarness: senderHarness !== "pi", kickoffsPerSession: 1, sameNativeReceiverSession: true,
      nativeIdleWake: false, noContactObservationMs: 10000, businessAssertion: scenario.businessAssertion,
      prompts, caveat: "One controlled live negative control, not an initiative success rate." };
  } else {
  let send;
  await until(() => {
    const queued = nativeSendOutcomes(events).filter(row => row.session === sender && row.queued);
    send = deliveredSends(workspace, sender, receiver).find(row => queued.some(outcome => outcome.messageId === row.message_id));
    return !!send;
  }, "model chooses and successfully queues useful peer message", 10000);
  const sentMs = send.sent_at - started;
  observations.successfulDeliveryMs = sentMs;
  assert.ok(sentMs > initialReceiverEndMs, "receiver must finish its own task before the source delivers advice");
  stage = "receiver-continuation";
  await until(() => receiverContinuation(events, receiver, sentMs), "same idle receiver resumes after delivery without a second user prompt");
  const finalReceiverState = await receiverState(b, "receiver-after-followup");
  assert.equal(finalReceiverState.sessionId, initialReceiverState.sessionId, "the already-started native receiver session must be retained");
  assert.equal(b.exitCode, null, "receiver process stays alive throughout the scenario");
  observations.sameNativeReceiverSession = true;
  observations.receiverContinuation = receiverContinuation(events, receiver, sentMs);
  stage = "business-artifact";
  assert.notEqual(fs.readFileSync(path.join(root, scenario.artifact), "utf8"), initialArtifact, "receiver must update the business artifact after its initial task");
  assert.ok(fs.statSync(path.join(root, scenario.artifact)).mtimeMs > send.sent_at, "business artifact must be written after the peer delivery");
  const artifactWrites = receiverArtifactWrites(events, receiver, path.join(root, receiver), path.join(root, scenario.artifact), sentMs);
  assert.ok(artifactWrites.length, "receiver's native successful write/edit of the business artifact must be observable after delivery; source edits or unproven shell writes are insufficient");
  observations.receiverArtifactWrites = artifactWrites;
  await scenario.verify(root);
  assert.equal(workspace.inbox(unrelated).length, 0);
  assert.equal(workspace.db.prepare("SELECT count(*) AS n FROM workspace_sends WHERE target=?").get(unrelated).n, 0, "unrelated peer must not receive even an attempted reserved send");
  report = { pass: true, elapsedMs: Date.now() - started, source: senderHarness, receiver: "Pi", kickoffsPerSession: 1,
    crossHarness: senderHarness !== "pi", sameNativeReceiverSession: true,
    receiverHistoryScope: "One earlier ordinary task in the same process, not an imported long-running user history",
    successfulDeliveryMs: sentMs, receiverContinuation: receiverContinuation(events, receiver, sentMs),
    receiverArtifactWrites: artifactWrites,
    nativeIdleWake: true, businessAssertion: scenario.businessAssertion, unrelatedMessages: 0,
    prompts, caveat: "One controlled live run, generic coordination guidance enabled. Not an initiative success rate or speed comparison." };
  }
} catch (error) {
  report = { pass: false, failedStage: stage, elapsedMs: Date.now() - started, source: senderHarness,
    receiver: "Pi", crossHarness: senderHarness !== "pi", error: error.message, prompts };
  process.exitCode = 1;
} finally {
  report = { ...observations, ...report, scenario: scenario.name, sourceWorkstream: sender, receiverWorkstream: receiver, artifact: scenario.artifact };
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  fs.writeFileSync(path.join(root, "events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  workspace.close();
  console.log(JSON.stringify({ ...report, artifacts: root }, null, 2));
}
