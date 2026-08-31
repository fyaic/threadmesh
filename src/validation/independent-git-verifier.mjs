import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../canonical-json.mjs";
import {
  assertProtocolObject,
  codedError,
  verificationAttestationDigest,
  verifyVerificationAttestation,
} from "../protocol-validator.mjs";

export const INDEPENDENT_GIT_VERIFIER_TEST = Object.freeze({
  command: "node",
  args: Object.freeze(["--test", "test/fixtures/independent-git-verifier-target.test.mjs"]),
  resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
});

const CHILD_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "independent-git-verifier-child.mjs",
);
const GIT_SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const ANCHOR_KEYS = ["keyId", "algorithm", "actorId", "trustDomain", "policyId", "publicKeyPem"];
const ROUTING_KEYS = ["messageId", "senderIncarnationId", "receiver"];
const CHAIN_KEYS = [
  "chainId", "requirementDigest", "validatedBaseSha", "fixtureSeedSha", "fixtureDefinitionDigest",
];

function verifierError(code, detail) {
  return codedError(code, detail);
}

function isExactObject(value, keys) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function assertTimeout(value, label) {
  if (!Number.isInteger(value) || value < 100 || value > 120_000) {
    throw verifierError("threadmesh_independent_git_verifier_timeout_invalid", label);
  }
}

function assertGitSha(value, label) {
  if (!GIT_SHA.test(value ?? "")) throw verifierError("threadmesh_independent_git_verifier_request_invalid", label);
}

function assertDigest(value, label) {
  if (!DIGEST.test(value ?? "")) throw verifierError("threadmesh_independent_git_verifier_request_invalid", label);
}

function assertRoutingIdentity(subject) {
  if (!isExactObject(subject, ROUTING_KEYS)) {
    throw verifierError("threadmesh_independent_git_verifier_request_invalid", "subject");
  }
  const subjectCheck = {
    specVersion: "0.0-draft",
    attestationId: "att_independent_git_verifier_subject_01",
    verifier: {
      actorType: "service",
      actorId: "threadmesh-independent-git-verifier",
      authenticationId: "authn_independent_git_verifier_01",
      trustDomain: "threadmesh://independent-git-verifier",
    },
    subject: { ...subject, claimType: "artifact-state", claimDigest: `sha256:${"a".repeat(64)}` },
    method: "independent-reproduction",
    evidenceDigest: `sha256:${"a".repeat(64)}`,
    verifiedAt: "2026-08-31T00:00:00.000Z",
    trustPolicy: {
      policyId: "threadmesh://independent-git-verifier/policy/1",
      decisionId: "decision_independent_git_verifier_subject_01",
      decision: "trusted",
      decidedAt: "2026-08-31T00:00:00.000Z",
    },
    signedPayloadDigest: "",
    proof: { algorithm: "ed25519", keyId: "threadmesh://independent-git-verifier/key/ephemeral", signature: "a".repeat(43) },
  };
  subjectCheck.signedPayloadDigest = verificationAttestationDigest(subjectCheck);
  assertProtocolObject("verification-attestation", subjectCheck);
}

function assertRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw verifierError("threadmesh_independent_git_verifier_request_invalid");
  }
  if (typeof request.repoPath !== "string" || !path.isAbsolute(request.repoPath) || request.repoPath.includes("\0")) {
    throw verifierError("threadmesh_independent_git_verifier_request_invalid", "repoPath");
  }
  if (!isExactObject(request.chain, CHAIN_KEYS)) {
    throw verifierError("threadmesh_independent_git_verifier_request_invalid", "chain");
  }
  if (!ID.test(request.chain.chainId)) throw verifierError("threadmesh_independent_git_verifier_request_invalid", "chainId");
  for (const key of ["requirementDigest", "fixtureDefinitionDigest"]) assertDigest(request.chain[key], key);
  for (const key of ["validatedBaseSha", "fixtureSeedSha"]) assertGitSha(request.chain[key], key);
  for (const phase of ["implementation", "fix"]) {
    const commit = request[phase];
    if (!isExactObject(commit, ["sha", "treeSha", "diffDigest"])) {
      throw verifierError("threadmesh_independent_git_verifier_request_invalid", phase);
    }
    assertGitSha(commit.sha, `${phase}.sha`);
    assertGitSha(commit.treeSha, `${phase}.treeSha`);
    assertDigest(commit.diffDigest, `${phase}.diffDigest`);
  }
  const finding = request.finding;
  if (
    !isExactObject(finding, ["resourcePath", "counterexample", "digest"]) ||
    typeof finding.resourcePath !== "string" || finding.resourcePath.length < 1 ||
    finding.resourcePath.length > 200 || path.isAbsolute(finding.resourcePath) ||
    finding.resourcePath.split(/[\\/]/u).includes("..") ||
    typeof finding.counterexample !== "string" || finding.counterexample.length < 1 ||
    finding.counterexample.length > 256 || !DIGEST.test(finding.digest) ||
    finding.digest !== independentGitFindingDigest(finding)
  ) throw verifierError("threadmesh_independent_git_verifier_request_invalid", "finding");
  if (!isExactObject(request.trustedTest, ["resourcePath", "blobDigest"]) ||
      request.trustedTest.resourcePath !== INDEPENDENT_GIT_VERIFIER_TEST.resourcePath) {
    throw verifierError("threadmesh_independent_git_verifier_request_invalid", "trustedTest");
  }
  assertDigest(request.trustedTest.blobDigest, "trustedTest.blobDigest");
  assertRoutingIdentity(request.subject);
}

