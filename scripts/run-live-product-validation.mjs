import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ACK = "issue-7-approved-for-live-product-validation";
const MAINTAINER_EXPERIMENTAL_ACK =
  "maintainer-approved-for-experimental-live-validation";
const REPOSITORY = "fyaic/threadmesh";
const REVIEW_TARGET = "265e461f1b8714c56f7fe817795b81d895f732c6";
const PRODUCT_ADAPTERS = Object.freeze({
  codex: "codex-app-server",
  "codex-proactive": "codex-app-server",
  "codex-attention": "codex-app-server",
  kimi: "acp-session",
  gemini: "gemini-headless",
});
const EVIDENCE_KEYS = Object.freeze({
  codex: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
  "codex-proactive": ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
  "codex-attention": ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
  kimi: ["kind", "sessionId", "snapshotDigest", "stopReason"],
  gemini: ["exitCode", "kind", "resultStatus", "sessionId", "snapshotDigest", "toolUseCount"],
});
const METADATA_KEYS = Object.freeze({
  codex: ["userAgent", "model", "modelProvider"],
  "codex-proactive": ["userAgent", "model", "modelProvider"],
  "codex-attention": ["userAgent", "model", "modelProvider"],
  kimi: ["protocolVersion", "agentName", "agentVersion"],
  gemini: ["version", "interface", "approvalMode", "sandboxRequested"],
});
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

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function boundedMetadataValue(value) {
  if (value === null || typeof value === "boolean" || Number.isSafeInteger(value)) {
    return { accepted: true, value };
  }
  if (typeof value === "string" && Buffer.byteLength(value) <= 256 &&
      !/[\u0000-\u001f\u007f]/u.test(value)) {
    return { accepted: true, value };
  }
  if (
    value && typeof value === "object" && !Array.isArray(value) &&
    value.redacted === true && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0 &&
    /^sha256:[a-f0-9]{64}$/.test(value.digest ?? "")
  ) {
    return {
      accepted: true,
      value: { redacted: true, byteLength: value.byteLength, digest: value.digest },
    };
  }
  return { accepted: false };
}

function projectMetadata(productId, metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const projected = {};
  for (const key of METADATA_KEYS[productId] ?? []) {
    if (!Object.hasOwn(metadata, key)) return null;
    const bounded = boundedMetadataValue(metadata[key]);
    if (!bounded.accepted) return null;
    projected[key] = bounded.value;
  }
  return projected;
}

function projectReviewGate(gate) {
  if (
    gate?.satisfied !== true || gate.scope !== "m0-normative" ||
    gate.reviewTarget !== REVIEW_TARGET || gate.reviewCount !== 2 ||
    !Number.isSafeInteger(gate.externalReviewerCount) || gate.externalReviewerCount < 1 ||
    gate.externalReviewerCount > gate.reviewCount ||
    JSON.stringify(gate.perspectives) !== JSON.stringify(["agent-safety", "distributed-systems"])
  ) return null;
  return {
    satisfied: true,
    scope: gate.scope,
    reviewTarget: gate.reviewTarget,
    reviewCount: gate.reviewCount,
    externalReviewerCount: gate.externalReviewerCount,
    perspectives: [...gate.perspectives],
  };
}

function projectExperimentalReviewGate(gate) {
  if (
    gate?.satisfied !== false || gate.scope !== "m0-normative" ||
    gate.reviewTarget !== REVIEW_TARGET || !Number.isSafeInteger(gate.reviewCount) ||
    gate.reviewCount < 0 || !Number.isSafeInteger(gate.externalReviewerCount) ||
    gate.externalReviewerCount < 0 || gate.externalReviewerCount > gate.reviewCount ||
    !Array.isArray(gate.perspectives) ||
    !gate.perspectives.every((value) =>
      ["agent-safety", "distributed-systems"].includes(value))
  ) return null;
  return {
    satisfied: false,
    scope: gate.scope,
    reviewTarget: gate.reviewTarget,
    reviewCount: gate.reviewCount,
    externalReviewerCount: gate.externalReviewerCount,
    perspectives: [...gate.perspectives],
  };
}

function projectAuthorization(result, allowMaintainerExperimental) {
  if (
    result.authorization?.mode === "external-review" &&
    result.authorization.normativeReviewSatisfied === true &&
    result.authorization.issueUrl === "https://github.com/fyaic/threadmesh/issues/7"
  ) {
    const reviewGate = projectReviewGate(result.reviewGate);
    return reviewGate ? { authorization: { ...result.authorization }, reviewGate } : null;
  }
  if (
    allowMaintainerExperimental === true &&
    result.authorization?.mode === "maintainer-experimental" &&
    result.authorization.normativeReviewSatisfied === false &&
    result.authorization.issueUrl === "https://github.com/fyaic/threadmesh/issues/7"
  ) {
    const reviewGate = projectExperimentalReviewGate(result.reviewGate);
    return reviewGate ? { authorization: { ...result.authorization }, reviewGate } : null;
  }
  return null;
}

