import fs from "node:fs";
import path from "node:path";

import { createAutonomousEventPump } from
  "../activation/autonomous-event-pump.mjs";
import { sha256Digest } from "../canonical-json.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { projectLifecycleEventToEnvelope } from "../routing/lifecycle-events.mjs";
import { retireM52LiveTurnJournal } from "./m5-2-live-turn-journal.mjs";
import {
  CodexLiveAgentRuntime,
  REGISTERED_PEER_DECISION_TOOL,
} from "./live-agent-scenario.mjs";
import { DeterministicNoPlanCodexAdapter } from
  "./deterministic-no-plan-codex-adapter.mjs";

const NOW = Date.parse("2026-09-01T08:00:00.000Z");
const CREATED_AT = "2026-09-01T07:00:00.000Z";
const EXPIRES_AT = "2026-09-01T10:00:00.000Z";
const owner = Object.freeze({ kind: "user", principalId: "owner_no_plan_scenario" });

function principal(actor) {
  return { kind: "task", taskId: actor.taskId, incarnationId: actor.incarnationId };
}

function taskRef(actor) {
  return { taskId: actor.taskId, incarnationId: actor.incarnationId };
}

function tool(name, description) {
  return Object.freeze({
    type: "function",
    name,
    description,
    inputSchema: Object.freeze({ type: "object", additionalProperties: true }),
  });
}

const TOOLS = Object.freeze({
  implementation: tool("threadmesh_publish_artifact", "Publish the bounded implementation."),
  review: tool("threadmesh_report_review_finding", "Publish the exact review finding."),
  fix: tool("threadmesh_publish_dependency", "Publish the bounded review fix."),
});

function actionEventBody(event) {
  return {
    eventType: event.eventType,
    messageId: event.messageId,
    target: { ...event.target },
    relationshipId: event.relationshipId,
    content: event.content,
    reason: event.reason,
    evidenceRefs: [...(event.evidenceRefs ?? [])],
    freshness: event.freshness ? { ...event.freshness } : null,
    causality: event.causality ?? null,
  };
}

function lifecycleEvent({ eventType, messageId, sender, target, relationshipId, content }) {
  return {
    eventType,
    messageId,
    sender: {
      taskId: sender.taskId, incarnationId: sender.incarnationId,
      actorType: "agent", harness: "codex",
    },
    target: {
      taskId: target.taskId, incarnationId: target.incarnationId, harness: "codex",
    },
    relationshipId,
    content,
    reason: "A completed model-selected ThreadMesh action published this event.",
    evidenceRefs: [],
    freshness: { expectedObjectiveVersion: 1 },
    createdAt: new Date(NOW).toISOString(),
    expiresAt: EXPIRES_AT,
  };
}

function grant(id, source, target) {
  return {
    specVersion: "0.0-draft",
    grantId: `grant_${id}`,
    grantVersion: 1,
    relationshipId: `rel_${id}`,
    relationshipType: "peer",
    source: taskRef(source),
    target: taskRef(target),
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  };
}

function completionBinding(turn, execution) {
  return {
    evidence: turn.evidence,
    receipt: turn.receipt,
    adapterReceiptDigest: sha256Digest(turn.receipt),
    toolCalls: execution.actions.map((action) => ({
      ordinal: action.ordinal,
      turnId: action.turnId,
      callId: action.callId,
      tool: action.name,
      argumentsDigest: action.argumentsDigest,
      outputDigest: action.resultDigest,
      resultStatus: action.resultStatus,
    })),
    nonThreadMeshToolCalls: 0,
  };
}

