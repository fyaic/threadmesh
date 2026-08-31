import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { sha256Digest } from "../canonical-json.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import {
  verificationAttestationDigest,
} from "../protocol-validator.mjs";
import {
  DEPENDENCY_EFFECT_REASON_CODES,
  LIFECYCLE_EVENT_TYPES,
  evaluateAttentionRoute,
  evaluateDependencyEffect,
  projectLifecycleEventToEnvelope,
} from "../routing/lifecycle-events.mjs";
import { AttentionWakeCursorConsumer } from "../routing/attention-wake.mjs";

export const CODEX_ATTENTION_B_WAITING_MARKER = "THREADMESH_ATTENTION_B_WAITING";
export const CODEX_ATTENTION_B_READY_MARKER = "THREADMESH_ATTENTION_B_READY";
export const CODEX_ATTENTION_CHECKSUM =
  "sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff0";

const OWNER = Object.freeze({ kind: "user", principalId: "threadmesh-codex-attention-owner" });
const CONDITIONS = new Set(["control", "relevant", "irrelevant"]);

export const CODEX_ATTENTION_TOOLS = Object.freeze([
  Object.freeze({
    type: "function",
    name: "threadmesh_related_tasks",
    description: "Read the one bounded downstream dependency summary before deciding whether the verified result needs a lifecycle checkpoint.",
    inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
  }),
  Object.freeze({
    type: "function",
    name: "threadmesh_publish_dependency",
    description: "After reading the related-task summary, emit one dependency-satisfied checkpoint only when that exact dependent needs the verified checksum. This does not itself unlock a dependency.",
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      required: ["reason"],
      properties: Object.freeze({
        reason: Object.freeze({ type: "string", minLength: 1, maxLength: 160 }),
      }),
    }),
  }),
]);

function scenarioError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function taskRef(task) {
  return { taskId: task.taskId, incarnationId: task.incarnationId };
}

function taskPrincipal(task) {
  return { kind: "task", ...taskRef(task) };
}

function ids(runId) {
  const suffix = String(runId).replaceAll(/[^a-zA-Z0-9]/g, "").slice(0, 40) || "run";
  return {
    messageId: `msg_codex_attention_${suffix}`,
    relationshipId: `rel_codex_attention_${suffix}`,
    grantId: `grant_codex_attention_${suffix}`,
    dependencyId: `dependency_codex_attention_${suffix}`,
    a: {
      taskId: "task_codex_attention_a",
      incarnationId: `inc_codex_attention_a_${suffix}`,
      harness: "codex-app-server",
    },
    b: {
      taskId: "task_codex_attention_b",
      incarnationId: `inc_codex_attention_b_${suffix}`,
      harness: "codex-app-server",
    },
  };
}

function createVerifier() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const trustAnchor = {
    keyId: "threadmesh://codex-attention/verifier/1",
    algorithm: "ed25519",
    actorId: "threadmesh-codex-attention-verifier",
    trustDomain: "threadmesh://codex-attention/verifier",
    policyId: "threadmesh://codex-attention/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
  return { privateKey, trustAnchors: [trustAnchor] };
}

