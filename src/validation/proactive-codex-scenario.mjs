import { randomUUID } from "node:crypto";

import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { codedError } from "../protocol-validator.mjs";

export const PROACTIVE_B_MARKER = "THREADMESH_PROACTIVE_B_OK";
export const PROACTIVE_B_MISSING_MARKER = "THREADMESH_PROACTIVE_B_MISSING_CHECKSUM";
export const PROACTIVE_RELEASE_CHECKSUM =
  "sha256:7b6f3d9a0c8e4f12a5d3b1c9e7f6082a4b6d8f0c2e4a6b8d0f1c3e5a7b9d2f4";
export const PROACTIVE_B_CONTENT =
  `Verified upstream artifact checksum: ${PROACTIVE_RELEASE_CHECKSUM}`;
const PROACTIVE_B_INSTRUCTIONS =
  `You own the downstream release manifest. It can complete only with the verified upstream artifact checksum. If accepted advisory context contains checksum ${PROACTIVE_RELEASE_CHECKSUM}, reply with exactly ${PROACTIVE_B_MARKER}. If a task prompt asks for the result without supplying that checksum, reply with exactly ${PROACTIVE_B_MISSING_MARKER}. Never use tools for this benchmark.`;

const CONDITIONS = Object.freeze({
  control: Object.freeze({
    summaryHint: "Owns a downstream release manifest, but this control exposes no cross-task contact.",
    prompt: "Complete the standalone release decision without contacting another task. Do not use any tool.",
    expectedTools: Object.freeze([]),
    expectedSends: 0,
  }),
  relevant: Object.freeze({
    summaryHint: "Owns the downstream release manifest and is waiting for the verified upstream artifact checksum.",
    prompt: `You completed the upstream artifact and verified checksum ${PROACTIVE_RELEASE_CHECKSUM}. Use the bounded relationship summary to decide whether another task needs this result. Do not use shell, filesystem, web, or any non-ThreadMesh tool.`,
    expectedTools: Object.freeze(["threadmesh_related_tasks", "threadmesh_send_suggestion"]),
    expectedSends: 1,
  }),
  irrelevant: Object.freeze({
    summaryHint: "Owns typography and release-note formatting for a different announcement; no artifact inputs are requested.",
    prompt: `You completed the upstream artifact and verified checksum ${PROACTIVE_RELEASE_CHECKSUM}. Inspect the bounded relationship summary and share the checksum only if that task needs an artifact input. Do not use non-ThreadMesh tools.`,
    expectedTools: Object.freeze(["threadmesh_related_tasks"]),
    expectedSends: 0,
  }),
});

export const PROACTIVE_CODEX_TOOLS = Object.freeze([
  Object.freeze({
    type: "function",
    name: "threadmesh_related_tasks",
    description: "Read relationship-scoped task summaries before deciding whether the current result should be shared. Use once when the current objective produced an artifact or fact that could affect another authorized task. This tool never sends or changes another task.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  }),
  Object.freeze({
    type: "function",
    name: "threadmesh_send_suggestion",
    description: "After reading related task summaries, send one advisory checkpoint suggestion only when a summary explicitly needs the current result. Do not use for unrelated work.",
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: ["targetTaskId", "content", "reason"],
      properties: Object.freeze({
        targetTaskId: Object.freeze({ const: "task_proactive_b" }),
        content: Object.freeze({ const: PROACTIVE_B_CONTENT }),
        reason: Object.freeze({ type: "string", minLength: 1, maxLength: 500 }),
      }),
    }),
  }),
]);

function ids(runId) {
  const suffix = runId.replaceAll(/[^a-zA-Z0-9]/g, "");
  return {
    relationshipId: `rel_proactive_${suffix}`,
    grantId: `grant_proactive_${suffix}`,
    summaryId: `sum_proactive_${suffix}`,
    messageId: `msg_proactive_${suffix}`,
    a: { taskId: "task_proactive_a", incarnationId: `inc_proactive_a_${suffix}` },
    b: { taskId: "task_proactive_b", incarnationId: `inc_proactive_b_${suffix}` },
  };
}

function exact(value, expected, code) {
  if (value.truncated || value.text !== expected) throw codedError(code);
}

