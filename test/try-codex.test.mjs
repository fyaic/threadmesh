import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { tryCodex, codexArtifactWrites, codexFailureHint, standaloneCodexEnv } from "../src/workspace/try-codex.mjs";

const fixture = fileURLToPath(new URL("./fixtures/fake-codex-try.mjs", import.meta.url));
const cli = fileURLToPath(new URL("../bin/threadmesh.mjs", import.meta.url));
test("standalone Codex isolates host task bindings without changing auth, network or policy environment", () => {
  const parent = { CODEX_THREAD_ID: "host-thread", CODEX_SESSION_ID: "host-session", CODEX_APP_TOOLS_PIPE_PATH: "host-pipe", CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "host-origin", CODEX_HOME: "/config", HOME: "/user", PATH: "/bin", OPENAI_API_KEY: "test-key", HTTPS_PROXY: "test-proxy", CODEX_SANDBOX: "preserved" };
  assert.deepEqual(standaloneCodexEnv(parent), { CODEX_HOME: "/config", HOME: "/user", PATH: "/bin", OPENAI_API_KEY: "test-key", HTTPS_PROXY: "test-proxy", CODEX_SANDBOX: "preserved" });
  assert.equal(parent.CODEX_THREAD_ID, "host-thread");
});
const env = mode => ({ ...process.env, THREADMESH_CODEX_COMMAND: fixture,
  THREADMESH_CODEX_TRY_MODE: mode, THREADMESH_PI_COMMAND: "/missing-no-pi-fallback" });
