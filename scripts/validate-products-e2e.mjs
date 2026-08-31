import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  acpProductDriver,
  codexProductDriver,
  geminiProductDriver,
} from "../src/validation/product-drivers.mjs";
import { runCoordinatorProductScenario } from "../src/validation/coordinator-product-scenario.mjs";
import {
  PROACTIVE_B_MISSING_MARKER,
  PROACTIVE_B_MARKER,
  runProactiveCodexScenario,
} from "../src/validation/proactive-codex-scenario.mjs";
import {
  verifyExternalReviewGate,
  verifyIsolatedExecutionState,
} from "../src/validation/external-review-gate.mjs";

export const LIVE_E2E_ACK = "issue-7-approved-for-live-product-validation";
export const MAINTAINER_EXPERIMENTAL_ACK =
  "maintainer-approved-for-experimental-live-validation";
const M0_ISSUE_URL = "https://github.com/fyaic/threadmesh/issues/7";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(root, "test", "fixtures", name);
const markers = Object.freeze({
  codex: "CODEX_THREADMESH_COORDINATOR_OK",
  kimi: "KIMI_THREADMESH_COORDINATOR_OK",
  gemini: "GEMINI_THREADMESH_COORDINATOR_OK",
});

async function runCodexAttention(options) {
  const { runCodexAttentionScenario } = await import(
    "../src/validation/codex-attention-scenario.mjs"
  );
  if (typeof runCodexAttentionScenario !== "function") {
    const error = new Error("Codex attention scenario export is unavailable.");
    error.code = "codex_attention_scenario_unavailable";
    throw error;
  }
  return runCodexAttentionScenario(options);
}

function fakeCodexAttentionAdapter(condition, readyMarker) {
  const refs = {
    a: {
      kind: "codex-app-server",
      threadId: `fake-attention-a-${condition}`,
      snapshotDigest: `sha256:${"a".repeat(64)}`,
      userAgent: "codex_cli_rs/0.145.0 (ThreadMesh fake attention)",
      model: "fake-model",
      modelProvider: "fake",
    },
    b: {
      kind: "codex-app-server",
      threadId: `fake-attention-b-${condition}`,
      snapshotDigest: `sha256:${"b".repeat(64)}`,
      userAgent: "codex_cli_rs/0.145.0 (ThreadMesh fake attention)",
      model: "fake-model",
      modelProvider: "fake",
    },
  };
  return {
    async startValidationThread({ marker }) {
      return { text: marker, truncated: false, adapterRef: refs.b };
    },
    async startAutonomousToolThread({ onToolCall }) {
      const toolCalls = [];
      if (condition !== "control") {
        await onToolCall({ tool: "threadmesh_related_tasks", arguments: {} });
        toolCalls.push({ tool: "threadmesh_related_tasks" });
      }
      if (condition === "relevant") {
        await onToolCall({
          tool: "threadmesh_publish_dependency",
          arguments: { reason: "The exact dependent needs this verified result." },
        });
        toolCalls.push({ tool: "threadmesh_publish_dependency" });
      }
      return {
        text: "Fake A completed the bounded attention decision.",
        truncated: false,
        adapterRef: refs.a,
        toolCalls,
        nonThreadMeshToolCalls: 0,
      };
    },
    async runAcceptedSuggestion({ adapterRef }) {
      return {
        text: readyMarker,
        truncated: false,
        receipt: {
          adapterOperationId: `fake-attention-turn-${condition}`,
          acceptedAt: "2026-08-31T10:01:30.000Z",
          evidenceRefs: [`threadmesh-fake://codex-attention/${condition}`],
        },
        evidence: {
          kind: "codex-app-server",
          threadId: adapterRef.threadId,
          turnId: `fake-attention-turn-${condition}`,
          turnStatus: "completed",
          snapshotDigest: adapterRef.snapshotDigest,
        },
      };
    },
    async deleteThread({ threadId }) {
      return { threadId, deleted: true };
    },
  };
}

export function publicProductErrorCode(error) {
  const code = error?.code;
  return typeof code === "string" && /^[a-z0-9_]{1,128}$/.test(code)
    ? code
    : "unknown_error";
}

export function evaluateLiveAuthorization(reviewGate, env = process.env) {
  if (reviewGate?.satisfied === true) {
    return {
      mode: "external-review",
      normativeReviewSatisfied: true,
      issueUrl: M0_ISSUE_URL,
    };
  }
  if (env.THREADMESH_MAINTAINER_EXPERIMENTAL_ACK === MAINTAINER_EXPERIMENTAL_ACK) {
    return {
      mode: "maintainer-experimental",
      normativeReviewSatisfied: false,
      issueUrl: M0_ISSUE_URL,
    };
  }
  return null;
}