function projectRepository(repository, executionSha) {
  if (
    repository?.satisfied !== true || repository.head !== executionSha ||
    repository.expectedSha !== executionSha || repository.remoteMain !== executionSha ||
    repository.branch !== "" || repository.clean !== true
  ) return null;
  return {
    satisfied: true,
    head: repository.head,
    branch: "",
    clean: true,
    remoteMain: repository.remoteMain,
    expectedSha: repository.expectedSha,
    errors: [],
  };
}

function projectCleanup(productId, cleanup, { requireComplete }) {
  if (!cleanup || typeof cleanup !== "object" || Array.isArray(cleanup)) return null;
  if (typeof cleanup.attempted !== "boolean" || typeof cleanup.complete !== "boolean") return null;
  const projected = { attempted: cleanup.attempted, complete: cleanup.complete };
  if (requireComplete && (cleanup.attempted !== true || cleanup.complete !== true)) return null;
  const productFields = {
    codex: ["threadDeleted"],
    "codex-proactive": ["threadDeleted", "aThreadDeleted", "bThreadDeleted"],
    "codex-attention": ["threadDeleted", "aThreadDeleted", "bThreadDeleted"],
    kimi: ["sessionDeleted", "absenceVerified"],
    gemini: ["isolatedHomeRemoved"],
  }[productId] ?? [];
  for (const key of productFields) {
    if (cleanup[key] === undefined && !requireComplete) continue;
    if (typeof cleanup[key] !== "boolean") return null;
    projected[key] = cleanup[key];
    if (requireComplete && cleanup[key] !== true) return null;
  }
  if (typeof cleanup.errorCode === "string" && /^[a-z0-9_]{1,128}$/.test(cleanup.errorCode)) {
    projected.errorCode = cleanup.errorCode;
  }
  return projected;
}

function projectLiveChildResult(result, {
  productId,
  executionSha,
  allowMaintainerExperimental = false,
}) {
  if (
    result.mode !== "live" || result.productId !== productId ||
    !isCanonicalIsoTimestamp(result.startedAt) || !isCanonicalIsoTimestamp(result.finishedAt) ||
    Date.parse(result.finishedAt) < Date.parse(result.startedAt)
  ) return null;
  const authorizationProjection = projectAuthorization(result, allowMaintainerExperimental);
  const repository = projectRepository(result.repository, executionSha);
  if (!authorizationProjection || !repository) return null;
  const projected = {
    mode: "live",
    productId,
    state: result.state,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    ...authorizationProjection,
    repository,
  };
  if (result.state !== "passed") {
    if (typeof result.code !== "string" || !/^[a-z0-9_]{1,128}$/.test(result.code)) return null;
    projected.code = result.code;
    if (result.cleanup !== undefined) {
      const cleanup = projectCleanup(productId, result.cleanup, { requireComplete: false });
      if (!cleanup) return null;
      projected.cleanup = cleanup;
    }
    return projected;
  }
  const expectedEvidenceKeys = EVIDENCE_KEYS[productId];
  const metadata = projectMetadata(productId, result.productMetadata);
  const cleanup = projectCleanup(productId, result.cleanup, { requireComplete: true });
  if (productId === "codex-attention") {
    const attention = projectCodexAttentionResult(result);
    if (
      result.adapterKind !== PRODUCT_ADAPTERS[productId] ||
      typeof result.messageId !== "string" ||
      !/^msg_[a-zA-Z0-9_]{1,240}$/.test(result.messageId) ||
      result.mailbox !== "claimed-and-accepted" ||
      result.markerMatched !== true ||
      JSON.stringify(result.evidenceKeys) !== JSON.stringify(expectedEvidenceKeys) ||
      !/^sha256:[a-f0-9]{64}$/.test(result.adapterSnapshotDigest ?? "") ||
      !metadata || !cleanup || !attention
    ) return null;
    return {
      ...projected,
      messageId: result.messageId,
      adapterKind: result.adapterKind,
      mailbox: result.mailbox,
      markerMatched: true,
      evidenceKeys: [...result.evidenceKeys],
      adapterSnapshotDigest: result.adapterSnapshotDigest,
      productMetadata: metadata,
      cleanup,
      attention,
    };
  }
  if (
    result.adapterKind !== PRODUCT_ADAPTERS[productId] ||
    typeof result.messageId !== "string" || !/^msg_[a-zA-Z0-9_]{1,240}$/.test(result.messageId) ||
    result.mailbox !== "claimed-and-accepted" || result.delivery !== "context-admitted" ||
    result.decision !== "accepted" || result.outcome !== "not-observed" ||
    result.markerMatched !== true ||
    JSON.stringify(result.evidenceKeys) !== JSON.stringify(expectedEvidenceKeys) ||
    !/^sha256:[a-f0-9]{64}$/.test(result.adapterSnapshotDigest ?? "") ||
    !metadata || !cleanup
  ) return null;
  const proactive = productId === "codex-proactive"
    ? projectProactiveResult(result)
    : null;
  if (productId === "codex-proactive" && !proactive) return null;
  return {
    ...projected,
    messageId: result.messageId,
    adapterKind: result.adapterKind,
    mailbox: result.mailbox,
    delivery: result.delivery,
    decision: result.decision,
    outcome: result.outcome,
    markerMatched: true,
    evidenceKeys: [...result.evidenceKeys],
    adapterSnapshotDigest: result.adapterSnapshotDigest,
    productMetadata: metadata,
    cleanup,
    ...(proactive ? { proactive } : {}),
  };
}

