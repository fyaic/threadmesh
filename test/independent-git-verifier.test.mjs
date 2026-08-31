import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  INDEPENDENT_GIT_VERIFIER_TEST,
  independentGitClaimDigest,
  independentGitFindingDigest,
  runIndependentGitVerifier,
  startIndependentGitVerifierService,
  verifyIndependentGitVerification,
} from "../src/validation/independent-git-verifier.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetFixture = path.join(root, INDEPENDENT_GIT_VERIFIER_TEST.resourcePath);

function git(repoPath, ...args) {
  return execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8" }).trim();
}

function commit(repoPath, message) {
  git(repoPath, "add", ".");
  git(repoPath, "commit", "-m", message, "--quiet");
  return git(repoPath, "rev-parse", "HEAD");
}

function treeSha(repository, sha) {
  return git(repository, "rev-parse", `${sha}^{tree}`);
}

function diffDigest(repository, parentSha, sha) {
  return sha256Digest(execFileSync("git", [
    "-C", repository, "diff", "--binary", "--no-ext-diff", "--no-renames", parentSha, sha,
  ], { encoding: "utf8" }));
}

function createRepository({ fixArtifact = "FIXED\n", fixTestContent } = {}) {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-git-verifier-test-"));
  git(repoPath, "init", "--quiet");
  git(repoPath, "config", "user.email", "verifier-test@example.invalid");
  git(repoPath, "config", "user.name", "Verifier Test");
  fs.mkdirSync(path.join(repoPath, "test", "fixtures"), { recursive: true });
  fs.copyFileSync(targetFixture, path.join(repoPath, INDEPENDENT_GIT_VERIFIER_TEST.resourcePath));
  fs.writeFileSync(path.join(repoPath, "artifact.txt"), "BASE\n");
  const baseSha = commit(repoPath, "base");
  fs.writeFileSync(path.join(repoPath, "artifact.txt"), "SEED\n");
  const fixtureSeedSha = commit(repoPath, "fixture seed");
  fs.writeFileSync(path.join(repoPath, "artifact.txt"), "BAD_COUNTEREXAMPLE\n");
  const implementationSha = commit(repoPath, "implementation finding");
  fs.writeFileSync(path.join(repoPath, "artifact.txt"), fixArtifact);
  if (fixTestContent) {
    fs.writeFileSync(path.join(repoPath, INDEPENDENT_GIT_VERIFIER_TEST.resourcePath), fixTestContent);
  }
  const fixSha = commit(repoPath, "fix finding");
  return { repoPath, baseSha, fixtureSeedSha, implementationSha, fixSha };
}

function requestFor(repository, { counterexample = "BAD_COUNTEREXAMPLE", chainId = "chain-m5-2-01", subject } = {}) {
  const finding = { resourcePath: "artifact.txt", counterexample };
  const testBlob = fs.readFileSync(
    path.join(repository.repoPath, INDEPENDENT_GIT_VERIFIER_TEST.resourcePath),
    "utf8",
  );
  return {
    repoPath: repository.repoPath,
    chain: {
      chainId,
      requirementDigest: sha256Digest({ chainId, kind: "requirement" }),
      validatedBaseSha: repository.baseSha,
      fixtureSeedSha: repository.fixtureSeedSha,
      fixtureDefinitionDigest: sha256Digest({ chainId, kind: "fixture" }),
    },
    implementation: {
      sha: repository.implementationSha,
      treeSha: treeSha(repository.repoPath, repository.implementationSha),
      diffDigest: diffDigest(repository.repoPath, repository.fixtureSeedSha, repository.implementationSha),
    },
    fix: {
      sha: repository.fixSha,
      treeSha: treeSha(repository.repoPath, repository.fixSha),
      diffDigest: diffDigest(repository.repoPath, repository.implementationSha, repository.fixSha),
    },
    finding: { ...finding, digest: independentGitFindingDigest(finding) },
    trustedTest: {
      resourcePath: INDEPENDENT_GIT_VERIFIER_TEST.resourcePath,
      blobDigest: sha256Digest(testBlob),
    },
    subject: subject ?? {
      messageId: "msg_independent_git_01",
      senderIncarnationId: "inc_independent_git_01",
      receiver: { taskId: "task_verifier", incarnationId: "inc_verifier_01" },
    },
  };
}