function classify(error, productId) {
  const code = publicProductErrorCode(error);
  const blockedCodes = new Set([
    "acp_agent_quota_error",
    "codex_app_server_quota_error",
    "codex_app_server_auth_error",
    "gemini_quota_error",
    "gemini_auth_error",
    "gemini_api_key_not_authorized",
  ]);
  return {
    state: blockedCodes.has(code) ? "blocked" : "failed",
    productId,
    code,
    ...(typeof error?.attention?.stage === "string"
      ? { stage: error.attention.stage }
      : {}),
    ...(error?.cleanup ? { cleanup: error.cleanup } : {}),
  };
}

async function runOne(productId, setupProduct) {
  try {
    return await runCoordinatorProductScenario({
      productId,
      marker: markers[productId],
      setupProduct,
    });
  } catch (error) {
    return classify(error, productId);
  }
}

async function fakeDrivers(directory) {
  return {
    kimi: acpProductDriver({
      command: process.execPath,
      args: [fixture("fake-acp-agent.mjs")],
      cwd: root,
      env: {
        FAKE_ACP_STATE_FILE: path.join(directory, "acp-state.json"),
        FAKE_ACP_EXACT_MARKER: markers.kimi,
      },
    }),
    codex: codexProductDriver({
      command: process.execPath,
      args: [fixture("fake-codex-app-server.mjs")],
      cwd: root,
      env: {
        FAKE_CODEX_STATE_FILE: path.join(directory, "codex-state.json"),
        FAKE_CODEX_EXACT_MARKER: markers.codex,
      },
      bootstrapMarker: markers.codex,
    }),
    gemini: geminiProductDriver({
      command: process.execPath,
      baseArgs: [fixture("fake-gemini-cli.mjs")],
      cwd: root,
      env: { FAKE_GEMINI_EXACT_MARKER: markers.gemini },
      temporaryRoot: directory,
    }),
  };
}

function liveDriver(productId, env) {
  if (productId === "kimi") {
    return acpProductDriver({
      command: env.KIMI_BIN ?? "/Users/veil/.kimi-code/bin/kimi",
      args: ["acp"],
      cwd: root,
    });
  }
  if (productId === "codex") {
    return codexProductDriver({
      command: env.CODEX_BIN ?? "/opt/homebrew/bin/codex",
      cwd: root,
      bootstrapMarker: "CODEX_THREADMESH_BOOTSTRAP_OK",
    });
  }
  if (productId === "gemini") {
    if (!env.GEMINI_API_KEY) {
      const error = new Error("An explicitly authorized GEMINI_API_KEY is required.");
      error.code = "gemini_api_key_not_authorized";
      throw error;
    }
    return geminiProductDriver({
      command: env.NPX_BIN ?? "/opt/homebrew/bin/npx",
      baseArgs: ["--yes", "@google/gemini-cli@0.56.0"],
      cwd: root,
      env: { GEMINI_API_KEY: env.GEMINI_API_KEY },
    });
  }
  throw new Error(`Unknown product: ${productId}`);
}

