import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import { runM52LiveCodexGate } from "../src/validation/m5-2-live-codex-gate.mjs";
import { CodexLiveAgentRuntime } from "../src/validation/live-agent-scenario.mjs";

const INITIAL = [
  "export function releaseGate(status) {",
  "  return String(status).toLowerCase() === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}", "",
].join("\n");
const FIXED = [
  "export function releaseGate(status) {",
  "  return status === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}", "",
].join("\n");

function git(cwd, args) {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
  }).trim();
}

function sourceRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-source-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "ThreadMesh Test"]);
  git(root, ["config", "user.email", "threadmesh@example.invalid"]);
  fs.writeFileSync(path.join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  return { root, sha: git(root, ["rev-parse", "HEAD"]) };
}

function fakeRuntime({
  failPhase = null,
  failureCode = "threadmesh_test_model_failure",
  failCreateRole = null,
} = {}) {
  const created = [];
  const deleted = [];
  const turns = [];
  const refs = new Map();
  return {
    created, deleted, turns,
    async createRole({ role, tools, phaseTools }) {
      const union = new Set([
        ...tools.map((tool) => tool.name),
        ...Object.values(phaseTools ?? {}).flat().map((tool) => tool.name),
      ]);
      assert.ok(union.size <= 4);
      if (role === failCreateRole) {
        throw Object.assign(new Error("partial role bootstrap failed"), {
          code: "threadmesh_test_role_bootstrap_failure",
          partialRoleCleanup: {
            threadCreated: true,
            deleted: true,
            absenceVerified: true,
            identifierDigest: sha256Digest({ role, partial: true }),
          },
        });
      }
      const ref = {
        kind: "codex-app-server",
        threadId: `private-thread-${role}`,
        snapshotDigest: sha256Digest({ role, kind: "fake-product" }),
      };
      refs.set(role, ref);
      created.push({ role, union: [...union] });
      return ref;
    },
    async runTurn(options) {
      assert.equal(Object.hasOwn(options, "plan"), false);
      assert.equal(options.ref, refs.get(options.role));
      if (options.phase === failPhase) {
        throw Object.assign(new Error("injected model failure"), {
          code: failureCode,
        });
      }
      const plans = {
        implementation: [
          ["threadmesh_commit_candidate", { phase: "implementation", content: INITIAL }],
          ["threadmesh_publish_artifact", (outputs) => ({ commitSha: outputs[0].subjectSha })],
        ],
        review: [
          ["threadmesh_review_read_artifact", {}],
          ["threadmesh_report_review_finding", {
            severity: "blocking",
            observedBehavior: "Lowercasing makes uppercase VERIFIED pass the release gate.",
            expectedBehavior: "The exact case-sensitive contract requires uppercase VERIFIED to be blocked.",
            reason: "The implementation violates exact verified matching by lowering case.",
          }],
        ],
        fix: [
          ["threadmesh_commit_candidate", { phase: "fix", content: FIXED }],
          ["threadmesh_publish_dependency", (outputs) => ({ commitSha: outputs[0].subjectSha })],
        ],
        verification: [["threadmesh_verify_exact_chain", {}]],
      };
      const selected = plans[options.phase];
      assert.deepEqual(options.allowedToolNames, selected.map(([name]) => name));
      const outputs = [];
      const toolCalls = [];
      const turnId = `private-turn-${options.role}-${options.phase}`;
      for (let ordinal = 0; ordinal < selected.length; ordinal += 1) {
        const [tool, argumentSource] = selected[ordinal];
        const argumentsValue = typeof argumentSource === "function"
          ? argumentSource(outputs) : argumentSource;
        const selectedMetadata = {
          threadId: options.ref.threadId, turnId,
          callId: `private-call-${options.phase}-${ordinal}`,
          ordinal, tool, arguments: argumentsValue,
          argumentsDigest: sha256Digest(argumentsValue),
        };
        await options.beforeToolCall(selectedMetadata);
        const output = await options.onToolCall(selectedMetadata);
        outputs.push(output);
        const completed = {
          ...selectedMetadata,
          outputDigest: sha256Digest(output),
          resultStatus: "completed",
        };
        await options.afterToolCall(completed);
        toolCalls.push({
          ordinal, turnId, callId: selectedMetadata.callId, tool,
          argumentsDigest: selectedMetadata.argumentsDigest,
          outputDigest: completed.outputDigest, resultStatus: "completed",
        });
      }
      turns.push({ role: options.role, phase: options.phase });
      return {
        state: "completed", nonThreadMeshToolCalls: 0, toolCalls,
        evidence: { turnId, turnStatus: "completed" },
      };
    },
    async deleteRole({ role, ref }) {
      assert.equal(ref, refs.get(role));
      deleted.push(role);
      return { deleted: true, absenceVerified: true };
    },
  };
}

