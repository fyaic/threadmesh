import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

async function execute(executable, args, options) {
  try {
    const result = await executeFile(executable, args, options);
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, killed: error.killed, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

/** Passive public discovery only. Never start a daemon or inspect any thread. */
export async function probeCodexDesktopEndpoint({ executable, timeoutMs = 5000 }, run = execute) {
  if (typeof executable !== "string" || !path.isAbsolute(executable) || executable.includes("\0")) {
    throw new Error("An explicitly selected absolute Codex executable is required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 15000) throw new Error("Invalid probe timeout");
  const options = { encoding: "utf8", timeout: timeoutMs, maxBuffer: 65536, windowsHide: true };
  const version = await run(executable, ["--version"], options);
  const runtimeVersion = /^codex-cli ([0-9]+\.[0-9]+\.[0-9]+(?:[-+][\w.-]+)?)\s*$/.exec(version.stdout ?? "")?.[1] ?? null;
  const base = { schemaVersion: 1, runtimeVersion, discovery: "official-default-daemon",
    endpointReachable: false, desktopOwnerVerified: false, readyForDirectedDelivery: false,
    modelCalls: 0, chatOperations: 0 };
  if (version.code !== 0 || !runtimeVersion) return { ...base, reason: "runtime_version_unavailable" };
  // This native command does initialize/initialized on the documented default
  // control socket. It does not bootstrap or attach stored conversations.
  const result = await run(executable, ["app-server", "daemon", "version"], options);
  if (result.code !== 0) {
    const error = String(result.stderr ?? "");
    return { ...base, reason: result.killed ? "public_endpoint_probe_timed_out"
      : /No such file or directory|os error 2/.test(error) ? "public_control_socket_missing"
      : /unrecognized subcommand|unexpected argument/.test(error) ? "public_daemon_command_unavailable"
      : "public_endpoint_unavailable" };
  }
  let value;
  try { value = JSON.parse(result.stdout); } catch { return { ...base, reason: "invalid_native_probe_response" }; }
  if (!value || typeof value.appServerVersion !== "string" ||
      !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][\w.-]+)?$/.test(value.appServerVersion)) {
    return { ...base, reason: "invalid_native_probe_response" };
  }
  // Version/socket/PID information cannot prove that this daemon owns the
  // already-open desktop conversation. Do not silently upgrade this to ready.
  return { ...base, endpointReachable: true, appServerVersion: value.appServerVersion,
    reason: "public_endpoint_reachable_desktop_owner_unverified" };
}
