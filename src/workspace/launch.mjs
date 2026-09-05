import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { COORDINATION_GUIDANCE } from "./mcp-server.mjs";

export const cliPath = fileURLToPath(new URL("../../bin/threadmesh.mjs", import.meta.url));
const piExtension = fileURLToPath(new URL("../integrations/pi-entry.js", import.meta.url));

export function executable(name) {
  const override = process.env[`THREADMESH_${name.toUpperCase()}_COMMAND`];
  if (override) {
    if (!path.isAbsolute(override)) throw new Error(`THREADMESH_${name.toUpperCase()}_COMMAND must be absolute`);
    return override;
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    const candidate = path.join(directory, process.platform === "win32" ? `${name}.cmd` : name);
    try { fs.accessSync(candidate, fs.constants.X_OK); return candidate; } catch { /* try next */ }
  }
  return null;
}

export function mcpConfig({ directory, name, harness, goal }) {
  return { command: process.execPath, args: [cliPath, "mcp", "--workspace", path.resolve(directory),
    "--name", name, "--harness", harness, "--goal", goal] };
}

export function deepseekPatch(config) {
  return [{ insert: [{ id: "threadmesh-mcp", name: "@deepseek-ai/dsh-mcp-client", config: {
    serverName: "threadmesh", transport: "stdio", ...config, failOnStartupError: true,
  } }] }];
}

export function installKimiConfig(cwd, config) {
  const directory = path.join(cwd, ".kimi-code");
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error("Refusing symlinked .kimi-code");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, "mcp.json");
  const existing = fs.existsSync(filename);
  if (existing && (fs.lstatSync(filename).isSymbolicLink() || fs.lstatSync(filename).nlink !== 1)) throw new Error("Refusing unsafe mcp.json");
  const original = existing ? fs.readFileSync(filename, "utf8") : null;
  const parsed = existing ? JSON.parse(original) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      (parsed.mcpServers && (typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)))) throw new Error("Invalid existing MCP configuration");
  if (parsed.mcpServers?.threadmesh) {
    if (JSON.stringify(parsed.mcpServers.threadmesh) !== JSON.stringify(config)) throw new Error("A different ThreadMesh entry exists. Use a different project or edit that entry explicitly.");
    return filename;
  }
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify({ ...parsed, mcpServers: { ...parsed.mcpServers, threadmesh: config } }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try {
    if ((fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : null) !== original) throw new Error("MCP configuration changed concurrently; retry");
    if (original !== null) fs.writeFileSync(`${filename}.threadmesh-backup-${Date.now()}`, original, { mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, filename);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return filename;
}

export function launchPlan({ agent, directory, name, goal, cwd = process.cwd(), extra = [], profile = "web", wakeIdle = false }) {
  const config = mcpConfig({ directory, name, goal, harness: agent });
  const env = { ...process.env, THREADMESH_WORKSPACE: path.resolve(directory), THREADMESH_NAME: name,
    THREADMESH_GOAL: goal, THREADMESH_WAKE_IDLE: wakeIdle ? "1" : "0" };
  if (agent === "pi") return { command: executable("pi"), args: ["--extension", piExtension, ...extra], env, cwd };
  if (agent === "codex") return { command: executable("codex"), args: [
    "-c", `mcp_servers.threadmesh.command=${JSON.stringify(config.command)}`,
    "-c", `mcp_servers.threadmesh.args=${JSON.stringify(config.args)}`,
    "-c", "mcp_servers.threadmesh.required=true",
    // Joining this private, same-owner room opts into these four operations.
    // Do not change global approval_policy, sandbox, or another server's tools.
    ...["threadmesh_peers", "threadmesh_send", "threadmesh_inbox", "threadmesh_checkpoint"]
      .flatMap(tool => ["-c", `mcp_servers.threadmesh.tools.${tool}.approval_mode="approve"`]),
    ...extra], env, cwd };
  if (agent === "kimi") {
    return { command: executable("kimi"), args: extra, env, cwd, kimiConfig: config };
  }
  if (agent === "deepseek") {
    const patchPath = path.join(path.resolve(directory), `deepseek-${name}.patch.json`);
    return { command: executable("dsh"), args: ["--profile", profile, "--patch", patchPath, ...extra],
      env, cwd, patchPath, patch: deepseekPatch(config) };
  }
  throw new Error("Supported harnesses: codex, kimi, pi, deepseek");
}

export async function launch(options) {
  const plan = launchPlan(options);
  if (!plan.command) throw new Error(`Harness not installed. Run threadmesh doctor. For DeepSeek: npm install -g @deepseek-ai/dsh@0.1.2-rc.1`);
  if (plan.patchPath) {
    if (fs.existsSync(plan.patchPath) && fs.lstatSync(plan.patchPath).isSymbolicLink()) throw new Error("Unsafe DeepSeek patch path");
    fs.writeFileSync(plan.patchPath, JSON.stringify(plan.patch, null, 2), { mode: 0o600 });
  }
  if (plan.kimiConfig) {
    const filename = installKimiConfig(plan.cwd, plan.kimiConfig);
    process.stderr.write(`ThreadMesh added its project MCP entry in ${filename}; existing entries retained.\n`);
  }
  process.stderr.write(`ThreadMesh: ${options.name} joined ${path.resolve(options.directory)}\n${COORDINATION_GUIDANCE}\n`);
  if (options.agent === "codex") process.stderr.write("ThreadMesh: the four local workspace tools are preapproved for this launch only. Shell/file and other MCP approvals are unchanged.\n");
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, { cwd: plan.cwd, env: plan.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1)));
  });
}

export function doctor() {
  return ["codex", "kimi", "pi", "dsh"].map(name => {
    const command = executable(name);
    if (!command) return { harness: name, installed: false, modelTested: false };
    const probe = spawnSync(command, ["--version"], { encoding: "utf8", timeout: 8000, maxBuffer: 64000 });
    return { harness: name, installed: true, version: (probe.stdout || "").trim().slice(0, 120),
      probeSucceeded: probe.status === 0, modelTested: false };
  });
}