function assertCleanWorktrees(repoPath) {
  const entries = git(repoPath, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
  assert.equal(entries.length, 1);
}

function assertNoVerifierCheckoutRegistration(repoPath) {
  const registrations = git(repoPath, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
  assert.equal(registrations.some((line) =>
    line.includes(`${path.sep}threadmesh-independent-git-verifier-`) && line.endsWith(`${path.sep}checkout`),
  ), false);
}

function installFailingGit(command) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-git-wrapper-"));
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const wrapper = path.join(directory, "git");
  fs.writeFileSync(wrapper, `#!${process.execPath}
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
if (args.includes("worktree") && args.includes(${JSON.stringify(command)})) process.exit(73);
const result = spawnSync(${JSON.stringify(realGit)}, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
`);
  fs.chmodSync(wrapper, 0o755);
  return directory;
}

function cleanup(repository) {
  if (repository) fs.rmSync(repository.repoPath, { recursive: true, force: true });
}

test("service pins a ready anchor and signs full chain, commit, fixed-test, and routing bindings", async () => {
  const repository = createRepository();
  let service;
  try {
    const request = requestFor(repository);
    service = await startIndependentGitVerifierService();
    assert.equal(service.trustAnchor.publicKeyPem.includes("PUBLIC KEY"), true);
    const response = await service.verify(request);

    assert.deepEqual(response.proof.chain, request.chain);
    assert.equal(response.proof.implementation.sha, request.implementation.sha);
    assert.equal(response.proof.fix.sha, request.fix.sha);
    assert.equal(response.proof.test.trustedBlobDigest, request.trustedTest.blobDigest);
    assert.equal(response.attestation.subject.claimType, "artifact-state");
    assert.equal(response.attestation.subject.claimDigest, independentGitClaimDigest({
      chain: response.proof.chain,
      proof: response.proof,
    }));
    assert.equal(response.trustAnchor.publicKeyPem, service.trustAnchor.publicKeyPem);
    assert.deepEqual(verifyIndependentGitVerification({
      request,
      response,
      expectedTrustAnchor: service.trustAnchor,
    }), response);
    assert.equal(JSON.stringify(response).includes("PRIVATE KEY"), false);
    assertCleanWorktrees(repository.repoPath);
    assertNoVerifierCheckoutRegistration(repository.repoPath);
    assert.deepEqual(await service.close(), { closed: true, childExited: true });
    service = undefined;
  } finally {
    if (service) await service.close();
    cleanup(repository);
  }
});

test("rejects wrong exact parents, counterexamples, commit bindings, and test-blob replacement", async () => {
  const repository = createRepository();
  const changedTest = createRepository({
    fixTestContent: "import assert from 'node:assert/strict'; assert.equal(1, 1);\n",
  });
  try {
    const request = requestFor(repository);
    fs.writeFileSync(path.join(repository.repoPath, "artifact.txt"), "POST_FIX\n");
    const wrongParentSha = commit(repository.repoPath, "unrelated descendant");
    const wrongParentRequest = requestFor(repository);
    wrongParentRequest.fix = {
      sha: wrongParentSha,
      treeSha: treeSha(repository.repoPath, wrongParentSha),
      diffDigest: diffDigest(repository.repoPath, repository.implementationSha, wrongParentSha),
    };
    await assert.rejects(
      runIndependentGitVerifier(wrongParentRequest),
      { code: "threadmesh_independent_git_verifier_parent_invalid" },
    );
    await assert.rejects(
      runIndependentGitVerifier(requestFor(repository, { counterexample: "NOT_PRESENT" })),
      { code: "threadmesh_independent_git_verifier_finding_not_reproduced" },
    );
    await assert.rejects(
      runIndependentGitVerifier({
        ...request,
        implementation: { ...request.implementation, diffDigest: `sha256:${"a".repeat(64)}` },
      }),
      { code: "threadmesh_independent_git_verifier_commit_binding_invalid" },
    );
    await assert.rejects(
      runIndependentGitVerifier(requestFor(changedTest)),
      { code: "threadmesh_independent_git_verifier_test_blob_invalid" },
    );
    assertCleanWorktrees(repository.repoPath);
    assertCleanWorktrees(changedTest.repoPath);
    assertNoVerifierCheckoutRegistration(repository.repoPath);
    assertNoVerifierCheckoutRegistration(changedTest.repoPath);
  } finally {
    cleanup(repository);
    cleanup(changedTest);
  }
});

test("rejects arbitrary claims and a valid alternate-anchor or cross-chain replay", async () => {
  const repository = createRepository();
  let primary;
  let alternate;
  try {
    const request = requestFor(repository);
    await assert.rejects(
      runIndependentGitVerifier({
        ...request,
        subject: { ...request.subject, claimDigest: `sha256:${"a".repeat(64)}` },
      }),
      { code: "threadmesh_independent_git_verifier_request_invalid" },
    );
    primary = await startIndependentGitVerifierService();
    alternate = await startIndependentGitVerifierService();
    const response = await primary.verify(request);
    const alternateResponse = await alternate.verify(request);
    assert.throws(
      () => verifyIndependentGitVerification({
        request,
        response: alternateResponse,
        expectedTrustAnchor: primary.trustAnchor,
      }),
      { code: "threadmesh_independent_git_verifier_unexpected_trust_anchor" },
    );
    const replayRequest = requestFor(repository, { chainId: "chain-m5-2-02" });
    assert.throws(
      () => verifyIndependentGitVerification({
        request: replayRequest,
        response,
        expectedTrustAnchor: primary.trustAnchor,
      }),
      { code: "threadmesh_independent_git_verifier_response_invalid" },
    );
    assert.notEqual(response.attestation.attestationId, (await primary.verify(replayRequest)).attestation.attestationId);
  } finally {
    if (alternate) await alternate.close();
    if (primary) await primary.close();
    cleanup(repository);
  }
});

test("cleanup failure settles the active verification with a stable error", async () => {
  const repository = createRepository();
  let service;
  let failedWorkspace;
  const originalRmSync = fs.rmSync;
  try {
    service = await startIndependentGitVerifierService();
    fs.rmSync = (target, ...args) => {
      if (typeof target === "string" && path.basename(target).startsWith("threadmesh-independent-git-verifier-")) {
        failedWorkspace = target;
        throw new Error("injected cleanup failure");
      }
      return originalRmSync(target, ...args);
    };
    await assert.rejects(
      service.verify(requestFor(repository)),
      { code: "threadmesh_independent_git_verifier_cleanup_failed" },
    );
    assertCleanWorktrees(repository.repoPath);
    assertNoVerifierCheckoutRegistration(repository.repoPath);
  } finally {
    fs.rmSync = originalRmSync;
    if (failedWorkspace) fs.rmSync(failedWorkspace, { recursive: true, force: true });
    if (service) await service.close();
    cleanup(repository);
  }
});

test("remove and prune failures cannot report a successful cleanup", async () => {
  const removeRepository = createRepository();
  const pruneRepository = createRepository({ fixArtifact: "HANG\n" });
  const originalPath = process.env.PATH;
  let wrapperDirectory;
  let service;
  try {
    wrapperDirectory = installFailingGit("remove");
    process.env.PATH = `${wrapperDirectory}${path.delimiter}${originalPath}`;
    await assert.rejects(
      runIndependentGitVerifier(requestFor(removeRepository)),
      { code: "threadmesh_independent_git_verifier_cleanup_failed" },
    );
    assertNoVerifierCheckoutRegistration(removeRepository.repoPath);
    process.env.PATH = originalPath;
    fs.rmSync(wrapperDirectory, { recursive: true, force: true });
    wrapperDirectory = installFailingGit("prune");
    process.env.PATH = `${wrapperDirectory}${path.delimiter}${originalPath}`;
    service = await startIndependentGitVerifierService();
    await assert.rejects(
      service.verify(requestFor(pruneRepository), { timeoutMs: 250 }),
      { code: "threadmesh_independent_git_verifier_cleanup_failed" },
    );
    process.env.PATH = originalPath;
    git(pruneRepository.repoPath, "worktree", "prune");
    assertNoVerifierCheckoutRegistration(pruneRepository.repoPath);
  } finally {
    process.env.PATH = originalPath;
    if (wrapperDirectory) fs.rmSync(wrapperDirectory, { recursive: true, force: true });
    if (service) await service.close();
    cleanup(removeRepository);
    cleanup(pruneRepository);
  }
});

test("timeout kills the child group, settles once, and cleans the registered worktree", async () => {
  const repository = createRepository({ fixArtifact: "HANG\n" });
  let service;
  try {
    service = await startIndependentGitVerifierService();
    await assert.rejects(
      service.verify(requestFor(repository), { timeoutMs: 250 }),
      { code: "threadmesh_independent_git_verifier_timeout" },
    );
    assertCleanWorktrees(repository.repoPath);
    assertNoVerifierCheckoutRegistration(repository.repoPath);
    assert.deepEqual(await service.close(), { closed: true, childExited: true });
    await assert.rejects(
      service.verify(requestFor(repository)),
      { code: "threadmesh_independent_git_verifier_service_closed" },
    );
    service = undefined;
  } finally {
    if (service) await service.close();
    cleanup(repository);
  }
});
