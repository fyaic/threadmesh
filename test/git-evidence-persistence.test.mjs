import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  SQLITE_SCHEMA_MANIFEST,
  SQLITE_SCHEMA_MIGRATIONS,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";
import { verificationAttestationDigest } from "../src/protocol-validator.mjs";
import { createGitEvidenceRequirement } from "../src/state/git-evidence-chain.mjs";
import { independentGitClaimDigest } from "../src/validation/independent-git-verifier.mjs";

const NOW = Date.parse("2026-08-31T08:00:00.000Z");
const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });
const owner = Object.freeze({ kind: "user", principalId: "owner_git_loop" });
const otherOwner = Object.freeze({ kind: "user", principalId: "owner_other" });
const policy = Object.freeze({ kind: "policy", principalId: "policy_git_loop" });
const findingDigest = sha256Digest({
  resourcePath: "artifact.txt",
  counterexample: "BAD_COUNTEREXAMPLE",
});

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-git-state-"));
  return {
    directory,
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

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

function actor(role, character) {
  return {
    taskId: `task_${role}`,
    incarnationId: `inc_${role}_01`,
    threadId: `thread-${role}`,
    snapshotDigest: `sha256:${character.repeat(64)}`,
  };
}

function context() {
  const signing = signer();
  const alternate = signer();
  const actors = {
    implementer: actor("implementer", "a"),
    reviewer: actor("reviewer", "b"),
    verifier: actor("verifier", "c"),
  };
  const input = {
    chainId: "chain-persisted-m5-2",
    validatedBaseSha: sha("1"),
    fixtureSeedSha: sha("2"),
    fixtureDefinitionDigest: digest("fixture-definition"),
    trustedTestBlobDigest: digest("trusted-test-blob"),
    ...actors,
    preconfiguredTrustAnchorDigest: sha256Digest(signing.trustAnchor),
  };
  const requirement = createGitEvidenceRequirement(input);
  const payloads = {
    implementation: {
      actor: actors.implementer,
      turnId: "turn-implementation",
      toolCallDigest: digest("implementation-tool"),
      commitSha: sha("3"),
      parentSha: requirement.fixtureSeedSha,
      treeSha: sha("4"),
      diffDigest: digest("implementation-diff"),
      testEvidenceDigest: digest("implementation-test"),
    },
    "review-failed": {
      actor: actors.reviewer,
      turnId: "turn-review",
      toolCallDigest: digest("review-tool"),
      implementationSha: sha("3"),
      findingDigest,
      reproductionEvidenceDigest: digest("reproduction"),
    },
    fix: {
      actor: actors.implementer,
      turnId: "turn-fix",
      toolCallDigest: digest("fix-tool"),
      commitSha: sha("5"),
      parentSha: sha("3"),
      treeSha: sha("6"),
      diffDigest: digest("fix-diff"),
      resolvesFindingDigest: findingDigest,
      testEvidenceDigest: digest("fix-test"),
    },
  };
  return { signing, alternate, actors, input, requirement, payloads };
}

function taskPrincipal(value) {
  return {
    kind: "task",
    taskId: value.taskId,
    incarnationId: value.incarnationId,
  };
}

function registerActors(coordinator, current, taskOwner = owner) {
  for (const value of Object.values(current.actors)) {
    coordinator.registerTask({
      taskId: value.taskId,
      incarnationId: value.incarnationId,
      harness: "codex",
      state: "idle",
      adapterRef: {
        kind: "codex-app-server",
        threadId: value.threadId,
        snapshotDigest: value.snapshotDigest,
      },
    }, taskOwner);
  }
}

function coordinatorFor(filename, current) {
  return new SqliteCoordinator({
    filename,
    clock: () => NOW,
    verificationTrustAnchors: [current.signing.trustAnchor],
  });
}

function bindingId(prefix, chain, implementationSha, fixSha, findingValueDigest) {
  return `${prefix}_${sha256Digest({
    chain,
    implementationSha,
    fixSha,
    findingDigest: findingValueDigest,
  }).slice(7, 31)}`;
}

function verification(current, signing = current.signing) {
  const request = {
    repoPath: "/private/bounded/repository",
    chain: {
      chainId: current.requirement.chainId,
      requirementDigest: current.requirement.requirementDigest,
      validatedBaseSha: current.requirement.validatedBaseSha,
      fixtureSeedSha: current.requirement.fixtureSeedSha,
      fixtureDefinitionDigest: current.requirement.fixtureDefinitionDigest,
    },
    implementation: {
      sha: current.payloads.implementation.commitSha,
      treeSha: current.payloads.implementation.treeSha,
      diffDigest: current.payloads.implementation.diffDigest,
    },
    fix: {
      sha: current.payloads.fix.commitSha,
      treeSha: current.payloads.fix.treeSha,
      diffDigest: current.payloads.fix.diffDigest,
    },
    finding: {
      resourcePath: "artifact.txt",
      counterexample: "BAD_COUNTEREXAMPLE",
      digest: current.payloads["review-failed"].findingDigest,
    },
    trustedTest: {
      resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
      blobDigest: current.requirement.trustedTestBlobDigest,
    },
    subject: {
      messageId: "msg_git_persistence_01",
      senderIncarnationId: current.actors.verifier.incarnationId,
      receiver: { taskId: "task_dependent", incarnationId: "inc_dependent_01" },
    },
  };
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
  };
  const { trustAnchor, privateKey } = signing;
  const verifiedAt = "2026-08-31T08:00:00.000Z";
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: bindingId(
      "att_git",
      request.chain,
      request.implementation.sha,
      request.fix.sha,
      request.finding.digest,
    ),
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_independent_git_verifier_01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      ...request.subject,
      claimType: "artifact-state",
      claimDigest: independentGitClaimDigest({ chain: proof.chain, proof }),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof),
    verifiedAt,
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: bindingId(
        "decision_git",
        request.chain,
        request.implementation.sha,
        request.fix.sha,
        request.finding.digest,
      ),
      decision: "trusted",
      decidedAt: verifiedAt,
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519",
    keyId: trustAnchor.keyId,
    signature: sign(
      null,
      Buffer.from(attestation.signedPayloadDigest, "utf8"),
      privateKey,
    ).toString("base64url"),
  };
  return { request, response: { trustAnchor, attestation, proof } };
}

