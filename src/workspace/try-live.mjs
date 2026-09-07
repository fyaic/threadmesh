import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { LocalWorkspace } from "./local-workspace.mjs";
import { executable, launchPlan } from "./launch.mjs";
import { liveScenario } from "./live-scenarios.mjs";
import { deliveredSends, nativeSendOutcomes, receiverContinuation, receiverArtifactWrites } from "./live-evidence.mjs";

export const tryHelp = `A real collaboration in one terminal:
  threadmesh try preferences --live
  threadmesh try api --live
  threadmesh try preferences --live --provider PROVIDER --model MODEL

Requires installed, authenticated Pi. Uses your configured Pi model by default.
This consumes model quota: two new disposable sessions and a possible follow-up.
The models choose whether to contact a peer; silence or incorrect work is a failure.
No existing GUI chats are attached. Only generated sample files are placed in the
private result directory. Pi tools run with your account's normal OS permissions,
not a security sandbox. Ctrl-C stops the run; results/logs remain locally for inspection.
No model was called. Use --live to start, or threadmesh preview for simulation.`;

// Read only actual provider failure fields, never classify arbitrary tool output
// or peer prose as a provider error. Private raw logs stay in the result folder.
export function modelFailure(event) {
  if (!event || typeof event !== "object") return null;
  const message = ["message_end", "turn_end"].includes(event.type) ? event.message : null;
  if (message?.role === "assistant" && ["error", "aborted"].includes(message.stopReason))
    return failureHint(message.errorMessage || message.stopReason);
  if (event.type === "error" || (event.type === "response" && event.success === false))
    return failureHint(event.error?.message || event.error || event.message || "runtime error");
  if (event.type === "agent_end") {
    if (event.willRetry) return "Pi attempted an automatic retry despite the sample's no-retry setting. Stopping this run; inspect the private logs.";
    const last = event.messages?.findLast(message => message.role === "assistant");
    if (last && ["error", "aborted"].includes(last.stopReason)) return failureHint(last.errorMessage || last.stopReason);
  }
  return null;
}

function signalChild(child, signal) {
  try {
    if (child.threadmeshProcessGroup && child.pid) process.kill(-child.pid, signal);
    else if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  } catch (error) { if (error.code !== "ESRCH") throw error; }
}

export function failureHint(reason) {
  const text = String(reason);
  if (/quota|usage.limit|rate.limit|429|credits|insufficient.balance/i.test(text))
    return "Provider quota or rate limit blocked this run. Check your provider account or choose an already configured model with --provider and --model. No automatic retry was made.";
  if (/api.?key|unauth|credential|authentication|401|403|no.*model|model.*not.*found/i.test(text))
    return "Pi could not authenticate or select a model. Open Pi and configure/login to your provider, then retry with that model. Installing Pi alone does not provide model access.";
  return "Pi reported a model/runtime failure. Inspect the private logs in the result directory; no live success or quota availability is claimed.";
}

export async function stopChildren(children) {
  const alive = child => child.exitCode === null && child.signalCode === null;
  for (const child of children) signalChild(child, "SIGTERM");
  await Promise.all(children.map(child => new Promise(resolve => {
    if (!alive(child) || !child.pid) return resolve();
    const timer = setTimeout(() => signalChild(child, "SIGKILL"), 1000);
    const deadline = setTimeout(() => { clearTimeout(timer); resolve(); }, 2500);
    child.once("close", () => { clearTimeout(timer); clearTimeout(deadline); resolve(); });
  })));
  // A harness may have exited before one of its tool subprocesses. The isolated
  // process group belongs only to this sample, never the user's existing Pi.
  for (const child of children) if (child.threadmeshProcessGroup) signalChild(child, "SIGKILL");
  return children.every(child => !alive(child) || !child.pid);
}

