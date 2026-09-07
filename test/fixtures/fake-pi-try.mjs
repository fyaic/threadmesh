#!/usr/bin/env node
// Deterministic process fixture. This is not an Agent or live-model proof.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { LocalWorkspace } from "../../src/workspace/local-workspace.mjs";

const name = process.env.THREADMESH_NAME;
const mode = process.env.THREADMESH_TRY_TEST_MODE;
const root = path.dirname(process.cwd());
const emit = event => process.stdout.write(`${JSON.stringify(event)}\n`);
const room = new LocalWorkspace(process.env.THREADMESH_WORKSPACE);
const disconnect = room.connect(name);
const tools = room.tools(name);
fs.writeFileSync(path.join(root, `${name}.pid`), String(process.pid));
const localSettings = JSON.parse(fs.readFileSync(".pi/settings.json", "utf8"));
if (localSettings.retry.enabled !== false) throw new Error("sample must disable retries locally");
let finishedInitial = false, followedUp = false;
const timer = setInterval(async () => {
  if (mode !== "success" || name !== "website" || !finishedInitial || followedUp || !room.inbox(name).length) return;
  followedUp = true;
  emit({ type: "agent_start" });
  emit({ type: "tool_execution_start", toolName: "write", toolCallId: "fixture-write", args: { path: "landing.json" } });
  fs.writeFileSync("landing.json", JSON.stringify({ headline: "Member Portal for your team", description: "Up to 5 free projects for your team.", signupButton: "Create my workspace" }));
  emit({ type: "tool_execution_end", toolName: "write", toolCallId: "fixture-write", result: { content: [] } });
  emit({ type: "agent_end" });
}, 150);
function close() { clearInterval(timer); disconnect(); room.close(); process.exit(0); }
process.on("SIGTERM", close);
process.on("SIGINT", close);
readline.createInterface({ input: process.stdin }).on("line", async line => {
  const command = JSON.parse(line);
  fs.appendFileSync(path.join(root, `${name}.commands.jsonl`), `${line}\n`);
  if (command.type === "get_state") {
    emit({ type: "response", id: command.id, success: true, data: {
      sessionId: `deterministic-${name}`, model: mode === "no-model" ? null : { provider: "fixture", id: "no-real-model" },
    } });
    return;
  }
  if (command.type !== "prompt") throw new Error("Unexpected sample RPC command");
  if (mode === "exit") return close();
  if (mode === "hang") return;
  emit({ type: "agent_start" });
  if (mode === "quota") {
    emit({ type: "message_end", message: { role: "assistant", stopReason: "error", errorMessage: "429 quota exhausted SECRET-TEST-CREDENTIAL" } });
    emit({ type: "agent_end" });
    return;
  }
  if (mode === "end-quota") {
    emit({ type: "agent_end", messages: [{ role: "assistant", stopReason: "error", errorMessage: "quota exhausted SECRET-TEST-CREDENTIAL" }] });
    return;
  }
  if (mode !== "success") throw new Error("Unknown deterministic fixture mode");
  if (name === "website") {
    const landing = JSON.parse(fs.readFileSync("landing.json", "utf8"));
    fs.writeFileSync("landing.json", JSON.stringify({ ...landing, signupButton: "Create my workspace" }));
    finishedInitial = true;
  } else {
    fs.writeFileSync("brief.json", JSON.stringify({ product: "Member Portal", freeTier: "Up to 5 free projects", spelling: "US" }));
    await tools.call("threadmesh_peers");
    const result = await tools.call("threadmesh_send", { to: "website", content: "Our approved brief now names Member Portal and limits the free tier to 5 projects. Preserve your own earlier signup label.", reason: "Landing copy depends on the approved brief" });
    emit({ type: "tool_execution_end", toolName: "threadmesh_send", result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
  }
  emit({ type: "agent_end" });
});
