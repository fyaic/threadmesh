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
import { verifyExternalReviewGate } from "../src/validation/external-review-gate.mjs";

export const LIVE_E2E_ACK = "issue-7-approved-for-live-product-validation";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(root, "test", "fixtures", name);
const markers = Object.freeze({
  codex: "CODEX_THREADMESH_COORDINATOR_OK",
  kimi: "KIMI_THREADMESH_COORDINATOR_OK",
  gemini: "GEMINI_THREADMESH_COORDINATOR_OK",
});

function classify(error, productId) {
  const code = error?.code ?? "unknown_error";
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
    detail: error?.message ?? String(error),
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
      homeDirectory: path.join(directory, "gemini-home"),
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
    fs.mkdirSync(path.join(directory, "gemini-home"), { mode: 0o700 });
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

export async function runLive(
  productId,
  env = process.env,
  verifyGate = () => verifyExternalReviewGate({ root }),
) {
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
  const reviewGate = verifyGate();
  if (!reviewGate.satisfied) {
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
  try {
    return {
      mode: "live",
      startedAt,
      ...(await runOne(productId, liveDriver(productId, env))),
      finishedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      mode: "live",
      startedAt,
      ...classify(error, productId),
      finishedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const [mode, productId] = process.argv.slice(2);
  let result;
  if (mode === "--fake-all" && !productId) result = await runFakeAll();
  else if (mode === "--live" && ["codex", "kimi", "gemini"].includes(productId)) {
    result = await runLive(productId);
  } else {
    result = {
      state: "not-run",
      code: "usage",
      usage: "node scripts/validate-products-e2e.mjs --fake-all | --live <codex|kimi|gemini>",
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
