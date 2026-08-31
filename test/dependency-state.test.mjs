import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  SqliteCoordinator,
  createEffectiveGrant,
} from "../src/coordinator/sqlite-coordinator.mjs";
import {
  verificationAttestationDigest,
} from "../src/protocol-validator.mjs";
import {
  projectLifecycleEventToEnvelope,
} from "../src/routing/lifecycle-events.mjs";

const NOW = Date.parse("2026-08-20T09:00:00Z");
const owner = { kind: "user", principalId: "owner_dependency" };
const policy = { kind: "policy", principalId: "policy_dependency" };
const prerequisite = {
  taskId: "task_prerequisite",
  incarnationId: "inc_prerequisite01",
};
const dependent = {
  taskId: "task_dependent",
  incarnationId: "inc_dependent01",
};
const senderPrincipal = { kind: "task", ...prerequisite };
const receiverPrincipal = { kind: "task", ...dependent };

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-dependency-"));
  return {
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

function edge(overrides = {}) {
  return {
    dependencyId: "dependency_prerequisite_before_dependent",
    version: 1,
    edgeType: "dependency",
    prerequisite,
    dependent,
    relationshipId: "rel_prerequisite_dependent",
    expectedEventType: "dependency-satisfied",
    freshness: {
      expectedRunId: "run_dependent01",
      expectedObjectiveVersion: 2,
      expectedCheckpoint: "checkpoint-2",
    },
    createdAt: "2026-08-20T08:30:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    eventType: "dependency-satisfied",
    messageId: "msg_dependency_satisfied01",
    sender: {
      ...prerequisite,
      actorType: "agent",
      harness: "codex",
    },
    target: { ...dependent, harness: "kimi-code" },
    relationshipId: "rel_prerequisite_dependent",
    content: "The prerequisite has passed its external verification gate.",
    reason: "The dependent task can now continue.",
    freshness: {
      expectedRunId: "run_dependent01",
      expectedObjectiveVersion: 2,
      expectedCheckpoint: "checkpoint-2",
    },
    createdAt: "2026-08-20T08:59:00Z",
    expiresAt: "2026-08-20T09:10:00Z",
    ...overrides,
  };
}

function createCoordinator(
  filename = ":memory:",
  verificationTrustAnchors = trustedVerifier.trustAnchors,
) {
  const coordinator = new SqliteCoordinator({
    filename,
    clock: () => NOW,
    verificationTrustAnchors,
  });
  coordinator.registerTask(
    {
      ...prerequisite,
      harness: "codex",
      state: "running",
      runtime: { runId: "run_prerequisite01", objectiveVersion: 1 },
    },
    owner,
  );
  coordinator.registerTask(
    {
      ...dependent,
      harness: "kimi-code",
      state: "idle",
      runtime: {
        runId: "run_dependent01",
        objectiveVersion: 2,
        checkpoint: "checkpoint-2",
      },
      adapterRef: {
        kind: "acp-session",
        sessionId: "session-dependent01",
        snapshotDigest: `sha256:${"c".repeat(64)}`,
      },
    },
    owner,
  );
  const grant = createEffectiveGrant(
    {
      specVersion: "0.0-draft",
      grantId: "grant_prerequisite_dependent",
      grantVersion: 1,
      relationshipId: "rel_prerequisite_dependent",
      relationshipType: "peer",
      source: prerequisite,
      target: dependent,
      allowedIntents: ["suggest"],
      allowedDeliveryModes: ["checkpoint-offer"],
      summaryVisibility: "coordination",
      structuredGateResponses: false,
      expiresAt: "2026-08-20T10:00:00Z",
    },
    {
      decisionId: "decision_dependency_grant01",
      authenticationId: "authn_dependency_owner01",
      decidedAt: "2026-08-20T08:00:00Z",
    },
    owner,
  );
  coordinator.installGrant(grant, owner);
  return coordinator;
}

function createVerifier(keyId = "https://verifier.example/keys/dependency-01") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    trustAnchors: [
      {
        keyId,
        algorithm: "ed25519",
        actorId: "verifier.example",
        trustDomain: "https://verifier.example",
        policyId: "threadmesh://policy/trusted-verifiers/v1",
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
      },
    ],
  };
}

const trustedVerifier = createVerifier();

