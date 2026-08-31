import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import { verificationAttestationDigest } from "../src/protocol-validator.mjs";
import {
  independentGitClaimDigest,
  verifyIndependentGitVerification,
} from "../src/validation/independent-git-verifier.mjs";
import {
  appendGitEvidenceRecord,
  appendIndependentVerificationRecord,
  createGitEvidenceRequirement,
  validateGitEvidenceChain,
} from "../src/state/git-evidence-chain.mjs";

const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });
const findingDigest = sha256Digest({
  resourcePath: "artifact.txt",
  counterexample: "BAD_COUNTEREXAMPLE",
});
const actor = (name, character) => ({
  taskId: `task_${name}01`,
  incarnationId: `inc_${name}01`,
  threadId: `thread-${name}`,
  snapshotDigest: `sha256:${character.repeat(64)}`,
});

function signer() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const trustAnchor = {
    keyId: "threadmesh://independent-git-verifier/key/ephemeral",
    algorithm: "ed25519",
    actorId: "threadmesh-independent-git-verifier",
    trustDomain: "threadmesh://independent-git-verifier",
    policyId: "threadmesh://independent-git-verifier/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
  return { privateKey, trustAnchor };
}

function fixture() {
  const signing = signer();
  const requirement = createGitEvidenceRequirement({
    chainId: "chain-m5-2-01",
    validatedBaseSha: sha("1"),
    fixtureSeedSha: sha("2"),
    fixtureDefinitionDigest: digest("fixture-definition"),
    trustedTestBlobDigest: digest("trusted-test-blob"),
    implementer: actor("implementer", "a"),
    reviewer: actor("reviewer", "b"),
    verifier: actor("verifier", "c"),
    preconfiguredTrustAnchorDigest: sha256Digest(signing.trustAnchor),
  });
  const payloads = {
    implementation: {
      actor: requirement.implementer, turnId: "turn-implementation",
      toolCallDigest: digest("implementation-tool"), commitSha: sha("3"),
      parentSha: requirement.fixtureSeedSha, treeSha: sha("4"),
      diffDigest: digest("implementation-diff"),
      testEvidenceDigest: digest("implementation-test"),
    },
    "review-failed": {
      actor: requirement.reviewer, turnId: "turn-review",
      toolCallDigest: digest("review-tool"), implementationSha: sha("3"),
      findingDigest, reproductionEvidenceDigest: digest("reproduction"),
    },
    fix: {
      actor: requirement.implementer, turnId: "turn-fix-same-thread",
      toolCallDigest: digest("fix-tool"), commitSha: sha("5"), parentSha: sha("3"),
      treeSha: sha("6"), diffDigest: digest("fix-diff"),
      resolvesFindingDigest: findingDigest, testEvidenceDigest: digest("fix-test"),
    },
  };
  return { requirement, payloads, signing };
}

function buildPrefix(context, count = 3) {
  const records = [];
  for (const stage of ["implementation", "review-failed", "fix"].slice(0, count)) {
    records.push(appendGitEvidenceRecord(context.requirement, records, {
      stage, payload: context.payloads[stage],
    }));
  }
  return records;
}

function bindingId(prefix, chain, implementationSha, fixSha, findingValueDigest) {
  return `${prefix}_${sha256Digest({
    chain, implementationSha, fixSha, findingDigest: findingValueDigest,
  }).slice(7, 31)}`;
}

