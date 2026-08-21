import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ACK = "issue-7-approved-for-live-product-validation";
const REPOSITORY = "fyaic/threadmesh";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitOutput(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function remoteMain() {
  return execFileSync("gh", [
    "api",
    "--hostname",
    "github.com",
    `repos/${REPOSITORY}/commits/main`,
    "--jq",
    ".sha",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function snapshot(cwd) {
  try {
    return {
      head: gitOutput(["rev-parse", "HEAD"], cwd),
      branch: gitOutput(["branch", "--show-current"], cwd),
      clean: gitOutput(["status", "--porcelain"], cwd).length === 0,
      remoteMain: remoteMain(),
      errors: [],
    };
  } catch {
    return {
      head: null,
      branch: null,
      clean: false,
      remoteMain: null,
      errors: ["repository state or GitHub main could not be verified"],
    };
  }
}

export function evaluateMainCheckoutBoundary(value) {
  const errors = [...(value.errors ?? [])];
  if (value.branch !== "main") errors.push("live validation requires branch main");
  if (!value.clean) errors.push("live validation requires a clean worktree");
  if (value.head !== value.remoteMain) errors.push("local HEAD must equal GitHub main");
  return { ...value, satisfied: errors.length === 0, errors };
}

export function evaluateIsolatedCheckoutBoundary(value, expectedSha) {
  const errors = [...(value.errors ?? [])];
  if (value.branch !== "") errors.push("execution worktree must be detached");
  if (!value.clean) errors.push("execution worktree must remain clean");
  if (value.head !== expectedSha || value.remoteMain !== expectedSha) {
    errors.push("execution worktree and GitHub main must remain at the validated SHA");
  }
  return { ...value, expectedSha, satisfied: errors.length === 0, errors };
}

export function resultExitCode(state) {
  if (state === "passed") return 0;
  if (state === "failed") return 1;
  if (state === "blocked") return 2;
  if (state === "not-run") return 3;
  return null;
}

export function validateIsolatedLiveChild(child, { productId, executionSha }) {
  let result;
  try {
    result = JSON.parse(child.stdout);
  } catch {
    return { accepted: false, code: "isolated_live_result_invalid" };
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { accepted: false, code: "isolated_live_result_invalid" };
  }
  const expectedStatus = resultExitCode(result.state);
  if (
    child.error != null ||
    child.signal !== null ||
    expectedStatus === null ||
    child.status !== expectedStatus
  ) {
    return { accepted: false, code: "isolated_live_child_exit_mismatch" };
  }
  if (
    result.mode !== "live" ||
    result.productId !== productId ||
    typeof result.startedAt !== "string" ||
    typeof result.finishedAt !== "string" ||
    result.reviewGate?.satisfied !== true ||
    result.repository?.satisfied !== true ||
    result.repository?.head !== executionSha ||
    result.repository?.expectedSha !== executionSha ||
    result.repository?.remoteMain !== executionSha ||
    result.repository?.branch !== "" ||
    result.repository?.clean !== true
  ) {
    return { accepted: false, code: "isolated_live_result_binding_mismatch" };
  }
  if (result.state === "passed" && (
    result.mailbox !== "claimed-and-accepted" ||
    result.delivery !== "context-admitted" ||
    result.markerMatched !== true ||
    result.cleanup?.complete !== true
  )) {
    return { accepted: false, code: "isolated_live_result_binding_mismatch" };
  }
  if (result.state !== "passed" && typeof result.code !== "string") {
    return { accepted: false, code: "isolated_live_result_binding_mismatch" };
  }
  return { accepted: true, result };
}

function stableResult(productId, code, startedAt, boundary = null) {
  return {
    mode: "live-bootstrap",
    productId,
    state: "not-run",
    code,
    startedAt,
    finishedAt: new Date().toISOString(),
    ...(boundary ? { repositoryBoundary: boundary } : {}),
  };
}

function main() {
  const startedAt = new Date().toISOString();
  const productId = process.argv[2];
  let result;
  if (!["codex", "kimi", "gemini"].includes(productId)) {
    result = stableResult(productId ?? null, "usage", startedAt);
  } else if (process.env.THREADMESH_LIVE_E2E_ACK !== ACK) {
    result = {
      ...stableResult(productId, "external_review_gate_not_acknowledged", startedAt),
      requiredAcknowledgement: ACK,
    };
  } else {
    const startBoundary = evaluateMainCheckoutBoundary(snapshot(root));
    if (!startBoundary.satisfied) {
      result = stableResult(productId, "live_repository_not_ready", startedAt, {
        start: startBoundary,
      });
    } else {
      const executionSha = startBoundary.head;
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-live-boundary-"));
      const worktree = path.join(temporaryRoot, "checkout");
      let worktreeAdded = false;
      let cleanupComplete = false;
      let childResult = null;
      let failureCode = null;
      let failureState = "failed";
      let executionStart = null;
      let executionEnd = null;
      try {
        execFileSync("git", ["worktree", "add", "--detach", worktree, executionSha], {
          cwd: root,
          stdio: "ignore",
        });
        worktreeAdded = true;
        executionStart = evaluateIsolatedCheckoutBoundary(snapshot(worktree), executionSha);
        if (!executionStart.satisfied) {
          failureCode = "isolated_live_repository_not_ready";
        } else {
          const gate = spawnSync(
            process.execPath,
            ["scripts/verify-external-review-gate.mjs"],
            {
              cwd: worktree,
              env: { ...process.env, THREADMESH_ISOLATED_LIVE_SHA: executionSha },
              encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"],
              timeout: 60_000,
              maxBuffer: 256 * 1024,
            },
          );
          if (gate.status !== 0) {
            failureCode = "external_review_records_incomplete";
            failureState = "not-run";
          } else {
            const install = spawnSync(
              process.env.NPM_BIN ?? "npm",
              ["ci", "--no-audit", "--no-fund"],
              { cwd: worktree, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000 },
            );
            if (install.status !== 0) {
              failureCode = "isolated_dependency_install_failed";
            } else {
              const child = spawnSync(
                process.execPath,
                ["scripts/validate-products-e2e.mjs", "--isolated-live", productId],
                {
                  cwd: worktree,
                  env: { ...process.env, THREADMESH_ISOLATED_LIVE_SHA: executionSha },
                  encoding: "utf8",
                  stdio: ["ignore", "pipe", "pipe"],
                  timeout: 600_000,
                  maxBuffer: 2 * 1024 * 1024,
                },
              );
              const validation = validateIsolatedLiveChild(child, { productId, executionSha });
              if (validation.accepted) childResult = validation.result;
              else failureCode = validation.code;
            }
          }
        }
        executionEnd = evaluateIsolatedCheckoutBoundary(snapshot(worktree), executionSha);
        if (!executionEnd.satisfied) {
          failureCode = "live_repository_changed_during_execution";
          failureState = "failed";
        }
      } catch {
        failureCode = "isolated_live_bootstrap_failed";
      } finally {
        try {
          if (worktreeAdded) {
            execFileSync("git", ["worktree", "remove", "--force", worktree], {
              cwd: root,
              stdio: "ignore",
            });
          }
          fs.rmSync(temporaryRoot, { recursive: true, force: true });
          cleanupComplete = true;
        } catch {
          cleanupComplete = false;
        }
      }

      const mainEnd = evaluateMainCheckoutBoundary(snapshot(root));
      if (
        !mainEnd.satisfied ||
        mainEnd.head !== executionSha ||
        mainEnd.remoteMain !== executionSha
      ) {
        failureCode = "live_repository_changed_during_execution";
        failureState = "failed";
      }
      if (!cleanupComplete) {
        failureCode = "live_worktree_cleanup_incomplete";
        failureState = "failed";
      }
      const repositoryBoundary = {
        executionSha,
        start: startBoundary,
        executionStart,
        executionEnd,
        end: mainEnd,
        cleanupComplete,
      };
      if (failureCode) {
        result = {
          mode: "live-bootstrap",
          productId,
          state: failureState,
          code: failureCode,
          startedAt,
          finishedAt: new Date().toISOString(),
          repositoryBoundary,
        };
      } else {
        result = {
          ...childResult,
          mode: "live-bootstrap",
          repositoryBoundary,
        };
      }
    }
  }

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = resultExitCode(result.state) ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