export async function runFakeAll() {
  const startedAt = new Date().toISOString();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-products-e2e-"));
  try {
    const drivers = await fakeDrivers(directory);
    const products = [];
    for (const productId of ["codex", "kimi", "gemini"]) {
      products.push(await runOne(productId, drivers[productId]));
    }
    return {
      mode: "fake-all",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: products.every((product) => product.state === "passed") ? "passed" : "failed",
      products,
      cleanup: { temporaryRootRemoved: true },
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function runFakeProactive() {
  const startedAt = new Date().toISOString();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-proactive-e2e-"));
  const baseEnv = { FAKE_CODEX_STATE_FILE: path.join(directory, "codex-state.json") };
  try {
    return {
      mode: "fake-proactive",
      startedAt,
      ...(await runProactiveCodexScenario({
        command: process.execPath,
        args: [fixture("fake-codex-app-server.mjs")],
        cwd: root,
        env: baseEnv,
        bootstrapEnv: { ...baseEnv, FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MISSING_MARKER },
        autonomousEnv: {
          ...baseEnv,
          FAKE_CODEX_AUTONOMOUS_TOOL: "1",
          FAKE_CODEX_AUTONOMOUS_MARKER: "Agent A sent the useful dependency.",
        },
        receiverEnv: { ...baseEnv, FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MARKER },
      })),
      finishedAt: new Date().toISOString(),
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function runFakeBehavior() {
  const startedAt = new Date().toISOString();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-behavior-e2e-"));
  try {
    const conditions = [];
    for (const condition of ["control", "relevant", "irrelevant"]) {
      const baseEnv = {
        FAKE_CODEX_STATE_FILE: path.join(directory, `${condition}-codex-state.json`),
      };
      const autonomousEnv = {
        control: {
          ...baseEnv,
        },
        relevant: {
          ...baseEnv,
          FAKE_CODEX_AUTONOMOUS_TOOL: "1",
          FAKE_CODEX_AUTONOMOUS_MARKER: "Agent A sent the useful dependency.",
        },
        irrelevant: {
          ...baseEnv,
          FAKE_CODEX_AUTONOMOUS_TOOL: "1",
          FAKE_CODEX_AUTONOMOUS_SKIP_SEND: "1",
        },
      }[condition];
      conditions.push(await runProactiveCodexScenario({
        command: process.execPath,
        args: [fixture("fake-codex-app-server.mjs")],
        cwd: root,
        condition,
        runId: `behavior_${condition}`,
        env: baseEnv,
        bootstrapEnv: {
          ...baseEnv,
          FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MISSING_MARKER,
        },
        autonomousEnv,
        receiverEnv: { ...baseEnv, FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MARKER },
      }));
    }
    return {
      mode: "fake-behavior",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: conditions.every(({ state }) => state === "passed") ? "passed" : "failed",
      conditions,
      cleanup: { temporaryRootRemoved: true },
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

export async function runFakeAttention() {
  const startedAt = new Date().toISOString();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-attention-e2e-"));
  try {
    const { CODEX_ATTENTION_B_READY_MARKER } = await import(
      "../src/validation/codex-attention-scenario.mjs"
    );
    const conditions = [];
    for (const condition of ["control", "relevant", "irrelevant"]) {
      conditions.push(await runCodexAttention({
        condition,
        adapter: fakeCodexAttentionAdapter(
          condition,
          CODEX_ATTENTION_B_READY_MARKER,
        ),
        cwd: root,
        runId: `fake_attention_${condition}`,
        temporaryParent: temporaryRoot,
      }));
    }
    return {
      mode: "fake-attention",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: conditions.every(({ state }) => state === "passed")
        ? "passed"
        : "failed",
      conditions,
      cleanup: { temporaryRootRemoved: true },
    };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runLive(productId, env = process.env) {
  const startedAt = new Date().toISOString();
  if (env.THREADMESH_LIVE_E2E_ACK !== LIVE_E2E_ACK) {
    return {
      mode: "live",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: "not-run",
      productId,
      code: "external_review_gate_not_acknowledged",
      requiredAcknowledgement: LIVE_E2E_ACK,
    };
  }
  const reviewGate = verifyExternalReviewGate({ root });
  const authorization = evaluateLiveAuthorization(reviewGate, env);
  if (!authorization) {
    return {
      mode: "live",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: "not-run",
      productId,
      code: "external_review_records_incomplete",
      reviewGate,
    };
  }
  const repository = verifyIsolatedExecutionState({
    root,
    expectedSha: env.THREADMESH_ISOLATED_LIVE_SHA,
  });
  if (!repository.satisfied) {
    return {
      mode: "live",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: "not-run",
      productId,
      code: "isolated_live_repository_not_ready",
      reviewGate,
      authorization,
      repository,
    };
  }
  try {
    return {
      mode: "live",
      startedAt,
      reviewGate,
      authorization,
      repository,
      ...(productId === "codex-proactive"
        ? await runProactiveCodexScenario({
            command: env.CODEX_BIN ?? "/opt/homebrew/bin/codex",
            cwd: root,
            model: env.CODEX_PROACTIVE_MODEL ?? null,
          })
        : productId === "codex-attention"
          ? await runCodexAttention({
              command: env.CODEX_BIN ?? "/opt/homebrew/bin/codex",
              cwd: root,
              model: env.CODEX_ATTENTION_MODEL ?? null,
              condition: "relevant",
            })
        : await runOne(productId, liveDriver(productId, env))),
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      mode: "live",
      startedAt,
      reviewGate,
      authorization,
      repository,
      ...classify(error, productId),
      finishedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const [mode, productId] = process.argv.slice(2);
  let result;
  if (mode === "--fake-all" && !productId) result = await runFakeAll();
  else if (mode === "--fake-proactive" && !productId) result = await runFakeProactive();
  else if (mode === "--fake-behavior" && !productId) result = await runFakeBehavior();
  else if (mode === "--fake-attention" && !productId) result = await runFakeAttention();
  else if (mode === "--isolated-live" && [
    "codex",
    "codex-proactive",
    "codex-attention",
    "kimi",
    "gemini",
  ].includes(productId)) {
    result = await runLive(productId);
  } else {
    result = {
      state: "not-run",
      code: "usage",
      usage: "node scripts/validate-products-e2e.mjs --fake-all | --fake-proactive | --fake-behavior | --fake-attention | --isolated-live <codex|codex-proactive|codex-attention|kimi|gemini>",
    };
  }
  console.log(JSON.stringify(result, null, 2));
  if (result.state === "failed") process.exitCode = 1;
  else if (result.state === "blocked") process.exitCode = 2;
  else if (result.state === "not-run") process.exitCode = 3;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
