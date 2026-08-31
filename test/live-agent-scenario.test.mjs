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
import { sha256Digest } from "../src/canonical-json.mjs";
import { renderRegisteredPeerContext } from "../src/rendering/context-admission.mjs";
import { createCodexPersistedTurnObservation } from "../src/state/codex-turn-reconciliation.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";

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

function passedLiveCoreResult(scenarioId = "m52-live-gated") {
  const identity = (character) => `sha256:${character.repeat(64)}`;
  return {
    schemaVersion: 1,
    scenarioId,
    state: "passed",
    product: "codex",
    evidenceClass: "real-codex-integrated-gate",
    liveProductEvidence: true,
    claim: "real-codex-a-r-same-a-v-integrated-gate",
    counts: {
      rolesCreated: 5,
      modelTurnsStarted: 12,
      modelTurnsCompleted: 12,
      toolEffectsCommitted: 8,
      receiverDecisionTurnsCompleted: 4,
      contextAdmissionReceipts: 4,
    },
    chain: {
      implementationSha: "a".repeat(40),
      fixSha: "b".repeat(40),
      directDescendant: true,
      verified: true,
      dependencyUnlocked: true,
      verificationMode: "independent-service-signed",
      attestationDigest: identity("c"),
    },
    initiative: {
      reviewTriggeredByLifecycle: true,
      fixTriggeredByAdmittedContext: true,
      verificationTriggeredByLifecycle: true,
      sameAResumed: true,
      humanRelayActions: 0,
      orchestratorPromptSubmissionsAfterReview: 0,
      pollingWakeups: 0,
      scriptedPromptSubmissions: 0,
    },
    identityDigests: {
      implementerThreadDigest: identity("d"),
      resumedImplementerThreadDigest: identity("d"),
      reviewerThreadDigest: identity("e"),
      verifierThreadDigest: identity("f"),
      dependentThreadDigest: identity("1"),
      irrelevantThreadDigest: identity("2"),
    },
    recovery: {
      status: "complete",
      restartCheckpointsPassed: 5,
      replayChecksPassed: 5,
      outcomeUnknownReconciliations: 1,
      processKillCanaryDigest: identity("3"),
    },
    controls: {
      dependencyLockedBefore: true,
      dependencySatisfiedAfter: true,
      irrelevantAuthorized: true,
      irrelevantSkipped: true,
      irrelevantModelTurns: 0,
      receiverOwnedDecisions: true,
      exactAdmissionReceiptsBound: true,
    },
    cleanup: {
      attempted: true,
      complete: true,
      threadsCreated: 5,
      threadsDeleted: 5,
      absenceChecksPassed: 5,
      temporaryResourcesRemoved: true,
      unexpectedArtifacts: 0,
      verifierServiceExited: true,
      verifierKeyMaterialRemoved: true,
      gitResourcesRemoved: true,
      sqliteSidecarsAbsent: true,
      journalsRetired: true,
      temporaryFilesAbsent: true,
    },
  };
}