test("real-product canary keeps model tool choice, same A, controls, and cleanup honest", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-temp-"));
  const runtime = fakeRuntime();
  try {
    const result = await runM52LiveCodexGate({
      runtime,
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      artifactsDirectory: artifacts,
      temporaryParent,
      scenarioId: "m52-live-canary-test",
      record() {},
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(result.evidenceClass, "real-codex-product-canary");
    assert.deepEqual(result.counts, {
      rolesPrecreated: 5, postBootstrapTurns: 4,
      modelSelectedToolCalls: 7, commits: 2, verifierRequests: 1,
    });
    assert.equal(result.chain.directDescendant, true);
    assert.equal(result.chain.verified, true);
    assert.equal(result.chain.unlocked, false);
    assert.equal(result.identityDigests.implementerThread,
      result.identityDigests.resumedImplementerThread);
    assert.equal(new Set(Object.values(result.identityDigests)).size, 5);
    assert.equal(result.initiative.phasePromptsSubmittedByRunner, 4);
    assert.equal(result.initiative.lifecycleHandoffsByThreadMesh, false);
    assert.equal(result.controls.dependentPostBootstrapTurns, 0);
    assert.equal(result.controls.irrelevantPostBootstrapTurns, 0);
    assert.equal(result.cleanup.threadsDeleted, 5);
    assert.equal(result.cleanup.absenceChecksPassed, 5);
    assert.equal(result.cleanup.complete, true);
    assert.deepEqual(runtime.turns.map(({ role, phase }) => `${role}:${phase}`), [
      "a:implementation", "r:review", "a:fix", "v:verification",
    ]);
    assert.equal(JSON.stringify(result).includes("private-thread"), false);
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("a partial Codex role bootstrap deletes and absence-checks its exact adapter ref", async () => {
  const snapshotDigest = `sha256:${"9".repeat(64)}`;
  const calls = [];
  const adapter = {
    async createDynamicToolThread() {
      throw Object.assign(new Error("bootstrap failed"), {
        code: "codex_app_server_bootstrap_failed",
        adapterRef: {
          kind: "codex-app-server",
          threadId: "private-partial-thread",
          snapshotDigest,
        },
      });
    },
    async confirmThreadAbsent(options) {
      calls.push(["confirm", options.threadId]);
      return { absent: calls.length > 1, snapshotDigest, checkedBy: "thread/read" };
    },
    async deleteThread(options) {
      calls.push(["delete", options.threadId]);
      return { deleted: true, threadId: options.threadId, snapshotDigest };
    },
  };
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  await assert.rejects(
    runtime.createRole({
      role: "a",
      cwd: "/private/implementer",
      tools: [{
        type: "function", name: "threadmesh_decide_offer",
        description: "bounded decision",
        inputSchema: { type: "object", additionalProperties: false },
      }],
      instructions: "Use bounded tools only.",
      scenarioId: "m52-partial-cleanup",
    }),
    (error) => error?.code === "codex_app_server_bootstrap_failed" &&
      error?.partialRoleCleanup?.threadCreated === true &&
      error?.partialRoleCleanup?.deleted === true &&
      error?.partialRoleCleanup?.absenceVerified === true,
  );
  assert.deepEqual(calls, [
    ["confirm", "private-partial-thread"],
    ["delete", "private-partial-thread"],
    ["confirm", "private-partial-thread"],
  ]);
});

test("an already-absent partial Codex role bootstrap counts as exactly cleaned", async () => {
  const snapshotDigest = `sha256:${"8".repeat(64)}`;
  const calls = [];
  const adapter = {
    async createDynamicToolThread() {
      throw Object.assign(new Error("bootstrap failed after remote cleanup"), {
        code: "codex_app_server_bootstrap_failed",
        adapterRef: {
          kind: "codex-app-server",
          threadId: "private-already-absent-thread",
          snapshotDigest,
        },
      });
    },
    async confirmThreadAbsent(options) {
      calls.push(["confirm", options.threadId]);
      return { absent: true, snapshotDigest, checkedBy: "thread/read" };
    },
    async deleteThread(options) {
      calls.push(["delete", options.threadId]);
      return { deleted: true, threadId: options.threadId, snapshotDigest };
    },
  };
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
  await assert.rejects(
    runtime.createRole({
      role: "a",
      cwd: "/private/implementer",
      tools: [{
        type: "function", name: "threadmesh_decide_offer",
        description: "bounded decision",
        inputSchema: { type: "object", additionalProperties: false },
      }],
      instructions: "Use bounded tools only.",
      scenarioId: "m52-partial-cleanup-replay",
    }),
    (error) => error?.code === "codex_app_server_bootstrap_failed" &&
      error?.partialRoleCleanup?.threadCreated === true &&
      error?.partialRoleCleanup?.deleted === true &&
      error?.partialRoleCleanup?.absenceVerified === true,
  );
  assert.deepEqual(calls, [["confirm", "private-already-absent-thread"]]);
});

test("unbounded OS error codes are normalized while cleanup evidence survives", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-os-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-os-temp-"));
  try {
    const result = await runM52LiveCodexGate({
      runtime: fakeRuntime({ failPhase: "review", failureCode: "ENOENT" }),
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      artifactsDirectory: artifacts,
      temporaryParent,
      scenarioId: "m52-live-canary-os-failure",
      record() {},
    });
    assert.equal(result.state, "failed");
    assert.equal(result.code, "threadmesh_m52_live_codex_canary_failed");
    assert.equal(result.cleanup.threadsDeleted, 5);
    assert.equal(result.cleanup.absenceChecksPassed, 5);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("an early partially-created role can still report exact complete cleanup", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-partial-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-partial-temp-"));
  try {
    const result = await runM52LiveCodexGate({
      runtime: fakeRuntime({ failCreateRole: "v" }),
      sourceRoot: source.root,
      validatedBaseSha: source.sha,
      artifactsDirectory: artifacts,
      temporaryParent,
      scenarioId: "m52-live-canary-partial-role",
      record() {},
    });
    assert.equal(result.state, "failed");
    assert.equal(result.counts.rolesPrecreated, 2);
    assert.equal(result.cleanup.threadsCreated, 3);
    assert.equal(result.cleanup.threadsDeleted, 3);
    assert.equal(result.cleanup.absenceChecksPassed, 3);
    assert.equal(result.cleanup.complete, true);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

test("a failed model phase remains failed but still cleans every precreated role", async () => {
  const source = sourceRepository();
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-failure-artifacts-"));
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-canary-failure-temp-"));
  const runtime = fakeRuntime({ failPhase: "review" });
  try {
    const result = await runM52LiveCodexGate({
      runtime, sourceRoot: source.root, validatedBaseSha: source.sha,
      artifactsDirectory: artifacts, temporaryParent,
      scenarioId: "m52-live-canary-failure", record() {},
    });
    assert.equal(result.state, "failed");
    assert.equal(result.code, "threadmesh_test_model_failure");
    assert.equal(result.liveProductEvidence, false);
    assert.equal(result.counts.rolesPrecreated, 5);
    assert.equal(result.counts.postBootstrapTurns, 1);
    assert.equal(result.cleanup.threadsDeleted, 5);
    assert.equal(result.cleanup.complete, true);
    assert.deepEqual(new Set(runtime.deleted), new Set(["a", "r", "v", "dependent", "irrelevant"]));
    assert.deepEqual(fs.readdirSync(temporaryParent), []);
  } finally {
    fs.rmSync(source.root, { recursive: true, force: true });
    fs.rmSync(artifacts, { recursive: true, force: true });
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});