function assertTrustAnchor(trustAnchor, code = "threadmesh_independent_git_verifier_response_invalid") {
  if (
    !isExactObject(trustAnchor, ANCHOR_KEYS) ||
    trustAnchor.keyId !== "threadmesh://independent-git-verifier/key/ephemeral" ||
    trustAnchor.algorithm !== "ed25519" ||
    trustAnchor.actorId !== "threadmesh-independent-git-verifier" ||
    trustAnchor.trustDomain !== "threadmesh://independent-git-verifier" ||
    trustAnchor.policyId !== "threadmesh://independent-git-verifier/policy/1" ||
    typeof trustAnchor.publicKeyPem !== "string" || trustAnchor.publicKeyPem.length > 1_024 ||
    !trustAnchor.publicKeyPem.includes("BEGIN PUBLIC KEY")
  ) throw verifierError(code, "trustAnchor");
}

function sameTrustAnchor(left, right) {
  return ANCHOR_KEYS.every((key) => left[key] === right[key]);
}

function bindingId(prefix, chain, implementationSha, fixSha, findingDigest) {
  return `${prefix}_${sha256Digest({ chain, implementationSha, fixSha, findingDigest }).slice(7, 31)}`;
}

function checkedGitWorktree(repoPath, args) {
  const result = spawnSync("git", ["-C", repoPath, "worktree", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  });
  if (result.status !== 0 || result.signal || result.error) {
    throw verifierError("threadmesh_independent_git_verifier_cleanup_failed");
  }
  return result.stdout;
}

function hasRegisteredWorktree(repoPath, worktree) {
  const expected = path.resolve(worktree);
  return checkedGitWorktree(repoPath, ["list", "--porcelain"])
    .split("\n")
    .some((line) => line === `worktree ${expected}`);
}

function cleanupWorkspace(workspaceRoot, repoPath) {
  const checkout = path.join(workspaceRoot, "checkout");
  try {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    checkedGitWorktree(repoPath, ["prune"]);
    if (hasRegisteredWorktree(repoPath, checkout)) {
      throw verifierError("threadmesh_independent_git_verifier_cleanup_failed");
    }
    return null;
  } catch {
    return verifierError("threadmesh_independent_git_verifier_cleanup_failed");
  }
}

function killProcessGroup(child) {
  if (process.platform !== "win32" && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The child may have already exited; fall through to direct termination.
    }
  }
  child.kill("SIGKILL");
}

export function independentGitFindingDigest({ resourcePath, counterexample }) {
  return sha256Digest({ resourcePath, counterexample });
}

export function independentGitClaimDigest({ chain, proof }) {
  return sha256Digest({ kind: "threadmesh-independent-git-verification-claim-v1", chain, proof });
}

