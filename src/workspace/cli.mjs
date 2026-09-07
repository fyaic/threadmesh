import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { LocalWorkspace, renderCheckpoint } from "./local-workspace.mjs";
import { startWorkspaceMcp } from "./mcp-server.mjs";
import { doctor, launch, mcpConfig, deepseekPatch } from "./launch.mjs";
import { preview } from "./preview.mjs";

const help = `ThreadMesh — connect your own agent sessions

  threadmesh preview [api|preferences|quota]  No-model walkthrough, clearly labelled
  threadmesh try [preferences] --live         Real Codex pair; existing login and model quota
  threadmesh init --workspace DIR            Create an explicitly shared local room
  threadmesh run codex|pi|kimi|deepseek --name NAME --goal GOAL [-- native args]
  threadmesh join NAME --harness NAME --goal GOAL  Publish a goal before launching
  threadmesh status                         Sessions, pending messages, checkpoints
  threadmesh setup HARNESS --name NAME --goal GOAL  Print MCP configuration
  threadmesh mcp --name NAME --harness NAME --goal GOAL  Stdio MCP server
  threadmesh checkpoint NAME --file JSON     Save goal, decisions, constraints, next
  threadmesh handoff NAME --out FILE         Export an explicit portable checkpoint
  threadmesh continue NAME --agent HARNESS --name NEW_NAME  Resume saved work elsewhere
  threadmesh mute NAME | unmute NAME         Pause/resume workspace communication
  threadmesh doctor                         Installed harness versions; no model call
  threadmesh demo [--json]                   Original deterministic conformance demo

Shared options: --workspace DIR (default .threadmesh), --goal TEXT, --name NAME
DeepSeek: --profile web|headless|acp. Pi: --wake-idle (explicit native wake opt-in).
Try defaults to Codex; Pi also supports try api --agent pi --live. Neither attaches old GUI chats.
Use a unique name per connected session. Joining a room shares its published goals
and advisory messages with other joined sessions, never your full chat history.
`;

export async function workspaceCli(argv) {
  const split = argv.indexOf("--");
  const extra = split >= 0 ? argv.slice(split + 1) : [];
  const { values, positionals } = parseArgs({ args: split >= 0 ? argv.slice(0, split) : argv,
    allowPositionals: true, options: {
      workspace: { type: "string", default: ".threadmesh" }, name: { type: "string" },
      goal: { type: "string" }, harness: { type: "string" }, agent: { type: "string" },
      profile: { type: "string", default: "web" }, file: { type: "string" }, out: { type: "string" },
      "wake-idle": { type: "boolean", default: false }, help: { type: "boolean", short: "h" },
      live: { type: "boolean", default: false }, provider: { type: "string" }, model: { type: "string" },
    } });
  const [command, subject] = positionals;
  const directory = path.resolve(values.workspace);
  const print = value => process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value, null, 2)}\n`);
  const required = (value, key) => { if (!value) throw new Error(`Missing ${key}. Run threadmesh --help.`); return value; };
  if (!command || command === "help" || values.help) { print(help); return; }
  if (command === "doctor") { print(doctor()); return; }
  if (command === "preview") { await preview(subject); return; }
  if (command === "try") {
    if (positionals.length > 2 || extra.length) throw new Error("Usage: threadmesh try [preferences|api] --agent codex|pi --live [--model NAME]");
    const agent = values.agent || "codex";
    if (!["codex", "pi"].includes(agent)) throw new Error("The self-contained try command supports codex or pi. No automatic harness fallback is performed.");
    if (agent === "codex" && values.provider) throw new Error("For Codex, keep its configured provider and login; --provider is a Pi-only option. Use --model for a Codex model override.");
    if (!values.live) {
      if (agent === "pi") { const { tryHelp } = await import("./try-live.mjs"); print(tryHelp); }
      else print(`A real Codex collaboration in one terminal:
  threadmesh try preferences --live
  threadmesh try preferences --agent codex --live

