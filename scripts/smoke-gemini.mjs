import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import { GeminiHeadlessAdapter } from "../src/adapters/gemini-headless.mjs";

const execFileAsync = promisify(execFile);
const command = process.env.NPX_BIN ?? "/opt/homebrew/bin/npx";
const npmCommand = process.env.NPM_BIN ?? "/opt/homebrew/bin/npm";
const packageSpecifier = "@google/gemini-cli@0.56.0";
const expectedIntegrity = "sha512-q4oBfb/Oh/HNLMYBOJMp88/QQ8hLffnB0ykoVThi6A5isbGHJ/ylWLMosMGqukKY0Q1Jv/XRDpb46Q1BV+zQqw==";
const baseArgs = ["--yes", packageSpecifier];
const temporaryHome = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-gemini-home-"));
const adapter = new GeminiHeadlessAdapter();
const result = {
  command,
  packageSpecifier,
  packageIntegrity: null,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  probe: null,
  liveMarker: { state: "not-run", code: "gemini_live_marker_gated" },
  cleanup: { attempted: false, isolatedHomeRemoved: false },
};

try {
  const integrity = await execFileAsync(
    npmCommand,
    ["view", packageSpecifier, "dist.integrity"],
    { timeout: 30_000 },
  );
  result.packageIntegrity = integrity.stdout.trim();
  if (result.packageIntegrity !== expectedIntegrity) {
    throw new Error("gemini_package_integrity_mismatch");
  }
  const env = { GEMINI_CLI_HOME: temporaryHome };
  result.probe = await adapter.probe({
    command,
    baseArgs,
    cwd: process.cwd(),
    env,
    timeoutMs: 60_000,
  });
} catch (error) {
  const code = error?.code ?? "unknown_error";
  const blocked = ["gemini_quota_error", "gemini_auth_error"].includes(code);
  result.liveMarker = {
    state: blocked ? "blocked" : "failed",
    code,
  };
} finally {
  result.cleanup.attempted = true;
  fs.rmSync(temporaryHome, { recursive: true, force: false });
  result.cleanup.isolatedHomeRemoved = !fs.existsSync(temporaryHome);
  result.finishedAt = new Date().toISOString();
}

console.log(JSON.stringify(result, null, 2));
if (result.liveMarker.state === "failed" || !result.cleanup.isolatedHomeRemoved) process.exitCode = 1;
if (result.liveMarker.state === "blocked") process.exitCode = 2;