export async function tryLive({ scenarioName = "preferences", provider, model,
  write = line => process.stdout.write(`${line}\n`), timeoutMs = 300000 } = {}) {
  if (!["api", "preferences"].includes(scenarioName)) throw new Error("Try scenario must be preferences or api.");
  if (!executable("pi")) throw new Error("Pi is not installed. Install and authenticate Pi first; run threadmesh doctor to inspect installed harnesses. No model was called. Use threadmesh preview for a no-model walkthrough.");
  const scenario = liveScenario(scenarioName);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-try-"));
  fs.chmodSync(root, 0o700);
  const directory = path.join(root, "room");
  const workspace = new LocalWorkspace(directory, { create: true });
  const { receiver, sender, unrelated, prompts } = scenario;
  const children = [], events = [], logs = [];
  const started = Date.now();
  let stage = "setup", fatal, report, heartbeat, size = 0, cancelled = false;
  let beforeArtifact, afterArtifact;
  const elapsed = () => Date.now() - started;
  const onSignal = () => { cancelled = true; for (const child of children) signalChild(child, "SIGTERM"); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  function progress(next, label) { stage = next; write(`[${Math.round(elapsed() / 1000)}s] ${label}`); }
  const modelArgs = [...(provider ? ["--provider", provider] : []), ...(model ? ["--model", model] : [])];
  const check = () => {
    if (cancelled) throw new Error("Cancelled by user. No further model prompts will be sent.");
    if (fatal) throw new Error(fatal);
    if (children.some(child => !child.threadmeshVerifier && (child.exitCode !== null || child.signalCode !== null)))
      throw new Error("A Pi session exited before the collaboration completed. Inspect its private stderr log; configure Pi interactively if model access is missing.");
  };
  async function until(predicate, label, limit = timeoutMs) {
    const deadline = Date.now() + limit;
    while (true) {
      check();
      if (predicate()) return;
      if (Date.now() >= deadline || elapsed() >= timeoutMs)
        throw new Error(`Timed out: ${label}. The model may have stayed silent or failed to finish; this is not a successful collaboration. No automatic retry was made.`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  function start(name) {
    const plan = launchPlan({ agent: "pi", directory, name, goal: workspace.member(name).goal,
      cwd: path.join(root, name), wakeIdle: name === receiver,
      extra: [...modelArgs, "--mode", "rpc", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--session-dir", path.join(root, `${name}-sessions`)] });
    const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
    child.threadmeshProcessGroup = process.platform !== "win32";
    children.push(child);
    const log = fs.createWriteStream(path.join(root, `${name}.stderr.log`), { mode: 0o600 });
    logs.push(log);
    log.on("error", () => { fatal = "Could not save private runtime logs."; });
    child.stderr.on("data", chunk => {
      size += chunk.length;
      if (size <= 10_000_000) log.write(chunk);
      else fatal = "Runtime output exceeded the 10 MB limit; stopping the sample.";
    });
    let pending = "";
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > 10_000_000) { fatal = "Runtime output exceeded the 10 MB limit; stopping the sample."; return; }
      pending += chunk;
      let boundary;
      while ((boundary = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, boundary); pending = pending.slice(boundary + 1);
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (!event || typeof event !== "object" || Array.isArray(event)) continue;
        events.push({ session: name, elapsedMs: elapsed(), event });
        fatal ||= modelFailure(event);
      }
    });
    child.once("error", () => { fatal = "Could not start Pi. Check threadmesh doctor and your Pi installation."; });
    child.stdin.on("error", () => { fatal = "Pi closed its input before completion. Inspect its private runtime log."; });
    return child;
  }
  function send(child, command) { check(); child.stdin.write(`${JSON.stringify(command)}\n`); }
  async function state(child, id) {
    send(child, { id, type: "get_state" });
    await until(() => events.some(row => row.event.type === "response" && row.event.id === id), "read native Pi state", 10000);
    const data = events.find(row => row.event.type === "response" && row.event.id === id).event.data;
    assert.equal(typeof data?.sessionId, "string", "Pi must expose the native receiver identity");
    if (!data.model) throw new Error("Pi has no configured model. Open Pi and select an authenticated provider/model before retrying.");
    return data;
  }
  try {
    write(`REAL model run — ${scenarioName}. Uses your Pi account and quota; not a simulation or desktop attachment.`);
    write(`Private results: ${root}\nPi runs with normal OS permissions, not a sandbox. Ctrl-C stops both sample sessions.`);
    for (const name of [receiver, sender]) {
      fs.mkdirSync(path.join(root, name));
      fs.mkdirSync(path.join(root, name, ".pi"));
      // Project-only override. The RPC set_auto_retry setter writes global user
      // settings, so it must not be used for a disposable first-use sample.
      fs.writeFileSync(path.join(root, name, ".pi/settings.json"), JSON.stringify({ retry: { enabled: false } }), { mode: 0o600 });
    }
    scenario.setup(root);
    workspace.join(receiver, "pi", scenario.receiverGoal);
    workspace.join(sender, "pi", scenario.senderGoal);
    workspace.join(unrelated, "pi", scenario.unrelatedGoal);
    heartbeat = setInterval(() => write(`[${Math.round(elapsed() / 1000)}s] Still working: ${stage}. Ctrl-C to stop.`), 10000);
    progress("receiver-start", `B (${receiver}): opening a sample session with its own initial task.`);
    const b = start(receiver);
    await until(() => workspace.db.prepare("SELECT name FROM workspace_connections WHERE name=?").get(receiver), "Pi extension startup", 15000);
    const initialState = await state(b, "receiver-initial-state");
    write(`Pi model: ${initialState.model.provider}/${initialState.model.id}. Quota is not verified until the model responds.`);
    progress("receiver-task", `B (${receiver}): establishing its earlier decisions.`);
    send(b, { id: "only-receiver-kickoff", type: "prompt", message: prompts[receiver] });
    await until(() => events.some(row => row.session === receiver && row.event.type === "agent_end"), "B initial model task");
    const initialEnd = events.find(row => row.session === receiver && row.event.type === "agent_end").elapsedMs;
    const before = fs.readFileSync(path.join(root, scenario.artifact), "utf8");
    beforeArtifact = before;
    fs.writeFileSync(path.join(root, "before.txt"), before, { mode: 0o600 });
    progress("source-task", `A (${sender}): working on the upstream change. The model decides whether to contact a peer.`);
    const a = start(sender);
    await until(() => workspace.db.prepare("SELECT name FROM workspace_connections WHERE name=?").get(sender), "source extension startup", 15000);
    const sourceState = await state(a, "source-initial-state");
    send(a, { id: "only-source-kickoff", type: "prompt", message: prompts[sender] });
    await until(() => events.some(row => row.session === sender && row.event.type === "agent_end"), "A model task");
    let delivery;
    progress("peer-delivery", "Checking actual A → B delivery, not just a send attempt.");
    await until(() => {
      const queued = nativeSendOutcomes(events).filter(row => row.session === sender && row.queued);
      delivery = deliveredSends(workspace, sender, receiver).find(row => queued.some(result => result.messageId === row.message_id));
      return delivery;
    }, "A chose and delivered a relevant peer message", 10000);
    const sentMs = delivery.sent_at - started;
    assert.ok(sentMs > initialEnd, "B must have finished its earlier task before A sends");
    progress("receiver-follow-up", `A (${sender}) → B (${receiver}): message delivered. Waiting for B's own follow-up, with no second user prompt.`);
    await until(() => receiverContinuation(events, receiver, sentMs), "B same-session follow-up");
    const finalState = await state(b, "receiver-final-state");
    assert.equal(finalState.sessionId, initialState.sessionId, "B must remain the same native session");
    const after = fs.readFileSync(path.join(root, scenario.artifact), "utf8");
    afterArtifact = after;
    fs.writeFileSync(path.join(root, "after.txt"), after, { mode: 0o600 });
    assert.notEqual(after, before, "B must make a useful artifact change after receiving advice");
    const writes = receiverArtifactWrites(events, receiver, path.join(root, receiver), path.join(root, scenario.artifact), sentMs);
    assert.ok(writes.length, "B's own successful native write/edit must be observable");
    assert.equal(workspace.db.prepare("SELECT count(*) AS n FROM workspace_sends WHERE target=?").get(unrelated).n, 0, "unrelated work must not receive a send");
    progress("verification", "B continued in the same session. Checking the actual result and prior constraints.");
    // Agent-written JavaScript is verified in a bounded child, not imported into
    // this process where an accidental infinite loop could defeat cancellation.
    const code = `import { liveScenario } from ${JSON.stringify(new URL("./live-scenarios.mjs", import.meta.url).href)}; await liveScenario(${JSON.stringify(scenarioName)}).verify(${JSON.stringify(root)});`;
    await new Promise((resolve, reject) => {
      const verifier = spawn(process.execPath, ["--input-type=module", "--eval", code], { stdio: "ignore", detached: process.platform !== "win32" });
      verifier.threadmeshProcessGroup = process.platform !== "win32";
      verifier.threadmeshVerifier = true;
      children.push(verifier);
      const timer = setTimeout(() => { signalChild(verifier, "SIGKILL"); reject(new Error("Business check timed out; delivery is not verified completion.")); }, Math.max(1, Math.min(10000, timeoutMs - elapsed())));
      verifier.once("error", error => { clearTimeout(timer); reject(error); });
      verifier.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("The business result did not pass. Messages or edits alone are not success; inspect before.txt and after.txt.")); });
    });
    check();
    report = { pass: true, mode: "live", scenario: scenarioName, model: { provider: initialState.model.provider, id: initialState.model.id },
      sourceModel: { provider: sourceState.model.provider, id: sourceState.model.id },
      sameNativeReceiverSession: true, kickoffsPerSession: 1, receiverArtifactWrites: writes,
      receiverContinuation: receiverContinuation(events, receiver, sentMs), businessAssertion: scenario.businessAssertion,
      source: sender, receiver, unrelatedMessages: 0,
      caveat: "One new disposable Pi pair with an earlier receiver task; not existing GUI attachment, independent adoption, a reliability score or quota recovery." };
  } catch (error) {
    report = { pass: false, mode: "live", scenario: scenarioName, failedStage: stage, cancelled, error: error.message };
  } finally {
    clearInterval(heartbeat);
    const stopped = await stopChildren(children);
    await Promise.all(logs.map(log => new Promise(resolve => { if (log.destroyed) resolve(); else log.end(resolve); })));
    report = { ...report, elapsedMs: elapsed(), sampleProcessesStopped: stopped, artifacts: root };
    if (!stopped) { report.pass = false; report.error = "A sample process did not stop. Check the retained logs and process state."; }
    workspace.close();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    fs.writeFileSync(path.join(root, "events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
    fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  }
  write(report.pass ? `PASS: A chose B; the same B session continued and its own change passed the business check.\n${scenario.businessAssertion}` : `NOT PASSED (${report.failedStage}): ${report.error}`);
  if (report.pass && scenarioName === "preferences") {
    const before = JSON.parse(beforeArtifact), after = JSON.parse(afterArtifact);
    write("What B changed (before → after):");
    for (const key of ["headline", "description", "signupButton"])
      write(`  ${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
    write("  Protected paid-plan price: $12/month, unchanged. No message sent to the unrelated workstream.");
  }
  write(`Results: ${root}\nInspect report.json, before.txt and after.txt (when reached). Logs and sample files stay local; model requests use your configured provider as usual. Sample processes stopped: ${report.sampleProcessesStopped}.`);
  return report;
}