function verification(context, mutations = {}) {
  const { requirement, payloads, signing } = context;
  const finding = {
    resourcePath: "artifact.txt", counterexample: "BAD_COUNTEREXAMPLE",
    digest: payloads["review-failed"].findingDigest,
  };
  const subject = {
    messageId: "msg_independent_git_01",
    senderIncarnationId: requirement.verifier.incarnationId,
    receiver: { taskId: "task_dependent01", incarnationId: "inc_dependent01" },
  };
  const request = {
    repoPath: "/private/bounded/repository",
    chain: {
      chainId: requirement.chainId,
      requirementDigest: requirement.requirementDigest,
      validatedBaseSha: requirement.validatedBaseSha,
      fixtureSeedSha: requirement.fixtureSeedSha,
      fixtureDefinitionDigest: requirement.fixtureDefinitionDigest,
    },
    implementation: {
      sha: payloads.implementation.commitSha,
      treeSha: payloads.implementation.treeSha,
      diffDigest: payloads.implementation.diffDigest,
    },
    fix: {
      sha: payloads.fix.commitSha,
      treeSha: payloads.fix.treeSha,
      diffDigest: payloads.fix.diffDigest,
    },
    finding,
    trustedTest: {
      resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
      blobDigest: requirement.trustedTestBlobDigest,
    },
    subject,
  };
  if (mutations.request) Object.assign(request, mutations.request);
  const proof = {
    chain: request.chain,
    implementation: {
      ...request.implementation,
      parentSha: request.chain.fixtureSeedSha,
      resourceDigest: digest("implementation-resource"),
    },
    fix: {
      ...request.fix,
      parentSha: request.implementation.sha,
      resourceDigest: digest("fix-resource"),
    },
    finding: {
      resourcePath: request.finding.resourcePath,
      digest: request.finding.digest,
      counterexampleDigest: sha256Digest(request.finding.counterexample),
    },
    test: {
      command: "node",
      args: ["--test", "test/fixtures/independent-git-verifier-target.test.mjs"],
      resourcePath: request.trustedTest.resourcePath,
      seedBlobDigest: request.trustedTest.blobDigest,
      fixBlobDigest: request.trustedTest.blobDigest,
      trustedBlobDigest: request.trustedTest.blobDigest,
    },
    ...mutations.proof,
  };
  const trustAnchor = mutations.trustAnchor ?? signing.trustAnchor;
  const privateKey = mutations.privateKey ?? signing.privateKey;
  const verifiedAt = "2026-08-31T00:00:00.000Z";
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: bindingId(
      "att_git", request.chain, request.implementation.sha, request.fix.sha, request.finding.digest,
    ),
    verifier: {
      actorType: "service", actorId: trustAnchor.actorId,
      authenticationId: "authn_independent_git_verifier_01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      ...request.subject,
      claimType: "artifact-state",
      claimDigest: independentGitClaimDigest({ chain: proof.chain, proof }),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof), verifiedAt,
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: bindingId(
        "decision_git", request.chain, request.implementation.sha, request.fix.sha,
        request.finding.digest,
      ),
      decision: "trusted", decidedAt: verifiedAt,
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519", keyId: trustAnchor.keyId,
    signature: sign(null, Buffer.from(attestation.signedPayloadDigest, "utf8"), privateKey)
      .toString("base64url"),
  };
  return { request, response: { trustAnchor, attestation, proof } };
}

function appendFinal(context, records, values = verification(context)) {
  return appendIndependentVerificationRecord(context.requirement, records, {
    actor: context.requirement.verifier, turnId: "turn-verifier",
    toolCallDigest: digest("verifier-tool"), request: values.request,
    response: values.response, expectedTrustAnchor: context.signing.trustAnchor,
  });
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code);
}

test("bridge builds a replay-verifiable trusted chain", () => {
  const context = fixture();
  const records = buildPrefix(context);
  const values = verification(context);
  verifyIndependentGitVerification({
    request: values.request,
    response: values.response,
    expectedTrustAnchor: context.signing.trustAnchor,
  });
  records.push(appendFinal(context, records, values));
  assert.deepEqual(validateGitEvidenceChain(context.requirement, records), {
    structurallyComplete: true, trustedComplete: true, nextStage: null,
    headDigest: records[3].recordDigest, recordCount: 4,
  });
  const replayRequirement = JSON.parse(JSON.stringify(context.requirement));
  const replayRecords = JSON.parse(JSON.stringify(records));
  assert.equal(validateGitEvidenceChain(replayRequirement, replayRecords).trustedComplete, true);
  assert.equal(Object.hasOwn(records[3].payload.verificationRequest, "repoPath"), false);
  assert.equal(Object.isFrozen(records[3].payload.verificationResponse.attestation), true);
});

test("generic append refuses the independently verified stage", () => {
  const context = fixture();
  expectCode(() => appendGitEvidenceRecord(context.requirement, buildPrefix(context), {
    stage: "independently-verified", payload: {},
  }), "threadmesh_git_evidence_bridge_required");
});

