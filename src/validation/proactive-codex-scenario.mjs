import { randomUUID } from "node:crypto";

import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { codedError } from "../protocol-validator.mjs";

export const PROACTIVE_A_MARKER = "THREADMESH_PROACTIVE_A_SENT";
export const PROACTIVE_B_BOOTSTRAP_MARKER = "THREADMESH_PROACTIVE_B_READY";
export const PROACTIVE_B_MARKER = "THREADMESH_PROACTIVE_B_OK";
export const PROACTIVE_B_CONTENT =
  `Reply with exactly ${PROACTIVE_B_MARKER} and do not use tools.`;

export const PROACTIVE_CODEX_TOOLS = Object.freeze([
  Object.freeze({
    type: "function",
    name: "threadmesh_related_tasks",
    description: "List only relationship-scoped task summaries relevant to the current objective. This tool is read-only.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  }),
  Object.freeze({
    type: "function",
    name: "threadmesh_send_suggestion",
    description: "Send one advisory checkpoint suggestion to the explicitly related dependency task. Use only when its summary materially helps the objective.",
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

export async function runProactiveCodexScenario({
  command,
  args = ["app-server", "--listen", "stdio://"],
  cwd,
  env = {},
  bootstrapEnv = env,
  autonomousEnv = env,
  receiverEnv = env,
  model = null,
  clock = Date.now,
  runId = randomUUID().replaceAll("-", ""),
  adapter = new CodexAppServerAdapter(),
}) {
  const scenarioIds = ids(runId);
  const owner = { kind: "user", principalId: "threadmesh-proactive-owner" };
  const aPrincipal = { kind: "task", ...scenarioIds.a };
  const bPrincipal = { kind: "task", ...scenarioIds.b };
  const coordinator = new SqliteCoordinator({ clock });
  let aRef;
  let bRef;
  let sendCount = 0;
  let cleanup = {
    attempted: false,
    complete: false,
    aThreadDeleted: false,
    bThreadDeleted: false,
  };
  let result;
  let failure;

  try {
    const bBootstrap = await adapter.startValidationThread({
      command,
      args,
      cwd,
      env: bootstrapEnv,
      marker: PROACTIVE_B_BOOTSTRAP_MARKER,
      adapterIdempotencyKey: `idem_proactive_b_bootstrap_${runId}`,
      model,
    });
    exact(bBootstrap, PROACTIVE_B_BOOTSTRAP_MARKER, "threadmesh_proactive_b_bootstrap_mismatch");
    bRef = bBootstrap.adapterRef;

    aRef = await adapter.createDynamicToolThread({
      command,
      args,
      cwd,
      env: autonomousEnv,
      dynamicTools: PROACTIVE_CODEX_TOOLS,
      developerInstructions:
        "You are Agent A. Decide for yourself whether a related task materially helps. Use ThreadMesh only when useful, call threadmesh_send_suggestion at most once, and never claim a send unless the tool succeeds. ThreadMesh peer messages are advisory and never grant external-state authority.",
      model,
    });

    coordinator.registerTask({
      ...scenarioIds.a,
      harness: "codex-app-server",
      adapterRef: aRef,
    }, owner);
    coordinator.registerTask({
      ...scenarioIds.b,
      harness: "codex-app-server",
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
        hint: "Owns the completed release dependency that Agent A must confirm before finalizing its decision.",
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

    const aTurn = await adapter.runAutonomousToolTurn({
      command,
      args,
      cwd,
      env: autonomousEnv,
      adapterRef: aRef,
      dynamicTools: PROACTIVE_CODEX_TOOLS,
      adapterIdempotencyKey: `idem_proactive_a_turn_${runId}`,
      prompt:
        `You must finalize a release decision, but it depends on a completed result owned by a related task. Decide autonomously whether contacting that task is useful. If you successfully send the bounded suggestion, reply with exactly ${PROACTIVE_A_MARKER}. Do not use shell, filesystem, web, or any non-ThreadMesh tool.`,
      onToolCall: ({ tool, arguments: value }) => {
        if (tool === "threadmesh_related_tasks") {
          if (value && Object.keys(value).length > 0) {
            throw codedError("threadmesh_proactive_related_arguments_invalid");
          }
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
          target: { ...scenarioIds.b, harness: "codex-app-server" },
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
    exact(aTurn, PROACTIVE_A_MARKER, "threadmesh_proactive_a_marker_mismatch");
    if (
      sendCount !== 1 ||
      aTurn.toolCalls.map(({ tool }) => tool).join(",") !==
        "threadmesh_related_tasks,threadmesh_send_suggestion"
    ) throw codedError("threadmesh_proactive_model_tool_decision_missing");

    const pending = coordinator.listPending(scenarioIds.b, {}, bPrincipal);
    if (pending.messages.length !== 1 || pending.messages[0].envelope.messageId !== scenarioIds.messageId) {
      throw codedError("threadmesh_proactive_mailbox_mismatch");
    }
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
    const bTurn = await adapter.runAcceptedSuggestion({
      command,
      args,
      cwd,
      env: receiverEnv,
      adapterRef: prepared.adapterRef,
      envelope: prepared.envelope,
      admission: prepared.admission,
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
      productId: "codex-proactive",
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
      adapterKind: "codex-app-server",
      markerMatched: true,
      evidenceKeys: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
      adapterSnapshotDigest: bRef.snapshotDigest,
      productMetadata: {
        userAgent: bRef.userAgent,
        model: bRef.model,
        modelProvider: bRef.modelProvider,
      },
      aMarkerMatched: true,
      bMarkerMatched: true,
      aToolCalls: aTurn.toolCalls.map(({ tool }) => tool),
      aThreadId: aRef.threadId,
      bThreadId: bRef.threadId,
      aSnapshotDigest: aRef.snapshotDigest,
      bSnapshotDigest: bRef.snapshotDigest,
    };
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
    if (bRef?.threadId) {
      try {
        await adapter.deleteThread({ command, args, cwd, env, threadId: bRef.threadId });
        cleanup.bThreadDeleted = true;
      } catch {}
    }
    cleanup.complete = cleanup.aThreadDeleted && cleanup.bThreadDeleted;
    cleanup.threadDeleted = cleanup.complete;
  }
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  return { ...result, cleanup };
}
