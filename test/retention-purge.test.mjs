import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  StaticTokenAuthenticator,
  ThreadMeshJsonRpcBinding,
} from "../src/bindings/jsonrpc.mjs";
import { ThreadMeshJsonRpcClient } from "../src/client/jsonrpc-client.mjs";
import {
  createEffectiveGrant,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";

const START = Date.parse("2026-08-20T09:00:00Z");
const owner = { kind: "user", principalId: "owner" };
const policy = { kind: "policy", principalId: "retention-policy" };
const sender = {
  kind: "task",
  taskId: "task_retention_sender",
  incarnationId: "inc_retention_sender01",
};
const receiver = {
  kind: "task",
  taskId: "task_retention_receiver",
  incarnationId: "inc_retention_receiver01",
};
const ref = ({ taskId, incarnationId }) => ({ taskId, incarnationId });

function grant() {
  return createEffectiveGrant(
    {
      specVersion: "0.0-draft",
      grantId: "grant_retention_sender_receiver",
      grantVersion: 1,
      relationshipId: "rel_retention_sender_receiver",
      relationshipType: "peer",
      source: ref(sender),
      target: ref(receiver),
      allowedIntents: ["suggest"],
      allowedDeliveryModes: ["checkpoint-offer"],
      summaryVisibility: "coordination",
      structuredGateResponses: false,
      createdAt: "2026-08-20T08:00:00Z",
      expiresAt: "2026-08-20T10:00:00Z",
    },
    {
      decisionId: "decision_retention_grant01",
      authenticationId: "authn_retention_owner01",
      decidedAt: "2026-08-20T08:00:00Z",
    },
    owner,
  );
}

function envelope(messageId, secret) {
  return {
    specVersion: "0.0-draft",
    messageId,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "evidence-referenced",
    sender: {
      taskId: sender.taskId,
      incarnationId: sender.incarnationId,
      actorType: "agent",
      harness: "retention-sender",
    },
    target: {
      taskId: receiver.taskId,
      incarnationId: receiver.incarnationId,
      harness: "retention-receiver",
    },
    relationshipId: "rel_retention_sender_receiver",
    content: secret,
    reason: `reason:${secret}`,
    evidenceRefs: [`artifact://${secret}`],
    delivery: {
      requestedMode: "checkpoint-offer",
      requiresDisposition: true,
    },
    createdAt: "2026-08-20T09:00:00Z",
    expiresAt: "2026-08-20T09:10:00Z",
  };
}

function setup(filename, clock) {
  const coordinator = new SqliteCoordinator({ filename, clock });
  coordinator.registerTask(
    {
      taskId: sender.taskId,
      incarnationId: sender.incarnationId,
      harness: "retention-sender",
      state: "running",
    },
    owner,
  );
  coordinator.registerTask(
    {
      taskId: receiver.taskId,
      incarnationId: receiver.incarnationId,
      harness: "retention-receiver",
      state: "running",
      adapterRef: {
        kind: "acp-session",
        sessionId: "retention-session-secret",
        snapshotDigest: `sha256:${"a".repeat(64)}`,
      },
    },
    owner,
  );
  coordinator.installGrant(grant(), owner);
  return coordinator;
}

test("purges expired content but preserves replay and unknown-outcome evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-retention-"));
  const filename = path.join(directory, "coordinator.sqlite");
  let currentTime = START;
  let coordinator = setup(filename, () => currentTime);
  const purgedSecret = "secret-that-must-be-tombstoned";
  const unknownSecret = "secret-held-for-unknown-outcome";
  const firstEnvelope = envelope("msg_retention_purge01", purgedSecret);
  const unknownEnvelope = envelope("msg_retention_unknown01", unknownSecret);
  try {
    coordinator.proposeRelationship(
      {
        specVersion: "0.0-draft",
        proposalId: "proposal_retention_expired01",
        source: ref(sender),
        target: ref(receiver),
        relationshipType: "peer",
        requestedIntents: ["suggest"],
        requestedDeliveryModes: ["checkpoint-offer"],
        requestedSummaryVisibility: "coordination",
        reason: `proposal:${purgedSecret}`,
        proposedBy: { actorType: "agent", task: ref(sender) },
        createdAt: "2026-08-20T09:00:00Z",
        expiresAt: "2026-08-20T09:20:00Z",
      },
      sender,
    );
    coordinator.publishTaskSummary(
      {
        specVersion: "0.0-draft",
        summaryId: "sum_retention_receiver01",
        summaryVersion: 1,
        task: {
          taskId: receiver.taskId,
          incarnationId: receiver.incarnationId,
          harness: "retention-receiver",
        },
        projection: {
          relationshipId: "rel_retention_sender_receiver",
          grantId: "grant_retention_sender_receiver",
          grantVersion: 1,
          summaryVisibility: "coordination",
        },
        state: "running",
        blockerHint: `summary:${purgedSecret}`,
        coordination: {
          intents: ["suggest"],
          deliveryModes: ["checkpoint-offer"],
        },
        sensitivity: "relationship-scoped",
        audience: {
          visibility: "relationship-scoped",
          relationshipIds: ["rel_retention_sender_receiver"],
        },
        updatedAt: "2026-08-20T09:00:00Z",
      },
      null,
      receiver,
    );

    coordinator.submit(firstEnvelope, sender);
    coordinator.respond(
      sender.incarnationId,
      firstEnvelope.messageId,
      "accepted",
      0,
      receiver,
    );
    const admission = coordinator.prepareContextAdmission(
      sender.incarnationId,
      firstEnvelope.messageId,
      1,
      receiver,
    );
    coordinator.confirmContextAdmission(
      sender.incarnationId,
      firstEnvelope.messageId,
      1,
      admission.admissionToken,
      {
        sessionId: "retention-session-secret",
        snapshotDigest: `sha256:${"a".repeat(64)}`,
        stopReason: "end_turn",
      },
      receiver,
    );
    coordinator.submit(unknownEnvelope, sender);
    coordinator.respond(
      sender.incarnationId,
      unknownEnvelope.messageId,
      "accepted",
      0,
      receiver,
    );
    const prepared = coordinator.prepareAdapterSubmission(
      sender.incarnationId,
      unknownEnvelope.messageId,
      1,
      receiver,
    );
    coordinator.beginAdapterSubmission(prepared.submission.submissionId, 1, receiver);

    coordinator.rotateTaskIncarnation(
      receiver,
      {
        taskId: receiver.taskId,
        incarnationId: "inc_retention_receiver02",
        harness: "retention-receiver-v2",
        state: "idle",
      },
      0,
      owner,
    );
    currentTime = Date.parse("2026-08-20T11:00:00Z");
    const first = coordinator.purgeSensitiveContent(
      { before: "2026-08-20T10:30:00Z", limit: 100 },
      policy,
    );
    assert.deepEqual(first.messages, [{
      senderIncarnationId: sender.incarnationId,
      messageId: firstEnvelope.messageId,
    }]);
    assert.deepEqual(first.proposalIds, ["proposal_retention_expired01"]);
    assert.deepEqual(first.summaryIds, ["sum_retention_receiver01"]);
    assert.deepEqual(first.adapterRefs, []);
    assert.deepEqual(first.admissionClaimRefs, [{
      senderIncarnationId: sender.incarnationId,
      messageId: firstEnvelope.messageId,
    }]);

    const snapshot = coordinator.inspectMessage(
      sender.incarnationId,
      firstEnvelope.messageId,
      sender,
    );
    assert.deepEqual(snapshot.content, { state: "redacted", reason: "purged" });
    assert.equal(snapshot.evidence.state, "redacted");
    assert.equal(snapshot.evidence.count, 0);
    assert.equal(snapshot.provenance.claimStatus, "evidence-referenced");
    assert.equal(snapshot.lifecycle.contentPurgedAt, "2026-08-20T11:00:00.000Z");
    assert.deepEqual(
      snapshot.events.map((event) => event.eventType),
      [
        "message-durably-received",
        "receiver-decided",
        "context-admission-claimed",
        "context-admitted",
        "content-purged",
      ],
    );
    const audit = coordinator.auditEvents(
      sender.incarnationId,
      firstEnvelope.messageId,
      sender,
    );
    assert.deepEqual(audit[0].detail, {
      redacted: true,
      reason: "retention-policy",
    });
    assert.equal(JSON.stringify(audit).includes(purgedSecret), false);

    const replay = coordinator.submit(firstEnvelope, sender);
    assert.equal(replay.replay, true);
    assert.equal(JSON.stringify(replay).includes(purgedSecret), false);
    assert.equal(
      coordinator.db
        .prepare("SELECT envelope_json FROM messages WHERE message_id = ?")
        .pluck()
        .get(firstEnvelope.messageId)
        .includes(purgedSecret),
      false,
    );
    assert.equal(
      coordinator.db
        .prepare("SELECT adapter_ref_json FROM admission_claims WHERE message_id = ?")
        .pluck()
        .get(firstEnvelope.messageId)
        .includes("retention-session-secret"),
      false,
    );
    assert.equal(
      coordinator.db
        .prepare("SELECT proposal_json FROM relationship_proposals WHERE proposal_id = ?")
        .pluck()
        .get("proposal_retention_expired01")
        .includes(purgedSecret),
      false,
    );
    assert.equal(
      coordinator.db
        .prepare("SELECT summary_json FROM task_summaries WHERE summary_id = ?")
        .pluck()
        .get("sum_retention_receiver01")
        .includes(purgedSecret),
      false,
    );
    assert.equal(
      coordinator.db
        .prepare("SELECT content_purged_at FROM messages WHERE message_id = ?")
        .pluck()
        .get(unknownEnvelope.messageId),
      null,
    );
    assert.equal(
      coordinator.db
        .prepare("SELECT envelope_json FROM messages WHERE message_id = ?")
        .pluck()
        .get(unknownEnvelope.messageId)
        .includes(unknownSecret),
      true,
    );

    const second = coordinator.purgeSensitiveContent(
      { before: "2026-08-20T10:30:00Z", limit: 100 },
      policy,
    );
    assert.deepEqual(second.messages, []);
    assert.deepEqual(second.adapterRefs, []);

    coordinator.reconcileAdapterSubmission(
      prepared.submission.submissionId,
      1,
      {
        resolution: "confirmed-not-submitted",
        evidenceRefs: ["adapter-query://retention/not-found"],
      },
      receiver,
    );
    const afterReconciliation = coordinator.purgeSensitiveContent(
      { before: "2026-08-20T10:30:00Z", limit: 100 },
      policy,
    );
    assert.deepEqual(afterReconciliation.messages, [{
      senderIncarnationId: sender.incarnationId,
      messageId: unknownEnvelope.messageId,
    }]);
    assert.deepEqual(afterReconciliation.adapterRefs, [{
      taskId: receiver.taskId,
      incarnationId: receiver.incarnationId,
    }]);
    assert.deepEqual(coordinator.checkpointStorage(policy), {
      busy: 0,
      logFrames: 0,
      checkpointedFrames: 0,
    });
    const walFilename = `${filename}-wal`;
    if (fs.existsSync(walFilename)) {
      assert.equal(fs.statSync(walFilename).size, 0);
    }

    coordinator.close();
    coordinator = new SqliteCoordinator({ filename, clock: () => currentTime });
    assert.equal(
      coordinator.inspectMessage(
        sender.incarnationId,
        unknownEnvelope.messageId,
        sender,
      ).content.reason,
      "purged",
    );
  } finally {
    coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("exposes policy-only idempotent purge through authenticated JSON-RPC", () => {
  const coordinator = new SqliteCoordinator({ clock: () => START });
  const credentials = [
    {
      token: "owner-token",
      context: {
        specVersion: "0.0-draft",
        authenticationId: "authn_retention_rpc_owner01",
        mechanism: "local-static-token",
        principal: owner,
        authenticatedAt: "2026-08-20T08:00:00Z",
      },
    },
    {
      token: "policy-token",
      context: {
        specVersion: "0.0-draft",
        authenticationId: "authn_retention_rpc_policy01",
        mechanism: "local-static-token",
        principal: policy,
        authenticatedAt: "2026-08-20T08:00:00Z",
      },
    },
  ];
  const binding = new ThreadMeshJsonRpcBinding({
    coordinator,
    authenticator: new StaticTokenAuthenticator(credentials),
    clock: () => START,
  });
  const send = (request, context) => binding.handle(request, context);
  const ownerClient = new ThreadMeshJsonRpcClient({
    send,
    authorization: "Bearer owner-token",
  });
  const policyClient = new ThreadMeshJsonRpcClient({
    send,
    authorization: "Bearer policy-token",
  });
  const params = {
    before: "2026-08-20T09:00:00Z",
    limit: 10,
    idempotencyKey: "idem_retention_rpc_purge01",
  };
  try {
    assert.throws(
      () => ownerClient.call("maintenance.purgeContent", params),
      { code: "threadmesh_policy_authority_required", rpcCode: -32003 },
    );
    const first = policyClient.call("maintenance.purgeContent", params);
    assert.equal(first.operationReplay, false);
    assert.deepEqual(first.value.messages, []);
    const replay = policyClient.call("maintenance.purgeContent", params);
    assert.equal(replay.operationReplay, true);
    assert.deepEqual(replay.value, first.value);
    assert.throws(
      () => coordinator.purgeSensitiveContent(
        { before: "2026-08-20T09:01:00Z" },
        policy,
      ),
      { code: "threadmesh_retention_cutoff_invalid" },
    );
    assert.throws(
      () => coordinator.purgeSensitiveContent(
        { before: "2026-08-20T09:00:00Z", limit: 0 },
        policy,
      ),
      { code: "threadmesh_retention_limit_invalid" },
    );
  } finally {
    coordinator.close();
  }
});