function verifiedDisposition({
  event,
  persisted,
  receiver,
  verifier,
  receiverEvidence,
  receiverOutput,
  verifiedAt,
  deliveryObservedAt,
}) {
  const trustAnchor = verifier.trustAnchors[0];
  const evidenceDigest = sha256Digest(receiverEvidence);
  const claimDigest = sha256Digest({
    checksum: CODEX_ATTENTION_CHECKSUM,
    receiverOutput,
    receiverEvidence,
  });
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: "att_codex_attention_dependency_01",
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_codex_attention_verifier_01",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      messageId: event.messageId,
      senderIncarnationId: event.sender.incarnationId,
      receiver: taskRef(receiver),
      claimType: "artifact-state",
      claimDigest,
    },
    method: "direct-resource-query",
    evidenceDigest,
    verifiedAt,
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: "decision_codex_attention_verifier_01",
      decision: "trusted",
      decidedAt: verifiedAt,
    },
  };
  const signedPayloadDigest = verificationAttestationDigest(attestation);
  const signature = sign(null, Buffer.from(signedPayloadDigest, "utf8"), verifier.privateKey)
    .toString("base64url");
  return {
    specVersion: "0.0-draft",
    dispositionId: "dsp_codex_attention_dependency_01",
    messageId: event.messageId,
    receiver: taskRef(receiver),
    revision: persisted.revision + 1,
    delivery: { state: persisted.delivery, observedAt: deliveryObservedAt },
    decision: {
      state: persisted.decision,
      decidedAt: deliveryObservedAt,
      decidedBy: { actorType: "agent", task: taskRef(receiver) },
      reasonCode: persisted.decisionReasonCode,
    },
    outcome: {
      state: "externally-verified",
      observedAt: verifiedAt,
      evidenceRefs: ["threadmesh://codex-attention/evidence/verified"],
      verificationAttestations: [{
        ...attestation,
        signedPayloadDigest,
        proof: { algorithm: "ed25519", keyId: trustAnchor.keyId, signature },
      }],
    },
    updatedAt: verifiedAt,
  };
}

function publicAdapterRef(ref) {
  return {
    threadId: ref?.threadId ?? null,
    snapshotDigest: ref?.snapshotDigest ?? null,
  };
}

function assertExact(adapterResult, marker, code) {
  if (adapterResult?.truncated || adapterResult?.text !== marker) throw scenarioError(code);
}

/**
 * Run a two-thread Codex attention-router case. A wake here is a coordinator
 * mediated logical wake (a bounded B thread resume after durable reconciliation),
 * not a claim that Codex provides native idle/background wake support.
 */