function appendPrefix(coordinator, current) {
  let revision = 0;
  let head = null;
  for (const stage of ["implementation", "review-failed", "fix"]) {
    const result = coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage,
      payload: current.payloads[stage],
      expectedRevision: revision,
      expectedHeadDigest: head,
    }, taskPrincipal(current.payloads[stage].actor));
    revision = result.state.recordCount;
    head = result.state.headDigest;
  }
  return { revision, head };
}

function appendFinal(coordinator, current, prefix, signing = current.signing) {
  const verified = verification(current, signing);
  return coordinator.appendIndependentGitVerificationRecord(
    current.requirement.chainId,
    {
      actor: current.actors.verifier,
      turnId: "turn-verifier",
      toolCallDigest: digest("verifier-tool"),
      ...verified,
      expectedTrustAnchor: signing.trustAnchor,
      expectedRevision: prefix.revision,
      expectedHeadDigest: prefix.head,
    },
    taskPrincipal(current.actors.verifier),
  );
}

function expectCode(operation, code) {
  assert.throws(operation, (error) => error?.code === code);
}

test("persists all four stages and replays the signed final chain after restart", () => {
  const temporary = temporaryDatabase();
  const current = context();
  let coordinator = coordinatorFor(temporary.filename, current);
  try {
    registerActors(coordinator, current);
    const created = coordinator.createGitEvidenceRequirement(current.input, owner);
    assert.equal(created.state.recordCount, 0);
    assert.deepEqual(Object.keys(created.adapterRefDigests).sort(), [
      "implementer", "reviewer", "verifier",
    ]);
    const prefix = appendPrefix(coordinator, current);
    const final = appendFinal(coordinator, current, prefix);
    assert.equal(final.state.trustedComplete, true);
    assert.equal(final.state.recordCount, 4);
    assert.equal(coordinator.inspectGitEvidenceChain(current.requirement.chainId, owner).revision, 4);
    assert.equal(coordinator.inspectGitEvidenceChain(current.requirement.chainId, policy).trustedComplete, true);
    for (const value of Object.values(current.actors)) {
      assert.equal(coordinator.getTask(value, owner).state, "idle");
    }
    coordinator.close();
    coordinator = coordinatorFor(temporary.filename, current);
    const recovered = coordinator.getGitEvidenceChain(current.requirement.chainId, owner);
    assert.equal(recovered.state.trustedComplete, true);
    assert.equal(recovered.records.length, 4);
    assert.equal(recovered.records[3].payload.verificationRequest.repoPath, undefined);
    assert.equal(recovered.records[3].recordDigest, final.record.recordDigest);
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("fails closed on owner, actor, session, snapshot, revision, head, stage, and replay conflicts", () => {
  const temporary = temporaryDatabase();
  const current = context();
  const coordinator = coordinatorFor(temporary.filename, current);
  try {
    registerActors(coordinator, current);
    expectCode(
      () => coordinator.createGitEvidenceRequirement(current.input, otherOwner),
      "threadmesh_git_evidence_requirement_not_authorized",
    );
    expectCode(
      () => coordinator.createGitEvidenceRequirement({
        ...current.input,
        chainId: "chain-wrong-session",
        implementer: { ...current.actors.implementer, threadId: "thread-wrong" },
      }, owner),
      "threadmesh_git_evidence_actor_snapshot_mismatch",
    );
    const unconfigured = signer();
    expectCode(
      () => coordinator.createGitEvidenceRequirement({
        ...current.input,
        chainId: "chain-unconfigured-anchor",
        preconfiguredTrustAnchorDigest: sha256Digest(unconfigured.trustAnchor),
      }, owner),
      "threadmesh_git_evidence_trust_anchor_not_configured",
    );
    const snapshotChainId = "chain-snapshot-aba";
    coordinator.createGitEvidenceRequirement({
      ...current.input,
      chainId: snapshotChainId,
    }, owner);
    coordinator.attachTask(
      current.actors.implementer,
      {
        kind: "codex-app-server",
        threadId: current.actors.implementer.threadId,
        snapshotDigest: digest("advanced-snapshot"),
      },
      0,
      owner,
    );
    expectCode(() => coordinator.appendGitEvidenceRecord(snapshotChainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_actor_snapshot_mismatch");
    coordinator.attachTask(
      current.actors.implementer,
      {
        kind: "codex-app-server",
        threadId: current.actors.implementer.threadId,
        snapshotDigest: current.actors.implementer.snapshotDigest,
      },
      1,
      owner,
    );
    expectCode(() => coordinator.appendGitEvidenceRecord(snapshotChainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_actor_snapshot_mismatch");

    coordinator.createGitEvidenceRequirement(current.input, owner);
    expectCode(
      () => coordinator.getGitEvidenceChain(current.requirement.chainId, otherOwner),
      "threadmesh_git_evidence_not_authorized",
    );
    const count = () => coordinator.db
      .prepare("SELECT COUNT(*) FROM git_evidence_records WHERE chain_id = ?")
      .pluck()
      .get(current.requirement.chainId);
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "fix",
      payload: current.payloads.fix,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_stage_order_invalid");
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 1,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_revision_conflict");
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: digest("wrong-head"),
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_head_conflict");
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.reviewer)), "threadmesh_authenticated_principal_mismatch");

    const implementation = coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer));
    assert.equal(count(), 1);
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 0,
      expectedHeadDigest: null,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_revision_conflict");
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "implementation",
      payload: current.payloads.implementation,
      expectedRevision: 1,
      expectedHeadDigest: implementation.state.headDigest,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_stage_order_invalid");
    expectCode(() => coordinator.appendGitEvidenceRecord(current.requirement.chainId, {
      stage: "review-failed",
      payload: {
        ...current.payloads["review-failed"],
        actor: current.actors.implementer,
      },
      expectedRevision: 1,
      expectedHeadDigest: implementation.state.headDigest,
    }, taskPrincipal(current.actors.implementer)), "threadmesh_git_evidence_wrong_actor");
    assert.equal(count(), 1);
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("alternate anchor and tampered persisted final evidence fail without partial writes", () => {
  const temporary = temporaryDatabase();
  const current = context();
  let coordinator = coordinatorFor(temporary.filename, current);
  try {
    registerActors(coordinator, current);
    coordinator.createGitEvidenceRequirement(current.input, owner);
    const prefix = appendPrefix(coordinator, current);
    expectCode(
      () => appendFinal(coordinator, current, prefix, current.alternate),
      "threadmesh_git_evidence_trust_anchor_not_configured",
    );
    assert.equal(coordinator.inspectGitEvidenceChain(
      current.requirement.chainId,
      owner,
    ).revision, 3);
    appendFinal(coordinator, current, prefix);
    coordinator.close();

    const database = new Database(temporary.filename);
    const row = database.prepare(
      "SELECT record_json FROM git_evidence_records WHERE chain_id = ? AND sequence = 4",
    ).get(current.requirement.chainId);
    const tampered = JSON.parse(row.record_json);
    tampered.payload.verificationResponse.attestation.proof.signature = "a".repeat(43);
    database.prepare(
      "UPDATE git_evidence_records SET record_json = ? WHERE chain_id = ? AND sequence = 4",
    ).run(JSON.stringify(tampered), current.requirement.chainId);
    database.close();
    expectCode(
      () => coordinatorFor(temporary.filename, current),
      "threadmesh_git_evidence_verification_untrusted",
    );
    coordinator = null;
  } finally {
    if (coordinator) coordinator.close();
    temporary.cleanup();
  }
});

test("materialized header detects suffix truncation before a chain can be reopened", () => {
  const temporary = temporaryDatabase();
  const current = context();
  let coordinator = coordinatorFor(temporary.filename, current);
  try {
    registerActors(coordinator, current);
    coordinator.createGitEvidenceRequirement(current.input, owner);
    appendFinal(coordinator, current, appendPrefix(coordinator, current));
    coordinator.close();
    const database = new Database(temporary.filename);
    database.prepare(
      "DELETE FROM git_evidence_records WHERE chain_id = ? AND sequence = 4",
    ).run(current.requirement.chainId);
    const header = database.prepare(
      `SELECT record_count AS recordCount, revision,
              head_record_digest AS headDigest
       FROM git_evidence_requirements WHERE chain_id = ?`,
    ).get(current.requirement.chainId);
    database.close();
    assert.equal(header.recordCount, 4);
    assert.equal(header.revision, 4);
    assert.match(header.headDigest, /^sha256:[a-f0-9]{64}$/u);
    expectCode(
      () => coordinatorFor(temporary.filename, current),
      "threadmesh_git_evidence_storage_tampered",
    );
    coordinator = null;
  } finally {
    if (coordinator) coordinator.close();
    temporary.cleanup();
  }
});

test("migrates v4 append-only without changing its checksum or existing task data", () => {
  const temporary = temporaryDatabase();
  const current = context();
  let coordinator = coordinatorFor(temporary.filename, current);
  registerActors(coordinator, current);
  coordinator.close();
  let database = new Database(temporary.filename);
  const v4Checksum = database.prepare(
    "SELECT checksum FROM schema_migrations WHERE version = 4",
  ).pluck().get();
  const taskCount = database.prepare("SELECT COUNT(*) FROM tasks").pluck().get();
  database.exec(`
    DROP INDEX git_evidence_records_chain_sequence;
    DROP TABLE git_evidence_records;
    DROP TABLE git_evidence_requirements;
    DELETE FROM schema_migrations WHERE version = 5;
    PRAGMA user_version = 4;
  `);
  database.close();

  coordinator = coordinatorFor(temporary.filename, current);
  coordinator.close();
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(database.pragma("user_version", { simple: true }), SQLITE_SCHEMA_VERSION);
    assert.equal(SQLITE_SCHEMA_VERSION, 5);
    assert.equal(database.prepare(
      "SELECT checksum FROM schema_migrations WHERE version = 4",
    ).pluck().get(), v4Checksum);
    assert.equal(v4Checksum, "sha256:04397daddf3be6b8b34059eb8c1291681f3d3d2deb1423b09e937aab2556859e");
    assert.equal(database.prepare("SELECT COUNT(*) FROM tasks").pluck().get(), taskCount);
    assert.equal(database.prepare(
      "SELECT COUNT(*) FROM schema_migrations",
    ).pluck().get(), SQLITE_SCHEMA_MIGRATIONS.length);
    assert.equal(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'git_evidence_records'",
    ).pluck().get(), "git_evidence_records");
  } finally {
    database.close();
    temporary.cleanup();
  }
});

test("rejects v5 tables rebuilt with matching names but missing structural constraints", () => {
  const temporary = temporaryDatabase();
  const current = context();
  const coordinator = coordinatorFor(temporary.filename, current);
  coordinator.close();
  const database = new Database(temporary.filename);
  database.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE git_evidence_records;
    DROP TABLE git_evidence_requirements;
    CREATE TABLE git_evidence_requirements (
      chain_id TEXT,
      requirement_digest TEXT,
      requirement_json TEXT,
      authority_kind TEXT,
      authority_principal_id TEXT,
      implementer_task_id TEXT,
      implementer_incarnation_id TEXT,
      implementer_adapter_ref_digest TEXT,
      implementer_task_revision INTEGER,
      reviewer_task_id TEXT,
      reviewer_incarnation_id TEXT,
      reviewer_adapter_ref_digest TEXT,
      reviewer_task_revision INTEGER,
      verifier_task_id TEXT,
      verifier_incarnation_id TEXT,
      verifier_adapter_ref_digest TEXT,
      verifier_task_revision INTEGER,
      record_count INTEGER,
      head_record_digest TEXT,
      revision INTEGER,
      binding_digest TEXT,
      created_at TEXT
    );
    CREATE TABLE git_evidence_records (
      chain_id TEXT,
      sequence INTEGER,
      stage TEXT,
      actor_task_id TEXT,
      actor_incarnation_id TEXT,
      previous_record_digest TEXT,
      record_digest TEXT,
      record_json TEXT,
      created_at TEXT
    );
    CREATE INDEX git_evidence_records_chain_sequence
      ON git_evidence_records (chain_id, sequence);
  `);
  database.close();
  expectCode(
    () => coordinatorFor(temporary.filename, current),
    "threadmesh_storage_schema_incompatible",
  );
  temporary.cleanup();
});

test("v5 migration checksum commits to evidence constraints and index definitions", () => {
  const migration = SQLITE_SCHEMA_MIGRATIONS.find(({ version }) => version === 5);
  assert.equal(migration.manifest, SQLITE_SCHEMA_MANIFEST);
  assert.equal(migration.manifest.constraints.tables.git_evidence_records.unique.includes(
    "chain_id,record_digest",
  ), true);
  assert.deepEqual(
    migration.manifest.constraints.indexes.git_evidence_records_chain_sequence.columns,
    ["chain_id", "sequence"],
  );
  assert.equal(migration.checksum, sha256Digest({
    version: migration.version,
    name: migration.name,
    manifest: migration.manifest,
  }));
  const altered = structuredClone(migration.manifest);
  altered.constraints.tables.git_evidence_records.unique = ["record_digest"];
  assert.notEqual(migration.checksum, sha256Digest({
    version: migration.version,
    name: migration.name,
    manifest: altered,
  }));
});