function signedDisposition({
  sourceEvent = event(),
  revision = 3,
  deliveryState = "adapter-submitted",
  decisionState = "accepted",
  verifier = trustedVerifier,
} = {}) {
  const trustAnchor = verifier.trustAnchors[0];
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: "att_dependency_verified01",
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_dependency_verifier01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      messageId: sourceEvent.messageId,
      senderIncarnationId: sourceEvent.sender.incarnationId,
      receiver: dependent,
      claimType: "external-effect",
      claimDigest: `sha256:${"a".repeat(64)}`,
    },
    method: "direct-resource-query",
    evidenceDigest: `sha256:${"b".repeat(64)}`,
    verifiedAt: "2026-08-20T09:02:00Z",
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: "decision_dependency_verifier01",
      decision: "trusted",
      decidedAt: "2026-08-20T09:02:00Z",
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519",
    keyId: trustAnchor.keyId,
    signature: sign(
      null,
      Buffer.from(attestation.signedPayloadDigest, "utf8"),
      verifier.privateKey,
    ).toString("base64url"),
  };
  const disposition = {
    specVersion: "0.0-draft",
    dispositionId: "dsp_dependency_verified01",
    messageId: sourceEvent.messageId,
    receiver: dependent,
    revision,
    delivery: {
      state: deliveryState,
      observedAt: "2026-08-20T09:01:00Z",
    },
    decision:
      decisionState === "accepted"
        ? {
            state: "accepted",
            decidedAt: "2026-08-20T09:00:50Z",
            decidedBy: { actorType: "agent", task: dependent },
            reasonCode: "accepted",
          }
        : {
            state: "rejected",
            decidedAt: "2026-08-20T09:00:50Z",
            decidedBy: { actorType: "agent", task: dependent },
            reasonCode: "receiver-rejected",
          },
    outcome: {
      state: "externally-verified",
      observedAt: "2026-08-20T09:02:00Z",
      evidenceRefs: ["https://verifier.example/evidence/dependency-01"],
      verificationAttestations: [attestation],
    },
    updatedAt: "2026-08-20T09:02:00Z",
  };
  return { disposition, trustAnchors: verifier.trustAnchors };
}

function prepareAccepted(coordinator, sourceEvent = event()) {
  coordinator.submit(projectLifecycleEventToEnvelope(sourceEvent), senderPrincipal);
  coordinator.respond(
    sourceEvent.sender.incarnationId,
    sourceEvent.messageId,
    "accepted",
    0,
    receiverPrincipal,
  );
  const prepared = coordinator.prepareAdapterSubmission(
    sourceEvent.sender.incarnationId,
    sourceEvent.messageId,
    1,
    receiverPrincipal,
  );
  coordinator.beginAdapterSubmission(
    prepared.submission.submissionId,
    1,
    receiverPrincipal,
  );
  coordinator.recordAdapterReceipt(
    prepared.submission.submissionId,
    1,
    {
      adapterOperationId: `operation-${sourceEvent.messageId}`,
      acceptedAt: "2026-08-20T09:01:00Z",
      evidenceRefs: [`adapter-receipt://${sourceEvent.messageId}`],
    },
    receiverPrincipal,
  );
}