function blockedCanaryCoreResult(scenarioId = "m52-live-canary") {
  const identity = (character) => `sha256:${character.repeat(64)}`;
  return {
    schemaVersion: 1,
    scenarioId,
    state: "blocked",
    code: "threadmesh_m52_live_codex_integrated_gate_incomplete",
    product: "codex",
    evidenceClass: "real-codex-product-canary",
    liveProductEvidence: false,
    claim: "real_product_model_tool_canary",
    counts: {
      rolesPrecreated: 5,
      postBootstrapTurns: 4,
      modelSelectedToolCalls: 8,
      commits: 2,
      verifierRequests: 1,
    },
    chain: {
      validatedBaseSha: "a".repeat(40),
      fixtureSeedSha: "b".repeat(40),
      implementationSha: "c".repeat(40),
      fixSha: "d".repeat(40),
      directDescendant: true,
      verified: true,
      unlocked: false,
    },
    initiative: {
      aPublishedArtifact: true,
      rReportedFinding: true,
      sameAFixed: true,
      vRequestedVerification: true,
      humanRelayActions: 0,
      phasePromptsSubmittedByRunner: 4,
      lifecycleHandoffsByThreadMesh: false,
    },
    identityDigests: {
      implementerThread: identity("1"),
      resumedImplementerThread: identity("1"),
      reviewerThread: identity("2"),
      verifierThread: identity("3"),
      dependentThread: identity("4"),
      irrelevantThread: identity("5"),
    },
    recovery: {
      businessTurnJournalsRetired: 0,
      admissionJournalsRetired: 0,
      reconciledWithoutResend: false,
      duplicateNativeTurnsPrevented: false,
    },
    controls: {
      sameARef: true,
      sameAWorktree: true,
      dependentUnlocked: false,
      dependentPostBootstrapTurns: 0,
      irrelevantPostBootstrapTurns: 0,
      allRolesDeleted: true,
      fixtureRemoved: true,
      cleanupComplete: true,
    },
    cleanup: {
      attempted: true,
      complete: true,
      threadsCreated: 5,
      threadsDeleted: 5,
      absenceChecksPassed: 5,
      fixtureRemoved: true,
    },
    missingGates: [
      "coordinator-attention-routing",
      "receiver-owned-decisions",
      "context-admission-receipts",
      "durable-recovery-checkpoints",
      "independent-verifier-attestation",
      "dependency-finalization",
    ],
  };
}

