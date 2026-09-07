import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { probeEvent } from "../experiments/desktop/threadmesh-desktop-probe/scripts/probe.mjs";

const root = new URL("../experiments/desktop/threadmesh-desktop-probe/", import.meta.url);
const script = fileURLToPath(new URL("scripts/probe.mjs", root));
const fixture = (id, event = "SessionStart") => ({ session_id: id, hook_event_name: event });
const marker = (value) => value.hookSpecificOutput.additionalContext.match(/session=([0-9a-f]{16})/)[1];

test("desktop probe correlates native hook events, not a chosen workspace name", () => {
  const first = marker(probeEvent(fixture("fixture-native-a")));
  assert.equal(first, marker(probeEvent(fixture("fixture-native-a", "UserPromptSubmit"))));
  assert.notEqual(first, marker(probeEvent(fixture("fixture-native-b"))));
});

test("desktop probe discards private fields and raw native identity", () => {
  const result = JSON.stringify(probeEvent({ ...fixture("private-id"), prompt: "private-prompt",
    cwd: "/private-project", transcript_path: "/not-readable/transcript", api_key: "private-key" }));
  for (const value of ["private-id", "private-prompt", "private-project", "transcript", "private-key"]) {
    assert.ok(!result.includes(value));
  }
  assert.ok(result.includes("proves neither session authorization nor peer delivery"));
});

test("desktop probe rejects absent identities and non-checkpoint hooks", () => {
  for (const input of [null, {}, fixture(""), fixture(" "), fixture("x".repeat(257)),
    fixture("a", "Stop"), fixture("a", "PreToolUse")]) {
    assert.throws(() => probeEvent(input));
  }
});

test("packaged subprocess emits only the hook protocol and fails open", () => {
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: "utf8", timeout: 5000 });
  const ok = run(JSON.stringify(fixture("native-fixture")));
  assert.equal(ok.status, 0);
  assert.equal(ok.stderr, "");
  assert.equal(JSON.parse(ok.stdout).hookSpecificOutput.hookEventName, "SessionStart");
  for (const input of ["private-invalid-json", "x".repeat(1024 * 1024 + 1)]) {
    const result = run(input);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {});
    assert.ok(result.stderr.includes("probe unavailable"));
    assert.ok(!result.stderr.includes("private-invalid-json"));
  }
});

test("desktop manifests agree and only two non-blocking hooks are installed", () => {
  const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const codex = json(".codex-plugin/plugin.json");
  const zcode = json(".zcode-plugin/plugin.json");
  assert.equal(codex.name, zcode.name);
  assert.equal(codex.version, zcode.version);
  const mcp = json(".mcp.json");
  assert.deepEqual(Object.keys(mcp), ["mcpServers"]);
  assert.deepEqual(Object.keys(mcp.mcpServers), ["threadmesh-desktop-probe"]);
  assert.deepEqual(mcp.mcpServers["threadmesh-desktop-probe"], {
    command: "node", cwd: ".", args: ["scripts/mcp.mjs"],
  });
  assert.deepEqual(zcode.mcpServers["threadmesh-desktop-probe"], {
    command: "node", cwd: "${ZCODE_PLUGIN_ROOT}", args: ["${ZCODE_PLUGIN_ROOT}/scripts/mcp.mjs"],
  });
  const hooks = json("hooks/hooks.json").hooks;
  assert.deepEqual(Object.keys(hooks), ["SessionStart", "UserPromptSubmit"]);
  for (const definitions of Object.values(hooks)) {
    assert.equal(definitions[0].hooks[0].timeout, 5);
    assert.ok(definitions[0].hooks[0].command.includes('"${CLAUDE_PLUGIN_ROOT}/scripts/probe.mjs"'));
  }
});
