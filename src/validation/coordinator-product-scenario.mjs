import { randomUUID } from "node:crypto";

import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { codedError } from "../protocol-validator.mjs";

const EVIDENCE_KEYS = Object.freeze({
  "acp-session": ["kind", "sessionId", "snapshotDigest", "stopReason"],
  "codex-app-server": ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
  "gemini-headless": [
    "exitCode",
    "kind",
    "resultStatus",
    "sessionId",
    "snapshotDigest",
    "toolUseCount",
  ],
});

function scenarioIds(productId, runId) {
  const suffix = `${productId}_${runId}`.replaceAll(/[^a-zA-Z0-9_]/g, "_");
  return {
    relationshipId: `rel_${suffix}`,
    grantId: `grant_${suffix}`,
    messageId: `msg_${suffix}`,
    senderTaskId: `task_sender_${suffix}`,
    senderIncarnationId: `inc_sender_${suffix}`,
    receiverTaskId: `task_receiver_${suffix}`,
    receiverIncarnationId: `inc_receiver_${suffix}`,
  };
}

function exactMarker(text, marker, truncated) {
  if (truncated || text !== marker) {
    throw codedError("threadmesh_product_marker_mismatch");
  }
}

export async function runCoordinatorProductScenario({
  productId,
  marker,
  setupProduct,
  clock = Date.now,
  runId = randomUUID().replaceAll("-", ""),
}) {
  if (typeof productId !== "string" || typeof marker !== "string" || !marker) {
    throw codedError("threadmesh_product_scenario_invalid");
  }
  const owner = { kind: "user", principalId: "threadmesh-validation-owner" };
  const ids = scenarioIds(productId, runId);
  const now = clock();
  const coordinator = new SqliteCoordinator({ clock });
  let product;
  let cleanup = { attempted: false, complete: false };
  let scenarioResult;
  let failure;

  try {
    product = await setupProduct({ marker, ids });
    const sender = {
      kind: "task",
      taskId: ids.senderTaskId,
      incarnationId: ids.senderIncarnationId,
    };
    const receiver = {
      kind: "task",
      taskId: ids.receiverTaskId,
      incarnationId: ids.receiverIncarnationId,
    };
    coordinator.registerTask(
      {
        taskId: sender.taskId,
        incarnationId: sender.incarnationId,
        harness: "threadmesh-validation-sender",
      },
      owner,
    );
    coordinator.registerTask(
      {
        taskId: receiver.taskId,
        incarnationId: receiver.incarnationId,
        harness: product.harness,
        adapterRef: product.adapterRef,
      },
      owner,
    );

    coordinator.issueGrant(
      {
        specVersion: "0.0-draft",
        grantId: ids.grantId,
        grantVersion: 1,
        relationshipId: ids.relationshipId,
        relationshipType: "dependency",
        source: { taskId: sender.taskId, incarnationId: sender.incarnationId },
        target: { taskId: receiver.taskId, incarnationId: receiver.incarnationId },
        allowedIntents: ["suggest"],
        allowedDeliveryModes: ["checkpoint-offer"],
        summaryVisibility: "coordination",
        structuredGateResponses: false,
        createdAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 10 * 60_000).toISOString(),
      },
      {
        decisionId: `decision_${runId}`,
        authenticationId: `authn_${runId}`,
        decidedAt: new Date(now - 60_000).toISOString(),
      },
      owner,
    );

    const envelope = {
      specVersion: "0.0-draft",
      messageId: ids.messageId,
      messageType: "suggestion",
      intent: "suggest",
      claimStatus: "unverified",
      sender: {
        taskId: sender.taskId,
        incarnationId: sender.incarnationId,
        actorType: "agent",
        harness: "threadmesh-validation-sender",
      },
      target: {
        taskId: receiver.taskId,
        incarnationId: receiver.incarnationId,
        harness: product.harness,
      },
      relationshipId: ids.relationshipId,
      content: `Reply with exactly ${marker} and do not use tools.`,
      reason: "Bounded coordinator-mediated product validation.",
      evidenceRefs: [],
      delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60_000).toISOString(),
    };

    coordinator.submit(envelope, sender);
    const mailbox = coordinator.listPending(receiver, {}, receiver);
    if (mailbox.messages.length !== 1 || mailbox.messages[0].envelope.messageId !== ids.messageId) {
      throw codedError("threadmesh_validation_mailbox_mismatch");
    }
    const claimed = coordinator.claimPending(sender.incarnationId, ids.messageId, 0, receiver);
    coordinator.acknowledgePending(
      sender.incarnationId,
      ids.messageId,
      claimed.claimToken,
      "accepted",
      0,
      receiver,
    );
    const prepared = coordinator.prepareContextAdmission(
      sender.incarnationId,
      ids.messageId,
      1,
      receiver,
    );
    const delivery = await product.deliver(prepared);
    exactMarker(delivery.text, marker, delivery.truncated);
    const disposition = coordinator.confirmContextAdmission(
      sender.incarnationId,
      ids.messageId,
      1,
      prepared.admissionToken,
      delivery.evidence,
      receiver,
    );
    const admittedEvent = coordinator
      .auditEvents(sender.incarnationId, ids.messageId, receiver)
      .find((event) => event.eventType === "context-admitted");
    const expectedKeys = EVIDENCE_KEYS[product.adapterRef.kind];
    if (
      !admittedEvent ||
      !expectedKeys ||
      JSON.stringify(Object.keys(admittedEvent.detail.adapterEvidence).sort()) !==
        JSON.stringify([...expectedKeys].sort())
    ) {
      throw codedError("threadmesh_validation_audit_projection_mismatch");
    }

    scenarioResult = {
      state: "passed",
      productId,
      messageId: ids.messageId,
      adapterKind: product.adapterRef.kind,
      mailbox: "claimed-and-accepted",
      delivery: disposition.delivery,
      decision: disposition.decision,
      outcome: disposition.outcome,
      markerMatched: true,
      evidenceKeys: Object.keys(admittedEvent.detail.adapterEvidence).sort(),
      adapterSnapshotDigest: product.adapterRef.snapshotDigest,
      productMetadata: product.productMetadata ?? null,
    };
  } catch (error) {
    failure = error;
  } finally {
    coordinator.close();
    if (product?.cleanup) {
      try {
        cleanup = { attempted: true, ...(await product.cleanup()) };
      } catch (error) {
        cleanup = {
          attempted: true,
          complete: false,
          errorCode: error?.code ?? "unknown_cleanup_error",
        };
      }
    }
  }
  if (!cleanup.complete && product) {
    failure ??= codedError("threadmesh_product_cleanup_incomplete");
  }
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  return { ...scenarioResult, cleanup };
}