test("dry-run proves the A-R-same-A-V runner contract without claiming product evidence", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-fixture-"));
  const runtime = new DeterministicLiveAgentRuntime();
  let liveGates = 0;
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
      liveCodexGate: async () => { liveGates += 1; },
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
    assert.equal(liveGates, 0);
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

test("Codex live routes an acknowledged run through the integrated gate after a non-success probe", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-codex-gate-"));
  let probes = 0;
  let gates = 0;
  const runtime = {
    async probe() {
      probes += 1;
      return {
        userAgent: "codex-test/0.145.0",
        snapshotDigest: `sha256:${"c".repeat(64)}`,
      };
    },
    async createRole() {
      throw new Error("the injected gate owns product execution");
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
      liveCodexGate: async (options) => {
        gates += 1;
        assert.equal(options.runtime, runtime);
        assert.equal(options.sourceRoot, source.root);
        assert.equal(options.validatedBaseSha, source.sha);
        assert.equal(options.artifactsDirectory, artifacts);
        assert.equal(options.scenarioId, "m52-live-gated");
        options.record("live-gate.completed", {
          resultDigest: `sha256:${"d".repeat(64)}`,
        });
        return passedLiveCoreResult();
      },
    });
    assert.equal(result.state, "passed");
    assert.equal(result.evidenceClass, "real-codex-integrated-gate");
    assert.equal(result.liveProductEvidence, true);
    assert.equal(result.cleanup.complete, true);
    assert.equal(result.initiative.sameAResumed, true);
    assert.match(result.chain.attestationDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(probes, 1);
    assert.equal(gates, 1);
    assert.equal(fs.existsSync(path.join(artifacts, "result.json")), true);
    const records = fs.readFileSync(path.join(artifacts, "private-trace.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse);
    const probeIndex = records.findIndex(({ type }) => type === "harness.capability-probe");
    const gateIndex = records.findIndex(({ type }) => type === "live-gate.completed");
    assert.ok(probeIndex >= 0 && gateIndex > probeIndex);
    assert.equal(records[0].type, "scenario.started");
    assert.equal(records[0].detail.dependencyUnlockInScope, true);
    assert.equal(records[probeIndex].detail.provesIntegratedGate, false);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});

test("Codex live requires the exact ACK before probing or resolving the gate", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-ack-"));
  let touched = 0;
  try {
    await assert.rejects(
      runLiveAgentScenario({
        mode: "live", product: "codex", sourceRoot: source.root,
        validatedBaseSha: source.sha, artifactsDirectory: artifacts,
        command: "/fake/codex", ack: "wrong", scenarioId: "m52-ack-rejected",
        runtime: { async probe() { touched += 1; } },
        liveCodexGate: async () => { touched += 1; },
      }),
      { code: "threadmesh_live_scenario_ack_required" },
    );
    assert.equal(touched, 0);
    assert.deepEqual(fs.readdirSync(artifacts), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});

test("completed real Codex canary remains blocked and names every missing closure gate", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-scenario-canary-"));
  try {
    const result = await runLiveAgentScenario({
      mode: "live", product: "codex", sourceRoot: source.root,
      validatedBaseSha: source.sha, artifactsDirectory: artifacts,
      command: "/fake/codex", ack: "maintainer-approved-threadmesh-live-agent-scenario",
      scenarioId: "m52-live-canary",
      runtime: { async probe() { return { userAgent: "codex-test", snapshotDigest: `sha256:${"a".repeat(64)}` }; } },
      liveCodexGate: async () => blockedCanaryCoreResult(),
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.evidenceClass, "real-codex-product-canary");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(result.initiative.phasePromptsSubmittedByRunner, 4);
    assert.equal(result.initiative.lifecycleHandoffsByThreadMesh, false);
    assert.equal(result.missingGates.length, 6);
    assert.equal(JSON.parse(fs.readFileSync(path.join(artifacts, "result.json"))).state, "blocked");
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
  }
});

test("Codex canary cannot self-assert pass and failed attempts remain failed with artifacts", async () => {
  const source = sourceRepository();
  const invalidArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-invalid-"));
  const identityArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-identity-"));
  const failedArtifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-failed-"));
  const options = {
    mode: "live", product: "codex", sourceRoot: source.root,
    validatedBaseSha: source.sha, command: "/fake/codex",
    ack: "maintainer-approved-threadmesh-live-agent-scenario",
    runtime: { async probe() { return { userAgent: "codex-test", snapshotDigest: `sha256:${"a".repeat(64)}` }; } },
  };
  try {
    await assert.rejects(
      runLiveAgentScenario({
        ...options, artifactsDirectory: invalidArtifacts, scenarioId: "m52-canary-self-pass",
        liveCodexGate: async () => ({
          ...blockedCanaryCoreResult("m52-canary-self-pass"),
          state: "passed", liveProductEvidence: true,
        }),
      }),
      { code: "threadmesh_live_codex_gate_result_invalid" },
    );
    const missingIdentity = blockedCanaryCoreResult("m52-canary-missing-identity");
    missingIdentity.identityDigests.reviewerThread = null;
    missingIdentity.chain.fixSha = null;
    await assert.rejects(
      runLiveAgentScenario({
        ...options, artifactsDirectory: identityArtifacts,
        scenarioId: "m52-canary-missing-identity",
        liveCodexGate: async () => missingIdentity,
      }),
      { code: "threadmesh_live_codex_gate_result_invalid" },
    );
    const failed = blockedCanaryCoreResult("m52-canary-failed");
    failed.state = "failed";
    failed.code = "threadmesh_live_canary_model_failed";
    failed.counts.postBootstrapTurns = 1;
    failed.chain.implementationSha = null;
    failed.chain.fixSha = null;
    failed.identityDigests.reviewerThread = null;
    failed.identityDigests.verifierThread = null;
    failed.identityDigests.dependentThread = null;
    failed.identityDigests.irrelevantThread = null;
    failed.cleanup.complete = false;
    failed.cleanup.threadsDeleted = 4;
    failed.cleanup.absenceChecksPassed = 4;
    failed.controls.allRolesDeleted = false;
    failed.controls.cleanupComplete = false;
    const result = await runLiveAgentScenario({
      ...options, artifactsDirectory: failedArtifacts, scenarioId: "m52-canary-failed",
      liveCodexGate: async () => failed,
    });
    assert.equal(result.state, "failed");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(fs.existsSync(path.join(failedArtifacts, "result.json")), true);
    assert.equal(fs.existsSync(path.join(failedArtifacts, "cleanup-manifest.json")), true);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(invalidArtifacts, { recursive: true, force: true });
    fs.rmSync(identityArtifacts, { recursive: true, force: true });
    fs.rmSync(failedArtifacts, { recursive: true, force: true });
  }
});

test("Codex live public projection rejects unknown and raw-bearing fields", async () => {
  const source = sourceRepository();
  const cases = [
    ["unknown-uuid", (result) => { result.metadata = "a6c46695-e8da-4d98-90c6-a76d5490b0aa"; }],
    ["raw-thread", (result) => { result.detail = "thread-secret-value"; }],
    ["nested", (result) => { result.counts.prompt = "/private/raw prompt"; }],
    ["path", (result) => { result.cleanup.path = "/private/raw"; }],
  ];
  try {
    for (const [name, mutate] of cases) {
      const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), `threadmesh-live-leak-${name}-`));
      const scenarioId = `m52-leak-${name}`;
      const core = passedLiveCoreResult(scenarioId);
      mutate(core);
      await assert.rejects(
        runLiveAgentScenario({
          mode: "live", product: "codex", sourceRoot: source.root,
          validatedBaseSha: source.sha, artifactsDirectory: artifacts,
          command: "/fake/codex", ack: "maintainer-approved-threadmesh-live-agent-scenario",
          scenarioId,
          runtime: { async probe() { return { userAgent: "codex-test", snapshotDigest: `sha256:${"a".repeat(64)}` }; } },
          liveCodexGate: async () => core,
        }),
        { code: "threadmesh_live_codex_gate_result_invalid" },
        name,
      );
      assert.equal(fs.existsSync(path.join(artifacts, "result.json")), false);
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
    await assert.rejects(
      runLiveAgentScenario({
        mode: "live", product: "codex", sourceRoot: source.root,
        validatedBaseSha: source.sha,
        artifactsDirectory: fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-id-")),
        command: "/fake/codex", ack: "maintainer-approved-threadmesh-live-agent-scenario",
        scenarioId: "/private/raw prompt and key",
      }),
      { code: "threadmesh_live_scenario_id_invalid" },
    );
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
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

function contextPrepared(ref, overrides = {}) {
  const envelope = {
    specVersion: "0.0-draft",
    messageId: "msg-context-recovery",
    relationshipId: "rel-context-recovery",
    sender: {
      taskId: "task-a", incarnationId: "inc-a", actorType: "agent",
    },
    target: { taskId: "task-r", incarnationId: "inc-r" },
    intent: "suggest",
    reason: "Independent review found a relevant constraint.",
    content: "Use the exact reviewed constraint as advisory context.",
    claimStatus: "unverified",
    delivery: { requestedMode: "checkpoint-offer" },
    createdAt: "2026-09-01T09:00:00.000Z",
  };
  const admission = {
    decision: "accepted", receiverIncarnationId: "inc-r", revision: 1,
  };
  return {
    admissionToken: "admission-token-context-recovery",
    adapterRef: ref,
    envelope,
    admission,
    revision: 1,
    rendering: renderRegisteredPeerContext(envelope),
    ...overrides,
  };
}

function contextRecoveryAdapter({ outcome = "success", terminalStatus = "interrupted" } = {}) {
  const snapshotDigest = `sha256:${"7".repeat(64)}`;
  const state = {
    observations: 0,
    nativeStarts: 0,
    callbackOrder: [],
    adapterIdempotencyKey: null,
    preparedRendering: null,
  };
  const ref = {
    kind: "codex-app-server",
    threadId: "thread-context-recovery",
    snapshotDigest,
    userAgent: "codex-test/0.145.0",
  };
  function turnsForObservation() {
    if (state.observations === 1 || outcome === "zero") return [];
    const items = outcome === "missing-client" ? [] : [{
      type: "userMessage", clientId: state.adapterIdempotencyKey,
    }];
    const turns = [{ id: "turn-context-recovery", status: terminalStatus, items }];
    if (outcome === "multiple") {
      turns.push({
        id: "turn-context-racer", status: "interrupted",
        items: [{ type: "userMessage", clientId: "unrelated-client" }],
      });
    }
    return turns;
  }
  return {
    state,
    ref,
    async createDynamicToolThread() { return ref; },
    async observePersistedTurns() {
      state.observations += 1;
      const turns = turnsForObservation();
      return createCodexPersistedTurnObservation({
        threadId: ref.threadId,
        snapshotDigest,
        threadStatus: state.observations === 1 ? "idle" : "notLoaded",
        readTurns: turns,
        listedTurns: turns,
      });
    },
    async runAcceptedSuggestion(options) {
      state.nativeStarts += 1;
      state.adapterIdempotencyKey = options.adapterIdempotencyKey;
      state.preparedRendering = options.preparedRendering;
      state.callbackOrder.push("adapter-called");
      if (outcome === "pre-start-failure") {
        throw Object.assign(new Error("pre-start validation failed"), {
          code: "codex_app_server_receiver_acceptance_required",
        });
      }
      state.callbackOrder.push("before");
      await options.beforeTurnStart({
        threadId: ref.threadId,
        snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      state.callbackOrder.push("started");
      await options.onTurnStarted({
        threadId: ref.threadId,
        turnId: "turn-context-recovery",
        snapshotDigest,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      if (outcome !== "success" && outcome !== "missing-receipt") {
        throw Object.assign(new Error("post-start transport failed"), {
          code: "codex_app_server_exited",
        });
      }
      const evidence = {
        threadId: ref.threadId,
        turnId: "turn-context-recovery",
        turnStatus: "completed",
        snapshotDigest,
      };
      if (outcome === "missing-receipt") return { state: "completed", evidence };
      return {
        state: "completed",
        text: "accepted",
        truncated: false,
        receipt: {
          adapterOperationId: evidence.turnId,
          acceptedAt: "2026-09-01T09:00:01.000Z",
          evidenceRefs: [
            `codex-app-server://thread/${ref.threadId}/turn/${evidence.turnId}`,
          ],
        },
        evidence,
      };
    },
  };
}

async function contextRuntimeFixture(t, adapter, name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `threadmesh-context-${name}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  const ref = await runtime.createRole({
    role: "r",
    cwd: "/private/reviewer",
    tools: CANARY_TOOLS,
    instructions: "Use only bounded tools.",
    scenarioId: `m52-context-${name}`,
  });
  return {
    directory,
    filename: path.join(directory, "admission-turn-journal.json"),
    runtime,
    ref,
    prepared: contextPrepared(ref),
  };
}

function coordinatorContextAdmission(ref, suffix) {
  const now = Date.parse("2026-09-01T09:00:00.000Z");
  const coordinator = new SqliteCoordinator({ clock: () => now });
  const owner = { kind: "user", principalId: `owner-${suffix}` };
  const senderPrincipal = {
    kind: "task", taskId: `task-a-${suffix}`, incarnationId: `inc_a_${suffix}`,
  };
  const receiverPrincipal = {
    kind: "task", taskId: `task-r-${suffix}`, incarnationId: `inc_r_${suffix}`,
  };
  coordinator.registerTask({
    taskId: senderPrincipal.taskId,
    incarnationId: senderPrincipal.incarnationId,
    harness: "codex-app-server",
    state: "running",
  }, owner);
  coordinator.registerTask({
    taskId: receiverPrincipal.taskId,
    incarnationId: receiverPrincipal.incarnationId,
    harness: "codex-app-server",
    state: "idle",
    adapterRef: ref,
  }, owner);
  coordinator.issueGrant({
    specVersion: "0.0-draft",
    grantId: `grant_${suffix}`,
    grantVersion: 1,
    relationshipId: `rel_${suffix}`,
    relationshipType: "peer",
    source: {
      taskId: senderPrincipal.taskId,
      incarnationId: senderPrincipal.incarnationId,
    },
    target: {
      taskId: receiverPrincipal.taskId,
      incarnationId: receiverPrincipal.incarnationId,
    },
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: "2026-09-01T08:00:00.000Z",
    expiresAt: "2026-09-01T10:00:00.000Z",
  }, {
    decisionId: `decision_${suffix}`,
    authenticationId: `authn_${suffix}`,
    decidedAt: "2026-09-01T08:00:00.000Z",
  }, owner);
  const messageId = `msg_${suffix}`;
  coordinator.submit({
    specVersion: "0.0-draft",
    messageId,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "sender-asserted",
    sender: {
      taskId: senderPrincipal.taskId,
      incarnationId: senderPrincipal.incarnationId,
      actorType: "agent",
      harness: "codex-app-server",
    },
    target: {
      taskId: receiverPrincipal.taskId,
      incarnationId: receiverPrincipal.incarnationId,
      harness: "codex-app-server",
    },
    relationshipId: `rel_${suffix}`,
    content: "Use the independently reviewed constraint.",
    reason: "The receiver needs exact peer context.",
    delivery: {
      requestedMode: "checkpoint-offer",
      requiresDisposition: true,
    },
    createdAt: "2026-09-01T09:00:00.000Z",
    expiresAt: "2026-09-01T09:10:00.000Z",
  }, senderPrincipal);
  coordinator.respond(
    senderPrincipal.incarnationId,
    messageId,
    "accepted",
    0,
    receiverPrincipal,
  );
  const prepared = coordinator.prepareContextAdmission(
    senderPrincipal.incarnationId,
    messageId,
    1,
    receiverPrincipal,
  );
  return {
    coordinator, senderPrincipal, receiverPrincipal, messageId, prepared,
  };
}

test("Codex context admission journals first, preserves callback order, and returns exact receipt/evidence", async (t) => {
  const adapter = contextRecoveryAdapter();
  const fixture = await contextRuntimeFixture(t, adapter, "success");
  let unknown = 0;
  const result = await fixture.runtime.deliverContext({
    role: "r",
    ref: fixture.ref,
    prepared: fixture.prepared,
    cwd: "/private/reviewer",
    scenarioId: "m52-context-success",
    turnRecovery: {
      filename: fixture.filename,
      executionId: "execution-context-success",
      async onOutcomeUnknown() { unknown += 1; },
      async onTerminalReconciliation() { throw new Error("must not reconcile success"); },
    },
  });
  assert.deepEqual(adapter.state.callbackOrder, ["adapter-called", "before", "started"]);
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(adapter.state.observations, 1);
  assert.equal(unknown, 0);
  assert.equal(result.receipt.adapterOperationId, result.evidence.turnId);
  assert.equal(result.evidence.turnStatus, "completed");
  assert.match(result.recoveryJournal.recordDigest, /^sha256:[a-f0-9]{64}$/u);
  const journal = JSON.parse(fs.readFileSync(fixture.filename, "utf8"));
  assert.equal(journal.operationBinding.kind, "context-admission");
  assert.equal(journal.operationBinding.messageId, fixture.prepared.envelope.messageId);
  assert.equal(journal.operationBinding.admissionToken, fixture.prepared.admissionToken);
  assert.equal(journal.operationBinding.revision, fixture.prepared.revision);
  assert.equal(
    journal.operationBinding.adapterIdempotencyKey,
    adapter.state.adapterIdempotencyKey,
  );
  assert.equal(adapter.state.preparedRendering, fixture.prepared.rendering);
  assert.equal(
    journal.operationBinding.promptDigest,
    sha256Digest(adapter.state.preparedRendering),
  );
  assert.equal(Object.hasOwn(result, "action"), false);
});

test("Codex context admission completes the exact coordinator claim only from native receipt evidence", async (t) => {
  const adapter = contextRecoveryAdapter();
  const fixture = await contextRuntimeFixture(t, adapter, "coordinator-success");
  const admission = coordinatorContextAdmission(fixture.ref, "coordinator-success");
  t.after(() => admission.coordinator.close());
  const delivered = await fixture.runtime.deliverContext({
    role: "r", ref: fixture.ref, prepared: admission.prepared,
    cwd: "/private/reviewer", scenarioId: "m52-context-coordinator-success",
    turnRecovery: {
      filename: fixture.filename,
      executionId: "execution-context-coordinator-success",
      async onOutcomeUnknown() {},
      async onTerminalReconciliation() {},
    },
  });
  const disposition = admission.coordinator.confirmContextAdmission(
    admission.senderPrincipal.incarnationId,
    admission.messageId,
    1,
    admission.prepared.admissionToken,
    delivered.evidence,
    admission.receiverPrincipal,
  );
  assert.equal(disposition.delivery, "context-admitted");
  assert.deepEqual(
    admission.coordinator.auditEvents(
      admission.senderPrincipal.incarnationId,
      admission.messageId,
      admission.receiverPrincipal,
    ).map(({ eventType }) => eventType),
    [
      "message-durably-received",
      "receiver-decided",
      "context-admission-claimed",
      "context-admitted",
    ],
  );
  assert.equal(delivered.receipt.adapterOperationId, delivered.evidence.turnId);
});

test("Codex terminal admission recovery leaves the coordinator claim unconfirmed and suppresses resend", async (t) => {
  const adapter = contextRecoveryAdapter({ outcome: "terminal" });
  const fixture = await contextRuntimeFixture(t, adapter, "coordinator-terminal");
  const admission = coordinatorContextAdmission(fixture.ref, "coordinator-terminal");
  t.after(() => admission.coordinator.close());
  const operation = () => fixture.runtime.deliverContext({
    role: "r", ref: fixture.ref, prepared: admission.prepared,
    cwd: "/private/reviewer", scenarioId: "m52-context-coordinator-terminal",
    turnRecovery: {
      filename: fixture.filename,
      executionId: "execution-context-coordinator-terminal",
      async onOutcomeUnknown() {},
      async onTerminalReconciliation() {},
    },
  });
  await assert.rejects(operation, {
    code: "threadmesh_codex_live_context_terminal_reconciled",
  });
  await assert.rejects(operation, {
    code: "threadmesh_codex_live_context_terminal_reconciled",
  });
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(
    admission.coordinator.getDisposition(
      admission.senderPrincipal.incarnationId,
      admission.messageId,
      admission.receiverPrincipal,
    ).delivery,
    "durably-received",
  );
  assert.equal(
    admission.coordinator.auditEvents(
      admission.senderPrincipal.incarnationId,
      admission.messageId,
      admission.receiverPrincipal,
    ).some(({ eventType }) => eventType === "context-admitted"),
    false,
  );
});

test("Codex context admission keeps a pre-start failure pre-effect", async (t) => {
  const adapter = contextRecoveryAdapter({ outcome: "pre-start-failure" });
  const fixture = await contextRuntimeFixture(t, adapter, "pre-start");
  let unknown = 0;
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-pre-start",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-pre-start",
        async onOutcomeUnknown() { unknown += 1; },
        async onTerminalReconciliation() {},
      },
    }),
    { code: "codex_app_server_receiver_acceptance_required" },
  );
  assert.equal(fs.existsSync(fixture.filename), false);
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(adapter.state.observations, 1);
  assert.equal(unknown, 0);
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-pre-start",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-pre-start",
        async onOutcomeUnknown() { unknown += 1; },
        async onTerminalReconciliation() {},
      },
    }),
    { code: "codex_app_server_receiver_acceptance_required" },
  );
  assert.equal(fs.existsSync(fixture.filename), false);
  assert.equal(adapter.state.nativeStarts, 2);
  assert.equal(adapter.state.observations, 2);
  assert.equal(unknown, 0);
});

test("Codex context admission reconciles only an exact post-start terminal once", async (t) => {
  const adapter = contextRecoveryAdapter({ outcome: "terminal" });
  const fixture = await contextRuntimeFixture(t, adapter, "terminal");
  let unknown = 0;
  let terminal = 0;
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-terminal",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-terminal",
        async onOutcomeUnknown({ prepared, operationBinding }) {
          unknown += 1;
          assert.equal(prepared.admissionToken, fixture.prepared.admissionToken);
          assert.equal(operationBinding.messageId, fixture.prepared.envelope.messageId);
        },
        async onTerminalReconciliation({ observation, operationBinding }) {
          terminal += 1;
          assert.equal(observation.turns[0].status, "interrupted");
          assert.equal(operationBinding.admissionToken, fixture.prepared.admissionToken);
        },
      },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_terminal_reconciled" &&
      error?.recovery?.state === "found-terminal" &&
      error?.recovery?.turnStatus === "interrupted",
  );
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(adapter.state.observations, 2);
  assert.equal(unknown, 1);
  assert.equal(terminal, 1);
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-terminal",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-terminal",
        async onOutcomeUnknown() { unknown += 1; },
        async onTerminalReconciliation() { terminal += 1; },
      },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_terminal_reconciled" &&
      error?.recovery?.journal?.replay === true,
  );
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(adapter.state.observations, 3);
  assert.equal(unknown, 2);
  assert.equal(terminal, 2);
});

test("Codex context admission keeps completed, zero, missing, and multiple deltas ambiguous without retry", async (t) => {
  const cases = [
    ["completed", { outcome: "terminal", terminalStatus: "completed" },
      "codex-native-turn-completed-observation-only"],
    ["zero", { outcome: "zero" }, "codex-native-turn-no-observable-delta"],
    ["missing", { outcome: "missing-client" }, "codex-native-turn-client-id-missing"],
    ["multiple", { outcome: "multiple" }, "codex-native-turn-multiple-new-turns"],
  ];
  for (const [name, options, reasonCode] of cases) {
    const adapter = contextRecoveryAdapter(options);
    const fixture = await contextRuntimeFixture(t, adapter, name);
    let terminal = 0;
    await assert.rejects(
      fixture.runtime.deliverContext({
        role: "r", ref: fixture.ref, prepared: fixture.prepared,
        cwd: "/private/reviewer", scenarioId: `m52-context-${name}`,
        turnRecovery: {
          filename: fixture.filename,
          executionId: `execution-context-${name}`,
          async onOutcomeUnknown() {},
          async onTerminalReconciliation() { terminal += 1; },
        },
      }),
      (error) => error?.code === "threadmesh_codex_live_context_reconciliation_ambiguous" &&
        error?.recovery?.reasonCode === reasonCode,
    );
    assert.equal(adapter.state.nativeStarts, 1, name);
    assert.equal(adapter.state.observations, 2, name);
    assert.equal(terminal, 0, name);
  }
});

test("Codex context admission rejects missing recovery and prepared mismatch before native start", async (t) => {
  const adapter = contextRecoveryAdapter();
  const fixture = await contextRuntimeFixture(t, adapter, "prepared-invalid");
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-prepared-invalid",
    }),
    { code: "threadmesh_live_context_recovery_required" },
  );
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r",
      ref: fixture.ref,
      prepared: { ...fixture.prepared, revision: 2 },
      cwd: "/private/reviewer",
      scenarioId: "m52-context-prepared-invalid",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-prepared-invalid",
        async onOutcomeUnknown() {},
        async onTerminalReconciliation() {},
      },
    }),
    { code: "threadmesh_live_context_prepared_invalid" },
  );
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r",
      ref: fixture.ref,
      prepared: {
        ...fixture.prepared,
        rendering: "THREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1\n{\"content\":\"spliced\"}",
      },
      cwd: "/private/reviewer",
      scenarioId: "m52-context-prepared-invalid",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-prepared-spliced",
        async onOutcomeUnknown() {},
        async onTerminalReconciliation() {},
      },
    }),
    { code: "threadmesh_live_context_prepared_invalid" },
  );
  assert.equal(adapter.state.nativeStarts, 0);
  assert.equal(adapter.state.observations, 0);
});

test("Codex context admission never fabricates a missing receipt or action", async (t) => {
  const adapter = contextRecoveryAdapter({
    outcome: "missing-receipt",
    terminalStatus: "completed",
  });
  const fixture = await contextRuntimeFixture(t, adapter, "missing-receipt");
  await assert.rejects(
    fixture.runtime.deliverContext({
      role: "r", ref: fixture.ref, prepared: fixture.prepared,
      cwd: "/private/reviewer", scenarioId: "m52-context-missing-receipt",
      turnRecovery: {
        filename: fixture.filename,
        executionId: "execution-context-missing-receipt",
        async onOutcomeUnknown() {},
        async onTerminalReconciliation() {},
      },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_reconciliation_ambiguous" &&
      error?.recovery?.reasonCode === "codex-native-turn-completed-observation-only" &&
      !Object.hasOwn(error, "receipt") && !Object.hasOwn(error, "action"),
  );
  assert.equal(adapter.state.nativeStarts, 1);
  assert.equal(adapter.state.observations, 2);
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
