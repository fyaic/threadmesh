import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createAutonomousEventPump } from
  "../activation/autonomous-event-pump.mjs";
import { sha256Digest } from "../canonical-json.mjs";
import {
  gitEvidenceVerificationResultDigest,
  SqliteCoordinator,
} from "../coordinator/sqlite-coordinator.mjs";
import { verificationAttestationDigest } from "../protocol-validator.mjs";
import { projectLifecycleEventToEnvelope } from "../routing/lifecycle-events.mjs";
import { retireM52LiveTurnJournal } from "./m5-2-live-turn-journal.mjs";
import {
  CodexLiveAgentRuntime,
  REGISTERED_PEER_DECISION_TOOL,
} from "./live-agent-scenario.mjs";
import { DeterministicNoPlanCodexAdapter } from
  "./deterministic-no-plan-codex-adapter.mjs";
import {
  independentGitClaimDigest,
  independentGitFindingDigest,
  verifyIndependentGitVerification,
} from "./independent-git-verifier.mjs";

const NOW = Date.parse("2026-09-01T08:00:00.000Z");
const CREATED_AT = "2026-09-01T07:00:00.000Z";
const EXPIRES_AT = "2026-09-01T10:00:00.000Z";
const DEPENDENT_ADAPTER_RECEIPT = Object.freeze({
  adapterOperationId: "fixture-no-plan-dependent-post-admission-receipt",
  acceptedAt: new Date(NOW).toISOString(),
  evidenceRefs: ["fixture://no-plan-dependent/post-admission-receipt"],
});
const owner = Object.freeze({ kind: "user", principalId: "owner_no_plan_scenario" });
const sha = (character) => character.repeat(40);
const digest = (value) => sha256Digest({ value });

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
  verify: tool("threadmesh_verify_exact_chain", "Verify and sign the exact evidence chain."),
  dependent: tool(
    "threadmesh_activate_verified_dependency",
    "Request activation; the coordinator commits it only after trusted finalization.",
  ),
});

const ROUTE_HANDLER_CONFIGS = Object.freeze([
  Object.freeze({
    handlerId: "handler.no-plan.review.v1", receiverRole: "r",
    eventType: "artifact-ready", businessPhase: "r-review",
    businessTool: TOOLS.review,
  }),
  Object.freeze({
    handlerId: "handler.no-plan.same-a-fix.v1", receiverRole: "a",
    eventType: "review-failed", businessPhase: "same-a-fix",
    businessTool: TOOLS.fix,
  }),
  Object.freeze({
    handlerId: "handler.no-plan.verify.v1", receiverRole: "v",
    eventType: "artifact-ready", businessPhase: "v-verify",
    businessTool: TOOLS.verify,
  }),
  Object.freeze({
    handlerId: "handler.no-plan.dependent.v1", receiverRole: "dependent",
    eventType: "dependency-satisfied", businessPhase: "dependent-gated-activation",
    businessTool: TOOLS.dependent,
  }),
  Object.freeze({
    handlerId: "handler.no-plan.irrelevant.v1", receiverRole: "irrelevant",
    eventType: "artifact-ready", businessPhase: "irrelevant-never-runs",
    businessTool: TOOLS.review,
  }),
]);

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

function promoteStage(coordinator, executionId, stage, payload, revision, head, actor) {
  return coordinator.promoteTurnExecutionWithGitEvidenceRecord(executionId, {
    stage,
    payload,
    expectedEvidenceChainRevision: revision,
    expectedEvidenceChainHead: head,
    expectedRevision: 5,
  }, principal(actor));
}

function promoteAttention(coordinator, activation, execution, actor) {
  const cursor = coordinator.getAttentionCursor(taskRef(actor), principal(actor)).cursor;
  return coordinator.promoteAttentionHandler(activation.claim.claimEpoch, {
    expectedClaimRevision: activation.claim.revision,
    expectedCursorRevision: cursor.revision,
  }, principal(actor));
}

