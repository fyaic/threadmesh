#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPiIntegrationLive } from "../src/validation/pi-live-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ACK = "I_UNDERSTAND_THIS_RUNS_REAL_PI_AND_KIMI_MODELS";

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function preflight() {
  if (process.env.THREADMESH_PI_LIVE_ACK !== ACK) {
    return { satisfied: false, code: "pi_live_acknowledgement_missing" };
  }
  if (git("branch", "--show-current") !== "main" || git("status", "--porcelain") !== "") {
    return { satisfied: false, code: "pi_live_clean_main_required" };
  }
  git("fetch", "origin", "main", "--quiet");
  const head = git("rev-parse", "HEAD");
  const remoteMain = git("rev-parse", "origin/main");
  if (head !== remoteMain) return { satisfied: false, code: "pi_live_synced_main_required" };
  return { satisfied: true, head };
}

const gate = preflight();
if (!gate.satisfied) {
  console.log(JSON.stringify({ mode: "pi-integration-live", state: "not-run", code: gate.code }));
  process.exitCode = 3;
} else {
  const result = await runPiIntegrationLive({
    piCommand: "/opt/homebrew/bin/pi",
    kimiCommand: "/Users/veil/.kimi-code/bin/kimi",
    cwd: root,
  });
  console.log(JSON.stringify({
    ...result,
    repository: { head: gate.head, clean: true, synchronizedMain: true },
  }, null, 2));
  process.exitCode = result.state === "passed" ? 0 : result.state === "blocked" ? 2 : 1;
}
