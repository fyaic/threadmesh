import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

function executable(explicit, environmentKey, binaryName) {
  const requested = explicit ?? process.env[environmentKey] ?? null;
  if (requested) {
    const resolved = path.resolve(requested);
    fs.accessSync(resolved, fs.constants.X_OK);
    return resolved;
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, binaryName);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return path.resolve(candidate);
    } catch {
      // Continue PATH discovery without a user-specific fallback.
    }
  }
  throw Object.assign(new Error(`${binaryName}_not_found`), {
    code: `threadmesh_${binaryName}_command_not_found`,
  });
}

try {
  const options = parse(process.argv.slice(2));
  const mode = options.mode ?? "dry-run";
  const product = options.product ?? (mode === "live" ? "codex" : "fixture");
  const artifactsDirectory = options["artifacts-dir"]
    ? path.resolve(options["artifacts-dir"])
    : fs.mkdtempSync(path.join(os.tmpdir(), `threadmesh-m5-2-${mode}-${product}-`));
  const result = await runLiveAgentScenario({
    mode,
    product,
    sourceRoot: root,
    validatedBaseSha: options.sha ?? git(["rev-parse", "HEAD"]),
    artifactsDirectory,
    temporaryParent: path.resolve(options["temporary-parent"] ?? os.tmpdir()),
    command: mode === "live"
      ? executable(
        options.command,
        product === "kimi" ? "KIMI_BIN" : "CODEX_BIN",
        product === "kimi" ? "kimi" : "codex",
      )
      : null,
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
