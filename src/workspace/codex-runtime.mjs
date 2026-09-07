import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Read-only, bounded CLI identity probe; never authenticate, update or run a model.
export function probeCodexVersion(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 2000, killSignal: "SIGKILL", maxBuffer: 4096, windowsHide: true });
  if (result.error || result.status !== 0) return null;
  const match = /^codex-cli (\d+\.\d+\.\d+)\s*$/.exec(result.stdout ?? "");
  return match?.[1] ?? null;
}

function numericVersion(value) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  const parts = value.split(".").map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function isExecutable(command) {
  if (!command) return false;
  try {
    if (!fs.statSync(command).isFile()) return false;
    fs.accessSync(command, fs.constants.X_OK); return true;
  }
  catch { return false; }
}

// First-use only: do not alter generic harness launching or install a runtime.
export function selectCodexRuntime({ platform = process.platform, searchPath = process.env.PATH ?? "",
  override = process.env.THREADMESH_CODEX_COMMAND,
  bundledCodexPath = "/Applications/ChatGPT.app/Contents/Resources/codex",
  probeVersion = probeCodexVersion } = {}) {
  if (override) {
    if (!path.isAbsolute(override)) throw new Error("THREADMESH_CODEX_COMMAND must be absolute");
    // Explicit wrappers and test fixtures need not support --version. Never probe
    // or silently replace a caller-selected executable, even if it fails later.
    return { command: override, version: null, source: "explicit-override", reason: "Explicit THREADMESH_CODEX_COMMAND preserved without a version probe." };
  }
  const onPath = searchPath.split(path.delimiter).filter(Boolean)
    .map(directory => path.resolve(directory, platform === "win32" ? "codex.cmd" : "codex"))
    .find(isExecutable);
  const bundled = platform === "darwin" && isExecutable(bundledCodexPath) ? bundledCodexPath : null;
  if (!onPath && !bundled) return null;
  const version = command => {
    try { const value = probeVersion(command); return numericVersion(value) ? value : null; }
    catch { return null; }
  };
  const pathVersion = onPath ? version(onPath) : null;
  if (!bundled || bundled === onPath)
    return { command: onPath, version: pathVersion, source: "path", reason: "Using the installed Codex on PATH." };
  if (onPath && !pathVersion)
    return { command: onPath, version: null, source: "path", reason: "PATH version could not be verified; preserving PATH rather than guessing." };
  const bundledVersion = version(bundled);
  if (!onPath)
    return { command: bundled, version: bundledVersion, source: "desktop-bundle", reason: "No Codex on PATH; reusing the installed desktop application's public CLI." };
  const a = numericVersion(pathVersion), b = numericVersion(bundledVersion);
  const different = b ? b.findIndex((part, index) => part !== a[index]) : -1;
  if (different >= 0 && b[different] > a[different])
    return { command: bundled, version: bundledVersion, source: "desktop-bundle", reason: `Installed desktop CLI ${bundledVersion} is newer than PATH CLI ${pathVersion}; account, model and configuration are unchanged.` };
  return { command: onPath, version: pathVersion, source: "path", reason: "PATH CLI is at least as new as the verified desktop CLI, or the desktop version is unknown." };
}
