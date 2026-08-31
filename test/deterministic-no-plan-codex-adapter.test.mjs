import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DeterministicNoPlanCodexAdapter,
} from "../src/validation/deterministic-no-plan-codex-adapter.mjs";
import { CodexLiveAgentRuntime } from "../src/validation/live-agent-scenario.mjs";

const TOOLS = Object.freeze([
  Object.freeze({
    type: "function",
    name: "threadmesh_record_relevant",
    description: "Record a relevant dependent-task action.",
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: Object.freeze(["case"]),
      properties: Object.freeze({ case: Object.freeze({ type: "string" }) }),
    }),
  }),
  Object.freeze({
    type: "function",
    name: "threadmesh_record_control",
    description: "Record the independent control action.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  }),
]);

function recovery(directory, phase) {
  return {
    filename: path.join(directory, `${phase}.turn.json`),
    executionId: `execution-${phase}`,
    async onOutcomeUnknown() {
      assert.fail("deterministic completed turns cannot have unknown outcomes");
    },
    async onTerminalReconciliation() {
      assert.fail("deterministic completed turns cannot need reconciliation");
    },
  };
}

test("Codex live runtime uses one persistent no-plan ref for relevant/control/irrelevant turns", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-no-plan-adapter-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const policyInputs = [];
  const adapter = new DeterministicNoPlanCodexAdapter({
    decideTurn(canonicalInput) {
      assert.equal(this, undefined);
      assert.equal(arguments.length, 1);
      assert.equal(typeof canonicalInput, "string");
      const input = JSON.parse(canonicalInput);
      assert.deepEqual(Object.keys(input).sort(), ["dynamicTools", "prompt"]);
      assert.deepEqual(
        input.dynamicTools.map(({ name }) => name),
        ["threadmesh_record_relevant", "threadmesh_record_control"],
      );
      policyInputs.push(input);
      if (input.prompt === "Relevant dependency is ready.") {
        return {
          text: "Relevant action selected.",
          toolCalls: [{
            tool: "threadmesh_record_relevant",
            arguments: { case: "dependency" },
          }],
        };
      }
      if (input.prompt === "Independent control checkpoint.") {
        return {
          text: "Control action selected.",
          toolCalls: [{ tool: "threadmesh_record_control", arguments: {} }],
        };
      }
      return { text: "No relevant action.", toolCalls: [] };
    },
  });
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  const ref = await runtime.createRole({
    role: "receiver",
    cwd: directory,
    tools: TOOLS,
    instructions: "Choose tools from the current prompt without an external plan.",
    scenarioId: "no-plan-three-cases",
  });
  const effects = [];
  const run = (phase, prompt) => runtime.runTurn({
    role: "receiver",
    phase,
    cwd: directory,
    ref,
    prompt,
    onToolCall: async ({ tool, arguments: args }) => {
      effects.push({ phase, tool, arguments: args });
      return { recorded: true };
    },
    scenarioId: "no-plan-three-cases",
    turnRecovery: recovery(directory, phase),
  });

  const relevant = await run("relevant", "Relevant dependency is ready.");
  const control = await run("control", "Independent control checkpoint.");
  const irrelevant = await run("irrelevant", "Unrelated task update.");

  assert.equal(relevant.evidence.threadId, ref.threadId);
  assert.equal(control.evidence.threadId, ref.threadId);
  assert.equal(irrelevant.evidence.threadId, ref.threadId);
  assert.equal(relevant.toolCalls.length, 1);
  assert.equal(control.toolCalls.length, 1);
  assert.equal(irrelevant.toolCalls.length, 0);
  assert.deepEqual(effects, [
    {
      phase: "relevant",
      tool: "threadmesh_record_relevant",
      arguments: { case: "dependency" },
    },
    { phase: "control", tool: "threadmesh_record_control", arguments: {} },
  ]);
  assert.equal(policyInputs.length, 3);

  const observation = await adapter.observePersistedTurns({
    command: "/fake/codex",
    args: [],
    cwd: directory,
    env: {},
    threadId: ref.threadId,
    expectedSnapshotDigest: ref.snapshotDigest,
    includeItemsList: false,
  });
  assert.equal(observation.turns.length, 3);
  assert.deepEqual(observation.turns.map(({ status }) => status), [
    "completed", "completed", "completed",
  ]);
  assert.equal(new Set(observation.turns.map(({ turnId }) => turnId)).size, 3);

  for (const invocation of adapter.invocations) {
    assert.equal(Object.hasOwn(invocation, "plan"), false);
    assert.equal(Object.hasOwn(invocation, "deliverContext"), false);
    assert.equal(Object.hasOwn(invocation, "phasePrompt"), false);
    assert.equal(Object.hasOwn(invocation, "runnerPhasePrompts"), false);
  }
  await assert.rejects(
    () => adapter.runAutonomousToolTurn({ plan: [] }),
    { code: "threadmesh_deterministic_adapter_plan_surface_forbidden" },
  );

  const cleanup = await runtime.deleteRole({ role: "receiver", ref, cwd: directory });
  assert.equal(cleanup.deleted, true);
  assert.equal(cleanup.absenceVerified, true);
  assert.equal((await adapter.confirmThreadAbsent({
    command: "/fake/codex", args: [], cwd: directory, env: {}, threadId: ref.threadId,
  })).absent, true);
});

test("no-plan adapter rejects unregistered tools and registered definition drift", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-no-plan-tools-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const adapter = new DeterministicNoPlanCodexAdapter();
  const ref = await adapter.createDynamicToolThread({
    command: "/fake/codex",
    args: [],
    cwd: directory,
    env: {},
    dynamicTools: [TOOLS[0]],
    developerInstructions: "Use only registered tools.",
    bootstrapMarker: "THREADMESH_READY",
    adapterIdempotencyKey: "idem_registered_tools",
  });
  const base = {
    command: "/fake/codex",
    args: [],
    cwd: directory,
    env: {},
    adapterRef: ref,
    prompt: "Current prompt.",
    adapterIdempotencyKey: "idem_registered_tools_turn",
    onToolCall: async () => ({ recorded: true }),
  };
  await assert.rejects(
    () => adapter.runAutonomousToolTurn({ ...base, dynamicTools: [TOOLS[1]] }),
    { code: "threadmesh_deterministic_adapter_registered_tool_mismatch" },
  );
  await assert.rejects(
    () => adapter.runAutonomousToolTurn({
      ...base,
      dynamicTools: [{ ...TOOLS[0], description: "Drifted definition." }],
    }),
    { code: "threadmesh_deterministic_adapter_registered_tool_mismatch" },
  );
  assert.equal(adapter.threads.get(ref.threadId).turns.length, 0);
});