async function runKickoff({
  coordinator, runtime, actor, ref, event, args, cwd, recoveryDirectory,
  ownedJournalPaths,
}) {
  const actorPrincipal = principal(actor);
  const executionId = "intent_no_plan_user_kickoff";
  const adapterIdempotencyKey = "idem_coordinator_driven_no_plan_a_user-kickoff";
  let execution = coordinator.createTurnExecutionIntent({
    intentId: executionId,
    scenarioId: "coordinator_driven_no_plan",
    chainId: "chain_coordinator_driven_no_plan",
    messageId: event.messageId,
    eventId: "event_authenticated_user_kickoff",
    actor,
    adapterIdempotencyKey,
    promptDigest: sha256Digest(`Implement and publish source ${event.messageId}.`),
    allowedTools: [TOOLS.implementation.name],
  }, 0, actorPrincipal);
  const filename = path.join(recoveryDirectory, `${executionId}.json`);
  ownedJournalPaths.add(filename);
  const turn = await runtime.runTurn({
    role: "a",
    phase: "user-kickoff",
    cwd,
    ref,
    prompt: `Implement and publish source ${event.messageId}.`,
    scenarioId: "coordinator_driven_no_plan",
    allowedToolNames: [TOOLS.implementation.name],
    turnRecovery: {
      filename, executionId,
      async onOutcomeUnknown() {}, async onTerminalReconciliation() {},
    },
    beforeTurnStart: async ({ adapterIdempotencyKey: actual }) => {
      if (actual !== adapterIdempotencyKey) throw new Error("kickoff adapter key mismatch");
      execution = coordinator.markTurnExecutionStarted(
        executionId, { expectedRevision: execution.revision }, actorPrincipal,
      );
    },
    onTurnStarted: async ({ turnId }) => {
      execution = coordinator.bindStartedTurnExecutionOperation(
        executionId, { turnId, expectedRevision: execution.revision }, actorPrincipal,
      );
    },
    beforeToolCall: async (selected) => {
      execution = coordinator.recordModelSelectedTurnToolAction(executionId, {
        turnId: selected.turnId, callId: selected.callId, ordinal: selected.ordinal,
        name: selected.tool, arguments: selected.arguments,
        expectedRevision: execution.revision,
        expectedActionHeadDigest: execution.actionHeadDigest,
      }, actorPrincipal);
    },
    async onToolCall() { return { commitSha: args.commitSha, published: true }; },
    afterToolCall: async (completed) => {
      execution = coordinator.completeModelSelectedTurnToolAction(executionId, {
        turnId: completed.turnId, callId: completed.callId, ordinal: completed.ordinal,
        resultDigest: completed.outputDigest, resultStatus: completed.resultStatus,
        expectedRevision: execution.revision,
        expectedActionHeadDigest: execution.actionHeadDigest,
      }, actorPrincipal);
    },
  });
  execution = coordinator.bindCompletedTurnExecution(executionId, {
    binding: completionBinding(turn, execution), expectedRevision: execution.revision,
  }, actorPrincipal);
  retireM52LiveTurnJournal({
    filename,
    expectedScenarioId: "coordinator_driven_no_plan",
    expectedExecutionId: executionId,
    expectedRecordDigest: turn.recoveryJournal.recordDigest,
  });
  coordinator.publishLifecycleFromCompletedAction(executionId, {
    expectedTool: TOOLS.implementation.name,
    event,
    expectedMaterial: { commitSha: args.commitSha },
  }, actorPrincipal);
  return { execution, turn };
}

function registerTask(coordinator, actor, ref) {
  const registered = { ...actor, threadId: ref.threadId, snapshotDigest: ref.snapshotDigest };
  coordinator.registerTask({
    taskId: actor.taskId,
    incarnationId: actor.incarnationId,
    harness: "codex",
    state: "idle",
    runtime: { objectiveVersion: 1 },
    adapterRef: ref,
  }, owner);
  return registered;
}

function journalLikePaths(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() &&
      (entry.name.endsWith(".json") || entry.name.endsWith(".decision-action")))
    .map((entry) => path.join(directory, entry.name));
}

