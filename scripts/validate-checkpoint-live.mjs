import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { LocalWorkspace } from "../src/workspace/local-workspace.mjs";
import { cliPath } from "../src/workspace/launch.mjs";

// An explicitly seeded pre-limit checkpoint, not an export of a real Kimi chat.
// The destination is a real model, launched through the public continue command.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-checkpoint-live-"));
const room = path.join(directory, "room");
const workspace = new LocalWorkspace(room, { create: true });
workspace.join("original", "kimi", "Finish approved release copy");
const checkpoint = workspace.checkpoint("original", {
  goal: "Finish approved release copy",
  decisions: "The user approved the name Member Portal, not Customer Portal. Use US English.",
  constraints: "Only edit release.md. No deployment, commands that publish, or network requests. Do not change version.txt.",
  progress: "The first draft is in release.md; the previous model is no longer available.",
  files: "release.md, version.txt",
  next: "Read the files, fix the title and UK spelling in release.md using the approved decisions, and save a checkpoint. Do not ask the user to repeat the approved name.",
});
workspace.close();
fs.writeFileSync(path.join(directory, "release.md"), "# Customer Portal\n\nOrganise your favourite reports in one place.\n");
fs.writeFileSync(path.join(directory, "version.txt"), "1.0.0\n");
const child = spawn(process.execPath, [cliPath, "continue", "original", "--workspace", room, "--agent", "pi", "--name", "recovery", "--",
  "--print", "--mode", "json", "--provider", process.env.THREADMESH_LIVE_PI_PROVIDER || "zai", "--model", process.env.THREADMESH_LIVE_PI_MODEL || "glm-5.3",
  "--no-skills", "--no-context-files", "--no-extensions", "--no-prompt-templates", "--session-dir", path.join(directory, "sessions")],
{ cwd: directory, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
const chunks = [], errors = [];
child.stdout.on("data", chunk => chunks.push(chunk));
child.stderr.on("data", chunk => errors.push(chunk));
console.log(JSON.stringify({ artifacts: directory, seed: "explicit fixture checkpoint", destination: "real Pi model", command: "threadmesh continue" }));
const timeout = setTimeout(() => child.kill("SIGTERM"), 240000);
let report;
try {
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  assert.equal(code, 0, "destination must complete");
  const content = fs.readFileSync(path.join(directory, "release.md"), "utf8");
  assert.match(content, /Member Portal/);
  assert.match(content, /Organize/);
  assert.match(content, /favorite/);
  assert.doesNotMatch(content, /Customer Portal|Organise|favourite/);
  assert.equal(fs.readFileSync(path.join(directory, "version.txt"), "utf8"), "1.0.0\n");
  const check = new LocalWorkspace(room);
  try { assert.ok(check.checkpoint("recovery"), "destination saves recoverable progress"); }
  finally { check.close(); }
  report = { pass: true, source: "seeded Kimi-labelled checkpoint, no source model call", destination: "real Pi", expectedNamePreserved: true, spellingUpdated: true, protectedFileUnchanged: true,
    destinationCheckpointSaved: true, limitation: "This tests continuation from explicit saved context, not lossless migration or native quota detection." };
} catch (error) { report = { pass: false, error: error.message }; process.exitCode = 1; }
finally {
  clearTimeout(timeout);
  fs.writeFileSync(path.join(directory, "native-output.jsonl"), Buffer.concat(chunks), { mode: 0o600 });
  fs.writeFileSync(path.join(directory, "stderr.log"), Buffer.concat(errors), { mode: 0o600 });
  fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify({ ...report, checkpoint }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ...report, artifacts: directory }, null, 2));
}