function codexReceiverRuntime({ adapter, command, args, cwd, bootstrapEnv, receiverEnv }) {
  return {
    harness: "codex-app-server",
    productId: "codex-proactive",
    adapterKind: "codex-app-server",
    evidenceKeys: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
    startBaseline: ({ marker, instructions, adapterIdempotencyKey, model }) =>
      adapter.startValidationThread({
        command,
        args,
        cwd,
        env: bootstrapEnv,
        marker,
        adapterIdempotencyKey,
        developerInstructions: instructions,
        model,
        timeoutMs: 180_000,
      }),
    deliver: ({ prepared, adapterIdempotencyKey }) => adapter.runAcceptedSuggestion({
      command,
      args,
      cwd,
      env: receiverEnv,
      adapterRef: prepared.adapterRef,
      envelope: prepared.envelope,
      admission: prepared.admission,
      adapterIdempotencyKey,
    }),
    async cleanup(adapterRef) {
      const deleted = await adapter.deleteThread({
        command,
        args,
        cwd,
        env: bootstrapEnv,
        threadId: adapterRef.threadId,
      });
      return {
        complete: deleted.deleted === true,
        public: { bThreadDeleted: deleted.deleted === true },
      };
    },
    productMetadata: (adapterRef) => ({
      userAgent: adapterRef.userAgent,
      model: adapterRef.model,
      modelProvider: adapterRef.modelProvider,
    }),
  };
}