test("rejects skipped stages, actor/session/parent errors, and tamper", () => {
  const context = fixture();
  expectCode(() => appendGitEvidenceRecord(context.requirement, [], {
    stage: "fix", payload: context.payloads.fix,
  }), "threadmesh_git_evidence_stage_order_invalid");
  expectCode(() => appendGitEvidenceRecord(context.requirement, [], {
    stage: "implementation", payload: { ...context.payloads.implementation, parentSha: sha("9") },
  }), "threadmesh_git_evidence_wrong_parent");
  const one = buildPrefix(context, 1);
  expectCode(() => appendGitEvidenceRecord(context.requirement, one, {
    stage: "review-failed",
    payload: { ...context.payloads["review-failed"], actor: context.requirement.implementer },
  }), "threadmesh_git_evidence_wrong_actor");
  const tampered = buildPrefix(context, 2).map((record) => structuredClone(record));
  tampered[0].payload.commitSha = sha("8");
  expectCode(() => validateGitEvidenceChain(context.requirement, tampered),
    "threadmesh_git_evidence_record_tampered");
});

test("bridge rejects cross-chain, wrong Git bindings, and fake claim digests", () => {
  const context = fixture();
  const records = buildPrefix(context);
  const cases = [
    (request) => { request.chain.chainId = "chain-other"; },
    (request) => { request.chain.requirementDigest = digest("other-requirement"); },
    (request) => { request.chain.validatedBaseSha = sha("9"); },
    (request) => { request.chain.fixtureSeedSha = sha("9"); },
    (request) => { request.chain.fixtureDefinitionDigest = digest("other-fixture"); },
    (request) => { request.implementation.sha = sha("9"); },
    (request) => { request.implementation.treeSha = sha("9"); },
    (request) => { request.implementation.diffDigest = digest("other-implementation-diff"); },
    (request) => { request.fix.sha = sha("9"); },
    (request) => { request.fix.treeSha = sha("9"); },
    (request) => { request.fix.diffDigest = digest("other-fix-diff"); },
    (request) => { request.trustedTest.blobDigest = digest("other-test"); },
  ];
  for (const mutate of cases) {
    const values = verification(context);
    mutate(values.request);
    expectCode(() => appendFinal(context, records, values),
      "threadmesh_git_evidence_verification_binding_mismatch");
  }
  const fake = verification(context);
  fake.response.attestation.subject.claimDigest = digest("self-consistent-but-not-chain-bound");
  expectCode(() => appendFinal(context, records, fake),
    "threadmesh_git_evidence_verification_untrusted");
});

test("bridge rejects wrong finding, alternate self-signed anchor, and signature tamper", () => {
  const context = fixture();
  const records = buildPrefix(context);
  expectCode(() => appendIndependentVerificationRecord(context.requirement, records, {
    actor: context.requirement.implementer,
    turnId: "turn-wrong-verifier",
    toolCallDigest: digest("wrong-verifier-tool"),
    ...verification(context),
    expectedTrustAnchor: context.signing.trustAnchor,
  }), "threadmesh_git_evidence_wrong_actor");
  const wrongFinding = verification(context);
  wrongFinding.request.finding.digest = digest("other-finding");
  expectCode(() => appendFinal(context, records, wrongFinding),
    "threadmesh_git_evidence_verification_binding_mismatch");
  const alternate = signer();
  expectCode(() => appendFinal(context, records, verification(context, {
    trustAnchor: alternate.trustAnchor, privateKey: alternate.privateKey,
  })), "threadmesh_git_evidence_wrong_trust_anchor");
  const tampered = verification(context);
  tampered.response.attestation.proof.signature = "a".repeat(43);
  expectCode(() => appendFinal(context, records, tampered),
    "threadmesh_git_evidence_verification_untrusted");
});

test("strict objects reject extras and role overlap", () => {
  const context = fixture();
  expectCode(() => appendGitEvidenceRecord(context.requirement, [], {
    stage: "implementation", payload: { ...context.payloads.implementation, extra: true },
  }), "threadmesh_git_evidence_payload_invalid");
  expectCode(() => createGitEvidenceRequirement({
    chainId: "chain-overlap", validatedBaseSha: sha("1"), fixtureSeedSha: sha("2"),
    fixtureDefinitionDigest: digest("fixture"), trustedTestBlobDigest: digest("test"),
    implementer: actor("same", "a"), reviewer: actor("same", "a"),
    verifier: actor("verifier", "c"), preconfiguredTrustAnchorDigest: digest("anchor"),
  }), "threadmesh_git_evidence_roles_not_distinct");
});
