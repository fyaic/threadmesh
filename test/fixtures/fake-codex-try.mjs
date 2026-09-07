#!/usr/bin/env node
// Deterministic native-wire fixture only; never a live model or product proof.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const root = process.cwd(), mode = process.env.THREADMESH_CODEX_TRY_MODE;
const emit = message => process.stdout.write(`${JSON.stringify(message)}\n`);
const logRoot = process.env.THREADMESH_CODEX_TRY_LOG_DIR || root;
fs.writeFileSync(path.join(logRoot, "codex.pid"), String(process.pid));
fs.writeFileSync(path.join(logRoot, "codex.args.json"), JSON.stringify(process.argv.slice(2)));
const threads = new Map(), requests = new Map();
let sequence = 0;
function tool(threadId, turnId, name, args = {}) {
  const id = `tool-${++sequence}`;
  const result = new Promise(resolve => requests.set(id, resolve));
  emit({ id, method: "item/tool/call", params: { threadId, turnId, callId: id, tool: name, arguments: args } });
  return result;
}
function complete(threadId, turnId, status = "completed", error = null) {
  emit({ method: "turn/completed", params: { threadId, turn: { id: turnId, status, error } } });
}
async function runTurn(threadId, turnId) {
  const state = threads.get(threadId);
  if (mode === "hang") return;
  if (["model-error", "retry-quota", "retry-auth", "nonretry-error"].includes(mode)) {
    const error = { message: mode === "retry-auth" ? "401 authentication unavailable SECRET-TEST-CREDENTIAL"
      : mode === "nonretry-error" ? "Response stream disconnected SECRET-TEST-CREDENTIAL"
      : "429 quota exhausted SECRET-TEST-CREDENTIAL" };
    emit({ method: "error", params: { threadId, turnId, error, willRetry: mode.startsWith("retry-") } });
    if (mode !== "model-error") return;
    complete(threadId, turnId, "failed", error); return;
  }
  if (["stream-retry", "retry-hang"].includes(mode) && state.name === "website" && state.turns === 1) {
    emit({ method: "error", params: { threadId, turnId, willRetry: true,
      error: { message: "Reconnecting... SECRET-TEST-PRIVATE", codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: null } } },
    } });
    if (mode === "retry-hang") return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  if (state.name === "website") {
    const filename = path.join(state.cwd, "landing.json");
    if (state.turns === 1) {
      const page = JSON.parse(fs.readFileSync(filename, "utf8"));
      fs.writeFileSync(filename, JSON.stringify({ ...page, signupButton: "Create my workspace" }));
    } else {
      await tool(threadId, turnId, "threadmesh_inbox");
      fs.writeFileSync(filename, JSON.stringify({ headline: "Member Portal for your team", description: "Up to 5 free projects for your team.", signupButton: "Create my workspace" }));
      emit({ method: "item/completed", params: { threadId, turnId, item: {
        type: "fileChange", id: "receiver-patch", status: mode === "failed-patch" ? "failed" : "completed",
        changes: [{ path: filename, kind: { type: "update", move_path: null }, diff: "deterministic fixture patch" }],
      } } });
    }
  } else if (state.name === "brand") {
    fs.writeFileSync(path.join(state.cwd, "brief.json"), JSON.stringify({ product: "Member Portal", freeTier: "Up to 5 free projects", spelling: "US" }));
    if (mode !== "silent") {
      await tool(threadId, turnId, "threadmesh_peers");
      await tool(mode === "wrong-thread" ? "not-a-sample-thread" : threadId, turnId,
        "threadmesh_send", { to: "website", content: "The product is now Member Portal and the free tier is limited to 5 projects. Keep prior signup decisions.", reason: "The landing page depends on the approved brief." });
    }
  }
  complete(threadId, turnId);
}
readline.createInterface({ input: process.stdin }).on("line", line => {
  fs.appendFileSync(path.join(logRoot, "codex.commands.jsonl"), `${line}\n`);
  const message = JSON.parse(line);
  if (!message.method) { requests.get(message.id)?.(message); requests.delete(message.id); return; }
  const { id, method, params } = message;
  if (method === "initialized") return;
  let result;
  if (method === "initialize") result = { userAgent: "codex_cli_rs/0.145.0 (deterministic fake)", platformFamily: "unix", platformOs: "macos" };
  else if (method === "account/read") result = { requiresOpenaiAuth: true, account: mode === "no-auth" ? null : { type: "chatgpt", email: "PRIVATE-ACCOUNT-EMAIL", planType: "plus" } };
  else if (method === "account/rateLimits/read") {
    const codex = { limitId: "codex", primary: { usedPercent: mode === "quota" ? 100 : 0, windowDurationMins: 300, resetsAt: 9999999999 }, secondary: null };
    result = { rateLimits: codex, rateLimitsByLimitId: { codex } };
  } else if (method === "thread/start") {
    const threadId = `fake-${path.basename(params.cwd)}`;
    threads.set(threadId, { name: path.basename(params.cwd), cwd: params.cwd, turns: 0 });
    result = { thread: { id: threadId }, model: "fixture-no-model", modelProvider: "openai", sandbox: { type: "workspaceWrite" } };
  } else if (method === "turn/start") {
    const state = threads.get(params.threadId), turnId = `${params.threadId}-turn-${++state.turns}`;
    result = { turn: { id: turnId, status: "inProgress" } };
    emit({ id, result });
    emit({ method: "turn/started", params: { threadId: params.threadId, turn: result.turn } });
    setTimeout(() => { void runTurn(params.threadId, turnId); }, 30); return;
  } else { emit({ id, error: { code: -32601, message: "Unexpected fixture method" } }); return; }
  emit({ id, result });
});
