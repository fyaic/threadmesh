import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CodexLiveAgentRuntime,
  DeterministicLiveAgentRuntime,
  runLiveAgentScenario,
  verifyLiveAgentEvidence,
} from "../src/validation/live-agent-scenario.mjs";
import { createCodexPersistedTurnObservation } from "../src/state/codex-turn-reconciliation.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "ThreadMesh Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "ThreadMesh Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  }).trim();
}

function sourceRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-source-"));
  git(root, "init", "--quiet");
  fs.writeFileSync(path.join(root, "README.md"), "source\n");
  git(root, "add", "README.md");
  git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "source");
  return { root, sha: git(root, "rev-parse", "HEAD") };
}

test("dry-run proves the A-R-same-A-V runner contract without claiming product evidence", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-fixture-"));
  const runtime = new DeterministicLiveAgentRuntime();
  try {
    const result = await runLiveAgentScenario({
      mode: "dry-run",
      product: "fixture",
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      artifactsDirectory: artifacts,
      temporaryParent,
      runtime,
      scenarioId: "m52-dry-contract",
    });
    assert.equal(result.state, "passed");
    assert.equal(result.liveProductEvidence, false);
    assert.deepEqual(result.fixtureAssertions, {
      scriptedToolPlan: true,
      scriptedHandoff: true,
      humanRelayActions: 0,
      orchestratorPromptSubmissionsAfterReview: 1,
      integratedSqliteCoordinator: true,
    });
    assert.equal(result.coordinator.sameImplementerThread, true);
    assert.equal(result.coordinator.dependencyLockedBefore, true);
    assert.equal(result.coordinator.dependencySatisfiedAfter, true);
    assert.equal(result.coordinator.irrelevantAuthorizedTaskTurnCount, 0);
    assert.equal(result.chain.trustedComplete, true);
    assert.equal(result.chain.verificationMode, "deterministic-in-process-fixture-signing");
    assert.equal(result.chain.signedIndependentAttestation, false);
    assert.equal(result.chain.dependencyUnlocked, true);
    assert.equal(result.cleanup.complete, true);
    const aTurns = runtime.turns.filter(({ role }) => role === "a");
    assert.ok(aTurns.length >= 4);
    assert.ok(aTurns.every(({ ref }) => ref.threadId === aTurns[0].ref.threadId));
    assert.equal(runtime.turns.some(({ role }) => role === "irrelevant"), false);
    assert.equal(result.liveClosureGates.satisfied, false);
    assert.ok(result.liveClosureGates.pending.length >= 4);
    assert.doesNotMatch(
      result.liveClosureGates.pending.join("\n"), /signed verifier result journal/u,
    );
    const records = fs.readFileSync(path.join(artifacts, "private-trace.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse);
    assert.equal(verifyLiveAgentEvidence(records).valid, true);
    assert.equal(records.some((record) => record.type === "coordinator.attention.next-only-claimed"), true);
    assert.equal(records.some((record) => record.type === "coordinator.context.exact-task-admitted"), true);
    assert.equal(records.some((record) => record.type === "coordinator.attention.cursor-committed"), true);
    assert.equal(records.some((record) => record.type === "attention.dispatched"), false);
    assert.equal(fs.existsSync(path.join(artifacts, "cleanup-manifest.json")), true);
    const journalPath = path.join(artifacts, "m5-2-recovery-journal.json");
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
    const signature = journal.bundle.verification.response.attestation.proof.signature;
    const traceText = fs.readFileSync(path.join(artifacts, "private-trace.jsonl"), "utf8");
    const resultText = fs.readFileSync(path.join(artifacts, "result.json"), "utf8");
    const cleanupText = fs.readFileSync(path.join(artifacts, "cleanup-manifest.json"), "utf8");
    assert.equal(traceText.includes(signature), false);
    assert.equal(resultText.includes(signature), false);
    assert.equal(cleanupText.includes(signature), false);
    assert.equal(result.recovery.journal.containsSignedVerifierBundle, true);
    assert.equal(result.recovery.journal.projectedIntoTrace, false);
    for (const resource of result.cleanup.resources) {
      if (resource.path) {
        assert.equal(
          resource.present,
          fs.existsSync(path.join(artifacts, resource.path)),
        );
      } else {
        assert.equal(resource.present, false);
        assert.deepEqual(resource.paths, []);
      }
      assert.equal(typeof resource.expectedDisposition, "string");
      assert.equal(typeof resource.absenceChecked, "boolean");
    }
    assert.deepEqual(
      fs.readdirSync(artifacts).filter((name) => name.endsWith(".tmp")),
      [],
    );
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("Codex live is capability-preflight only until durable attention and trusted finalize gates close", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-codex-gate-"));
  let probes = 0;
  const runtime = {
    async probe() {
      probes += 1;
      return {
        userAgent: "codex-test/0.145.0",
        snapshotDigest: `sha256:${"c".repeat(64)}`,
      };
    },
    async createRole() {
      throw new Error("must not create a role while live gate is closed");
    },
  };
  try {
    const result = await runLiveAgentScenario({
      mode: "live",
      product: "codex",
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      artifactsDirectory: artifacts,
      runtime,
      command: "/fake/codex",
      ack: "maintainer-approved-threadmesh-live-agent-scenario",
      scenarioId: "m52-live-gated",
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.code, "threadmesh_codex_live_attention_glue_not_closed");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(result.cleanup.threadsCreated, 0);
    assert.equal(probes, 1);
    assert.equal(fs.existsSync(path.join(artifacts, "result.json")), true);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});

function postStartFailureAdapter({ terminalStatus = "interrupted" } = {}) {
  const snapshotDigest = `sha256:${"d".repeat(64)}`;
  const state = {
    observations: 0,
    nativeStarts: 0,
    toolEffects: 0,
    clientUserMessageId: null,
  };
  return {
    state,
    snapshotDigest,
    async createDynamicToolThread() {
      return {
        kind: "codex-app-server",
        threadId: "thread-live-canary",
        snapshotDigest,
        userAgent: "codex-test/0.145.0",
      };
    },
    async observePersistedTurns() {
      state.observations += 1;
      const turns = state.observations === 1 ? [] : [{
        id: "turn-killed-canary",
        status: terminalStatus,
        items: [{ type: "userMessage", clientId: state.clientUserMessageId }],
      }];
      return createCodexPersistedTurnObservation({
        threadId: "thread-live-canary",
        snapshotDigest,
        threadStatus: state.observations === 1 ? "idle" : "notLoaded",
        readTurns: turns,
        listedTurns: turns,
      });
    },
    async runAutonomousToolTurn(options) {
      state.nativeStarts += 1;
      state.clientUserMessageId = options.adapterIdempotencyKey;
      await options.beforeTurnStart({
        threadId: options.adapterRef.threadId,
        snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      throw Object.assign(new Error("deterministic post-start transport failure"), {
        code: "codex_app_server_exited",
      });
    },
    async runAcceptedSuggestion(options) {
      return { delivered: true, options };
    },
  };
}

const CANARY_TOOLS = [{
  type: "function",
  name: "threadmesh_publish_artifact",
  description: "Publish one bounded artifact.",
  inputSchema: { type: "object", additionalProperties: false },
}];

test("post-start failure injection journals before turn/start, reconciles terminal, and never retries or effects", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-post-start-failure-"));
  const filename = path.join(directory, "turn-journal.json");
  const adapter = postStartFailureAdapter();
  const runtime = new CodexLiveAgentRuntime({
    command: "/fake/codex",
    adapter,
    env: { HOME: "/private/home", OPENAI_API_KEY: "must-not-enter-journal" },
  });
  let unknown = 0;
  let terminal = 0;
  try {
    const ref = await runtime.createRole({
      role: "a",
      cwd: "/private/fixture",
      tools: CANARY_TOOLS,
      instructions: "Use only the bounded ThreadMesh tool.",
      scenarioId: "m52-live-post-start-failure",
    });
    await assert.rejects(
      () => runtime.runTurn({
        role: "a",
        phase: "implementation",
        cwd: "/private/fixture",
        ref,
        prompt: "Choose whether to publish the candidate.",
        onToolCall: async () => {
          adapter.state.toolEffects += 1;
          return { published: true };
        },
        beforeToolCall: async () => {},
        afterToolCall: async () => {},
        scenarioId: "m52-live-post-start-failure",
        turnRecovery: {
          filename,
          executionId: "execution-live-post-start-failure",
          async onOutcomeUnknown({ baseline }) {
            unknown += 1;
            assert.equal(fs.existsSync(filename), true);
            assert.equal(baseline.turns.length, 0);
          },
          async onTerminalReconciliation({ baseline, observation }) {
            terminal += 1;
            assert.equal(baseline.turns.length, 0);
            assert.equal(observation.turns[0].status, "interrupted");
          },
        },
      }),
      (error) => {
        assert.equal(error.code, "threadmesh_codex_live_turn_terminal_reconciled");
        assert.deepEqual(error.recovery, {
          state: "found-terminal",
          turnStatus: "interrupted",
          journal: {
            recordDigest: error.recovery.journal.recordDigest,
            baselineDigest: error.recovery.journal.baselineDigest,
            observationDigest: error.recovery.journal.observationDigest,
            baselineTurnCount: 0,
            resourceCount: 1,
            replay: false,
          },
        });
        assert.equal(JSON.stringify(error.recovery).includes("thread-live-canary"), false);
        assert.equal(JSON.stringify(error.recovery).includes("turn-killed-canary"), false);
        return true;
      },
    );
    assert.equal(adapter.state.nativeStarts, 1);
    assert.equal(adapter.state.observations, 2);
    assert.equal(adapter.state.toolEffects, 0);
    assert.equal(unknown, 1);
    assert.equal(terminal, 1);
    const privateJournal = fs.readFileSync(filename, "utf8");
    assert.equal(privateJournal.includes("must-not-enter-journal"), false);
    assert.equal(privateJournal.includes("/private/home"), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("completed unknown remains ambiguous and cannot invoke terminal reconciliation", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-completed-unknown-"));
  const adapter = postStartFailureAdapter({ terminalStatus: "completed" });
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  let terminal = 0;
  try {
    const ref = await runtime.createRole({
      role: "a", cwd: "/private/fixture", tools: CANARY_TOOLS,
      instructions: "Use only the bounded ThreadMesh tool.", scenarioId: "m52-completed",
    });
    await assert.rejects(
      () => runtime.runTurn({
        role: "a", phase: "implementation", cwd: "/private/fixture", ref,
        prompt: "Choose whether to publish the candidate.",
        onToolCall: async () => ({ published: true }),
        scenarioId: "m52-completed",
        turnRecovery: {
          filename: path.join(directory, "turn-journal.json"),
          executionId: "execution-completed-unknown",
          async onOutcomeUnknown() {},
          async onTerminalReconciliation() { terminal += 1; },
        },
      }),
      (error) => error?.code === "threadmesh_codex_live_turn_reconciliation_ambiguous" &&
        error?.recovery?.reasonCode === "codex-native-turn-completed-observation-only",
    );
    assert.equal(adapter.state.nativeStarts, 1);
    assert.equal(adapter.state.toolEffects, 0);
    assert.equal(terminal, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Codex live runtime forwards durable start callbacks and blocks unreconciled admission", async (t) => {
  const recoveryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-callbacks-"));
  t.after(() => fs.rmSync(recoveryDirectory, { recursive: true, force: true }));
  const snapshotDigest = `sha256:${"e".repeat(64)}`;
  const calls = [];
  const adapter = {
    turnOptions: null,
    async createDynamicToolThread() {
      return {
        kind: "codex-app-server", threadId: "thread-callbacks",
        snapshotDigest, userAgent: "codex-test/0.145.0",
      };
    },
    async observePersistedTurns() {
      return createCodexPersistedTurnObservation({
        threadId: "thread-callbacks", snapshotDigest, threadStatus: "idle",
        readTurns: [], listedTurns: [],
      });
    },
    async runAutonomousToolTurn(options) {
      this.turnOptions = options;
      calls.push(["adapter.before", options.adapterIdempotencyKey]);
      await options.beforeTurnStart({
        threadId: "thread-callbacks", snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      await options.onTurnStarted({
        threadId: "thread-callbacks", turnId: "turn-callbacks", snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      return {
        state: "completed", text: "done", truncated: false,
        evidence: { turnId: "turn-callbacks", turnStatus: "completed" },
        toolCalls: [], nonThreadMeshToolCalls: 0,
      };
    },
    async runAcceptedSuggestion(options) {
      calls.push(["admission", options]);
      return { state: "completed", evidence: { turnId: "turn-admission" } };
    },
  };
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  const phaseTool = {
    type: "function",
    name: "threadmesh_report_review_finding",
    description: "Report one bounded finding.",
    inputSchema: { type: "object", additionalProperties: false },
  };
  const ref = await runtime.createRole({
    role: "r", cwd: "/private/reviewer", tools: CANARY_TOOLS,
    phaseTools: { review: [phaseTool] },
    instructions: "Use only bounded tools.", scenarioId: "m52-callbacks",
  });
  const turn = await runtime.runTurn({
    role: "r", phase: "review", cwd: "/private/reviewer", ref,
    prompt: "Review the accepted candidate.", onToolCall: async () => ({}),
    beforeTurnStart: async () => calls.push(["coordinator.started"]),
    onTurnStarted: async ({ turnId }) => calls.push(["coordinator.bound", turnId]),
    scenarioId: "m52-callbacks",
    allowedToolNames: ["threadmesh_report_review_finding"],
    turnRecovery: {
      filename: path.join(recoveryDirectory, "turn-journal.json"),
      executionId: "execution-callbacks",
      async onOutcomeUnknown() {},
      async onTerminalReconciliation() {},
    },
  });
  assert.equal(turn.evidence.turnId, "turn-callbacks");
  assert.deepEqual(calls.slice(0, 3).map(([name]) => name), [
    "adapter.before", "coordinator.started", "coordinator.bound",
  ]);
  assert.deepEqual(
    adapter.turnOptions.dynamicTools.map(({ name }) => name),
    ["threadmesh_report_review_finding"],
  );
  await assert.rejects(
    () => runtime.runTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref,
      prompt: "Review.", onToolCall: async () => ({}), scenarioId: "m52-callbacks",
      allowedToolNames: ["threadmesh_publish_artifact"],
    }),
    { code: "threadmesh_live_phase_tool_allowlist_invalid" },
  );
  await assert.rejects(
    () => runtime.runTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref,
      prompt: "Review.", onToolCall: async () => ({}), scenarioId: "m52-callbacks",
      allowedToolNames: ["threadmesh_report_review_finding"],
    }),
    { code: "threadmesh_live_turn_recovery_required" },
  );
  const prepared = {
    adapterRef: ref,
    envelope: {
      messageId: "msg-review", target: { incarnationId: "inc-r" }, intent: "suggest",
    },
    admission: { decision: "accepted", receiverIncarnationId: "inc-r", revision: 1 },
  };
  await assert.rejects(
    () => runtime.deliverContext({
      role: "r", ref, prepared, cwd: "/private/reviewer", scenarioId: "m52-callbacks",
    }),
    { code: "threadmesh_live_context_recovery_required" },
  );
  assert.equal(calls.some(([name]) => name === "admission"), false);
});

test("Codex live role cleanup is absence-first, replay-safe, and digest-only", async () => {
  for (const observations of [[true], [false, true], [false, false]]) {
    const calls = [];
    const adapter = {
      async deleteThread(options) {
        calls.push(["delete", options.threadId]);
        return { threadId: options.threadId, deleted: true, snapshotDigest: `sha256:${"f".repeat(64)}` };
      },
      async confirmThreadAbsent(options) {
        calls.push(["confirm", options.threadId]);
        return {
          absent: observations.shift(), checkedBy: "thread/read",
          snapshotDigest: `sha256:${"f".repeat(64)}`,
        };
      },
    };
    const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
    runtime.roles.set("a", {
      ref: {
        kind: "codex-app-server", threadId: "thread-cleanup",
        snapshotDigest: `sha256:${"f".repeat(64)}`,
      },
    });
    const operation = () => runtime.deleteRole({
      role: "a",
      ref: {
        kind: "codex-app-server", threadId: "thread-cleanup",
        snapshotDigest: `sha256:${"f".repeat(64)}`,
      },
      cwd: "/private/fixture",
    });
    const startedAbsent = observations.length === 1;
    const becomesAbsent = observations.length === 2 && observations[1] === true;
    if (startedAbsent || becomesAbsent) {
      const result = await operation();
      assert.equal(result.deleted, true);
      assert.equal(result.absenceVerified, true);
      assert.equal(result.checkedBy, "thread/read");
      assert.equal(JSON.stringify(result).includes("thread-cleanup"), false);
    } else {
      await assert.rejects(operation, { code: "threadmesh_live_role_cleanup_unconfirmed" });
    }
    assert.deepEqual(
      calls.map(([kind]) => kind),
      startedAbsent ? ["confirm"] : ["confirm", "delete", "confirm"],
    );
  }
});

test("Codex live role cleanup rejects wrong role or ref before adapter access", async () => {
  let calls = 0;
  const ref = {
    kind: "codex-app-server", threadId: "thread-owned",
    snapshotDigest: `sha256:${"a".repeat(64)}`,
  };
  const runtime = new CodexLiveAgentRuntime({
    command: "/fake/codex",
    adapter: {
      async confirmThreadAbsent() { calls += 1; },
      async deleteThread() { calls += 1; },
    },
  });
  runtime.roles.set("a", { ref });
  for (const [role, candidate] of [
    ["r", ref],
    ["a", { ...ref, threadId: "thread-other" }],
    ["a", { ...ref, snapshotDigest: `sha256:${"b".repeat(64)}` }],
  ]) {
    await assert.rejects(
      () => runtime.deleteRole({ role, ref: candidate, cwd: "/private/fixture" }),
      { code: "threadmesh_live_scenario_role_ref_mismatch" },
    );
  }
  assert.equal(calls, 0);
});

test("Codex live role rejects a five-tool union before creating a product thread", async () => {
  let created = 0;
  const runtime = new CodexLiveAgentRuntime({
    command: "/fake/codex",
    adapter: {
      async createDynamicToolThread() { created += 1; },
    },
  });
  const tools = Array.from({ length: 5 }, (_, index) => ({
    type: "function",
    name: `threadmesh_tool_${index}`,
    description: `Bounded tool ${index}.`,
    inputSchema: { type: "object", additionalProperties: false },
  }));
  await assert.rejects(
    () => runtime.createRole({
      role: "a", cwd: "/private/fixture", tools: tools.slice(0, 3),
      phaseTools: { fix: tools.slice(3) }, instructions: "Use bounded tools.",
      scenarioId: "m52-five-tools",
    }),
    { code: "threadmesh_live_role_tool_budget_exceeded" },
  );
  assert.equal(created, 0);
});

test("evidence verifier rejects a modified record", () => {
  const body = {
    schemaVersion: 1,
    sequence: 1,
    previousDigest: null,
    scenarioId: "x",
    evidenceClass: "deterministic-fixture",
    product: "fixture",
    type: "scenario.started",
    detail: {},
  };
  const records = [{ ...body, recordDigest: "sha256:" + "0".repeat(64) }];
  assert.equal(verifyLiveAgentEvidence(records).valid, false);
});

test("live execution requires explicit acknowledgement before any runtime action", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-ack-"));
  try {
    await assert.rejects(
      () => runLiveAgentScenario({
        mode: "live",
        product: "codex",
        sourceRoot: source.root,
        validatedBaseSha: source.sha,
        artifactsDirectory: artifacts,
        runtime: new DeterministicLiveAgentRuntime(),
      }),
      { code: "threadmesh_live_scenario_ack_required" },
    );
    assert.deepEqual(fs.readdirSync(artifacts), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});

test("dry-run refuses a product label so fixture output cannot impersonate Codex or Kimi", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-label-"));
  try {
    await assert.rejects(
      () => runLiveAgentScenario({
        mode: "dry-run",
        product: "kimi",
        sourceRoot: source.root,
        validatedBaseSha: source.sha,
        artifactsDirectory: artifacts,
      }),
      { code: "threadmesh_live_scenario_dry_run_product_invalid" },
    );
    assert.deepEqual(fs.readdirSync(artifacts), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});
