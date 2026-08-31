import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  LIVE_AGENT_SCENARIO_ACK,
  runLiveAgentScenario,
} from "../src/validation/live-agent-scenario.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length) {
      throw Object.assign(new Error("usage_error"), { code: "usage_error" });
    }
    result[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

try {
  const options = parse(process.argv.slice(2));
  const mode = options.mode ?? "dry-run";
  const product = options.product ?? (mode === "live" ? "codex" : "fixture");
  const artifactsDirectory = path.resolve(options["artifacts-dir"] ??
    path.join(process.env.TMPDIR ?? "/tmp", `threadmesh-m5-2-${mode}-${product}-${Date.now()}`));
  const result = await runLiveAgentScenario({
    mode,
    product,
    sourceRoot: root,
    validatedBaseSha: options.sha ?? git(["rev-parse", "HEAD"]),
    artifactsDirectory,
    temporaryParent: path.resolve(options["temporary-parent"] ?? process.env.TMPDIR ?? "/tmp"),
    command: path.resolve(options.command ?? (product === "kimi"
      ? process.env.KIMI_BIN ?? "/Users/veil/.kimi-code/bin/kimi"
      : process.env.CODEX_BIN ?? "/opt/homebrew/bin/codex")),
    model: options.model ?? null,
    ack: options.ack ?? process.env.THREADMESH_LIVE_AGENT_SCENARIO_ACK ?? null,
    scenarioId: options["scenario-id"] ?? `m52-${Date.now()}`,
  });
  console.log(JSON.stringify({ ...result, artifactsDirectory }, null, 2));
  if (result.state === "failed") process.exitCode = 1;
  if (result.state === "blocked") process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({
    state: "failed",
    code: error?.code ?? "threadmesh_live_scenario_runner_failed",
    liveAck: LIVE_AGENT_SCENARIO_ACK,
  }, null, 2));
  process.exitCode = error?.code === "usage_error" ? 2 : 1;
}