/** Validates signed bounded-resource counterexample evidence, not semantic correctness. */
export function verifyIndependentGitVerification({ request, response, expectedTrustAnchor }) {
  assertRequest(request);
  try {
    assertTrustAnchor(expectedTrustAnchor, "threadmesh_independent_git_verifier_expected_trust_anchor_invalid");
  } catch (error) {
    if (error.code === "threadmesh_independent_git_verifier_expected_trust_anchor_invalid") throw error;
    throw verifierError("threadmesh_independent_git_verifier_expected_trust_anchor_invalid");
  }
  if (!isExactObject(response, ["trustAnchor", "attestation", "proof"])) {
    throw verifierError("threadmesh_independent_git_verifier_response_invalid");
  }
  const { trustAnchor, attestation, proof } = response;
  const expectedProofKeys = ["chain", "implementation", "fix", "finding", "test"];
  if (
    !isExactObject(proof, expectedProofKeys) ||
    !isExactObject(proof.chain, CHAIN_KEYS) ||
    !isExactObject(proof.implementation, ["sha", "parentSha", "treeSha", "diffDigest", "resourceDigest"]) ||
    !isExactObject(proof.fix, ["sha", "parentSha", "treeSha", "diffDigest", "resourceDigest"]) ||
    !isExactObject(proof.finding, ["resourcePath", "digest", "counterexampleDigest"]) ||
    !isExactObject(proof.test, ["command", "args", "resourcePath", "seedBlobDigest", "fixBlobDigest", "trustedBlobDigest"]) ||
    sha256Digest(proof.chain) !== sha256Digest(request.chain) ||
    proof.implementation.sha !== request.implementation.sha ||
    proof.implementation.parentSha !== request.chain.fixtureSeedSha ||
    proof.implementation.treeSha !== request.implementation.treeSha ||
    proof.implementation.diffDigest !== request.implementation.diffDigest ||
    proof.fix.sha !== request.fix.sha || proof.fix.parentSha !== request.implementation.sha ||
    proof.fix.treeSha !== request.fix.treeSha || proof.fix.diffDigest !== request.fix.diffDigest ||
    proof.finding.resourcePath !== request.finding.resourcePath ||
    proof.finding.digest !== request.finding.digest ||
    proof.finding.counterexampleDigest !== sha256Digest(request.finding.counterexample) ||
    proof.test.command !== INDEPENDENT_GIT_VERIFIER_TEST.command ||
    JSON.stringify(proof.test.args) !== JSON.stringify(INDEPENDENT_GIT_VERIFIER_TEST.args) ||
    proof.test.resourcePath !== request.trustedTest.resourcePath ||
    proof.test.trustedBlobDigest !== request.trustedTest.blobDigest ||
    proof.test.seedBlobDigest !== request.trustedTest.blobDigest ||
    proof.test.fixBlobDigest !== request.trustedTest.blobDigest ||
    !DIGEST.test(proof.implementation.resourceDigest) || !DIGEST.test(proof.fix.resourceDigest) ||
    !attestation || attestation.subject?.messageId !== request.subject.messageId ||
    attestation.subject?.senderIncarnationId !== request.subject.senderIncarnationId ||
    attestation.subject?.receiver?.taskId !== request.subject.receiver.taskId ||
    attestation.subject?.receiver?.incarnationId !== request.subject.receiver.incarnationId ||
    attestation.subject?.claimType !== "artifact-state" ||
    attestation.subject?.claimDigest !== independentGitClaimDigest({ chain: proof.chain, proof }) ||
    attestation.attestationId !== bindingId(
      "att_git", request.chain, request.implementation.sha, request.fix.sha, request.finding.digest,
    ) ||
    attestation.trustPolicy?.decisionId !== bindingId(
      "decision_git", request.chain, request.implementation.sha, request.fix.sha, request.finding.digest,
    ) ||
    attestation.evidenceDigest !== sha256Digest(proof) ||
    attestation.signedPayloadDigest !== verificationAttestationDigest(attestation)
  ) throw verifierError("threadmesh_independent_git_verifier_response_invalid");
  assertTrustAnchor(trustAnchor);
  if (!sameTrustAnchor(trustAnchor, expectedTrustAnchor)) {
    throw verifierError("threadmesh_independent_git_verifier_unexpected_trust_anchor");
  }
  try {
    verifyVerificationAttestation(attestation, trustAnchor);
  } catch (error) {
    throw verifierError(error.code ?? "threadmesh_independent_git_verifier_proof_invalid");
  }
  return Object.freeze({ trustAnchor, attestation, proof });
}