Uses installed Codex and its existing login/model configuration. No Pi or second
subscription is required. This consumes your normal Codex quota; limits are not
bypassed. Two new disposable Codex sessions are created, NOT existing desktop
chats. ThreadMesh requests a checkpoint turn only after actual peer delivery;
this does not establish native desktop idle wake. Sample files and private logs
remain locally; Ctrl-C stops the run. No model was called. Add --live to start.
For an existing Pi account instead: threadmesh try --agent pi --live`);
      return;
    }
    const options = { scenarioName: subject || "preferences", provider: values.provider, model: values.model };
    const report = agent === "codex"
      ? await (await import("./try-codex.mjs")).tryCodex(options)
      : await (await import("./try-live.mjs")).tryLive(options);
    process.exitCode = report.pass ? 0 : report.cancelled ? 130 : 1;
    return;
  }
  if (command === "mcp") {
    await startWorkspaceMcp({ directory, name: required(values.name, "--name"),
      harness: required(values.harness, "--harness"), goal: required(values.goal, "--goal") }); return;
  }
  const workspace = new LocalWorkspace(directory, { create: command === "init" });
  let launchOptions;
  try {
    if (command === "init") print(`Workspace ready: ${directory}\nStart two sessions of the same agent (or different agents) with the same --workspace and different --name values.\nTry: threadmesh run pi --name client --goal "Maintain the orders client" --wake-idle`);
    else if (command === "join") print(workspace.join(required(subject, "NAME"), required(values.harness, "--harness"), required(values.goal, "--goal")));
    else if (command === "status") print(workspace.status());
    else if (["mute", "unmute"].includes(command)) print(workspace.mute(required(subject, "NAME"), command === "mute"));
    else if (command === "checkpoint") {
      const filename = required(values.file, "--file");
      if (fs.statSync(filename).size > 25000) throw new Error("Checkpoint file too large");
      print(workspace.checkpoint(required(subject, "NAME"), JSON.parse(fs.readFileSync(filename, "utf8"))));
    } else if (command === "handoff") {
      const content = renderCheckpoint(workspace.checkpoint(required(subject, "NAME")));
      if (values.out) { fs.writeFileSync(values.out, content, { mode: 0o600, flag: "wx" }); print(`Checkpoint exported: ${values.out}`); }
      else print(content);
    } else if (command === "continue") {
      const checkpoint = workspace.checkpoint(required(subject, "NAME"));
      const content = renderCheckpoint(checkpoint);
      const agent = required(values.agent, "--agent"), name = required(values.name, "--name");
      workspace.join(name, agent, checkpoint.goal);
      launchOptions = { agent, directory, name, goal: checkpoint.goal, wakeIdle: values["wake-idle"],
        profile: agent === "deepseek" ? "headless" : values.profile,
        extra: agent === "kimi" ? ["--prompt", content, ...extra] : [...extra, content] };
      print(`Continuing the saved checkpoint from ${checkpoint.savedAt}. Check current files before acting; native hidden state and tool permissions are not transferred.`);
    } else if (command === "run" || command === "setup") {
      const agent = required(subject, "HARNESS"), name = required(values.name, "--name"), goal = required(values.goal, "--goal");
      if (!["codex", "pi", "kimi", "deepseek"].includes(agent)) throw new Error("Harness must be codex, pi, kimi, or deepseek");
      if (command === "setup" && agent === "pi") throw new Error("Pi uses the native extension: use threadmesh run pi --name NAME --goal GOAL.");
      workspace.join(name, agent, goal);
      if (command === "setup") {
        const config = mcpConfig({ directory, name, harness: agent, goal });
        print(agent === "deepseek" ? deepseekPatch(config) : { mcpServers: { threadmesh: config } });
      } else launchOptions = { agent, directory, name, goal, extra, profile: values.profile, wakeIdle: values["wake-idle"] };
    } else throw new Error(`Unknown command: ${command}. Run threadmesh --help.`);
  } finally { workspace.close(); }
  if (launchOptions) process.exitCode = await launch(launchOptions);
}