function createVerification({
  requirement, payloads, verifier, dependent, trustAnchor, privateKey,
}) {
  const request = {
    repoPath: "/private/deterministic-fixture/repository",
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
    finding: {
      resourcePath: "artifact.txt",
      counterexample: "BAD_COUNTEREXAMPLE",
      digest: payloads["review-failed"].findingDigest,
    },
    trustedTest: {
      resourcePath: "test/fixtures/independent-git-verifier-target.test.mjs",
      blobDigest: requirement.trustedTestBlobDigest,
    },
    subject: {
      messageId: "msg_no_plan_fix_0001",
      senderIncarnationId: verifier.incarnationId,
      receiver: taskRef(dependent),
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
  const binding = {
    chain: request.chain,
    implementationSha: request.implementation.sha,
    fixSha: request.fix.sha,
    findingDigest: request.finding.digest,
  };
  const suffix = sha256Digest(binding).slice(7, 31);
  const attestation = {
    specVersion: "0.0-draft",
    attestationId: `att_git_${suffix}`,
    verifier: {
      actorType: "service",
      actorId: trustAnchor.actorId,
      authenticationId: "authn_no_plan_fixture_verifier",
      trustDomain: trustAnchor.trustDomain,
    },
    subject: {
      ...request.subject,
      claimType: "artifact-state",
      claimDigest: independentGitClaimDigest({ chain: proof.chain, proof }),
    },
    method: "independent-reproduction",
    evidenceDigest: sha256Digest(proof),
    verifiedAt: new Date(NOW).toISOString(),
    trustPolicy: {
      policyId: trustAnchor.policyId,
      decisionId: `decision_git_${suffix}`,
      decision: "trusted",
      decidedAt: new Date(NOW).toISOString(),
    },
  };
  attestation.signedPayloadDigest = verificationAttestationDigest(attestation);
  attestation.proof = {
    algorithm: "ed25519",
    keyId: trustAnchor.keyId,
    signature: sign(
      null, Buffer.from(attestation.signedPayloadDigest, "utf8"), privateKey,
    ).toString("base64url"),
  };
  const response = { trustAnchor, attestation, proof };
  verifyIndependentGitVerification({ request, response, expectedTrustAnchor: trustAnchor });
  return { request, response, expectedTrustAnchor: trustAnchor };
}

function externallyVerifiedDisposition(coordinator, verifier, dependent, event, attestation) {
  const persisted = coordinator.getDisposition(
    verifier.incarnationId, event.messageId, principal(dependent),
  );
  const at = new Date(NOW).toISOString();
  return {
    specVersion: "0.0-draft",
    dispositionId: "dsp_no_plan_verified_0001",
    messageId: event.messageId,
    receiver: taskRef(dependent),
    revision: persisted.revision + 1,
    delivery: { state: persisted.delivery, observedAt: at },
    decision: {
      state: persisted.decision,
      decidedAt: at,
      decidedBy: { actorType: "agent", task: taskRef(dependent) },
      reasonCode: persisted.decisionReasonCode,
    },
    outcome: {
      state: "externally-verified",
      observedAt: at,
      evidenceRefs: ["threadmesh://git-evidence/final"],
      verificationAttestations: [attestation],
    },
    updatedAt: at,
  };
}

function recordDependentAdapterReceipt(
  coordinator, verifier, dependent, event, expectedRevision,
) {
  const dependentPrincipal = principal(dependent);
  const prepared = coordinator.prepareAdapterSubmission(
    verifier.incarnationId, event.messageId, expectedRevision, dependentPrincipal,
  );
  coordinator.beginAdapterSubmission(
    prepared.submission.submissionId, expectedRevision, dependentPrincipal,
  );
  return coordinator.recordAdapterReceipt(
    prepared.submission.submissionId,
    expectedRevision,
    DEPENDENT_ADAPTER_RECEIPT,
    dependentPrincipal,
  );
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

function registerTask(coordinator, actor, ref, {
  state = "idle", runtime = { objectiveVersion: 1 },
} = {}) {
  const registered = { ...actor, threadId: ref.threadId, snapshotDigest: ref.snapshotDigest };
  coordinator.registerTask({
    taskId: actor.taskId,
    incarnationId: actor.incarnationId,
    harness: "codex",
    state,
    runtime,
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
  injectFinalizationFailure = false,
}) {
  if (!path.isAbsolute(artifactsDirectory ?? "") ||
      typeof injectPriorRelevant !== "boolean" ||
      typeof injectFinalizationFailure !== "boolean") {
    throw new Error("threadmesh_coordinator_driven_artifacts_invalid");
  }
  fs.mkdirSync(artifactsDirectory, { recursive: true });
  const scenarioRunRoot = fs.mkdtempSync(path.join(
    artifactsDirectory, ".threadmesh-coordinator-driven-run-",
  ));
  fs.chmodSync(scenarioRunRoot, 0o700);
  const journalDirectory = path.join(
    scenarioRunRoot, "journals",
  );
  fs.mkdirSync(journalDirectory, { recursive: false, mode: 0o700 });
  const ownedJournalPaths = new Set();
  const databasePath = path.join(scenarioRunRoot, "coordinator-driven.sqlite");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const trustAnchor = {
    keyId: "threadmesh://independent-git-verifier/key/ephemeral",
    algorithm: "ed25519",
    actorId: "threadmesh-independent-git-verifier",
    trustDomain: "threadmesh://independent-git-verifier",
    policyId: "threadmesh://independent-git-verifier/policy/1",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
  let coordinatorClockSequence = 0;
  const coordinator = new SqliteCoordinator({
    filename: databasePath,
    clock: () => NOW + coordinatorClockSequence++,
    verificationTrustAnchors: [trustAnchor],
  });
  const actors = {
    a: { taskId: "task_no_plan_a", incarnationId: "inc_no_plan_a_0001" },
    r: { taskId: "task_no_plan_r", incarnationId: "inc_no_plan_r_0001" },
    irrelevant: {
      taskId: "task_no_plan_irrelevant", incarnationId: "inc_no_plan_irrelevant_0001",
    },
    v: { taskId: "task_no_plan_v", incarnationId: "inc_no_plan_v_0001" },
    dependent: {
      taskId: "task_no_plan_dependent", incarnationId: "inc_no_plan_dependent_0001",
    },
  };
  const grants = {
    ar: grant("no_plan_a_r", actors.a, actors.r),
    ra: grant("no_plan_r_a", actors.r, actors.a),
    av: grant("no_plan_a_v", actors.a, actors.v),
    vd: grant("no_plan_v_dependent", actors.v, actors.dependent),
    ai: grant("no_plan_a_irrelevant", actors.a, actors.irrelevant),
  };
  const implementationSha = sha("3");
  const fixSha = sha("5");
  const findingDigest = independentGitFindingDigest({
    resourcePath: "artifact.txt",
    counterexample: "BAD_COUNTEREXAMPLE",
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
  const fixEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_fix_0001",
    sender: actors.a,
    target: actors.v,
    relationshipId: grants.av.relationshipId,
    content: `Review fix ${fixSha} is ready for independent verification.`,
  });
  const verifiedEvent = {
    ...lifecycleEvent({
      eventType: "dependency-satisfied",
      messageId: fixEvent.messageId,
      sender: actors.v,
      target: actors.dependent,
      relationshipId: grants.vd.relationshipId,
      content: "The exact signed evidence chain passed trusted fixture verification.",
    }),
    freshness: {
      expectedRunId: "run-no-plan-dependent",
      expectedObjectiveVersion: 2,
      expectedCheckpoint: "waiting-for-verified-fix",
    },
  };
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
  let adapter;
  let result;
  let failure;
  let evidenceRevision = 0;
  let evidenceHead = null;
  let verification = null;
  const verifiedActivationOrder = [];
  const cleanupRoles = [];
  try {
    adapter = new DeterministicNoPlanCodexAdapter({
      decideTurn(canonicalInput) {
        const input = JSON.parse(canonicalInput);
        const selectedTool = input.dynamicTools[0]?.name;
        const knownMessage = [artifactEvent, reviewEvent, fixEvent, verifiedEvent]
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
              event: actionEventBody(fixEvent), commitSha: fixSha,
            },
          }] };
        }
        if (selectedTool === TOOLS.verify.name) {
          return { text: "Independent signed verification selected.", toolCalls: [{
            tool: selectedTool,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(verifiedEvent),
              chainId: "chain_coordinator_driven_no_plan",
              expectedEvidenceChainRevision: evidenceRevision,
              expectedEvidenceChainHead: evidenceHead,
            },
          }] };
        }
        if (selectedTool === TOOLS.dependent.name) {
          return { text: "Dependency activation requested behind finalization gate.", toolCalls: [{
            tool: selectedTool, arguments: {},
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
    refs.v = await runtime.createRole({
      role: "v", cwd: artifactsDirectory,
      tools: [REGISTERED_PEER_DECISION_TOOL, TOOLS.verify],
      phaseTools: {
        "receiver-decision": [REGISTERED_PEER_DECISION_TOOL], "v-verify": [TOOLS.verify],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "v-verify": "admitted-tool",
      },
      instructions: "Verify only the exact coordinator-bound evidence chain.",
      scenarioId: "coordinator_driven_no_plan",
    });
    refs.dependent = await runtime.createRole({
      role: "dependent", cwd: artifactsDirectory,
      tools: [REGISTERED_PEER_DECISION_TOOL, TOOLS.dependent],
      phaseTools: {
        "receiver-decision": [REGISTERED_PEER_DECISION_TOOL],
        "dependent-gated-activation": [TOOLS.dependent],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision",
        "dependent-gated-activation": "admitted-tool",
      },
      instructions: "Request activation; trust only coordinator finalization state.",
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
    actors.v = registerTask(coordinator, actors.v, refs.v);
    actors.dependent = registerTask(coordinator, actors.dependent, refs.dependent, {
      state: "waiting",
      runtime: {
        runId: "run-no-plan-dependent",
        objectiveVersion: 2,
        checkpoint: "waiting-for-verified-fix",
      },
    });
    actors.irrelevant = registerTask(coordinator, actors.irrelevant, refs.irrelevant);
    for (const [index, current] of Object.values(grants).entries()) {
      coordinator.issueGrant(current, {
        decisionId: `decision_no_plan_${index}`,
        authenticationId: `authn_no_plan_${index}`,
        decidedAt: CREATED_AT,
      }, owner);
    }
    coordinator.createDependencyEdge({
      dependencyId: "dependency_no_plan_verified",
      version: 1,
      edgeType: "dependency",
      prerequisite: taskRef(actors.v),
      dependent: taskRef(actors.dependent),
      relationshipId: grants.vd.relationshipId,
      expectedEventType: "dependency-satisfied",
      freshness: {
        expectedRunId: "run-no-plan-dependent",
        expectedObjectiveVersion: 2,
        expectedCheckpoint: "waiting-for-verified-fix",
      },
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    }, owner);
    const requirement = coordinator.createGitEvidenceRequirement({
      chainId: "chain_coordinator_driven_no_plan",
      validatedBaseSha: sha("1"),
      fixtureSeedSha: sha("2"),
      fixtureDefinitionDigest: digest("fixture-definition"),
      trustedTestBlobDigest: digest("trusted-test"),
      implementer: actors.a,
      reviewer: actors.r,
      verifier: actors.v,
      preconfiguredTrustAnchorDigest: sha256Digest(trustAnchor),
    }, owner).requirement;
    coordinator.bindGitEvidenceDependency(requirement.chainId, {
      dependencyId: "dependency_no_plan_verified", expectedVersion: 1,
    }, owner);
    const payloads = {
      implementation: {
        actor: actors.a, turnId: null, toolCallDigest: null,
        commitSha: implementationSha, parentSha: sha("2"), treeSha: sha("4"),
        diffDigest: digest("implementation-diff"),
        testEvidenceDigest: digest("implementation-test"),
      },
      "review-failed": {
        actor: actors.r, turnId: null, toolCallDigest: null,
        implementationSha, findingDigest,
        reproductionEvidenceDigest: digest("reproduction"),
      },
      fix: {
        actor: actors.a, turnId: null, toolCallDigest: null,
        commitSha: fixSha, parentSha: implementationSha, treeSha: sha("6"),
        diffDigest: digest("fix-diff"), resolvesFindingDigest: findingDigest,
        testEvidenceDigest: digest("fix-test"),
      },
    };
    if (injectPriorRelevant) {
      coordinator.submit(
        projectLifecycleEventToEnvelope(priorRelevantEvent),
        principal(actors.a),
      );
    }

    let sameAActivation = null;
    let rActivation = null;
    let verifierActivation = null;
    let dependentActivation = null;
    let finalized = null;
    let dependentActivationCommitted = false;
    const pump = createAutonomousEventPump({
      coordinator,
      runtime,
      scenarioId: "coordinator_driven_no_plan",
      chainId: "chain_coordinator_driven_no_plan",
      recoveryDirectory: journalDirectory,
      maxEvents: 5,
    });
    pump.registerReceiver({
      receiver: actors.r,
      principal: principal(actors.r),
      role: "r",
      cwd: artifactsDirectory,
      ref: refs.r,
      routes: [{
        handlerId: ROUTE_HANDLER_CONFIGS[0].handlerId,
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
          const execution = coordinator.getTurnExecution(
            activation.businessExecutionId, principal(actors.r),
          );
          payloads["review-failed"].turnId = execution.actions[0].turnId;
          payloads["review-failed"].toolCallDigest = execution.actions[0].actionDigest;
          const promoted = promoteStage(
            coordinator, activation.businessExecutionId, "review-failed",
            payloads["review-failed"], evidenceRevision, evidenceHead, actors.r,
          );
          evidenceRevision = promoted.evidenceState.recordCount;
          evidenceHead = promoted.evidenceState.headDigest;
          coordinator.publishLifecycleFromCompletedAction(promoted.executionId, {
            expectedTool: TOOLS.review.name,
            event: reviewEvent,
            expectedMaterial: { findingDigest },
          }, principal(actors.r));
          promoteAttention(coordinator, activation, promoted, actors.r);
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
        handlerId: ROUTE_HANDLER_CONFIGS[1].handlerId,
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
          const execution = coordinator.getTurnExecution(
            activation.businessExecutionId, principal(actors.a),
          );
          payloads.fix.turnId = execution.actions[0].turnId;
          payloads.fix.toolCallDigest = execution.actions[0].actionDigest;
          const promoted = promoteStage(
            coordinator, activation.businessExecutionId, "fix", payloads.fix,
            evidenceRevision, evidenceHead, actors.a,
          );
          evidenceRevision = promoted.evidenceState.recordCount;
          evidenceHead = promoted.evidenceState.headDigest;
          coordinator.publishLifecycleFromCompletedAction(promoted.executionId, {
            expectedTool: TOOLS.fix.name,
            event: fixEvent,
            expectedMaterial: { commitSha: fixSha },
          }, principal(actors.a));
          promoteAttention(coordinator, activation, promoted, actors.a);
        },
      }],
    });
    pump.registerReceiver({
      receiver: actors.v,
      principal: principal(actors.v),
      role: "v",
      cwd: artifactsDirectory,
      ref: refs.v,
      routes: [{
        handlerId: ROUTE_HANDLER_CONFIGS[2].handlerId,
        eventType: "artifact-ready",
        subscribedEventTypes: ["artifact-ready"],
        grant: grants.av,
        sourceTask: actors.a,
        targetTask: { ...actors.v, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "v-verify",
        businessTool: TOOLS.verify,
        async onBusinessToolCall() {
          verifiedActivationOrder.push("v-verification-tool-selected");
          verification = createVerification({
            requirement, payloads, verifier: actors.v, dependent: actors.dependent,
            trustAnchor, privateKey,
          });
          return verification;
        },
        async onLifecyclePublication({ activation }) {
          verifierActivation = activation;
          coordinator.publishLifecycleFromCompletedAction(activation.businessExecutionId, {
            expectedTool: TOOLS.verify.name,
            event: verifiedEvent,
            expectedMaterial: {
              chainId: requirement.chainId,
              expectedEvidenceChainRevision: evidenceRevision,
              expectedEvidenceChainHead: evidenceHead,
            },
          }, principal(actors.v));
          verifiedActivationOrder.push("verified-event-durable");
        },
      }],
    });
    pump.registerReceiver({
      receiver: actors.dependent,
      principal: principal(actors.dependent),
      role: "dependent",
      cwd: artifactsDirectory,
      ref: refs.dependent,
      routes: [{
        handlerId: ROUTE_HANDLER_CONFIGS[3].handlerId,
        eventType: "dependency-satisfied",
        subscribedEventTypes: ["dependency-satisfied"],
        grant: grants.vd,
        sourceTask: actors.v,
        targetTask: {
          ...actors.dependent,
          runId: "run-no-plan-dependent",
          objectiveVersion: 2,
          checkpoint: "waiting-for-verified-fix",
        },
        now: NOW,
        businessPhase: "dependent-gated-activation",
        businessTool: TOOLS.dependent,
        async afterAdmissionPrepared() {
          verifiedActivationOrder.push("dependent-admission-prepared");
          recordDependentAdapterReceipt(
            coordinator, actors.v, actors.dependent, verifiedEvent, 1,
          );
          const disposition = externallyVerifiedDisposition(
            coordinator, actors.v, actors.dependent, verifiedEvent,
            verification.response.attestation,
          );
          const verifierExecution = coordinator.getTurnExecution(
            verifierActivation.businessExecutionId, principal(actors.v),
          );
          const action = verifierExecution.actions[0];
          if (action.resultDigest !== gitEvidenceVerificationResultDigest(verification)) {
            throw new Error("threadmesh_verifier_result_digest_mismatch");
          }
          finalized = coordinator.finalizeGitEvidenceDependency(
            verifierExecution.executionId,
            {
              actionOrdinal: 0,
              verificationToolArguments: JSON.parse(action.argsJson),
              ...verification,
              dependencyId: "dependency_no_plan_verified",
              expectedDependencyVersion: 1,
              event: verifiedEvent,
              disposition,
              expectedEvidenceChainRevision: evidenceRevision,
              expectedEvidenceChainHead: injectFinalizationFailure
                ? digest("injected-finalization-binding-failure")
                : evidenceHead,
              expectedRevision: verifierExecution.revision,
            },
            principal(actors.v),
          );
          evidenceRevision = finalized.evidenceState.recordCount;
          evidenceHead = finalized.evidenceState.headDigest;
          promoteAttention(coordinator, verifierActivation, finalized, actors.v);
          const edge = coordinator.getDependencyEdge(
            "dependency_no_plan_verified", principal(actors.dependent),
          );
          const task = coordinator.getTask(taskRef(actors.dependent), owner);
          if (edge.status !== "satisfied" || task.state !== "ready") {
            throw new Error("threadmesh_dependent_pre_business_gate_unsatisfied");
          }
          verifiedActivationOrder.push("trusted-finalization-completed");
        },
        async onBusinessToolCall() {
          const edge = coordinator.getDependencyEdge(
            "dependency_no_plan_verified", principal(actors.dependent),
          );
          const task = coordinator.getTask(taskRef(actors.dependent), owner);
          if (edge.version !== 1 || edge.status !== "satisfied" || task.state !== "ready") {
            throw new Error("threadmesh_dependent_pre_business_gate_unsatisfied");
          }
          verifiedActivationOrder.push("dependent-business-tool-selected");
          return { activationRequested: true, effectCommitted: true };
        },
        async onLifecyclePublication({ activation }) {
          dependentActivation = activation;
          const dependentCursor = coordinator.getAttentionCursor(
            taskRef(actors.dependent), principal(actors.dependent),
          ).cursor;
          coordinator.commitFinalizedDependencyAttentionHandler(
            activation.claim.claimEpoch,
            {
              dependencyId: "dependency_no_plan_verified",
              expectedClaimRevision: activation.claim.revision,
              expectedCursorRevision: dependentCursor.revision,
            },
            principal(actors.dependent),
          );
          verifiedActivationOrder.push("dependent-cursor-finalized");
          const edgeAfter = coordinator.getDependencyEdge(
            "dependency_no_plan_verified", principal(actors.dependent),
          );
          const taskAfter = coordinator.getTask(taskRef(actors.dependent), owner);
          dependentActivationCommitted = edgeAfter.status === "satisfied" &&
            taskAfter.state === "ready";
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
        handlerId: ROUTE_HANDLER_CONFIGS[4].handlerId,
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
    payloads.implementation.turnId = kickoff.execution.actions[0].turnId;
    payloads.implementation.toolCallDigest = kickoff.execution.actions[0].actionDigest;
    const promotedKickoff = promoteStage(
      coordinator, kickoff.execution.executionId, "implementation",
      payloads.implementation, evidenceRevision, evidenceHead, actors.a,
    );
    evidenceRevision = promotedKickoff.evidenceState.recordCount;
    evidenceHead = promotedKickoff.evidenceState.headDigest;
    coordinator.submit(projectLifecycleEventToEnvelope(irrelevantEvent), principal(actors.a));
    const pumpResult = await pump.runUntilIdle();
    if (!rActivation || !sameAActivation || !verifierActivation ||
        !dependentActivation || !finalized || !dependentActivationCommitted) {
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
    const chain = coordinator.getGitEvidenceChain(requirement.chainId, owner);
    const dependency = coordinator.getDependencyEdge(
      "dependency_no_plan_verified", principal(actors.dependent),
    );
    const dependentTask = coordinator.getTask(taskRef(actors.dependent), owner);
    const dependentDisposition = coordinator.getDisposition(
      actors.v.incarnationId, verifiedEvent.messageId, principal(actors.dependent),
    );
    const attentionCursors = Object.fromEntries(
      ["r", "a", "v", "dependent", "irrelevant"].map((role) => [
        role,
        coordinator.getAttentionCursor(taskRef(actors[role]), principal(actors[role])).cursor,
      ]),
    );
    const activeAttentionClaimCount = coordinator.db.prepare(
      "SELECT COUNT(*) AS count FROM attention_handler_claims WHERE state = 'active'",
    ).get().count;
    const finalizationRow = coordinator.db.prepare(
      `SELECT finalized_at AS finalizedAt
       FROM git_evidence_dependency_finalizations WHERE dependency_id = ?`,
    ).get("dependency_no_plan_verified");
    const dependentBusinessRow = coordinator.db.prepare(
      `SELECT started_at AS startedAt FROM turn_execution_intents
       WHERE execution_id = ?`,
    ).get(dependentActivation.businessExecutionId);
    const nativeTurnIds = [
      kickoff.turn.evidence.turnId,
      rActivation.decisionTurnEvidence?.turnId,
      rActivation.businessTurnEvidence?.turnId,
      sameAActivation.decisionTurnEvidence?.turnId,
      sameAActivation.businessTurnEvidence?.turnId,
      verifierActivation.decisionTurnEvidence?.turnId,
      verifierActivation.businessTurnEvidence?.turnId,
    ];
    const selectionBindings = pump.selectionRecords.map((record) => ({
      kind: record.kind,
      handlerId: record.handlerId,
      handlerConfigDigest: record.handlerConfigDigest,
      recordDigest: record.recordDigest,
    }));
    result = {
      state: "passed-full-functional-in-process-fixture",
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
      autonomousEventPumpScope: "in-process-functional-fixture",
      rawPhasePromptsSubmittedByFixtureRunner: 0,
      humanRelayCount: 0,
      pollingCount: 0,
      completedRoles: ["a-kickoff", "r", "same-a", "v", "dependent"],
      pendingRoles: [],
      pendingReason: "Durable pump restart and cross-process lease remain outside this fixture.",
      pendingGates: [
        "durable-pump-restart-checkpoint",
        "cross-process-concurrent-pump-lease",
      ],
      routeHandlerConfigs: ROUTE_HANDLER_CONFIGS,
      executedHandlerIds: selectionBindings
        .filter(({ kind }) => kind === "coordinator-activation")
        .map(({ handlerId }) => handlerId),
      selectionBindings,
      attention: {
        cursors: attentionCursors,
        activeClaimCount: activeAttentionClaimCount,
        allOfferedCursorsCommitted:
          Object.values(attentionCursors).every((cursor) => cursor.commitCount === 1) &&
          activeAttentionClaimCount === 0,
      },
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
      verification: {
        mode: "deterministic-in-process-trusted-signing",
        externalIndependentVerifier: false,
        signer: "fixture-owned-ephemeral-key",
        nativeVerifierSessionIndependent:
          refs.v.threadId !== refs.a.threadId && refs.v.threadId !== refs.r.threadId,
        nativeVerifierTurnIdDigest: sha256Digest(
          verifierActivation.businessTurnEvidence?.turnId,
        ),
        allLifecycleNativeTurnIdsDistinct:
          nativeTurnIds.every(Boolean) && new Set(nativeTurnIds).size === nativeTurnIds.length,
        signatureVerified: true,
        trustAnchorDigest: sha256Digest(trustAnchor),
        resultDigestBound: coordinator.getTurnExecution(
          verifierActivation.businessExecutionId, principal(actors.v),
        ).actions[0].resultDigest === gitEvidenceVerificationResultDigest(verification),
      },
      evidenceChain: {
        recordCount: chain.state.recordCount,
        trustedComplete: chain.state.trustedComplete,
        headDigest: chain.state.headDigest,
      },
      dependent: {
        decision: dependentDisposition.decision,
        outcome: dependentDisposition.outcome,
        edgeStatus: dependency.status,
        taskState: dependentTask.state,
        effectCommittedAfterFinalization: dependentActivationCommitted,
      },
      ordering: {
        sequence: [...verifiedActivationOrder],
        finalizationBeforeDependentBusiness:
          verifiedActivationOrder.indexOf("trusted-finalization-completed") <
            verifiedActivationOrder.indexOf("dependent-business-tool-selected"),
        finalizationAt: finalizationRow.finalizedAt,
        dependentBusinessStartedAt: dependentBusinessRow.startedAt,
        timestampStrictlyEarlier:
          Date.parse(finalizationRow.finalizedAt) <
            Date.parse(dependentBusinessRow.startedAt),
      },
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
    if (injectFinalizationFailure) {
      let edgeStatus = "unavailable";
      let taskState = "unavailable";
      try {
        edgeStatus = coordinator.getDependencyEdge(
          "dependency_no_plan_verified", principal(actors.dependent),
        ).status;
        taskState = coordinator.getTask(taskRef(actors.dependent), owner).state;
      } catch {}
      error.failureEvidence = {
        dependentBusinessTurnCount: coordinator.db.prepare(
          `SELECT COUNT(*) AS count FROM turn_execution_intents
           WHERE task_id = ? AND tool_allowlist_json = ?`,
        ).get(
          actors.dependent.taskId, JSON.stringify([TOOLS.dependent.name]),
        ).count,
        dependentBusinessToolActionCount: coordinator.db.prepare(
          "SELECT COUNT(*) AS count FROM turn_tool_actions WHERE tool_name = ?",
        ).get(TOOLS.dependent.name).count,
        committedEffectCount: coordinator.db.prepare(
          "SELECT COUNT(*) AS count FROM dependency_satisfactions WHERE dependency_id = ?",
        ).get("dependency_no_plan_verified").count,
        edgeStatus,
        taskState,
        sequence: [...verifiedActivationOrder],
      };
    }
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
  const legacyJournalDirectory = path.join(
    artifactsDirectory, ".threadmesh-coordinator-driven-journals",
  );
  const allJournalLikePaths = [
    ...journalLikePaths(artifactsDirectory),
    ...journalLikePaths(legacyJournalDirectory),
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
  let runRootRemoved = false;
  if (fs.existsSync(scenarioRunRoot) && fs.readdirSync(scenarioRunRoot).length === 0) {
    try {
      fs.rmdirSync(scenarioRunRoot);
      runRootRemoved = true;
    } catch (error) {
      journalRemovalFailures.push({
        pathDigest: sha256Digest(scenarioRunRoot),
        errorCode: error?.code ?? "unknown_run_root_removal_error",
      });
    }
  }
  const cleanup = {
    complete: cleanupRoles.length === Object.keys(refs).length &&
      cleanupRoles.every(({ deleted, absenceVerified }) => deleted && absenceVerified) &&
      remainingOwnedJournals.length === 0 && unknownJournalPaths.length === 0 &&
      journalRemovalFailures.length === 0 && databaseRemovalFailures.length === 0 &&
      journalDirectoryRemoved && runRootRemoved && !fs.existsSync(databasePath),
    roles: cleanupRoles,
    ownedJournalRemovedCount,
    remainingJournalCount: remainingOwnedJournals.length,
    unknownJournalCount: unknownJournalPaths.length,
    unknownJournalPathDigests: unknownJournalPaths.map(sha256Digest),
    journalRemovalFailures,
    databaseRemovalFailures,
    journalDirectoryRemoved,
    runRootRemoved,
    coordinatorRemoved: !fs.existsSync(databasePath),
  };
  if (failure) {
    failure.cleanup = cleanup;
    if (failure.failureEvidence) failure.failureEvidence.cleanupComplete = cleanup.complete;
    throw failure;
  }
  return Object.freeze({ ...result, cleanup });
}