/** Starts one private-key-owning child and returns its anchor before requests. */
export async function startIndependentGitVerifierService({ startupTimeoutMs = 10_000 } = {}) {
  assertTimeout(startupTimeoutMs, "startupTimeoutMs");
  const child = spawn(process.execPath, [CHILD_PATH], {
    stdio: ["pipe", "pipe", "ignore"],
    env: { PATH: process.env.PATH ?? "", LANG: "C" },
    detached: process.platform !== "win32",
  });
  let output = "";
  let ready = false;
  let closed = false;
  let active;
  let requestNumber = 0;
  let resolveClosed;
  const closedPromise = new Promise((resolve) => { resolveClosed = resolve; });
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  let startupTimer;

  const settleActive = (error, response) => {
    if (!active) return;
    const current = active;
    active = undefined;
    clearTimeout(current.timer);
    const cleanupError = cleanupWorkspace(current.workspaceRoot, current.request.repoPath);
    if (cleanupError) return current.reject(cleanupError);
    if (error) return current.reject(error);
    try {
      current.resolve(verifyIndependentGitVerification({
        request: current.request,
        response,
        expectedTrustAnchor: trustAnchor,
      }));
    } catch (verificationError) {
      current.reject(verificationError);
    }
  };

  const stop = () => {
    closed = true;
    killProcessGroup(child);
  };
  const failChild = (code) => {
    stop();
    const error = verifierError(code);
    if (!ready) rejectReady(error);
    settleActive(error);
  };

  child.once("error", () => failChild("threadmesh_independent_git_verifier_child_failed"));
  child.once("exit", () => {
    closed = true;
    clearTimeout(startupTimer);
    if (!ready) rejectReady(verifierError("threadmesh_independent_git_verifier_child_failed"));
    settleActive(verifierError("threadmesh_independent_git_verifier_child_failed"));
    resolveClosed();
  });
  child.stdin.on("error", () => failChild("threadmesh_independent_git_verifier_child_failed"));
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (Buffer.byteLength(output) > 64 * 1024) return failChild("threadmesh_independent_git_verifier_child_invalid");
    let newline;
    while ((newline = output.indexOf("\n")) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        if (!ready) {
          if (!isExactObject(message, ["type", "trustAnchor"]) || message.type !== "ready") {
            throw verifierError("threadmesh_independent_git_verifier_child_invalid");
          }
          assertTrustAnchor(message.trustAnchor);
          ready = true;
          clearTimeout(startupTimer);
          resolveReady(message.trustAnchor);
          continue;
        }
        if (!isExactObject(message, ["type", "id", "ok", "value"]) &&
            !isExactObject(message, ["type", "id", "ok", "code"])) {
          throw verifierError("threadmesh_independent_git_verifier_child_invalid");
        }
        if (message.type !== "result" || message.id !== active?.id) {
          throw verifierError("threadmesh_independent_git_verifier_child_invalid");
        }
        if (message.ok === true) settleActive(undefined, message.value);
        else if (message.ok === false && typeof message.code === "string" && message.code.length <= 120) {
          settleActive(verifierError(message.code));
        } else throw verifierError("threadmesh_independent_git_verifier_child_invalid");
      } catch (error) {
        failChild(error.code ?? "threadmesh_independent_git_verifier_child_invalid");
      }
    }
  });
  startupTimer = setTimeout(() => failChild("threadmesh_independent_git_verifier_timeout"), startupTimeoutMs);
  const trustAnchor = await readyPromise;

  return Object.freeze({
    trustAnchor,
    async verify(request, { timeoutMs = 30_000 } = {}) {
      assertRequest(request);
      assertTimeout(timeoutMs, "timeoutMs");
      if (closed) throw verifierError("threadmesh_independent_git_verifier_service_closed");
      if (active) throw verifierError("threadmesh_independent_git_verifier_busy");
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-independent-git-verifier-"));
      const id = `verify_${++requestNumber}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => failChild("threadmesh_independent_git_verifier_timeout"), timeoutMs);
        active = { id, request, workspaceRoot, timer, resolve, reject };
        try {
          child.stdin.write(`${JSON.stringify({ type: "verify", id, request, workspaceRoot })}\n`, (error) => {
            if (error) failChild("threadmesh_independent_git_verifier_child_failed");
          });
        } catch {
          failChild("threadmesh_independent_git_verifier_child_failed");
        }
      });
    },
    async close() {
      stop();
      await closedPromise;
      return Object.freeze({ closed: true, childExited: true });
    },
  });
}

/** One-shot convenience wrapper; use the service API when preconfiguring trust. */
export async function runIndependentGitVerifier(request, { timeoutMs = 30_000 } = {}) {
  const service = await startIndependentGitVerifierService();
  try {
    return await service.verify(request, { timeoutMs });
  } finally {
    await service.close();
  }
}
