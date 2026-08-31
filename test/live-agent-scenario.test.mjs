import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DeterministicLiveAgentRuntime,
  runLiveAgentScenario,
  verifyLiveAgentEvidence,
} from "../src/validation/live-agent-scenario.mjs";

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
    assert.ok(result.liveClosureGates.pending.length >= 5);
    const records = fs.readFileSync(path.join(artifacts, "private-trace.jsonl"), "utf8")
      .trim().split("\n").map(JSON.parse);
    assert.equal(verifyLiveAgentEvidence(records).valid, true);
    assert.equal(records.some((record) => record.type === "coordinator.attention.next-only-claimed"), true);
    assert.equal(records.some((record) => record.type === "coordinator.context.exact-task-admitted"), true);
    assert.equal(records.some((record) => record.type === "coordinator.attention.cursor-committed"), true);
    assert.equal(records.some((record) => record.type === "attention.dispatched"), false);
    assert.equal(fs.existsSync(path.join(artifacts, "cleanup-manifest.json")), true);
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