test("persists versioned dependency authority and freshness across restart", () => {
  const temporary = temporaryDatabase();
  let coordinator = createCoordinator(temporary.filename);
  try {
    assert.throws(
      () => coordinator.createDependencyEdge(
        edge(),
        { kind: "user", principalId: "unrelated_owner" },
      ),
      { code: "threadmesh_dependency_edge_scope_not_authorized" },
    );
    const created = coordinator.createDependencyEdge(edge(), owner);
    assert.equal(created.replay, false);
    assert.equal(created.status, "waiting");
    assert.deepEqual(created.authority, owner);
    assert.equal(created.freshness.expectedCheckpoint, "checkpoint-2");
    assert.equal(coordinator.createDependencyEdge(edge(), owner).replay, true);
  } finally {
    coordinator.close();
  }
  coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
    verificationTrustAnchors: trustedVerifier.trustAnchors,
  });
  try {
    const recovered = coordinator.getDependencyEdge(
      edge().dependencyId,
      receiverPrincipal,
    );
    assert.equal(recovered.version, 1);
    assert.equal(recovered.status, "waiting");
    assert.deepEqual(recovered.prerequisite, prerequisite);
    assert.deepEqual(recovered.dependent, dependent);
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("upgrades a v3 coordinator database without rewriting existing state", () => {
  const temporary = temporaryDatabase();
  let coordinator = createCoordinator(temporary.filename);
  coordinator.close();
  const database = new Database(temporary.filename);
  database.exec(`
    DROP INDEX git_evidence_records_chain_sequence;
    DROP TABLE git_evidence_records;
    DROP TABLE git_evidence_requirements;
    DROP TABLE dependency_satisfactions;
    DROP TABLE dependency_edges;
    DELETE FROM schema_migrations WHERE version >= 4;
    PRAGMA user_version = 3;
  `);
  const priorTaskCount = database.prepare("SELECT COUNT(*) FROM tasks").pluck().get();
  database.close();

  coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
    verificationTrustAnchors: trustedVerifier.trustAnchors,
  });
  try {
    assert.equal(coordinator.storageInfo().schemaVersion, 5);
    assert.equal(
      coordinator.getTask(prerequisite, owner).incarnationId,
      prerequisite.incarnationId,
    );
    assert.equal(priorTaskCount, 2);
    assert.equal(coordinator.createDependencyEdge(edge(), owner).status, "waiting");
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("atomically records a trusted verified disposition and satisfies exactly once", () => {
  const temporary = temporaryDatabase();
  let coordinator = createCoordinator(temporary.filename);
  const sourceEvent = event();
  const verified = signedDisposition({ sourceEvent });
  let first;
  try {
    coordinator.createDependencyEdge(edge(), owner);
    prepareAccepted(coordinator, sourceEvent);
    assert.throws(
      () => coordinator.satisfyDependencyEdge(
        {
          dependencyId: edge().dependencyId,
          expectedVersion: 1,
          event: sourceEvent,
          ...verified,
        },
        senderPrincipal,
      ),
      { code: "threadmesh_dependency_satisfaction_not_authorized" },
    );
    first = coordinator.satisfyDependencyEdge(
      {
        dependencyId: edge().dependencyId,
        expectedVersion: 1,
        event: sourceEvent,
        ...verified,
      },
      receiverPrincipal,
    );
    assert.equal(first.status, "satisfied");
    assert.equal(first.unlock, true);
    assert.equal(first.replay, false);
    assert.equal(coordinator.getTask(dependent, owner).state, "ready");
    assert.deepEqual(
      coordinator.getDisposition(
        sourceEvent.sender.incarnationId,
        sourceEvent.messageId,
        receiverPrincipal,
      ),
      {
        revision: 3,
        delivery: "adapter-submitted",
        decision: "accepted",
        decisionReasonCode: "accepted",
        outcome: "externally-verified",
      },
    );
  } finally {
    coordinator.close();
  }

  coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
    verificationTrustAnchors: trustedVerifier.trustAnchors,
  });
  try {
    const recovered = coordinator.getDependencyEdge(edge().dependencyId, policy);
    assert.equal(recovered.status, "satisfied");
    assert.equal(recovered.satisfaction.messageId, sourceEvent.messageId);
    const replay = coordinator.satisfyDependencyEdge(
      {
        dependencyId: edge().dependencyId,
        expectedVersion: 1,
        event: sourceEvent,
        ...verified,
      },
      policy,
    );
    assert.equal(replay.replay, true);
    assert.equal(replay.unlock, false);
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("does not unlock a dependent task while another current dependency is unsatisfied", () => {
  const coordinator = createCoordinator();
  const secondPrerequisite = {
    taskId: "task_prerequisite_second",
    incarnationId: "inc_prerequisite02",
  };
  try {
    coordinator.registerTask(
      {
        ...secondPrerequisite,
        harness: "codex",
        state: "running",
        runtime: { runId: "run_prerequisite02", objectiveVersion: 1 },
      },
      owner,
    );
    coordinator.createDependencyEdge(edge(), owner);
    coordinator.createDependencyEdge(
      edge({
        dependencyId: "dependency_second_before_dependent",
        prerequisite: secondPrerequisite,
        relationshipId: "rel_second_dependent",
      }),
      owner,
    );
    prepareAccepted(coordinator);
    const verified = signedDisposition();
    const first = coordinator.satisfyDependencyEdge(
      {
        dependencyId: edge().dependencyId,
        expectedVersion: 1,
        event: event(),
        ...verified,
      },
      receiverPrincipal,
    );

    assert.equal(first.status, "satisfied");
    assert.equal(first.unlock, false);
    assert.equal(coordinator.getTask(dependent, owner).state, "idle");
    assert.equal(
      coordinator.getDependencyEdge(
        "dependency_second_before_dependent",
        owner,
      ).status,
      "waiting",
    );
  } finally {
    coordinator.close();
  }
});

test("revocation, stale versions, unverified claims, rejection, and conflicts fail closed", () => {
  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      const revoked = coordinator.revokeDependencyEdge(edge().dependencyId, 1, owner);
      assert.equal(revoked.status, "revoked");
      assert.equal(revoked.version, 2);
      assert.equal(
        coordinator.revokeDependencyEdge(edge().dependencyId, 1, owner).replay,
        true,
      );
      prepareAccepted(coordinator);
      const verified = signedDisposition();
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 2,
            event: event(),
            ...verified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_edge_inactive" },
      );
    } finally {
      coordinator.close();
    }
  }

  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      coordinator.submit(projectLifecycleEventToEnvelope(event()), senderPrincipal);
      coordinator.respond(
        event().sender.incarnationId,
        event().messageId,
        "rejected",
        0,
        receiverPrincipal,
      );
      const verified = signedDisposition();
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 2,
            event: event(),
            ...verified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_edge_version_conflict" },
      );

      const unverified = structuredClone(verified.disposition);
      unverified.outcome = { state: "not-observed" };
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: event(),
            disposition: unverified,
            trustAnchors: verified.trustAnchors,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_disposition_binding_mismatch" },
      );

      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: event(),
            ...verified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_disposition_binding_mismatch" },
      );
    } finally {
      coordinator.close();
    }
  }

  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      prepareAccepted(coordinator);
      const verified = signedDisposition();
      const unverified = structuredClone(verified.disposition);
      unverified.outcome = { state: "not-observed" };
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: event(),
            disposition: unverified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_disposition_not_externally_verified" },
      );
      assert.equal(coordinator.getTask(dependent, owner).state, "idle");
    } finally {
      coordinator.close();
    }
  }

  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      coordinator.updateTaskRuntime(
        dependent,
        {
          runId: "run_dependent02",
          objectiveVersion: 2,
          checkpoint: "checkpoint-2",
        },
        0,
        owner,
      );
      const staleEvent = event({
        freshness: {
          expectedRunId: "run_dependent02",
          expectedObjectiveVersion: 2,
          expectedCheckpoint: "checkpoint-2",
        },
      });
      prepareAccepted(coordinator, staleEvent);
      const verified = signedDisposition({ sourceEvent: staleEvent });
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: staleEvent,
            ...verified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_edge_stale" },
      );
    } finally {
      coordinator.close();
    }
  }

  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      const secondDependency = edge({
        dependencyId: "dependency_second_same_event",
      });
      coordinator.createDependencyEdge(secondDependency, owner);
      prepareAccepted(coordinator);
      const verified = signedDisposition();
      coordinator.satisfyDependencyEdge(
        {
          dependencyId: edge().dependencyId,
          expectedVersion: 1,
          event: event(),
          ...verified,
        },
        receiverPrincipal,
      );
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: secondDependency.dependencyId,
            expectedVersion: 1,
            event: event(),
            ...verified,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_satisfaction_conflict" },
      );
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: event(),
            disposition: {
              ...verified.disposition,
              dispositionId: "dsp_dependency_conflict01",
            },
            trustAnchors: verified.trustAnchors,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_dependency_satisfaction_conflict" },
      );
    } finally {
      coordinator.close();
    }
  }

  {
    const coordinator = createCoordinator();
    try {
      coordinator.createDependencyEdge(edge(), owner);
      prepareAccepted(coordinator);
      const callerControlledVerifier = createVerifier(
        "https://attacker.example/keys/self-signed01",
      );
      const selfSigned = signedDisposition({ verifier: callerControlledVerifier });
      coordinator.verificationTrustAnchors = callerControlledVerifier.trustAnchors;
      assert.throws(
        () => coordinator.satisfyDependencyEdge(
          {
            dependencyId: edge().dependencyId,
            expectedVersion: 1,
            event: event(),
            ...selfSigned,
          },
          receiverPrincipal,
        ),
        { code: "threadmesh_verification_trust_denied" },
      );
    } finally {
      coordinator.close();
    }
  }
});