function projectSha256Digest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)
    ? value
    : null;
}

function boundedOpaqueId(value) {
  return typeof value === "string" &&
    Buffer.byteLength(value) >= 1 &&
    Buffer.byteLength(value) <= 512 &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function opaqueIdDigest(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validAttentionThreadRef(ref) {
  return ref && typeof ref === "object" && !Array.isArray(ref) &&
    JSON.stringify(Object.keys(ref).sort()) ===
      JSON.stringify(["snapshotDigest", "threadId"]) &&
    boundedOpaqueId(ref.threadId) && projectSha256Digest(ref.snapshotDigest);
}

function validAttentionEvidence(evidence) {
  return evidence && typeof evidence === "object" && !Array.isArray(evidence) &&
    JSON.stringify(Object.keys(evidence).sort()) === JSON.stringify([
      "kind",
      "snapshotDigest",
      "threadId",
      "turnId",
      "turnStatus",
    ]) &&
    evidence.kind === "codex-app-server" &&
    boundedOpaqueId(evidence.threadId) && boundedOpaqueId(evidence.turnId) &&
    evidence.turnStatus === "completed" &&
    projectSha256Digest(evidence.snapshotDigest);
}

function validAttentionReceipt(receipt) {
  return receipt && typeof receipt === "object" && !Array.isArray(receipt) &&
    JSON.stringify(Object.keys(receipt).sort()) === JSON.stringify([
      "acceptedAt",
      "adapterOperationId",
      "evidenceRefs",
    ]) &&
    boundedOpaqueId(receipt.adapterOperationId) &&
    isCanonicalIsoTimestamp(receipt.acceptedAt) &&
    Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length >= 1 &&
    receipt.evidenceRefs.length <= 8 &&
    receipt.evidenceRefs.every((value) => boundedOpaqueId(value));
}

function projectCodexAttentionResult(result) {
  const digests = result.evidenceDigests;
  const aThread = result.threads?.a;
  const bThread = result.threads?.b;
  const receiverEvidence = result.receiverEvidence;
  const adapterReceipt = result.adapterReceipt;
  if (
    !digests || typeof digests !== "object" || Array.isArray(digests) ||
    JSON.stringify(Object.keys(digests).sort()) !==
      JSON.stringify(["dependencyEdge", "disposition", "lifecycleEvent"]) ||
    !projectSha256Digest(digests.lifecycleEvent) ||
    !projectSha256Digest(digests.disposition) ||
    !projectSha256Digest(digests.dependencyEdge) ||
    !validAttentionThreadRef(aThread) ||
    !validAttentionThreadRef(bThread) ||
    aThread.threadId === bThread.threadId ||
    !validAttentionEvidence(receiverEvidence) ||
    !validAttentionReceipt(adapterReceipt) ||
    receiverEvidence.threadId !== bThread.threadId ||
    receiverEvidence.snapshotDigest !== bThread.snapshotDigest ||
    result.adapterSnapshotDigest !== bThread.snapshotDigest ||
    adapterReceipt.adapterOperationId !== receiverEvidence.turnId ||
    result.condition !== "relevant" ||
    result.modelSelectedCommunication !== true ||
    result.scriptedSubmitCount !== 0 ||
    result.manualRelayActions !== 0 ||
    result.modelPollingTurns !== 0 ||
    result.relatedTaskCalls !== 1 ||
    result.publishCalls !== 1 ||
    result.nonThreadMeshToolCalls !== 0 ||
    JSON.stringify(result.aToolCalls) !== JSON.stringify([
      "threadmesh_related_tasks",
      "threadmesh_publish_dependency",
    ]) ||
    result.lifecycleEventType !== "dependency-satisfied" ||
    result.cursorEventObserved !== true ||
    !Number.isSafeInteger(result.wakeCursor) || result.wakeCursor < 1 ||
    result.receiverResumeCount !== 1 ||
    result.routeReasonCode !== "attention-offer-authorized" ||
    result.wakeReasonCode !== "attention-wake-reconciled" ||
    result.receiverActivated !== true ||
    result.receiverDecision !== "accepted" ||
    result.delivery !== "adapter-submitted" ||
    result.outcome !== "externally-verified" ||
    result.verificationMode !== "local-simulation" ||
    result.externalVerificationReasonCode !== "dependency-satisfied-verified" ||
    result.dependencyStatus !== "satisfied" ||
    result.dependencyUnlock !== true ||
    result.restartRecovered !== true ||
    result.recoveredTaskState !== "ready"
  ) return null;
  return {
    condition: "relevant",
    modelSelectedCommunication: true,
    scriptedSubmitCount: 0,
    manualRelayActions: 0,
    modelPollingTurns: 0,
    relatedTaskCalls: 1,
    publishCalls: 1,
    nonThreadMeshToolCalls: 0,
    aToolCalls: [...result.aToolCalls],
    lifecycleEventType: result.lifecycleEventType,
    cursorEventObserved: true,
    wakeCursor: result.wakeCursor,
    receiverResumeCount: 1,
    routeReasonCode: result.routeReasonCode,
    wakeReasonCode: result.wakeReasonCode,
    receiverActivated: true,
    receiverDecision: result.receiverDecision,
    delivery: result.delivery,
    outcome: result.outcome,
    verificationMode: result.verificationMode,
    externalVerificationReasonCode: result.externalVerificationReasonCode,
    dependencyStatus: result.dependencyStatus,
    dependencyUnlock: true,
    restartRecovered: true,
    recoveredTaskState: result.recoveredTaskState,
    threadCorrelation: {
      aThreadDigest: opaqueIdDigest(aThread.threadId),
      bThreadDigest: opaqueIdDigest(bThread.threadId),
      receiverTurnDigest: opaqueIdDigest(receiverEvidence.turnId),
      threadsDistinct: true,
      receiverMatchedPrecreatedThread: true,
      receiptMatchedReceiverTurn: true,
    },
    evidenceDigests: {
      lifecycleEvent: digests.lifecycleEvent,
      disposition: digests.disposition,
      dependencyEdge: digests.dependencyEdge,
    },
  };
}

function projectProactiveResult(result) {
  if (
    result.modelSelectedCommunication !== true || result.scriptedSubmitCount !== 0 ||
    result.relatedTaskCalls !== 1 || result.sendCalls !== 1 ||
    result.nonThreadMeshToolCalls !== 0 ||
    result.aDecisionCompleted !== true || result.bMarkerMatched !== true ||
    JSON.stringify(result.aToolCalls) !== JSON.stringify([
      "threadmesh_related_tasks",
      "threadmesh_send_suggestion",
    ])
  ) return null;
  return {
    modelSelectedCommunication: true,
    scriptedSubmitCount: 0,
    relatedTaskCalls: 1,
    sendCalls: 1,
    nonThreadMeshToolCalls: 0,
    aDecisionCompleted: true,
    bMarkerMatched: true,
    aToolCalls: [...result.aToolCalls],
  };
}

export function validateIsolatedLiveChild(child, {
  productId,
  executionSha,
  allowMaintainerExperimental = false,
}) {
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
  const projected = projectLiveChildResult(result, {
    productId,
    executionSha,
    allowMaintainerExperimental,
  });
  if (!projected) {
    return { accepted: false, code: "isolated_live_result_binding_mismatch" };
  }
  return { accepted: true, result: projected };
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
  const allowMaintainerExperimental =
    process.env.THREADMESH_MAINTAINER_EXPERIMENTAL_ACK === MAINTAINER_EXPERIMENTAL_ACK;
  let result;
  if (!["codex", "codex-proactive", "codex-attention", "kimi", "gemini"].includes(productId)) {
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
          if (gate.status !== 0 && !allowMaintainerExperimental) {
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
              const validation = validateIsolatedLiveChild(child, {
                productId,
                executionSha,
                allowMaintainerExperimental,
              });
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
