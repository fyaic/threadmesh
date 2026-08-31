import { generateKeyPairSync, sign } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { sha256Digest } from "../canonical-json.mjs";
import { verificationAttestationDigest } from "../protocol-validator.mjs";

const TEST = Object.freeze({
  command: "node",
  args: Object.freeze(["--test", "test/fixtures/independent-git-verifier-target.test.mjs"]),
  resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
});
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const trustAnchor = Object.freeze({
  keyId: "threadmesh://independent-git-verifier/key/ephemeral",
  algorithm: "ed25519",
  actorId: "threadmesh-independent-git-verifier",
  trustDomain: "threadmesh://independent-git-verifier",
  policyId: "threadmesh://independent-git-verifier/policy/1",
  publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function git(repoPath, args, { encoding = "utf8" } = {}) {
  const result = spawnSync("git", ["-C", repoPath, ...args], {
    encoding,
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) fail("threadmesh_independent_git_verifier_git_failed");
  return result.stdout;
}

function assertCommit(repoPath, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) fail("threadmesh_independent_git_verifier_commit_invalid");
  const result = spawnSync("git", ["-C", repoPath, "cat-file", "-e", `${sha}^{commit}`], {
    stdio: "ignore",
    timeout: 10_000,
  });
  if (result.status !== 0) fail("threadmesh_independent_git_verifier_commit_invalid");
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 &&
    !path.isAbsolute(value) && !value.split(/[\\/]/u).includes("..");
}

function showResource(repoPath, sha, resourcePath) {
  const result = spawnSync("git", ["-C", repoPath, "show", `${sha}:${resourcePath}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) fail("threadmesh_independent_git_verifier_resource_missing");
  return result.stdout;
}

function singleParent(repoPath, sha) {
  const parts = git(repoPath, ["rev-list", "--parents", "-n", "1", sha]).trim().split(" ");
  if (parts.length !== 2 || parts[0] !== sha) fail("threadmesh_independent_git_verifier_parent_invalid");
  return parts[1];
}

function treeSha(repoPath, sha) {
  const value = git(repoPath, ["rev-parse", `${sha}^{tree}`]).trim();
  if (!/^[a-f0-9]{40}$/.test(value)) fail("threadmesh_independent_git_verifier_tree_invalid");
  return value;
}

function diffDigest(repoPath, parentSha, subjectSha) {
  return sha256Digest(git(repoPath, [
    "diff", "--binary", "--no-ext-diff", "--no-renames", parentSha, subjectSha,
  ]));
}

function runFixedTest(worktree) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, TEST.args, {
      cwd: worktree,
      env: { PATH: process.env.PATH ?? "", LANG: "C" },
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code, signal) => resolve(code === 0 && signal === null));
  });
}

function removeWorktree(repoPath, worktree) {
  const removed = spawnSync("git", ["-C", repoPath, "worktree", "remove", "--force", worktree], {
    stdio: "ignore",
    timeout: 10_000,
  });
  if (removed.status !== 0 || removed.signal || removed.error) {
    fail("threadmesh_independent_git_verifier_cleanup_failed");
  }
  const listed = spawnSync("git", ["-C", repoPath, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 10_000,
  });
  if (listed.status !== 0 || listed.signal || listed.error ||
      listed.stdout.split("\n").includes(`worktree ${path.resolve(worktree)}`)) {
    fail("threadmesh_independent_git_verifier_cleanup_failed");
  }
}

function bindingId(prefix, chain, implementationSha, fixSha, findingDigest) {
  return `${prefix}_${sha256Digest({ chain, implementationSha, fixSha, findingDigest }).slice(7, 31)}`;
}

function claimDigest(chain, proof) {
  return sha256Digest({ kind: "threadmesh-independent-git-verification-claim-v1", chain, proof });
}

async function verify(request) {
  const { repoPath, chain, implementation, fix, finding, trustedTest, subject, workspaceRoot } = request ?? {};
  if (!path.isAbsolute(repoPath ?? "") || !path.isAbsolute(workspaceRoot ?? "") ||
      !safePath(finding?.resourcePath) || trustedTest?.resourcePath !== TEST.resourcePath ||
      typeof finding?.counterexample !== "string" || !/^[a-f0-9]{40}$/.test(chain?.validatedBaseSha) ||
      !/^[a-f0-9]{40}$/.test(chain?.fixtureSeedSha) || !/^[a-f0-9]{40}$/.test(implementation?.sha) ||
      !/^[a-f0-9]{40}$/.test(fix?.sha)) {
    fail("threadmesh_independent_git_verifier_request_invalid");
  }
  for (const digest of [
    chain.requirementDigest, chain.fixtureDefinitionDigest, implementation.treeSha, implementation.diffDigest,
    fix.treeSha, fix.diffDigest, finding.digest, trustedTest.blobDigest,
  ]) if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "") && !/^[a-f0-9]{40}$/.test(digest ?? "")) {
    fail("threadmesh_independent_git_verifier_request_invalid");
  }
  if (finding.digest !== sha256Digest({ resourcePath: finding.resourcePath, counterexample: finding.counterexample })) {
    fail("threadmesh_independent_git_verifier_finding_digest_invalid");
  }
  for (const sha of [chain.validatedBaseSha, chain.fixtureSeedSha, implementation.sha, fix.sha]) assertCommit(repoPath, sha);
  if (singleParent(repoPath, chain.fixtureSeedSha) !== chain.validatedBaseSha ||
      singleParent(repoPath, implementation.sha) !== chain.fixtureSeedSha ||
      singleParent(repoPath, fix.sha) !== implementation.sha) {
    fail("threadmesh_independent_git_verifier_parent_invalid");
  }
  const actualImplementationTree = treeSha(repoPath, implementation.sha);
  const actualFixTree = treeSha(repoPath, fix.sha);
  const actualImplementationDiff = diffDigest(repoPath, chain.fixtureSeedSha, implementation.sha);
  const actualFixDiff = diffDigest(repoPath, implementation.sha, fix.sha);
  if (actualImplementationTree !== implementation.treeSha || actualFixTree !== fix.treeSha ||
      actualImplementationDiff !== implementation.diffDigest || actualFixDiff !== fix.diffDigest) {
    fail("threadmesh_independent_git_verifier_commit_binding_invalid");
  }

  const seedResource = showResource(repoPath, chain.fixtureSeedSha, finding.resourcePath);
  const implementationResource = showResource(repoPath, implementation.sha, finding.resourcePath);
  const fixResource = showResource(repoPath, fix.sha, finding.resourcePath);
  if (seedResource.includes(finding.counterexample) || !implementationResource.includes(finding.counterexample) ||
      fixResource.includes(finding.counterexample)) {
    fail("threadmesh_independent_git_verifier_finding_not_reproduced");
  }
  const seedTest = showResource(repoPath, chain.fixtureSeedSha, TEST.resourcePath);
  const fixTest = showResource(repoPath, fix.sha, TEST.resourcePath);
  const seedBlobDigest = sha256Digest(seedTest);
  const fixBlobDigest = sha256Digest(fixTest);
  if (seedBlobDigest !== trustedTest.blobDigest || fixBlobDigest !== trustedTest.blobDigest || seedTest !== fixTest) {
    fail("threadmesh_independent_git_verifier_test_blob_invalid");
  }

  const worktree = path.join(workspaceRoot, "checkout");
  fs.mkdirSync(workspaceRoot, { recursive: true, mode: 0o700 });
  git(repoPath, ["worktree", "add", "--detach", worktree, fix.sha]);
  let primaryError;
  try {
    if (!await runFixedTest(worktree)) fail("threadmesh_independent_git_verifier_test_failed");
  } catch (error) {
    primaryError = error;
  }
  let cleanupError;
  try {
    removeWorktree(repoPath, worktree);
  } catch (error) {
    cleanupError = error;
  }
  // The validation failure is the primary outcome; a successful validation may
  // never be reported when its exact worktree could not be removed.
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  const proof = {
    chain,
    implementation: {
      sha: implementation.sha,
      parentSha: chain.fixtureSeedSha,
      treeSha: actualImplementationTree,
      diffDigest: actualImplementationDiff,
      resourceDigest: sha256Digest(implementationResource),
    },
    fix: {
      sha: fix.sha,
      parentSha: implementation.sha,
      treeSha: actualFixTree,
      diffDigest: actualFixDiff,
      resourceDigest: sha256Digest(fixResource),
    },
    finding: {
      resourcePath: finding.resourcePath,
      digest: finding.digest,
      counterexampleDigest: sha256Digest(finding.counterexample),
    },
    test: {
      command: TEST.command,
      args: [...TEST.args],
      resourcePath: TEST.resourcePath,
      seedBlobDigest,
      fixBlobDigest,
      trustedBlobDigest: trustedTest.blobDigest,
    },
  };
  const verifiedAt = new Date().toISOString();
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: bindingId("att_git", chain, implementation.sha, fix.sha, finding.digest),
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_independent_git_verifier_01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      ...subject,
      claimType: "artifact-state",
      claimDigest: claimDigest(chain, proof),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof),
    verifiedAt,
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: bindingId("decision_git", chain, implementation.sha, fix.sha, finding.digest),
      decision: "trusted",
      decidedAt: verifiedAt,
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519",
    keyId: trustAnchor.keyId,
    signature: sign(null, Buffer.from(attestation.signedPayloadDigest, "utf8"), privateKey).toString("base64url"),
  };
  return { trustAnchor, attestation, proof };
}

function emit(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

process.stdout.on("error", () => process.exit(0));
emit({ type: "ready", trustAnchor });
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", async (line) => {
  let envelope;
  try {
    envelope = JSON.parse(line);
    if (!envelope || envelope.type !== "verify" || typeof envelope.id !== "string" ||
        envelope.id.length < 1 || envelope.id.length > 80) {
      fail("threadmesh_independent_git_verifier_request_invalid");
    }
    emit({
      type: "result",
      id: envelope.id,
      ok: true,
      value: await verify({ ...envelope.request, workspaceRoot: envelope.workspaceRoot }),
    });
  } catch (error) {
    emit({
      type: "result",
      id: typeof envelope?.id === "string" ? envelope.id : "invalid",
      ok: false,
      code: error?.code ?? "threadmesh_independent_git_verifier_child_failed",
    });
  }
});
