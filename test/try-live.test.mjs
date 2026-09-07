import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { failureHint, modelFailure, tryLive } from "../src/workspace/try-live.mjs";

const fixture = fileURLToPath(new URL("./fixtures/fake-pi-try.mjs", import.meta.url));
const cli = fileURLToPath(new URL("../bin/threadmesh.mjs", import.meta.url));
const env = mode => ({ ...process.env, THREADMESH_PI_COMMAND: fixture, THREADMESH_TRY_TEST_MODE: mode });
const secret = "SECRET-TEST-CREDENTIAL";

function cleanup(t, root) {
  assert.match(path.basename(root), /^threadmesh-try-/);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
}
function assertStopped(root) {
  for (const file of fs.readdirSync(root).filter(file => file.endsWith(".pid"))) {
    const pid = Number(fs.readFileSync(path.join(root, file), "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  }
}
async function runFixture(t, mode, options = {}) {
  const keys = ["THREADMESH_PI_COMMAND", "THREADMESH_TRY_TEST_MODE"];
  const previous = keys.map(key => process.env[key]);
  Object.assign(process.env, { THREADMESH_PI_COMMAND: fixture, THREADMESH_TRY_TEST_MODE: mode });
  const output = [];
  let report;
  try { report = await tryLive({ write: line => output.push(line), timeoutMs: 4000, ...options }); }
  finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
  cleanup(t, report.artifacts);
  assert.equal(report.sampleProcessesStopped, true);
  assertStopped(report.artifacts);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report.artifacts, "report.json"), "utf8")), report);
  if (process.platform !== "win32") assert.equal(fs.statSync(report.artifacts).mode & 0o777, 0o700);
  return { report, output: output.join("\n") };
}

test("failure hints classify actual provider fields and do not expose provider prose", () => {
  for (const reason of [`429 quota exhausted ${secret}`, `401 invalid API key ${secret}`, `Unexpected failure ${secret}`]) {
    assert.doesNotMatch(failureHint(reason), new RegExp(secret));
    assert.doesNotMatch(modelFailure({ type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: reason } }), new RegExp(secret));
  }
  assert.match(failureHint("quota exhausted"), /No automatic retry/);
  assert.match(modelFailure({ type: "response", success: false, error: { message: "401" } }), /authenticate/);
  assert.match(modelFailure({ type: "turn_end", message: { role: "assistant", stopReason: "aborted" } }), /failure/);
  assert.match(modelFailure({ type: "agent_end", willRetry: true }), /automatic retry/);
  assert.match(modelFailure({ type: "agent_end", messages: [{ role: "assistant", stopReason: "error", errorMessage: "quota" }] }), /quota/);
  for (const event of [null, "quota", { type: "tool_execution_end", result: { error: "quota" } },
    { type: "message_end", message: { role: "user", stopReason: "error", errorMessage: "quota" } },
    { type: "message_end", message: { role: "assistant", stopReason: "stop", content: "quota" } }]) assert.equal(modelFailure(event), null);
});

test("public try without --live never starts a harness", () => {
  const result = spawnSync(process.execPath, [cli, "try", "preferences"], { env: { ...process.env, THREADMESH_PI_COMMAND: "/missing-must-not-be-called" }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No model was called/);
  assert.match(result.stdout, /--live/);
  assert.doesNotMatch(result.stdout, /Private results:/);
});

test("public try rejects unsupported scenarios and missing harness before creating a sample", () => {
  const invalid = spawnSync(process.execPath, [cli, "try", "unknown", "--live"], { env: env("quota"), encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /preferences or api/);
  const missingEnv = { ...process.env, PATH: "" };
  delete missingEnv.THREADMESH_PI_COMMAND;
  const missing = spawnSync(process.execPath, [cli, "try", "--live"], { env: missingEnv, encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Pi is not installed/);
  assert.doesNotMatch(missing.stdout, /Private results:/);
});

test("deterministic quota failure followed by agent_end fails promptly without retry or source launch", async t => {
  const { report, output } = await runFixture(t, "quota");
  assert.equal(report.pass, false);
  assert.equal(report.failedStage, "receiver-task");
  assert.ok(report.elapsedMs < 4000);
  assert.match(report.error, /quota or rate limit/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
  const commands = fs.readFileSync(path.join(report.artifacts, "website.commands.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(commands.filter(command => command.type === "prompt").length, 1);
  assert.ok(!fs.existsSync(path.join(report.artifacts, "brand.pid")));
});

test("deterministic runtime exit is a failure with sample cleanup", async t => {
  const { report } = await runFixture(t, "exit");
  assert.equal(report.pass, false);
  assert.match(report.error, /exited before/);
});

test("agent_end-only quota errors are not accepted as successful task completion", async t => {
  const { report, output } = await runFixture(t, "end-quota");
  assert.equal(report.pass, false);
  assert.match(report.error, /quota/);
  assert.doesNotMatch(output, new RegExp(secret));
  assert.ok(!fs.existsSync(path.join(report.artifacts, "brand.pid")));
});

test("a silent runtime reaches its total deadline and all sample processes stop", async t => {
  const { report } = await runFixture(t, "hang", { timeoutMs: 1000 });
  assert.equal(report.pass, false);
  assert.match(report.error, /Timed out/);
  assert.ok(report.elapsedMs < 4000);
  assert.ok(!fs.existsSync(path.join(report.artifacts, "brand.pid")));
});

test("a configured model is required before any prompt", async t => {
  for (const mode of ["no-model"]) {
    const { report } = await runFixture(t, mode);
    assert.equal(report.pass, false);
    assert.match(report.error, /no configured model/);
    const commands = fs.readFileSync(path.join(report.artifacts, "website.commands.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(commands.filter(command => command.type === "prompt").length, 0);
    assert.ok(!fs.existsSync(path.join(report.artifacts, "brand.pid")));
  }
});

test("deterministic two-process fixture exercises delivery, identity, writes and business gate; not live proof", async t => {
  const { report, output } = await runFixture(t, "success");
  assert.equal(report.pass, true, report.error);
  assert.equal(report.sameNativeReceiverSession, true);
  assert.equal(report.receiverArtifactWrites.length, 1);
  assert.equal(report.unrelatedMessages, 0);
  assert.match(output, /A chose B/);
  for (const name of ["website", "brand"]) {
    const commands = fs.readFileSync(path.join(report.artifacts, `${name}.commands.jsonl`), "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(commands.filter(command => command.type === "prompt").length, 1, "no second user prompt or retry");
    assert.ok(commands.every(command => ["get_state", "prompt"].includes(command.type)), "do not mutate global Pi retry settings");
  }
});

test("Ctrl-C stops the deterministic sample and retains a cancelled report", { skip: process.platform === "win32", timeout: 10000 }, async t => {
  const child = spawn(process.execPath, [cli, "try", "--live"], { env: env("hang"), stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let output = "", sent = false;
  child.stdout.on("data", chunk => {
    output += chunk;
    if (!sent && output.includes("establishing its earlier decisions")) { sent = true; child.kill("SIGINT"); }
  });
  const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(sent, true);
  assert.equal(exit, 130);
  const root = output.match(/Private results: (.+)\n/)?.[1];
  assert.ok(root, output);
  cleanup(t, root);
  const report = JSON.parse(fs.readFileSync(path.join(root, "report.json"), "utf8"));
  assert.equal(report.pass, false);
  assert.equal(report.cancelled, true);
  assert.equal(report.sampleProcessesStopped, true);
  assertStopped(root);
});