export async function runCoordinatorDrivenNoPlanScenario({
  artifactsDirectory,
  injectPriorRelevant = false,
}) {
  if (!path.isAbsolute(artifactsDirectory ?? "") ||
      typeof injectPriorRelevant !== "boolean") {
    throw new Error("threadmesh_coordinator_driven_artifacts_invalid");
  }
  fs.mkdirSync(artifactsDirectory, { recursive: true });
  const journalDirectory = path.join(
    artifactsDirectory, ".threadmesh-coordinator-driven-journals",
  );
  fs.mkdirSync(journalDirectory, { recursive: false, mode: 0o700 });
  const ownedJournalPaths = new Set();
  const databasePath = path.join(artifactsDirectory, "coordinator-driven.sqlite");
  const coordinator = new SqliteCoordinator({ filename: databasePath, clock: () => NOW });
  const actors = {
    a: { taskId: "task_no_plan_a", incarnationId: "inc_no_plan_a_0001" },
    r: { taskId: "task_no_plan_r", incarnationId: "inc_no_plan_r_0001" },
    irrelevant: {
      taskId: "task_no_plan_irrelevant", incarnationId: "inc_no_plan_irrelevant_0001",
    },
    v: { taskId: "task_no_plan_v_pending", incarnationId: "inc_no_plan_v_pending_0001" },
  };
  const grants = {
    ar: grant("no_plan_a_r", actors.a, actors.r),
    ra: grant("no_plan_r_a", actors.r, actors.a),
    ai: grant("no_plan_a_irrelevant", actors.a, actors.irrelevant),
  };
  const implementationSha = "1".repeat(40);
  const fixSha = "2".repeat(40);
  const findingDigest = sha256Digest({
    finding: "The bounded candidate returns 41 instead of the required 42.",
  });
  const artifactEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_artifact_0001",
    sender: actors.a,
    target: actors.r,
    relationshipId: grants.ar.relationshipId,
    content: `Candidate ${implementationSha} is ready for exact review.`,
  });
  const reviewEvent = lifecycleEvent({
    eventType: "review-failed",
    messageId: "msg_no_plan_review_0001",
    sender: actors.r,
    target: actors.a,
    relationshipId: grants.ra.relationshipId,
    content: "Blocking finding: the bounded candidate returns 41, not 42.",
  });
  const pendingFixEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_fix_pending_v_0001",
    sender: actors.a,
    target: actors.v,
    relationshipId: "rel_no_plan_a_v_pending",
    content: `Review fix ${fixSha} is ready; V is intentionally pending in this partial gate.`,
  });
  const irrelevantEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_irrelevant_0001",
    sender: actors.a,
    target: actors.irrelevant,
    relationshipId: grants.ai.relationshipId,
    content: "Authorized negative control that is outside the receiver subscription.",
  });
  const priorRelevantEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_prior_relevant_0001",
    sender: actors.a,
    target: actors.r,
    relationshipId: grants.ar.relationshipId,
    content: "A prior relevant event must never be skipped for a later expected message.",
  });

  let refs = {};
  let runtime;
  let result;
  let failure;
  const cleanupRoles = [];
  try {
    const adapter = new DeterministicNoPlanCodexAdapter({
      decideTurn(canonicalInput) {
        const input = JSON.parse(canonicalInput);
        const selectedTool = input.dynamicTools[0]?.name;
        const knownMessage = [artifactEvent, reviewEvent]
          .find(({ messageId }) => input.prompt.includes(messageId));
        if (selectedTool === REGISTERED_PEER_DECISION_TOOL.name) {
          if (!knownMessage) {
            throw Object.assign(new Error("threadmesh_policy_oracle_event_unregistered"), {
              code: "threadmesh_policy_oracle_event_unregistered",
            });
          }
          return {
            text: "Accepted from coordinator-owned offer metadata.",
            toolCalls: [{
              tool: selectedTool,
              arguments: { messageId: knownMessage.messageId, decision: "accepted" },
            }],
          };
        }
        if (selectedTool === TOOLS.implementation.name) {
          return { text: "Implementation published.", toolCalls: [{
            tool: selectedTool,
            arguments: {
              sourceEventId: artifactEvent.messageId,
              event: actionEventBody(artifactEvent), commitSha: implementationSha,
            },
          }] };
        }
        if (selectedTool === TOOLS.review.name) {
          return { text: "Blocking review finding published.", toolCalls: [{
            tool: selectedTool,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(reviewEvent), findingDigest,
            },
          }] };
        }
        if (selectedTool === TOOLS.fix.name) {
          return { text: "Same implementer task applied the fix.", toolCalls: [{
            tool: selectedTool,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(pendingFixEvent), commitSha: fixSha,
            },
          }] };
        }
        return { text: "No relevant action.", toolCalls: [] };
      },
    });
    runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
    refs.a = await runtime.createRole({
      role: "a", cwd: artifactsDirectory,
      tools: [TOOLS.implementation, REGISTERED_PEER_DECISION_TOOL, TOOLS.fix],
      phaseTools: {
        "user-kickoff": [TOOLS.implementation],
        "receiver-decision": [REGISTERED_PEER_DECISION_TOOL],
        "same-a-fix": [TOOLS.fix],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "same-a-fix": "admitted-tool",
      },
      instructions: "Use only the current coordinator-admitted dynamic tool.",
      scenarioId: "coordinator_driven_no_plan",
    });
    refs.r = await runtime.createRole({
      role: "r", cwd: artifactsDirectory,
      tools: [REGISTERED_PEER_DECISION_TOOL, TOOLS.review],
      phaseTools: {
        "receiver-decision": [REGISTERED_PEER_DECISION_TOOL], "r-review": [TOOLS.review],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "r-review": "admitted-tool",
      },
      instructions: "Review only coordinator-admitted context.",
      scenarioId: "coordinator_driven_no_plan",
    });
    refs.irrelevant = await runtime.createRole({
      role: "irrelevant", cwd: artifactsDirectory,
      tools: [REGISTERED_PEER_DECISION_TOOL],
      instructions: "Remain idle unless coordinator attention is relevant.",
      scenarioId: "coordinator_driven_no_plan",
    });
    actors.a = registerTask(coordinator, actors.a, refs.a);
    actors.r = registerTask(coordinator, actors.r, refs.r);
    actors.irrelevant = registerTask(coordinator, actors.irrelevant, refs.irrelevant);
    for (const [index, current] of Object.values(grants).entries()) {
      coordinator.issueGrant(current, {
        decisionId: `decision_no_plan_${index}`,
        authenticationId: `authn_no_plan_${index}`,
        decidedAt: CREATED_AT,
      }, owner);
    }
    if (injectPriorRelevant) {
      coordinator.submit(
        projectLifecycleEventToEnvelope(priorRelevantEvent),
        principal(actors.a),
      );
    }

    let sameAActivation = null;
    let rActivation = null;
    const pump = createAutonomousEventPump({
      coordinator,
      runtime,
      scenarioId: "coordinator_driven_no_plan",
      chainId: "chain_coordinator_driven_no_plan",
      recoveryDirectory: journalDirectory,
      maxEvents: 3,
    });
    pump.registerReceiver({
      receiver: actors.r,
      principal: principal(actors.r),
      role: "r",
      cwd: artifactsDirectory,
      ref: refs.r,
      routes: [{
        eventType: "artifact-ready",
        subscribedEventTypes: ["artifact-ready"],
        grant: grants.ar,
        sourceTask: actors.a,
        targetTask: { ...actors.r, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "r-review",
        businessTool: TOOLS.review,
        async onBusinessToolCall() {
          return { findingDigest, blocking: true, implementationSha };
        },
        async onLifecyclePublication({ activation }) {
          rActivation = activation;
          coordinator.publishLifecycleFromCompletedAction(activation.businessExecutionId, {
            expectedTool: TOOLS.review.name,
            event: reviewEvent,
            expectedMaterial: { findingDigest },
          }, principal(actors.r));
        },
      }],
    });
    pump.registerReceiver({
      receiver: actors.a,
      principal: principal(actors.a),
      role: "a",
      cwd: artifactsDirectory,
      ref: refs.a,
      routes: [{
        eventType: "review-failed",
        subscribedEventTypes: ["review-failed"],
        grant: grants.ra,
        sourceTask: actors.r,
        targetTask: { ...actors.a, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "same-a-fix",
        businessTool: TOOLS.fix,
        async onBusinessToolCall() {
          return { commitSha: fixSha, parentSha: implementationSha };
        },
        async onLifecyclePublication({ activation }) {
          sameAActivation = activation;
          return { state: "pending-unregistered-verifier", event: pendingFixEvent };
        },
      }],
    });
    pump.registerReceiver({
      receiver: actors.irrelevant,
      principal: principal(actors.irrelevant),
      role: "irrelevant",
      cwd: artifactsDirectory,
      ref: refs.irrelevant,
      routes: [{
        eventType: "artifact-ready",
        subscribedEventTypes: ["review-failed"],
        grant: grants.ai,
        sourceTask: actors.a,
        targetTask: { ...actors.irrelevant, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "irrelevant-never-runs",
        businessTool: TOOLS.review,
        async onBusinessToolCall() { throw new Error("irrelevant business turn ran"); },
        async onLifecyclePublication() { throw new Error("irrelevant publication ran"); },
      }],
    });

    const kickoffArgs = {
      sourceEventId: artifactEvent.messageId,
      event: actionEventBody(artifactEvent),
      commitSha: implementationSha,
    };
    const kickoff = await runKickoff({
      coordinator, runtime, actor: actors.a, ref: refs.a,
      event: artifactEvent, args: kickoffArgs,
      cwd: artifactsDirectory, recoveryDirectory: journalDirectory,
      ownedJournalPaths,
    });
    coordinator.submit(projectLifecycleEventToEnvelope(irrelevantEvent), principal(actors.a));
    const pumpResult = await pump.runUntilIdle();
    if (!rActivation || !sameAActivation) {
      throw new Error("threadmesh_event_pump_expected_activations_missing");
    }

    const counts = {
      lifecycleActionPublications: coordinator.db.prepare(
        "SELECT COUNT(*) AS count FROM lifecycle_action_publications",
      ).get().count,
      receiverDecisions: coordinator.db.prepare(
        "SELECT COUNT(*) AS count FROM attention_route_decision_bindings",
      ).get().count,
      contextAdmissions: coordinator.db.prepare(
        "SELECT COUNT(*) AS count FROM context_admission_turn_bindings",
      ).get().count,
    };
    result = {
      state: "passed-autonomous-pump-in-process-partial",
      liveProductEvidence: false,
      initialUserStartPrompts: 1,
      deterministicPolicyOracle: true,
      activationDispatchesByFixtureRunner: 0,
      eventPumpDispatches: pumpResult.dispatches,
      eventPumpSkips: pumpResult.skips,
      eventPumpSelectionRecordCount: pumpResult.selectionRecordCount,
      eventPumpSelectionHeadDigest: pumpResult.selectionHeadDigest,
      eventPumpSelectionChainValid: pumpResult.selectionChainValid,
      eventPumpSelectionChainScope: pumpResult.selectionChainScope,
      eventPumpSelectionDurable: false,
      eventPumpTerminalState: pumpResult.state,
      eventPumpAwaitingPromotion: pumpResult.awaitingPromotion === true,
      autonomousEventPump: true,
      autonomousEventPumpScope: "in-process-partial",
      rawPhasePromptsSubmittedByFixtureRunner: 0,
      humanRelayCount: 0,
      pollingCount: 0,
      completedRoles: ["a-kickoff", "r", "same-a"],
      pendingRoles: ["v", "dependent"],
      pendingReason: "Verifier and dependent activation are not implemented by this partial gate.",
      pendingGates: [
        "durable-pump-restart-checkpoint",
        "cross-process-concurrent-pump-lease",
        "verifier-and-dependent-activation",
      ],
      sameARef: sameAActivation.admitted &&
        kickoff.turn.evidence.threadId === refs.a.threadId &&
        sameAActivation.decisionTurnEvidence?.threadId === refs.a.threadId &&
        sameAActivation.businessTurnEvidence?.threadId === refs.a.threadId &&
        new Set([
          kickoff.turn.evidence.turnId,
          sameAActivation.decisionTurnEvidence?.turnId,
          sameAActivation.businessTurnEvidence?.turnId,
        ]).size === 3,
      bindings: counts,
      irrelevant: {
        claimCount: coordinator.db.prepare(
          "SELECT COUNT(*) AS count FROM attention_handler_claims WHERE receiver_task_id = ?",
        ).get(actors.irrelevant.taskId).count,
        turnCount: adapter.threads.get(refs.irrelevant.threadId).turns.length,
        durableSkip: coordinator.getAttentionCursor(
          taskRef(actors.irrelevant), principal(actors.irrelevant),
        ).cursor.commitCount === 1,
      },
      runtime: {
        planSurfaceUsed: adapter.invocations.some((entry) =>
          ["plan", "deliverContext", "phasePrompt", "runnerPhasePrompts"]
            .some((key) => Object.hasOwn(entry, key))),
        modelSelectedToolCalls: [...adapter.threads.values()]
          .reduce((count, thread) => count + thread.turns
            .reduce((sum, turn) => sum + turn.toolCalls.length, 0), 0),
      },
    };
  } catch (error) {
    failure = error;
  } finally {
    if (runtime) {
      for (const [role, ref] of Object.entries(refs).reverse()) {
        try {
          cleanupRoles.push({ role, ...(await runtime.deleteRole({
            role, ref, cwd: artifactsDirectory,
          })) });
        } catch (error) {
          cleanupRoles.push({ role, deleted: false, absenceVerified: false, error: error.code });
        }
      }
    }
    try {
      const executions = coordinator.db.prepare(
        "SELECT execution_id FROM turn_execution_intents WHERE scenario_id = ?",
      ).all("coordinator_driven_no_plan");
      for (const { execution_id: executionId } of executions) {
        const journalPath = path.join(journalDirectory, `${executionId}.json`);
        ownedJournalPaths.add(journalPath);
        ownedJournalPaths.add(`${journalPath}.decision-action`);
      }
    } catch (error) {
      failure ??= error;
    }
    coordinator.close();
  }
  const journalRemovalFailures = [];
  let ownedJournalRemovedCount = 0;
  for (const filename of ownedJournalPaths) {
    if (!fs.existsSync(filename)) continue;
    try {
      fs.rmSync(filename);
      ownedJournalRemovedCount += 1;
    } catch (error) {
      journalRemovalFailures.push({
        pathDigest: sha256Digest(filename),
        errorCode: error?.code ?? "unknown_journal_removal_error",
      });
    }
  }
  const databaseRemovalFailures = [];
  for (const filename of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`,
    `${databasePath}-journal`]) {
    if (!fs.existsSync(filename)) continue;
    try {
      fs.rmSync(filename);
    } catch (error) {
      databaseRemovalFailures.push({
        pathDigest: sha256Digest(filename),
        errorCode: error?.code ?? "unknown_database_removal_error",
      });
    }
  }
  const remainingOwnedJournals = [...ownedJournalPaths].filter(fs.existsSync);
  const allJournalLikePaths = [
    ...journalLikePaths(artifactsDirectory),
    ...journalLikePaths(journalDirectory),
  ];
  const unknownJournalPaths = allJournalLikePaths.filter(
    (filename) => !ownedJournalPaths.has(filename),
  );
  let journalDirectoryRemoved = false;
  if (fs.existsSync(journalDirectory) && fs.readdirSync(journalDirectory).length === 0) {
    try {
      fs.rmdirSync(journalDirectory);
      journalDirectoryRemoved = true;
    } catch (error) {
      journalRemovalFailures.push({
        pathDigest: sha256Digest(journalDirectory),
        errorCode: error?.code ?? "unknown_journal_directory_removal_error",
      });
    }
  }
  const cleanup = {
    complete: cleanupRoles.length === Object.keys(refs).length &&
      cleanupRoles.every(({ deleted, absenceVerified }) => deleted && absenceVerified) &&
      remainingOwnedJournals.length === 0 && unknownJournalPaths.length === 0 &&
      journalRemovalFailures.length === 0 && databaseRemovalFailures.length === 0 &&
      journalDirectoryRemoved && !fs.existsSync(databasePath),
    roles: cleanupRoles,
    ownedJournalRemovedCount,
    remainingJournalCount: remainingOwnedJournals.length,
    unknownJournalCount: unknownJournalPaths.length,
    unknownJournalPathDigests: unknownJournalPaths.map(sha256Digest),
    journalRemovalFailures,
    databaseRemovalFailures,
    journalDirectoryRemoved,
    coordinatorRemoved: !fs.existsSync(databasePath),
  };
  if (failure) {
    failure.cleanup = cleanup;
    throw failure;
  }
  return Object.freeze({ ...result, cleanup });
}