function cleanup(t, root) {
  assert.match(path.basename(root), /^threadmesh-(?:try-codex|codex-test)-/);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
}
const commands = root => fs.readFileSync(path.join(root, "codex.commands.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
function stopped(root) {
  const pid = Number(fs.readFileSync(path.join(root, "codex.pid"), "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
}
async function runFixture(t, mode, options = {}) {
  const values = { THREADMESH_CODEX_COMMAND: fixture, THREADMESH_CODEX_TRY_MODE: mode,
    THREADMESH_PI_COMMAND: "/missing-no-pi-fallback" };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const output = [];
  let report;
  try { report = await tryCodex({ write: line => output.push(line), timeoutMs: 5000, ...options }); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  cleanup(t, report.artifacts); stopped(report.artifacts);
  assert.equal(report.sampleProcessesStopped, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(report.artifacts, "report.json"), "utf8")), report);
  assert.doesNotMatch(JSON.stringify(report), /SECRET-TEST-CREDENTIAL|PRIVATE-ACCOUNT-EMAIL/);
  if (process.platform !== "win32") assert.equal(fs.statSync(report.artifacts).mode & 0o777, 0o700);
  return { report, output: output.join("\n"), calls: commands(report.artifacts) };
}

test("default public try is Codex, and without --live starts no process", t => {
  const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-test-")); cleanup(t, logRoot);
  const result = spawnSync(process.execPath, [cli, "try", "preferences"], {
    env: { ...env("quota"), THREADMESH_CODEX_TRY_LOG_DIR: logRoot }, encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Codex/); assert.match(result.stdout, /No model was called/);
  assert.match(result.stdout, /not existing desktop|NOT existing desktop/i);
  assert.deepEqual(fs.readdirSync(logRoot), [], "even a preflight process needs explicit --live");
});

test("Codex rejects API execution before any process or temporary artifact, without Pi fallback", t => {
  const logRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-test-")); cleanup(t, logRoot);
  const result = spawnSync(process.execPath, [cli, "try", "api", "--agent", "codex", "--live"], {
    env: { ...env("success"), TMPDIR: logRoot, THREADMESH_CODEX_TRY_LOG_DIR: logRoot }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Codex first-use currently supports preferences only/);
  assert.match(result.stderr, /--agent pi.*no automatic fallback/);
  assert.doesNotMatch(result.stdout, /REAL Codex|Private sample|Private results/);
  assert.deepEqual(fs.readdirSync(logRoot), [], "rejection must precede sample-directory creation and executable launch");
});

test("Codex failure hints do not echo account or provider secrets", () => {
  for (const reason of ["429 quota SECRET-TEST-CREDENTIAL", "401 credentials SECRET-TEST-CREDENTIAL", { message: "runtime SECRET-TEST-CREDENTIAL" }])
    assert.doesNotMatch(codexFailureHint(reason), /SECRET-TEST-CREDENTIAL/);
  assert.match(codexFailureHint("quota"), /Codex.*quota/);
  assert.match(codexFailureHint("401"), /existing Codex/);
});

test("native artifact proof requires exact receiver, turn, path and successful patch", () => {
  const make = (item = {}, params = {}) => ({ elapsedMs: 42, event: { method: "item/completed", params: {
    threadId: "b", turnId: "followup", item: { id: "patch", type: "fileChange", status: "completed", changes: [{ path: "landing.json" }], ...item }, ...params,
  } } });
  const check = event => codexArtifactWrites([event], "b", "followup", "/sample/website", "/sample/website/landing.json");
  assert.equal(check(make()).length, 1);
  for (const status of ["failed", "declined", "inProgress"]) assert.deepEqual(check(make({ status })), []);
  assert.deepEqual(check(make({}, { threadId: "a" })), []);
  assert.deepEqual(check(make({}, { turnId: "initial" })), []);
  assert.deepEqual(check(make({ changes: [{ path: "../brand/brief.json" }] })), []);
  assert.deepEqual(check({ elapsedMs: 42, event: { method: "item/completed" } }), []);
  assert.deepEqual(check({ elapsedMs: 42 }), []);
});

test("known depleted Codex quota stops before creating threads or starting models", async t => {
  const { report, calls, output } = await runFixture(t, "quota");
  assert.equal(report.pass, false); assert.match(report.error, /quota|limit/i);
  assert.ok(calls.some(call => call.method === "account/rateLimits/read"));
  assert.ok(!calls.some(call => ["thread/start", "turn/start"].includes(call.method)));
  assert.ok(!calls.some(call => /login|logout|consume/.test(call.method ?? "")));
  assert.doesNotMatch(output, /SECRET-TEST-CREDENTIAL|PRIVATE-ACCOUNT-EMAIL/);
});

test("missing Codex login fails without a model, login mutation or Pi fallback", async t => {
  const { report, calls } = await runFixture(t, "no-auth");
  assert.equal(report.pass, false); assert.match(report.error, /authentication/);
  assert.ok(!calls.some(call => ["thread/start", "turn/start", "account/login/start"].includes(call.method)));
  assert.deepEqual(calls.find(call => call.method === "account/read").params, { refreshToken: false });
});

test("native model quota error fails promptly and never starts A", async t => {
  const { report, calls } = await runFixture(t, "model-error");
  assert.equal(report.pass, false); assert.match(report.error, /quota/);
  assert.equal(calls.filter(call => call.method === "turn/start").length, 1);
  assert.equal(calls.filter(call => call.method === "thread/start").length, 1);
});

test("native transient retry can recover the same turn without restarting the sample", async t => {
  const { report, calls, output } = await runFixture(t, "stream-retry");
  assert.equal(report.pass, true, report.error);
  assert.equal(report.runtimeRetryReported, true);
  assert.equal(calls.filter(call => call.method === "turn/start").length, 3, "native reconnect is not another model kickoff");
  assert.equal((output.match(/Codex reconnecting within the remaining run budget/g) ?? []).length, 1);
  assert.doesNotMatch(output, /SECRET-TEST-CREDENTIAL|SECRET-TEST-PRIVATE/);
});

test("quota/auth retry notices and nonretry errors stop without waiting for a terminal notification", async t => {
  for (const mode of ["retry-quota", "retry-auth", "nonretry-error"]) {
    const { report, calls, output } = await runFixture(t, mode);
    assert.equal(report.pass, false);
    assert.ok(report.elapsedMs < 2500, "access failures must not wait for the total timeout");
    assert.equal(report.runtimeRetryReported, mode.startsWith("retry-"));
    assert.equal(calls.filter(call => call.method === "turn/start").length, 1);
    assert.doesNotMatch(output, /Codex reconnecting|SECRET-TEST-CREDENTIAL/);
  }
});

test("a native retry does not reset or bypass the total run deadline", async t => {
  const { report, calls } = await runFixture(t, "retry-hang", { timeoutMs: 1200 });
  assert.equal(report.pass, false); assert.equal(report.runtimeRetryReported, true);
  assert.match(report.error, /Timed out/);
  assert.ok(report.elapsedMs >= 1200 && report.elapsedMs < 3000);
  assert.equal(calls.filter(call => call.method === "turn/start").length, 1);
});

test("deterministic Codex pair retains B identity and native edit ownership; not live proof", async t => {
  const { report, calls, output } = await runFixture(t, "success");
  assert.equal(report.pass, true, report.error);
  assert.equal(report.sameNativeReceiverSession, true); assert.equal(report.receiverArtifactWrites.length, 1);
  assert.equal(report.unrelatedMessages, 0); assert.match(output, /same Codex B thread/);
  const starts = calls.filter(call => call.method === "thread/start");
  assert.equal(starts.length, 2); assert.ok(starts.every(call => call.params.ephemeral === true));
  assert.ok(starts.every(call => call.params.approvalPolicy === "never" && call.params.sandbox === "workspace-write"));
  assert.ok(starts.every(call => call.params.dynamicTools.every(tool => tool.type === "function")));
  assert.equal(calls.find(call => call.method === "initialize").params.capabilities.experimentalApi, true);
  const turns = calls.filter(call => call.method === "turn/start");
  assert.deepEqual(turns.map(call => call.params.threadId), ["fake-website", "fake-brand", "fake-website"]);
  assert.ok(turns.every(call => call.params.sandboxPolicy.excludeSlashTmp && call.params.sandboxPolicy.excludeTmpdirEnvVar && !call.params.sandboxPolicy.networkAccess));
  const results = calls.filter(call => !call.method && call.result);
  assert.ok(results.length >= 3); assert.ok(results.every(call => call.result.contentItems[0].type === "inputText"));
  assert.doesNotMatch(fs.readFileSync(path.join(report.artifacts, "events.json"), "utf8"), /PRIVATE-ACCOUNT-EMAIL/);
});

test("wrong-thread native tool request is rejected without delivery or follow-up", async t => {
  const { report, calls } = await runFixture(t, "wrong-thread");
  assert.equal(report.pass, false);
  assert.equal(calls.filter(call => call.method === "turn/start").length, 2);
  const rejection = calls.find(call => call.result?.success === false);
  assert.ok(rejection); assert.match(rejection.result.contentItems[0].text, /unbound_dynamic_tool/);
});

test("changed artifact with failed native patch is not a successful collaboration", async t => {
  const { report } = await runFixture(t, "failed-patch");
  assert.equal(report.pass, false); assert.match(report.error, /successful native B file-change/);
  assert.notEqual(fs.readFileSync(path.join(report.artifacts, "before.txt"), "utf8"), fs.readFileSync(path.join(report.artifacts, "after.txt"), "utf8"));
});

test("Ctrl-C terminates the Codex sample and preserves a cancelled report", { skip: process.platform === "win32", timeout: 10000 }, async t => {
  const child = spawn(process.execPath, [cli, "try", "--live"], { env: env("hang"), stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
  let output = "", sent = false;
  child.stdout.on("data", chunk => {
    output += chunk;
    if (!sent && output.includes("establishing its original task")) { sent = true; child.kill("SIGINT"); }
  });
  const exit = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(sent, true); assert.equal(exit, 130);
  const root = output.match(/Private results: (.+)\n/)?.[1]; assert.ok(root, output); cleanup(t, root);
  const report = JSON.parse(fs.readFileSync(path.join(root, "report.json"), "utf8"));
  assert.equal(report.pass, false); assert.equal(report.cancelled, true); assert.equal(report.sampleProcessesStopped, true); stopped(root);
});