export async function runCodexAttentionScenario({
  condition = "relevant",
  command,
  args = ["app-server", "--listen", "stdio://"],
  cwd = process.cwd(),
  env = {},
  model = null,
  runId = "attention01",
  temporaryParent = os.tmpdir(),
  adapter = new CodexAppServerAdapter(),
  clock = Date.now,
  turnTimeoutMs = 180_000,
} = {}) {
  if (!CONDITIONS.has(condition)) throw scenarioError("threadmesh_codex_attention_condition_invalid");
  for (const method of ["startValidationThread", "startAutonomousToolThread", "runAcceptedSuggestion", "deleteThread"]) {
    if (typeof adapter?.[method] !== "function") throw scenarioError("threadmesh_codex_attention_adapter_invalid");
  }
  if (typeof clock !== "function" || !Number.isFinite(clock())) {
    throw scenarioError("threadmesh_codex_attention_clock_invalid");
  }
  if (!Number.isInteger(turnTimeoutMs) || turnTimeoutMs < 30_000 || turnTimeoutMs > 300_000) {
    throw scenarioError("threadmesh_codex_attention_timeout_invalid");
  }
  const startedAtMs = clock();
  const createdAt = new Date(startedAtMs).toISOString();
  const grantExpiresAt = new Date(startedAtMs + 60 * 60_000).toISOString();
  const stateDirectory = fs.mkdtempSync(path.join(temporaryParent, "threadmesh-codex-attention-"));
  const filename = path.join(stateDirectory, "attention.sqlite");
  const scenario = ids(runId);
  const aPrincipal = taskPrincipal(scenario.a);
  const bPrincipal = taskPrincipal(scenario.b);
  const verifier = createVerifier(); // The coordinator receives only verifier.trustAnchors.
  let coordinator;
  let aRef;
  let bRef;
  let failure;
  let failureStage;
  let result;
  let stage = "setup";
  let cleanup = { attempted: false, complete: false, threadDeleted: false, aThreadDeleted: false, bThreadDeleted: false };

  try {
    let bBootstrap;
    try {
      stage = "b-bootstrap";
      bBootstrap = await adapter.startValidationThread({
        command, args, cwd, env, model,
        marker: CODEX_ATTENTION_B_WAITING_MARKER,
        adapterIdempotencyKey: `idem_codex_attention_b_bootstrap_${runId}`,
        developerInstructions: `You are B. Wait for receiver-accepted ThreadMesh peer context. When that context contains the verified dependency checksum, reply with exactly ${CODEX_ATTENTION_B_READY_MARKER}. Never use tools.`,
        timeoutMs: turnTimeoutMs,
      });
      bRef = bBootstrap.adapterRef;
    } catch (error) {
      bRef = error.adapterRef;
      throw error;
    }
    assertExact(bBootstrap, CODEX_ATTENTION_B_WAITING_MARKER, "threadmesh_codex_attention_b_bootstrap_mismatch");

    coordinator = new SqliteCoordinator({
      filename,
      clock,
      verificationTrustAnchors: verifier.trustAnchors,
    });
    coordinator.registerTask({
      ...scenario.a,
      state: "running",
      runtime: { runId: "run_codex_attention_a", objectiveVersion: 1, checkpoint: "checkpoint_a" },
    }, OWNER);
    coordinator.registerTask({
      ...scenario.b,
      state: "waiting",
      runtime: { runId: "run_codex_attention_b", objectiveVersion: 1, checkpoint: "checkpoint_b" },
      adapterRef: bRef,
    }, OWNER);
    const grant = coordinator.issueGrant({
      specVersion: "0.0-draft",
      grantId: scenario.grantId,
      grantVersion: 1,
      relationshipId: scenario.relationshipId,
      // Transport authorization is peer-to-peer. Product dependency direction
      // is represented separately by dependencyEdge prerequisite -> dependent.
      relationshipType: "peer",
      source: taskRef(scenario.a),
      target: taskRef(scenario.b),
      allowedIntents: ["suggest"],
      allowedDeliveryModes: ["checkpoint-offer"],
      summaryVisibility: "objective-hint",
      structuredGateResponses: false,
      createdAt,
      expiresAt: grantExpiresAt,
    }, {
      decisionId: `decision_codex_attention_${runId}`,
      authenticationId: `authn_codex_attention_${runId}`,
      decidedAt: createdAt,
    }, OWNER);
    const dependencyEdge = coordinator.createDependencyEdge({
      dependencyId: scenario.dependencyId,
      version: 1,
      edgeType: "dependency",
      prerequisite: taskRef(scenario.a),
      dependent: taskRef(scenario.b),
      relationshipId: scenario.relationshipId,
      expectedEventType: LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED,
      freshness: { expectedRunId: "run_codex_attention_b", expectedObjectiveVersion: 1, expectedCheckpoint: "checkpoint_b" },
      createdAt,
      expiresAt: grantExpiresAt,
    }, OWNER);

    let event = null;
    let route = null;
    let modelLifecycleToolCalls = 0;
    let directSubmitOutsideTool = 0;
    let aTurn;
    try {
      stage = "a-decision";
      aTurn = await adapter.startAutonomousToolThread({
        command, args, cwd, env, model,
        dynamicTools: CODEX_ATTENTION_TOOLS,
        adapterIdempotencyKey: `idem_codex_attention_a_turn_${runId}`,
        developerInstructions: "You are A. First inspect ThreadMesh related tasks if your completed checksum might help another task. Emit one lifecycle checkpoint only if the returned dependency explicitly needs that checksum. Never use non-ThreadMesh tools.",
        timeoutMs: turnTimeoutMs,
        prompt: condition === "relevant"
          ? `You independently verified ${CODEX_ATTENTION_CHECKSUM}. Decide whether an authorized downstream task needs it.`
          : condition === "irrelevant"
            ? `You independently verified ${CODEX_ATTENTION_CHECKSUM}. Inspect the authorized relationship and publish only if it needs this result.`
            : "Complete your local task without contacting another task or using a tool.",
        onToolCall: ({ tool, arguments: value }) => {
          if (tool === "threadmesh_related_tasks") {
            return {
              tasks: [{
                taskId: scenario.b.taskId,
                needsChecksum: condition === "relevant",
                status: condition === "relevant"
                  ? "waiting-for-verified-checksum"
                  : "not-relevant",
              }],
            };
          }
          if (tool !== "threadmesh_publish_dependency") {
            throw scenarioError("threadmesh_codex_attention_tool_unsupported");
          }
          if (condition !== "relevant") {
            throw scenarioError("threadmesh_codex_attention_unwanted_lifecycle_event");
          }
          if (
            modelLifecycleToolCalls !== 0 ||
            typeof value?.reason !== "string" ||
            value.reason.length < 1 ||
            value.reason.length > 160
          ) {
            throw scenarioError("threadmesh_codex_attention_lifecycle_tool_invalid");
          }
          modelLifecycleToolCalls += 1;
          event = {
            eventType: LIFECYCLE_EVENT_TYPES.DEPENDENCY_SATISFIED,
            messageId: scenario.messageId,
            sender: { ...scenario.a, actorType: "agent" },
            target: { ...scenario.b },
            relationshipId: scenario.relationshipId,
            content: `Verified dependency checksum: ${CODEX_ATTENTION_CHECKSUM}`,
            reason: value.reason,
            freshness: {
              expectedRunId: "run_codex_attention_b",
              expectedObjectiveVersion: 1,
              expectedCheckpoint: "checkpoint_b",
            },
            createdAt: new Date(clock()).toISOString(),
            expiresAt: new Date(clock() + 10 * 60_000).toISOString(),
          };
          route = evaluateAttentionRoute({
            event,
            receiverTask: taskRef(scenario.b),
            grant,
            currentGrant: grant,
            sourceTask: { ...scenario.a, retiredAt: null },
            targetTask: {
              ...scenario.b,
              retiredAt: null,
              runId: "run_codex_attention_b",
              objectiveVersion: 1,
              checkpoint: "checkpoint_b",
            },
            now: clock(),
          });
          if (!route.offer) {
            throw scenarioError("threadmesh_codex_attention_route_failed");
          }
          coordinator.submit(projectLifecycleEventToEnvelope(event), aPrincipal);
          return { state: route.state, reasonCode: route.reasonCode };
        },
      });
      aRef = aTurn.adapterRef;
    } catch (error) {
      aRef = error.adapterRef;
      throw error;
    }
    if (aRef.threadId === bRef.threadId) {
      throw scenarioError("threadmesh_codex_attention_threads_not_distinct");
    }
    coordinator.attachTask(taskRef(scenario.a), aRef, 0, aPrincipal);
    const aToolCalls = aTurn.toolCalls.map(({ tool }) => tool);
    if (aTurn.nonThreadMeshToolCalls !== 0) {
      throw scenarioError("threadmesh_codex_attention_non_threadmesh_tool_observed");
    }
    const expectedTools = condition === "relevant"
      ? ["threadmesh_related_tasks", "threadmesh_publish_dependency"]
      : condition === "irrelevant"
        ? ["threadmesh_related_tasks"]
        : [];
    if (JSON.stringify(aToolCalls) !== JSON.stringify(expectedTools)) {
      throw scenarioError("threadmesh_codex_attention_model_tool_sequence_invalid");
    }
    if ((condition === "relevant") !== (modelLifecycleToolCalls === 1)) {
      throw scenarioError("threadmesh_codex_attention_model_choice_invalid");
    }

    let receiverTurn = null;
    let receiverEvidence = null;
    let transportDisposition = null;
    const consumer = new AttentionWakeCursorConsumer({
      readPage: (options) => coordinator.waitTask(taskRef(scenario.b), options, bPrincipal),
      isRelevant: (auditEvent) => Boolean(event) &&
        auditEvent.eventType === "message-durably-received" && auditEvent.messageId === event.messageId,
      handleEvent: async () => {
        stage = "b-receiver";
        const message = coordinator.inspectMessage(scenario.a.incarnationId, event.messageId, bPrincipal);
        const claim = coordinator.claimPending(scenario.a.incarnationId, event.messageId, message.disposition.revision, bPrincipal);
        const accepted = coordinator.acknowledgePending(
          scenario.a.incarnationId,
          event.messageId,
          claim.claimToken,
          "accepted",
          message.disposition.revision,
          bPrincipal,
        );
        const prepared = coordinator.prepareAdapterSubmission(
          scenario.a.incarnationId,
          event.messageId,
          accepted.revision,
          bPrincipal,
        );
        coordinator.beginAdapterSubmission(
          prepared.submission.submissionId,
          accepted.revision,
          bPrincipal,
        );
        receiverTurn = await adapter.runAcceptedSuggestion({
          command, args, cwd, env,
          adapterRef: bRef,
          envelope: prepared.envelope,
          admission: {
            decision: "accepted",
            receiverIncarnationId: scenario.b.incarnationId,
            revision: accepted.revision,
          },
          adapterIdempotencyKey: `idem_codex_attention_b_receive_${runId}`,
          timeoutMs: turnTimeoutMs,
        });
        assertExact(receiverTurn, CODEX_ATTENTION_B_READY_MARKER, "threadmesh_codex_attention_b_marker_mismatch");
        if (
          receiverTurn.evidence?.threadId !== bRef.threadId ||
          receiverTurn.evidence?.snapshotDigest !== bRef.snapshotDigest ||
          receiverTurn.evidence?.turnStatus !== "completed" ||
          typeof receiverTurn.evidence?.turnId !== "string" ||
          receiverTurn.evidence.turnId.length === 0 ||
          receiverTurn.receipt?.adapterOperationId !== receiverTurn.evidence.turnId
        ) {
          throw scenarioError("threadmesh_codex_attention_receiver_evidence_mismatch");
        }
        receiverEvidence = {
          kind: "codex-app-server",
          threadId: receiverTurn.evidence.threadId,
          turnId: receiverTurn.evidence.turnId,
          turnStatus: receiverTurn.evidence.turnStatus,
          snapshotDigest: receiverTurn.evidence.snapshotDigest,
        };
        const receipt = coordinator.recordAdapterReceipt(
          prepared.submission.submissionId,
          accepted.revision,
          receiverTurn.receipt,
          bPrincipal,
        );
        transportDisposition = receipt.disposition;
        return { state: "accepted", reasonCode: "receiver-accepted" };
      },
    });
    // No wake hint: a dropped best-effort wake cannot lose the durable event.
    stage = "durable-wake";
    const wake = await consumer.reconcile();
    if (condition === "relevant" && (!receiverTurn || wake.handled.length !== 1)) {
      throw scenarioError("threadmesh_codex_attention_durable_wake_missing");
    }
    if (condition !== "relevant" && receiverTurn) throw scenarioError("threadmesh_codex_attention_unwanted_wake");

    let satisfaction = { status: "waiting", unlock: false };
    let effect = null;
    let externalDisposition = null;
    if (event) {
      stage = "verification";
      const persisted = coordinator.getDisposition(scenario.a.incarnationId, event.messageId, bPrincipal);
      externalDisposition = verifiedDisposition({
        event,
        persisted,
        receiver: scenario.b,
        verifier,
        receiverEvidence,
        receiverOutput: receiverTurn.text,
        verifiedAt: new Date(clock()).toISOString(),
        deliveryObservedAt: receiverTurn.receipt.acceptedAt,
      });
      effect = evaluateDependencyEffect({
        event,
        disposition: externalDisposition,
        trustAnchors: verifier.trustAnchors,
        dependencyEdge,
        currentDependencyEdge: dependencyEdge,
        now: clock(),
      });
      if (!effect.unlock || effect.reasonCode !== DEPENDENCY_EFFECT_REASON_CODES.VERIFIED) {
        throw scenarioError("threadmesh_codex_attention_external_verification_failed");
      }
      satisfaction = coordinator.satisfyDependencyEdge({
        dependencyId: dependencyEdge.dependencyId,
        expectedVersion: dependencyEdge.version,
        event,
        disposition: externalDisposition,
      }, bPrincipal);
      if (!satisfaction.unlock) throw scenarioError("threadmesh_codex_attention_dependency_unlock_failed");
    }

    coordinator.close();
    stage = "restart-recovery";
    coordinator = new SqliteCoordinator({
      filename,
      clock,
      verificationTrustAnchors: verifier.trustAnchors,
    });
    const recoveredEdge = coordinator.getDependencyEdge(scenario.dependencyId, OWNER);
    const recoveredDependent = coordinator.getTask(taskRef(scenario.b), OWNER);
    const recoveredDisposition = event
      ? coordinator.getDisposition(scenario.a.incarnationId, event.messageId, bPrincipal)
      : null;
    const expectedRecoveredState = condition === "relevant" ? "ready" : "waiting";
    if (recoveredDependent.state !== expectedRecoveredState || recoveredEdge.status !== (condition === "relevant" ? "satisfied" : "waiting")) {
      throw scenarioError("threadmesh_codex_attention_restart_recovery_failed");
    }
    result = {
      state: "passed",
      condition,
      productId: "codex-attention",
      adapterKind: "codex-app-server",
      modelSelectedCommunication: condition === "relevant",
      scriptedSubmitCount: directSubmitOutsideTool,
      aToolCalls,
      relatedTaskCalls: aToolCalls.filter((tool) => tool === "threadmesh_related_tasks").length,
      publishCalls: modelLifecycleToolCalls,
      nonThreadMeshToolCalls: aTurn.nonThreadMeshToolCalls,
      lifecycleEventType: event?.eventType ?? null,
      routeReasonCode: route?.reasonCode ?? null,
      wakeReasonCode: wake.reasonCode,
      wakeCursor: wake.nextCursor,
      cursorEventObserved: wake.handled.length === 1,
      receiverResumeCount: receiverTurn ? 1 : 0,
      receiverActivated: Boolean(receiverTurn),
      receiverDecision: recoveredDisposition?.decision ?? "not-requested",
      delivery: recoveredDisposition?.delivery ?? "not-sent",
      outcome: externalDisposition?.outcome.state ?? transportDisposition?.outcome ?? "not-observed",
      verificationMode: event ? "local-simulation" : "not-run",
      dependencyStatus: recoveredEdge.status,
      dependencyUnlock: Boolean(satisfaction.unlock),
      externalVerificationReasonCode: effect?.reasonCode ?? null,
      recoveredTaskState: recoveredDependent.state,
      restartRecovered: true,
      manualRelayActions: 0,
      modelPollingTurns: 0,
      messageId: event?.messageId ?? null,
      mailbox: event ? "claimed-and-accepted" : "empty",
      markerMatched: Boolean(receiverTurn),
      evidenceKeys: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
      adapterSnapshotDigest: bRef.snapshotDigest,
      productMetadata: {
        userAgent: bRef.userAgent ?? null,
        model: bRef.model ?? null,
        modelProvider: bRef.modelProvider ?? null,
      },
      threads: { a: publicAdapterRef(aRef), b: publicAdapterRef(bRef) },
      receiverEvidence,
      adapterReceipt: receiverTurn?.receipt ?? null,
      evidenceDigests: {
        lifecycleEvent: event ? sha256Digest(event) : null,
        disposition: externalDisposition ? sha256Digest(externalDisposition) : null,
        dependencyEdge: sha256Digest(recoveredEdge),
      },
      cleanup,
    };
  } catch (error) {
    failure = error;
    failureStage = stage;
  } finally {
    try { coordinator?.close(); } catch {}
    cleanup.attempted = true;
    for (const [name, ref] of [["aThreadDeleted", aRef], ["bThreadDeleted", bRef]]) {
      if (!ref?.threadId) {
        cleanup[name] = true;
        continue;
      }
      try {
        const deleted = await adapter.deleteThread({ command, args, cwd, env, threadId: ref.threadId });
        cleanup[name] = deleted?.deleted === true;
      } catch {
        cleanup[name] = false;
      }
    }
    try {
      fs.rmSync(stateDirectory, { recursive: true, force: true });
      cleanup.complete = cleanup.aThreadDeleted && cleanup.bThreadDeleted;
    } catch {
      cleanup.complete = false;
    }
    cleanup.threadDeleted = cleanup.aThreadDeleted && cleanup.bThreadDeleted;
  }
  if (!failure && cleanup.complete) return result;
  const error = failure ?? scenarioError("threadmesh_codex_attention_cleanup_failed");
  error.attention = {
    state: "failed",
    condition,
    productId: "codex-attention",
    code: error.code ?? "threadmesh_codex_attention_failed",
    stage: failureStage ?? "cleanup",
    cleanup,
  };
  error.cleanup = cleanup;
  throw error;
}