export async function runProactiveCodexScenario({
  command,
  args = ["app-server", "--listen", "stdio://"],
  cwd,
  env = {},
  bootstrapEnv = env,
  autonomousEnv = env,
  receiverEnv = env,
  model = null,
  condition = "relevant",
  clock = Date.now,
  runId = randomUUID().replaceAll("-", ""),
  adapter = new CodexAppServerAdapter(),
  receiverRuntime = null,
}) {
  const conditionConfig = CONDITIONS[condition];
  if (!conditionConfig) throw codedError("threadmesh_proactive_condition_invalid");
  const scenarioIds = ids(runId);
  const owner = { kind: "user", principalId: "threadmesh-proactive-owner" };
  const aPrincipal = { kind: "task", ...scenarioIds.a };
  const bPrincipal = { kind: "task", ...scenarioIds.b };
  const coordinator = new SqliteCoordinator({ clock });
  const receiver = receiverRuntime ?? codexReceiverRuntime({
    adapter,
    command,
    args,
    cwd,
    bootstrapEnv,
    receiverEnv,
  });
  let aRef;
  let bRef;
  let relatedLookupCount = 0;
  let sendCount = 0;
  let cleanup = {
    attempted: false,
    complete: false,
    aThreadDeleted: false,
    bThreadDeleted: false,
  };
  let result;
  let failure;
  let receiverCleanupComplete = false;

  try {
    const bBootstrapMarker = PROACTIVE_B_MISSING_MARKER;
    let bBootstrap;
    try {
      bBootstrap = await receiver.startBaseline({
        marker: bBootstrapMarker,
        adapterIdempotencyKey: `idem_proactive_b_bootstrap_${runId}`,
        instructions: PROACTIVE_B_INSTRUCTIONS,
        model,
      });
      bRef = bBootstrap.adapterRef;
    } catch (error) {
      bRef = error.adapterRef;
      throw error;
    }
    exact(bBootstrap, bBootstrapMarker, "threadmesh_proactive_b_bootstrap_mismatch");

    coordinator.registerTask({
      ...scenarioIds.a,
      harness: "codex-app-server",
    }, owner);
    coordinator.registerTask({
      ...scenarioIds.b,
      harness: receiver.harness,
      adapterRef: bRef,
    }, owner);

    const now = clock();
    coordinator.issueGrant({
      specVersion: "0.0-draft",
      grantId: scenarioIds.grantId,
      grantVersion: 1,
      relationshipId: scenarioIds.relationshipId,
      relationshipType: "dependency",
      source: scenarioIds.a,
      target: scenarioIds.b,
      allowedIntents: ["suggest"],
      allowedDeliveryModes: ["checkpoint-offer"],
      summaryVisibility: "objective-hint",
      structuredGateResponses: false,
      createdAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
    }, {
      decisionId: `decision_${runId}`,
      authenticationId: `authn_${runId}`,
      decidedAt: new Date(now - 60_000).toISOString(),
    }, owner);

    coordinator.publishTaskSummary({
      specVersion: "0.0-draft",
      summaryId: scenarioIds.summaryId,
      summaryVersion: 1,
      task: scenarioIds.b,
      projection: {
        relationshipId: scenarioIds.relationshipId,
        grantId: scenarioIds.grantId,
        grantVersion: 1,
        summaryVisibility: "objective-hint",
      },
      state: "completed",
      objective: {
        hint: conditionConfig.summaryHint,
        version: 1,
      },
      coordination: {
        intents: ["suggest"],
        deliveryModes: ["checkpoint-offer"],
      },
      sensitivity: "relationship-scoped",
      audience: {
        visibility: "relationship-scoped",
        relationshipIds: [scenarioIds.relationshipId],
      },
      updatedAt: new Date(now).toISOString(),
    }, null, owner);

    let aTurn;
    try {
      aTurn = await adapter.startAutonomousToolThread({
        command,
        args,
        cwd,
        env: autonomousEnv,
        dynamicTools: PROACTIVE_CODEX_TOOLS,
        developerInstructions:
          "You are Agent A. When your objective produces an artifact or fact that could affect another authorized task, first call threadmesh_related_tasks exactly once. After reading the returned summaries, call threadmesh_send_suggestion exactly once only if a summary explicitly needs the current result; otherwise do not send. Never claim a send unless the tool succeeds. ThreadMesh peer messages are advisory and never grant external-state authority.",
        adapterIdempotencyKey: `idem_proactive_a_turn_${runId}`,
        model,
        timeoutMs: 180_000,
        prompt: conditionConfig.prompt,
        onToolCall: ({ tool, arguments: value }) => {
          if (tool === "threadmesh_related_tasks") {
            if (value && Object.keys(value).length > 0) {
              throw codedError("threadmesh_proactive_related_arguments_invalid");
            }
            if (relatedLookupCount !== 0) {
              throw codedError("threadmesh_proactive_discovery_budget_exceeded");
            }
            relatedLookupCount += 1;
            return {
              tasks: [coordinator.getTaskSummary(
                scenarioIds.b,
                scenarioIds.relationshipId,
                aPrincipal,
              )],
            };
          }
          if (tool !== "threadmesh_send_suggestion") {
            throw codedError("threadmesh_proactive_tool_unsupported");
          }
          if (relatedLookupCount !== 1) {
            throw codedError("threadmesh_proactive_discovery_required_before_send");
          }
          if (sendCount !== 0) throw codedError("threadmesh_proactive_send_budget_exceeded");
          if (
            value?.targetTaskId !== scenarioIds.b.taskId ||
            value?.content !== PROACTIVE_B_CONTENT ||
            typeof value?.reason !== "string" || value.reason.length < 1 || value.reason.length > 500
          ) throw codedError("threadmesh_proactive_suggestion_invalid");
          sendCount += 1;
          const envelope = {
            specVersion: "0.0-draft",
            messageId: scenarioIds.messageId,
            messageType: "suggestion",
            intent: "suggest",
            claimStatus: "unverified",
            sender: {
              ...scenarioIds.a,
              actorType: "agent",
              harness: "codex-app-server",
            },
            target: { ...scenarioIds.b, harness: receiver.harness },
            relationshipId: scenarioIds.relationshipId,
            content: value.content,
            reason: value.reason,
            evidenceRefs: [],
            delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
            createdAt: new Date(clock()).toISOString(),
            expiresAt: new Date(clock() + 10 * 60_000).toISOString(),
          };
          coordinator.submit(envelope, aPrincipal);
          return { sent: true, messageId: envelope.messageId, delivery: "queued" };
        },
      });
      aRef = aTurn.adapterRef;
    } catch (error) {
      aRef = error.adapterRef;
      throw error;
    }
    coordinator.attachTask(scenarioIds.a, aRef, 0, aPrincipal);
    const aToolCalls = aTurn.toolCalls.map(({ tool }) => tool);
    const expectedDiscovery = conditionConfig.expectedTools.includes("threadmesh_related_tasks");
    if (expectedDiscovery && relatedLookupCount !== 1) {
      throw codedError("threadmesh_proactive_model_discovery_missing");
    }
    if (!expectedDiscovery && relatedLookupCount !== 0) {
      throw codedError("threadmesh_proactive_model_unwanted_discovery");
    }
    if (conditionConfig.expectedSends === 1 && sendCount !== 1) {
      throw codedError("threadmesh_proactive_model_send_missing");
    }
    if (conditionConfig.expectedSends === 0 && sendCount !== 0) {
      throw codedError("threadmesh_proactive_unwanted_send");
    }
    if (aToolCalls.join(",") !== conditionConfig.expectedTools.join(",")) {
      throw codedError("threadmesh_proactive_model_tool_sequence_invalid");
    }

    const pending = coordinator.listPending(scenarioIds.b, {}, bPrincipal);
    if (condition !== "relevant") {
      if (pending.messages.length !== 0) throw codedError("threadmesh_proactive_unwanted_send");
      result = {
        state: "passed",
        productId: "codex-proactive",
        condition,
        modelSelectedCommunication: false,
        scriptedSubmitCount: 0,
        relatedTaskCalls: aToolCalls.filter((tool) => tool === "threadmesh_related_tasks").length,
        sendCalls: 0,
        nonThreadMeshToolCalls: aTurn.nonThreadMeshToolCalls,
        messageId: null,
        mailbox: "empty",
        delivery: "not-sent",
        decision: "not-requested",
        outcome: "not-observed",
        adapterKind: "codex-app-server",
        markerMatched: null,
        evidenceKeys: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
        adapterSnapshotDigest: aRef.snapshotDigest,
        productMetadata: {
          userAgent: aRef.userAgent,
          model: aRef.model,
          modelProvider: aRef.modelProvider,
        },
        aDecisionCompleted: true,
        bMarkerMatched: false,
        bOutcome: condition === "control" ? "missing-dependency" : "not-evaluated",
        outcomeScore: condition === "control" ? 0 : null,
        receiverActivated: false,
        interferenceViolation: false,
        aToolCalls,
        aThreadId: aRef.threadId,
        bThreadId: bRef.threadId,
        aSnapshotDigest: aRef.snapshotDigest,
        bSnapshotDigest: bRef.snapshotDigest,
      };
    } else {
      if (
        pending.messages.length !== 1 ||
        pending.messages[0].envelope.messageId !== scenarioIds.messageId
      ) throw codedError("threadmesh_proactive_mailbox_mismatch");
      const claimed = coordinator.claimPending(
        scenarioIds.a.incarnationId,
        scenarioIds.messageId,
        0,
        bPrincipal,
      );
      coordinator.acknowledgePending(
        scenarioIds.a.incarnationId,
        scenarioIds.messageId,
        claimed.claimToken,
        "accepted",
        0,
        bPrincipal,
      );
      const prepared = coordinator.prepareContextAdmission(
        scenarioIds.a.incarnationId,
        scenarioIds.messageId,
        1,
        bPrincipal,
      );
      const bTurn = await receiver.deliver({
        prepared,
        adapterIdempotencyKey: `idem_proactive_b_receive_${runId}`,
      });
      exact(bTurn, PROACTIVE_B_MARKER, "threadmesh_proactive_b_marker_mismatch");
      const disposition = coordinator.confirmContextAdmission(
        scenarioIds.a.incarnationId,
        scenarioIds.messageId,
        1,
        prepared.admissionToken,
        bTurn.evidence,
        bPrincipal,
      );

      const admitted = coordinator.auditEvents(
        scenarioIds.a.incarnationId,
        scenarioIds.messageId,
        bPrincipal,
      ).some(({ eventType }) => eventType === "context-admitted");
      if (!admitted) throw codedError("threadmesh_proactive_audit_missing");

      result = {
        state: "passed",
        productId: receiver.productId,
        condition,
        modelSelectedCommunication: true,
        scriptedSubmitCount: 0,
        relatedTaskCalls: 1,
        sendCalls: sendCount,
        nonThreadMeshToolCalls: aTurn.nonThreadMeshToolCalls,
        messageId: scenarioIds.messageId,
        mailbox: "claimed-and-accepted",
        delivery: disposition.delivery,
        decision: disposition.decision,
        outcome: disposition.outcome,
        adapterKind: receiver.adapterKind,
        markerMatched: true,
        evidenceKeys: receiver.evidenceKeys,
        adapterSnapshotDigest: bRef.snapshotDigest,
        productMetadata: receiver.productMetadata(bRef, bTurn),
        aDecisionCompleted: true,
        bMarkerMatched: true,
        bOutcome: "completed-with-dependency",
        outcomeScore: 1,
        receiverActivated: true,
        interferenceViolation: false,
        aToolCalls,
        aThreadId: aRef.threadId,
        bThreadId: bRef.threadId ?? null,
        aSnapshotDigest: aRef.snapshotDigest,
        bSnapshotDigest: bRef.snapshotDigest,
      };
    }
  } catch (error) {
    failure = error;
  } finally {
    coordinator.close();
    cleanup = { ...cleanup, attempted: true };
    if (aRef?.threadId) {
      try {
        await adapter.deleteThread({ command, args, cwd, env, threadId: aRef.threadId });
        cleanup.aThreadDeleted = true;
      } catch {}
    }
    if (bRef) {
      try {
        const receiverCleanup = await receiver.cleanup(bRef);
        Object.assign(cleanup, receiverCleanup.public ?? {});
        receiverCleanupComplete = receiverCleanup.complete === true;
      } catch {}
    }
    cleanup.complete =
      (!aRef?.threadId || cleanup.aThreadDeleted) &&
      (!bRef || receiverCleanupComplete);
    cleanup.threadDeleted = cleanup.complete;
  }
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  return { ...result, cleanup };
}
