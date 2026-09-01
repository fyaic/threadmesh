import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  runM52EventPumpCodexGate,
  runM52OperatorSuppliedCodexEventPumpGate,
} from
  "../src/validation/m5-2-event-pump-codex-gate.mjs";

const LIVE_ACK = "maintainer-approved-threadmesh-m52-event-pump-live";

function options(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) return { help: true };
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      const error = new Error("threadmesh_m52_event_pump_runner_usage_invalid");
      error.code = "threadmesh_m52_event_pump_runner_usage_invalid";
      throw error;
    }
    parsed[key.slice(2)] = value;
  }
  return parsed;
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/run-m5-2-event-pump-gate.mjs --mode fake [--artifacts-dir ABSOLUTE]",
    "  THREADMESH_M52_EVENT_PUMP_LIVE_ACK=maintainer-approved-threadmesh-m52-event-pump-live \\",
    "    THREADMESH_CODEX_COMMAND=/absolute/path/to/codex \\",
    "    node scripts/run-m5-2-event-pump-gate.mjs --mode live [--model MODEL]",
    "  node scripts/run-m5-2-event-pump-gate.mjs --mode live --ack ACK --command /absolute/path/to/codex",
    "  Live mode treats the command as operator-supplied and Codex-shaped; the probe does not prove binary provenance.",
    "",
    "Exit codes: blocked=2, failed=1, usage/preflight/not-run=3.",
  ].join("\n"));
}

let ownedArtifacts = null;
try {
  const parsed = options(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exitCode = 0;
  } else {
  const mode = parsed.mode ?? "fake";
  if (!["fake", "live"].includes(mode)) {
    throw Object.assign(new Error("threadmesh_m52_event_pump_runner_mode_invalid"), {
      code: "threadmesh_m52_event_pump_runner_mode_invalid",
    });
  }
  const artifactsDirectory = parsed["artifacts-dir"]
    ? path.resolve(parsed["artifacts-dir"])
    : (ownedArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-pump-gate-")));
  let result;
  if (mode === "live") {
    const ack = parsed.ack ?? process.env.THREADMESH_M52_EVENT_PUMP_LIVE_ACK;
    if (ack !== LIVE_ACK) {
      throw Object.assign(new Error("threadmesh_m52_event_pump_runner_live_ack_required"), {
        code: "threadmesh_m52_event_pump_runner_live_ack_required",
      });
    }
    const command = parsed.command ?? process.env.THREADMESH_CODEX_COMMAND;
    if (!path.isAbsolute(command ?? "")) {
      throw Object.assign(new Error("threadmesh_m52_event_pump_runner_command_invalid"), {
        code: "threadmesh_m52_event_pump_runner_command_invalid",
      });
    }
    let commandValid = false;
    try {
      fs.accessSync(command, fs.constants.X_OK);
      commandValid = fs.statSync(command).isFile();
    } catch {}
    if (!commandValid) {
      throw Object.assign(new Error("threadmesh_m52_event_pump_runner_command_invalid"), {
        code: "threadmesh_m52_event_pump_runner_command_invalid",
      });
    }
    result = await runM52OperatorSuppliedCodexEventPumpGate({
      artifactsDirectory,
      command,
      ...(parsed.model ? { model: parsed.model } : {}),
    });
  } else {
    result = await runM52EventPumpCodexGate({ artifactsDirectory });
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.state === "blocked" ? 2 : (result.state === "failed" ? 1 : 3);
  }
} catch (error) {
  const preflightCodes = new Set([
    "threadmesh_m52_event_pump_runner_usage_invalid",
    "threadmesh_m52_event_pump_runner_mode_invalid",
    "threadmesh_m52_event_pump_runner_live_ack_required",
    "threadmesh_m52_event_pump_runner_command_invalid",
    "threadmesh_m52_event_pump_gate_input_invalid",
    "threadmesh_m52_event_pump_gate_product_probe_invalid",
  ]);
  const preflight = preflightCodes.has(error?.code);
  console.error(JSON.stringify({
    state: preflight ? "not-run" : "failed",
    code: error?.code ?? "threadmesh_m52_event_pump_runner_failed",
    liveAck: LIVE_ACK,
  }, null, 2));
  process.exitCode = preflight ? 3 : 1;
} finally {
  if (ownedArtifacts !== null) fs.rmSync(ownedArtifacts, { recursive: true, force: true });
}
