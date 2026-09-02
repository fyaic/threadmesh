import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createAutonomousEventPump } from
  "../activation/autonomous-event-pump.mjs";
import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
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
import { createBoundedGitLoopFixture } from "./bounded-git-loop-fixture.mjs";
import {
  INDEPENDENT_GIT_VERIFIER_TEST,
  independentGitClaimDigest,
  independentGitFindingDigest,
  startIndependentGitVerifierService,
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
const REAL_EFFECT_RESOURCE = "artifact.txt";
const REAL_EFFECT_SEED = "SEED\n";
const REAL_EFFECT_IMPLEMENTATION = "BAD_COUNTEREXAMPLE\n";
const REAL_EFFECT_FIX = "FIXED\n";

function scenarioError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const FAILURE_PROGRESS_COUNT_QUERIES = Object.freeze({
  tasks: "SELECT COUNT(*) AS count FROM tasks",
  dispatches: "SELECT COUNT(*) AS count FROM event_pump_dispatches",
  turnIntents: "SELECT COUNT(*) AS count FROM turn_execution_intents",
  toolActions: "SELECT COUNT(*) AS count FROM turn_tool_actions",
  completedToolActions:
    "SELECT COUNT(*) AS count FROM turn_tool_actions WHERE result_status = 'completed'",
  lifecyclePublications: "SELECT COUNT(*) AS count FROM lifecycle_action_publications",
  gitEvidenceRecords: "SELECT COUNT(*) AS count FROM git_evidence_records",
  dependencyFinalizations:
    "SELECT COUNT(*) AS count FROM git_evidence_dependency_finalizations",
  dependencySatisfactions: "SELECT COUNT(*) AS count FROM dependency_satisfactions",
  cursorCommits: "SELECT COUNT(*) AS count FROM attention_cursor_commits",
});

export const COORDINATOR_FAILURE_RECONCILIATION_REASONS = Object.freeze([
  "codex-native-turn-identity-mismatch",
  "codex-native-turn-thread-not-idle",
  "codex-native-turn-baseline-truncated",
  "codex-native-turn-baseline-mutated",
  "codex-native-turn-no-observable-delta",
  "codex-native-turn-multiple-new-turns",
  "codex-native-turn-client-id-mismatch",
  "codex-native-turn-client-id-missing",
  "codex-native-turn-completed-observation-only",
  "codex-native-turn-still-in-progress",
  "codex-native-turn-started-id-mismatch",
]);

export function deriveCoordinatorDrivenFailureStage(counts) {
  const durableStages = Math.min(
    counts.lifecyclePublications ?? 0,
    counts.gitEvidenceRecords ?? 0,
  );
  if ((counts.dependencyFinalizations ?? 0) > 0 ||
      (counts.dependencySatisfactions ?? 0) > 0) {
    return "dependency-finalized";
  }
  if (durableStages >= 4) return "verification-published";
  if (durableStages >= 3) return "fix-published";
  if (durableStages >= 2) return "review-published";
  if (durableStages >= 1 && (counts.turnIntents ?? 0) >= 3) {
    return "reviewer-admitted-turn-partial";
  }
  if (durableStages >= 1) return "implementation-published";
  if ((counts.turnIntents ?? 0) > 0) return "implementation-turn-partial";
  if ((counts.tasks ?? 0) >= 5) return "roles-registered";
  if ((counts.tasks ?? 0) > 0) return "roles-registering";
  return "coordinator-ready";
}

export function captureCoordinatorDrivenFailureProgress(database, error) {
  const counts = Object.fromEntries(Object.entries(FAILURE_PROGRESS_COUNT_QUERIES)
    .map(([key, query]) => [key, database.prepare(query).get().count]));
  const recovery = error?.recovery;
  const reasonCode = recovery?.reasonCode;
  const reconciliation = recovery?.state === "ambiguous" &&
      COORDINATOR_FAILURE_RECONCILIATION_REASONS.includes(reasonCode)
    ? {
        state: "ambiguous",
        reasonCode,
      }
    : null;
  return Object.freeze({
    schemaVersion: 1,
    source: "sqlite-pre-cleanup",
    stage: deriveCoordinatorDrivenFailureStage(counts),
    counts: Object.freeze(counts),
    reconciliation: reconciliation === null ? null : Object.freeze(reconciliation),
  });
}

function throwIfShutdownRequested(signal) {
  if (signal?.aborted === true) {
    throw scenarioError("threadmesh_coordinator_driven_shutdown_requested");
  }
}

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

function exactArgumentsTool(base, argumentsValue) {
  const properties = Object.fromEntries(Object.entries(argumentsValue).map(
    ([key, value]) => [key, { const: value }],
  ));
  return Object.freeze({
    ...base,
    description: `${base.description} Use the exact coordinator-bound arguments in the schema.`,
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      properties: Object.freeze(properties),
      required: Object.freeze(Object.keys(argumentsValue)),
    }),
  });
}

function exactDecisionTool(messageId) {
  return Object.freeze({
    ...REGISTERED_PEER_DECISION_TOOL,
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      properties: Object.freeze({
        messageId: Object.freeze({ const: messageId }),
        decision: Object.freeze({
          type: "string", enum: Object.freeze(["accepted", "deferred", "rejected"]),
        }),
      }),
      required: Object.freeze(["messageId", "decision"]),
    }),
  });
}

const TOOLS = Object.freeze({
  implementationCommit: tool(
    "threadmesh_commit_candidate",
    "Write and commit the exact bounded implementation or fix candidate, then return Git evidence.",
  ),
  implementation: tool("threadmesh_publish_artifact", "Publish the bounded implementation."),
  reviewRead: tool(
    "threadmesh_review_read_artifact",
    "Inspect the exact admitted artifact before reporting a finding.",
  ),
  reviewReproduce: tool(
    "threadmesh_reproduce_review_finding",
    "Report a finding discovered from the detached reviewer checkout.",
  ),
  review: tool("threadmesh_report_review_finding", "Publish the exact review finding."),
  fixApply: tool(
    "threadmesh_apply_review_fix",
    "Apply the admitted review finding in the persistent implementer task.",
  ),
  fix: tool("threadmesh_publish_dependency", "Publish the bounded review fix."),
  verifyRead: tool(
    "threadmesh_read_verification_chain",
    "Inspect the exact admitted evidence chain before requesting verification.",
  ),
  verify: tool("threadmesh_verify_exact_chain", "Verify and sign the exact evidence chain."),
  dependentCheck: tool(
    "threadmesh_check_finalized_dependency",
    "Read the exact finalized dependency state before requesting activation.",
  ),
  dependent: tool(
    "threadmesh_activate_verified_dependency",
    "Request activation; the coordinator commits it only after trusted finalization.",
  ),
});

const ROUTE_HANDLER_CONFIGS = Object.freeze([
  Object.freeze({
    handlerId: "handler.no-plan.review.v1", receiverRole: "r",
    eventType: "artifact-ready", businessPhase: "r-review",
    businessTools: Object.freeze([TOOLS.reviewRead, TOOLS.review]),
  }),
  Object.freeze({
    handlerId: "handler.no-plan.same-a-fix.v1", receiverRole: "a",
    eventType: "review-failed", businessPhase: "same-a-fix",
    businessTools: Object.freeze([TOOLS.fixApply, TOOLS.fix]),
  }),
  Object.freeze({
    handlerId: "handler.no-plan.verify.v1", receiverRole: "v",
    eventType: "artifact-ready", businessPhase: "v-verify",
    businessTools: Object.freeze([TOOLS.verifyRead, TOOLS.verify]),
  }),
  Object.freeze({
    handlerId: "handler.no-plan.dependent.v1", receiverRole: "dependent",
    eventType: "dependency-satisfied", businessPhase: "dependent-gated-activation",
    businessTools: Object.freeze([TOOLS.dependentCheck, TOOLS.dependent]),
  }),
  Object.freeze({
    handlerId: "handler.no-plan.irrelevant.v1", receiverRole: "irrelevant",
    eventType: "artifact-ready", businessPhase: "irrelevant-never-runs",
    businessTools: Object.freeze([TOOLS.reviewRead, TOOLS.review]),
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
  const execution = coordinator.getTurnExecution(executionId, principal(actor));
  return coordinator.promoteTurnExecutionWithGitEvidenceRecord(executionId, {
    stage,
    payload,
    expectedEvidenceChainRevision: revision,
    expectedEvidenceChainHead: head,
    expectedRevision: execution.revision,
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
  ownedJournalPaths, businessTools = [TOOLS.implementation],
  publicationOrdinal = 0, onBusinessToolCall = null, prompt = null,
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
    promptDigest: sha256Digest(prompt ?? `Implement and publish source ${event.messageId}.`),
    allowedTools: businessTools.map(({ name }) => name),
  }, 0, actorPrincipal);
  const filename = path.join(recoveryDirectory, `${executionId}.json`);
  ownedJournalPaths.add(filename);
  const turn = await runtime.runTurn({
    role: "a",
    phase: "user-kickoff",
    cwd,
    ref,
    prompt: prompt ?? `Implement and publish source ${event.messageId}.`,
    scenarioId: "coordinator_driven_no_plan",
    allowedToolNames: businessTools.map(({ name }) => name),
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
      if (selected?.tool !== businessTools[selected?.ordinal]?.name) {
        throw scenarioError("threadmesh_user_kickoff_tool_sequence_mismatch");
      }
      execution = coordinator.recordModelSelectedTurnToolAction(executionId, {
        turnId: selected.turnId, callId: selected.callId, ordinal: selected.ordinal,
        name: selected.tool, arguments: selected.arguments,
        expectedRevision: execution.revision,
        expectedActionHeadDigest: execution.actionHeadDigest,
      }, actorPrincipal);
    },
    async onToolCall(selected) {
      return onBusinessToolCall
        ? onBusinessToolCall(selected)
        : { commitSha: args.commitSha, published: true };
    },
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
    actionOrdinal: publicationOrdinal,
    expectedTool: TOOLS.implementation.name,
    event,
    expectedMaterial: {
      commitSha: execution.actions[publicationOrdinal] === undefined
        ? args.commitSha
        : JSON.parse(execution.actions[publicationOrdinal].argsJson).commitSha,
    },
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
  runtime: providedRuntime = null,
  signal = null,
  realEffects = false,
  sourceRoot = null,
  validatedBaseSha = null,
  temporaryParent = null,
  injectPriorRelevant = false,
  injectFinalizationFailure = false,
  injectPreverifiedTamper = null,
  injectSelectionBindingMismatch = false,
  injectRealReviewFindingTamper = false,
}) {
  const preverifiedTamperVariants = new Set([
    "state-only", "missing-receipt", "missing-satisfaction",
    "missing-finalization", "wrong-digest",
  ]);
  if (!path.isAbsolute(artifactsDirectory ?? "") ||
      (providedRuntime !== null && (
        typeof providedRuntime?.createRole !== "function" ||
        typeof providedRuntime?.runTurn !== "function" ||
        typeof providedRuntime?.runReceiverDecisionTurn !== "function" ||
        typeof providedRuntime?.runAdmittedToolTurn !== "function" ||
        typeof providedRuntime?.deleteRole !== "function"
      )) ||
      typeof realEffects !== "boolean" ||
      (realEffects && (
        !path.isAbsolute(sourceRoot ?? "") ||
        !/^[a-f0-9]{40}$/u.test(validatedBaseSha ?? "") ||
        !path.isAbsolute(temporaryParent ?? "")
      )) ||
      (signal !== null && (
        typeof signal !== "object" || typeof signal.aborted !== "boolean"
      )) ||
      typeof injectPriorRelevant !== "boolean" ||
      typeof injectFinalizationFailure !== "boolean" ||
      typeof injectSelectionBindingMismatch !== "boolean" ||
      typeof injectRealReviewFindingTamper !== "boolean" ||
      (injectRealReviewFindingTamper && !realEffects) ||
      (injectPreverifiedTamper !== null &&
        !preverifiedTamperVariants.has(injectPreverifiedTamper))) {
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
  let gitFixture = null;
  let verifierService = null;
  let verifierServiceClosed = !realEffects;
  let gitFixtureCleanup = Object.freeze({ complete: !realEffects });
  let privateKey = null;
  let trustAnchor;
  let coordinator = null;
  let coordinatorClockSequence = 0;
  try {
    if (realEffects) {
      gitFixture = createBoundedGitLoopFixture({
        sourceRoot,
        validatedBaseSha,
        temporaryParent,
        seedFiles: { [REAL_EFFECT_RESOURCE]: REAL_EFFECT_SEED },
      });
      verifierService = await startIndependentGitVerifierService();
      trustAnchor = verifierService.trustAnchor;
    } else {
      const signing = generateKeyPairSync("ed25519");
      privateKey = signing.privateKey;
      trustAnchor = {
        keyId: "threadmesh://independent-git-verifier/key/ephemeral",
        algorithm: "ed25519",
        actorId: "threadmesh-independent-git-verifier",
        trustDomain: "threadmesh://independent-git-verifier",
        policyId: "threadmesh://independent-git-verifier/policy/1",
        publicKeyPem: signing.publicKey.export({ type: "spki", format: "pem" }),
      };
    }
    coordinator = new SqliteCoordinator({
      filename: databasePath,
      clock: () => NOW + coordinatorClockSequence++,
      verificationTrustAnchors: [trustAnchor],
    });
  } catch (error) {
    try { coordinator?.close(); } catch {}
    try {
      if (verifierService) {
        await verifierService.close();
        verifierServiceClosed = true;
      }
    } catch {}
    gitFixtureCleanup = gitFixture?.cleanup() ?? gitFixtureCleanup;
    try { fs.rmSync(scenarioRunRoot, { recursive: true }); } catch {}
    error.cleanup = {
      complete: verifierServiceClosed && gitFixtureCleanup.complete === true &&
        !fs.existsSync(scenarioRunRoot),
      roles: [],
      verifierServiceClosed,
      gitFixture: gitFixtureCleanup,
      runRootRemoved: !fs.existsSync(scenarioRunRoot),
      coordinatorRemoved: !fs.existsSync(databasePath),
      remainingJournalCount: 0,
    };
    throw error;
  }
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
  let implementationSha = realEffects ? null : sha("3");
  let fixSha = realEffects ? null : sha("5");
  let finding = realEffects ? null : Object.freeze({
    resourcePath: "artifact.txt",
    counterexample: "BAD_COUNTEREXAMPLE",
  });
  let findingDigest = finding === null ? null : independentGitFindingDigest(finding);
  let implementationEvidence = null;
  let fixEvidence = null;
  let reviewerCheckout = null;
  let verifierCheckout = null;
  const artifactEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_artifact_0001",
    sender: actors.a,
    target: actors.r,
    relationshipId: grants.ar.relationshipId,
    content: realEffects
      ? "A bounded Git candidate is ready for detached review."
      : `Candidate ${implementationSha} is ready for exact review.`,
  });
  const reviewEvent = lifecycleEvent({
    eventType: "review-failed",
    messageId: "msg_no_plan_review_0001",
    sender: actors.r,
    target: actors.a,
    relationshipId: grants.ra.relationshipId,
    content: realEffects
      ? "A blocking finding was reported from the detached candidate review."
      : "Blocking finding: the bounded candidate returns 41, not 42.",
  });
  const fixEvent = lifecycleEvent({
    eventType: "artifact-ready",
    messageId: "msg_no_plan_fix_0001",
    sender: actors.a,
    target: actors.v,
    relationshipId: grants.av.relationshipId,
    content: realEffects
      ? "A direct-descendant Git fix is ready for independent verification."
      : `Review fix ${fixSha} is ready for independent verification.`,
  });
  const verifiedEvent = {
    ...lifecycleEvent({
      eventType: "dependency-satisfied",
      messageId: fixEvent.messageId,
      sender: actors.v,
      target: actors.dependent,
      relationshipId: grants.vd.relationshipId,
      content: realEffects
        ? "The exact Git chain passed the preconfigured process-isolated verifier."
        : "The exact signed evidence chain passed trusted fixture verification.",
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
  const kickoffArgs = {
    sourceEventId: artifactEvent.messageId,
    event: actionEventBody(artifactEvent),
    commitSha: implementationSha,
  };
  const copyShaTool = (base, staticArguments) => Object.freeze({
    ...base,
    description: `${base.description} Copy the exact commitSha returned by the preceding commit tool.`,
    inputSchema: Object.freeze({
      type: "object",
      additionalProperties: false,
      properties: Object.freeze({
        ...Object.fromEntries(Object.entries(staticArguments).map(
          ([key, value]) => [key, Object.freeze({ const: value })],
        )),
        commitSha: Object.freeze({ type: "string", pattern: "^[a-f0-9]{40}$" }),
      }),
      required: Object.freeze([...Object.keys(staticArguments), "commitSha"]),
    }),
  });
  const realReviewFindingDigest = independentGitFindingDigest({
    resourcePath: REAL_EFFECT_RESOURCE,
    counterexample: REAL_EFFECT_IMPLEMENTATION.trim(),
  });
  const realReviewPublish = Object.freeze({
    ...TOOLS.review,
    description: `${TOOLS.review.description} Use only the artifact content returned by the preceding read tool. Report its exact resourcePath and counterexample with a bounded reason; use the coordinator-bound findingDigest constant from this schema.`,
    inputSchema: Object.freeze({
      type: "object", additionalProperties: false,
      properties: Object.freeze({
        sourceEventId: Object.freeze({ const: artifactEvent.messageId }),
        event: Object.freeze({ const: actionEventBody(reviewEvent) }),
        resourcePath: Object.freeze({ type: "string", minLength: 1, maxLength: 200 }),
        counterexample: Object.freeze({ type: "string", minLength: 1, maxLength: 256 }),
        reason: Object.freeze({ type: "string", minLength: 1, maxLength: 1000 }),
        findingDigest: Object.freeze({ const: realReviewFindingDigest }),
      }),
      required: Object.freeze([
        "sourceEventId", "event", "resourcePath", "counterexample", "reason",
        "findingDigest",
      ]),
    }),
  });
  const realCommitCandidate = Object.freeze({
    ...TOOLS.implementationCommit,
    inputSchema: Object.freeze({
      type: "object", additionalProperties: false,
      properties: Object.freeze({
        phase: Object.freeze({ enum: Object.freeze(["implementation", "fix"]) }),
        content: Object.freeze({
          enum: Object.freeze([REAL_EFFECT_IMPLEMENTATION, REAL_EFFECT_FIX]),
        }),
        sourceEventId: Object.freeze({ type: "string", minLength: 1, maxLength: 512 }),
      }),
      required: Object.freeze(["phase", "content", "sourceEventId"]),
    }),
  });
  const scenarioTools = Object.freeze({
    implementationCommit: realEffects ? realCommitCandidate : null,
    implementation: realEffects
      ? copyShaTool(TOOLS.implementation, {
        sourceEventId: artifactEvent.messageId,
        event: actionEventBody(artifactEvent),
      })
      : exactArgumentsTool(TOOLS.implementation, kickoffArgs),
    rDecision: exactDecisionTool(artifactEvent.messageId),
    reviewRead: exactArgumentsTool(TOOLS.reviewRead, {
      sourceEventId: artifactEvent.messageId,
    }),
    reviewReproduce: null,
    review: realEffects ? realReviewPublish : exactArgumentsTool(TOOLS.review, {
      sourceEventId: artifactEvent.messageId, event: actionEventBody(reviewEvent), findingDigest,
    }),
    aDecision: exactDecisionTool(reviewEvent.messageId),
    fixApply: realEffects
      ? realCommitCandidate
      : exactArgumentsTool(TOOLS.fixApply, { sourceEventId: reviewEvent.messageId }),
    fix: realEffects
      ? copyShaTool(TOOLS.fix, {
        sourceEventId: reviewEvent.messageId,
        event: actionEventBody(fixEvent),
      })
      : exactArgumentsTool(TOOLS.fix, {
        sourceEventId: reviewEvent.messageId, event: actionEventBody(fixEvent), commitSha: fixSha,
      }),
    vDecision: exactDecisionTool(fixEvent.messageId),
    verifyRead: exactArgumentsTool(TOOLS.verifyRead, {
      sourceEventId: fixEvent.messageId,
    }),
    verify: Object.freeze({
      ...TOOLS.verify,
      description: `${TOOLS.verify.description} Use the exact event and chain fields in the schema; copy the revision and head returned by the preceding read tool.`,
      inputSchema: Object.freeze({
        type: "object",
        additionalProperties: false,
        properties: Object.freeze({
          sourceEventId: Object.freeze({ const: fixEvent.messageId }),
          event: Object.freeze({ const: actionEventBody(verifiedEvent) }),
          chainId: Object.freeze({ const: "chain_coordinator_driven_no_plan" }),
          expectedEvidenceChainRevision: Object.freeze({ type: "integer", minimum: 0 }),
          expectedEvidenceChainHead: Object.freeze({
            type: "string", pattern: "^sha256:[a-f0-9]{64}$",
          }),
        }),
        required: Object.freeze([
          "sourceEventId", "event", "chainId", "expectedEvidenceChainRevision",
          "expectedEvidenceChainHead",
        ]),
      }),
    }),
    dependentDecision: exactDecisionTool(verifiedEvent.messageId),
    dependentCheck: exactArgumentsTool(TOOLS.dependentCheck, {}),
    dependent: exactArgumentsTool(TOOLS.dependent, {}),
  });
  if (realEffects) {
    const reviewerVisibleContract = canonicalJson({
      event: actionEventBody(reviewEvent),
      tools: [scenarioTools.reviewRead, scenarioTools.review],
    });
    if ([REAL_EFFECT_RESOURCE, REAL_EFFECT_IMPLEMENTATION.trim(), REAL_EFFECT_FIX.trim()]
      .some((sealedValue) => reviewerVisibleContract.includes(sealedValue))) {
      throw scenarioError("threadmesh_real_effect_review_context_not_content_blind");
    }
  }
  const routeHandlerConfigs = Object.freeze([
    Object.freeze({ ...ROUTE_HANDLER_CONFIGS[0], businessTools: Object.freeze([
      scenarioTools.reviewRead, scenarioTools.review,
    ]) }),
    Object.freeze({ ...ROUTE_HANDLER_CONFIGS[1], businessTools: Object.freeze([
      scenarioTools.fixApply, scenarioTools.fix,
    ]) }),
    Object.freeze({ ...ROUTE_HANDLER_CONFIGS[2], businessTools: Object.freeze([
      scenarioTools.verifyRead, scenarioTools.verify,
    ]) }),
    Object.freeze({ ...ROUTE_HANDLER_CONFIGS[3], businessTools: Object.freeze([
      scenarioTools.dependentCheck, scenarioTools.dependent,
    ]) }),
    Object.freeze({ ...ROUTE_HANDLER_CONFIGS[4], businessTools: Object.freeze([
      scenarioTools.reviewRead, scenarioTools.review,
    ]) }),
  ]);

  let refs = {};
  let runtime;
  let adapter;
  let result;
  let failure;
  let failureProgress = null;
  let evidenceRevision = 0;
  let evidenceHead = null;
  let verification = null;
  let tamperedReopenRejectionCode = null;
  const verifiedActivationOrder = [];
  const cleanupRoles = [];
  const roleCwds = {};
  const roleBusinessCwds = {};
  try {
    throwIfShutdownRequested(signal);
    adapter = providedRuntime?.adapter ?? new DeterministicNoPlanCodexAdapter({
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
        if (realEffects && selectedTool === TOOLS.implementationCommit.name) {
          const fixing = knownMessage?.messageId === reviewEvent.messageId;
          return {
            text: fixing
              ? "Committed and published the exact admitted fix."
              : "Committed and published the bounded implementation.",
            toolCalls: [{
              tool: TOOLS.implementationCommit.name,
              arguments: {
                phase: fixing ? "fix" : "implementation",
                content: fixing ? REAL_EFFECT_FIX : REAL_EFFECT_IMPLEMENTATION,
                sourceEventId: knownMessage.messageId,
              },
            }, {
              tool: fixing ? TOOLS.fix.name : TOOLS.implementation.name,
              arguments: {},
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
        if (selectedTool === TOOLS.reviewRead.name) {
          if (realEffects) return {
            text: "Read the detached artifact and reported the exact counterexample.",
            toolCalls: [{
              tool: TOOLS.reviewRead.name,
              arguments: { sourceEventId: knownMessage.messageId },
            }, {
              tool: TOOLS.review.name,
              arguments: {},
            }],
          };
          return { text: "Artifact inspected and blocking finding published.", toolCalls: [{
            tool: TOOLS.reviewRead.name,
            arguments: { sourceEventId: knownMessage.messageId },
          }, {
            tool: TOOLS.review.name,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(reviewEvent), findingDigest,
            },
          }] };
        }
        if (selectedTool === TOOLS.fixApply.name) {
          return { text: "Same implementer task applied and published the fix.", toolCalls: [{
            tool: TOOLS.fixApply.name,
            arguments: { sourceEventId: knownMessage.messageId },
          }, {
            tool: TOOLS.fix.name,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(fixEvent), commitSha: fixSha,
            },
          }] };
        }
        if (selectedTool === TOOLS.verifyRead.name) {
          return { text: "Evidence inspected and signed verification selected.", toolCalls: [{
            tool: TOOLS.verifyRead.name,
            arguments: { sourceEventId: knownMessage.messageId },
          }, {
            tool: TOOLS.verify.name,
            arguments: {
              sourceEventId: knownMessage.messageId,
              event: actionEventBody(verifiedEvent),
              chainId: "chain_coordinator_driven_no_plan",
              expectedEvidenceChainRevision: evidenceRevision,
              expectedEvidenceChainHead: evidenceHead,
            },
          }] };
        }
        if (selectedTool === TOOLS.dependentCheck.name) {
          return { text: "Finalization inspected before dependency activation.", toolCalls: [{
            tool: TOOLS.dependentCheck.name, arguments: {},
          }, {
            tool: TOOLS.dependent.name, arguments: {},
          }] };
        }
        return { text: "No relevant action.", toolCalls: [] };
      },
      resolveToolArguments({ canonicalInput, tool: selectedTool, arguments: value,
        priorOutputs }) {
        if (!realEffects || Object.keys(value).length > 0) return value;
        const input = JSON.parse(canonicalInput);
        const knownMessage = [artifactEvent, reviewEvent, fixEvent, verifiedEvent]
          .find(({ messageId }) => input.prompt.includes(messageId));
        if (selectedTool === TOOLS.implementation.name) return {
          sourceEventId: artifactEvent.messageId,
          event: actionEventBody(artifactEvent),
          commitSha: priorOutputs[0].subjectSha,
        };
        if (selectedTool === TOOLS.fix.name) return {
          sourceEventId: reviewEvent.messageId,
          event: actionEventBody(fixEvent),
          commitSha: priorOutputs[0].subjectSha,
        };
        if (selectedTool === TOOLS.review.name) {
          const read = priorOutputs[0];
          return {
            sourceEventId: knownMessage.messageId,
            event: actionEventBody(reviewEvent),
            resourcePath: read.resourcePath,
            counterexample: injectRealReviewFindingTamper
              ? "WRONG_COUNTEREXAMPLE" : read.content.trim(),
            reason: "The detached artifact contains the exact blocking counterexample.",
            findingDigest: realReviewFindingDigest,
          };
        }
        return value;
      },
    });
    runtime = providedRuntime ?? new CodexLiveAgentRuntime({ command: "/fake/codex", adapter });
    roleCwds.a = realEffects ? gitFixture.implementerWorktree : artifactsDirectory;
    roleBusinessCwds.a = roleCwds.a;
    refs.a = await runtime.createRole({
      role: "a", cwd: roleCwds.a,
      tools: [
        ...(realEffects ? [scenarioTools.implementationCommit] : []),
        scenarioTools.implementation, scenarioTools.aDecision,
        ...(!realEffects ? [scenarioTools.fixApply] : []), scenarioTools.fix,
      ],
      phaseTools: {
        "user-kickoff": [
          ...(realEffects ? [scenarioTools.implementationCommit] : []),
          scenarioTools.implementation,
        ],
        "receiver-decision": [scenarioTools.aDecision],
        "same-a-fix": [scenarioTools.fixApply, scenarioTools.fix],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "same-a-fix": "admitted-tool",
      },
      instructions: "Use only the current coordinator-admitted dynamic tool.",
      scenarioId: "coordinator_driven_no_plan",
    });
    throwIfShutdownRequested(signal);
    roleCwds.r = realEffects ? gitFixture.root : artifactsDirectory;
    roleBusinessCwds.r = realEffects
      ? path.join(gitFixture.root, "reviewer") : artifactsDirectory;
    refs.r = await runtime.createRole({
      role: "r", cwd: roleCwds.r,
      tools: [
        scenarioTools.rDecision, scenarioTools.reviewRead, scenarioTools.review,
      ],
      phaseTools: {
        "receiver-decision": [scenarioTools.rDecision],
        "r-review": [
          scenarioTools.reviewRead, scenarioTools.review,
        ],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "r-review": "admitted-tool",
      },
      instructions: realEffects
        ? "Review only coordinator-admitted context. In the admitted review turn, call every offered tool exactly once and in order: read the detached-checkout artifact, then report the exact resourcePath and counterexample found in the returned content. Use the coordinator-bound findingDigest constant from the report tool schema; do not derive or copy it from tool output. Do not stop after the read result."
        : "Review only coordinator-admitted context.",
      scenarioId: "coordinator_driven_no_plan",
    });
    throwIfShutdownRequested(signal);
    roleCwds.v = realEffects ? gitFixture.root : artifactsDirectory;
    roleBusinessCwds.v = realEffects
      ? path.join(gitFixture.root, "verifier") : artifactsDirectory;
    refs.v = await runtime.createRole({
      role: "v", cwd: roleCwds.v,
      tools: [scenarioTools.vDecision, scenarioTools.verifyRead, scenarioTools.verify],
      phaseTools: {
        "receiver-decision": [scenarioTools.vDecision],
        "v-verify": [scenarioTools.verifyRead, scenarioTools.verify],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision", "v-verify": "admitted-tool",
      },
      instructions: "Verify only the exact coordinator-bound evidence chain.",
      scenarioId: "coordinator_driven_no_plan",
    });
    throwIfShutdownRequested(signal);
    roleCwds.dependent = realEffects ? gitFixture.root : artifactsDirectory;
    roleBusinessCwds.dependent = roleCwds.dependent;
    refs.dependent = await runtime.createRole({
      role: "dependent", cwd: roleCwds.dependent,
      tools: [
        scenarioTools.dependentDecision, scenarioTools.dependentCheck, scenarioTools.dependent,
      ],
      phaseTools: {
        "receiver-decision": [scenarioTools.dependentDecision],
        "dependent-gated-activation": [scenarioTools.dependentCheck, scenarioTools.dependent],
      },
      protectedPhases: {
        "receiver-decision": "receiver-decision",
        "dependent-gated-activation": "admitted-tool",
      },
      instructions: "Request activation; trust only coordinator finalization state.",
      scenarioId: "coordinator_driven_no_plan",
    });
    throwIfShutdownRequested(signal);
    roleCwds.irrelevant = realEffects ? gitFixture.root : artifactsDirectory;
    roleBusinessCwds.irrelevant = roleCwds.irrelevant;
    refs.irrelevant = await runtime.createRole({
      role: "irrelevant", cwd: roleCwds.irrelevant,
      tools: [scenarioTools.rDecision, scenarioTools.reviewRead, scenarioTools.review],
      instructions: "Remain idle unless coordinator attention is relevant.",
      scenarioId: "coordinator_driven_no_plan",
    });
    throwIfShutdownRequested(signal);
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
      validatedBaseSha: realEffects ? validatedBaseSha : sha("1"),
      fixtureSeedSha: realEffects ? gitFixture.seedSha : sha("2"),
      fixtureDefinitionDigest: realEffects
        ? gitFixture.fixtureDefinitionDigest : digest("fixture-definition"),
      trustedTestBlobDigest: realEffects
        ? sha256Digest(fs.readFileSync(
          path.join(sourceRoot, ...INDEPENDENT_GIT_VERIFIER_TEST.resourcePath.split("/")),
          "utf8",
        ))
        : digest("trusted-test"),
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
        commitSha: implementationSha,
        parentSha: realEffects ? null : sha("2"),
        treeSha: realEffects ? null : sha("4"),
        diffDigest: realEffects ? null : digest("implementation-diff"),
        testEvidenceDigest: realEffects ? null : digest("implementation-test"),
      },
      "review-failed": {
        actor: actors.r, turnId: null, toolCallDigest: null,
        implementationSha, findingDigest,
        reproductionEvidenceDigest: realEffects ? null : digest("reproduction"),
      },
      fix: {
        actor: actors.a, turnId: null, toolCallDigest: null,
        commitSha: fixSha, parentSha: implementationSha,
        treeSha: realEffects ? null : sha("6"),
        diffDigest: realEffects ? null : digest("fix-diff"),
        resolvesFindingDigest: findingDigest,
        testEvidenceDigest: realEffects ? null : digest("fix-test"),
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
    const recordTamperedReopen = () => {
      let reopened = null;
      try {
        reopened = new SqliteCoordinator({
          filename: databasePath,
          clock: () => NOW,
          verificationTrustAnchors: [trustAnchor],
        });
      } catch (error) {
        tamperedReopenRejectionCode = error.code ?? "unknown_reopen_rejection";
      } finally {
        reopened?.close();
      }
      if (!tamperedReopenRejectionCode) {
        throw new Error("threadmesh_preverified_tamper_reopen_accepted");
      }
    };
    const pump = createAutonomousEventPump({
      coordinator,
      runtime,
      signal,
      scenarioId: "coordinator_driven_no_plan",
      chainId: "chain_coordinator_driven_no_plan",
      recoveryDirectory: journalDirectory,
      maxEvents: 5,
    });
    pump.registerReceiver({
      receiver: actors.r,
      principal: principal(actors.r),
      role: "r",
      cwd: roleBusinessCwds.r,
      ref: refs.r,
      routes: [{
        handlerId: routeHandlerConfigs[0].handlerId,
        eventType: "artifact-ready",
        subscribedEventTypes: ["artifact-ready"],
        grant: grants.ar,
        sourceTask: actors.a,
        targetTask: { ...actors.r, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "r-review",
        businessTools: routeHandlerConfigs[0].businessTools,
        async onBusinessToolCall({ tool: selectedTool, arguments: value }) {
          if (selectedTool === TOOLS.reviewRead.name) {
            if (!realEffects) return { artifactDigest: digest("admitted-review-artifact") };
            const checkout = gitFixture.verifyReviewerCheckout({ implementationSha });
            const content = fs.readFileSync(
              path.join(reviewerCheckout.worktree, REAL_EFFECT_RESOURCE), "utf8",
            );
            const candidate = {
              resourcePath: REAL_EFFECT_RESOURCE,
              counterexample: content.trim(),
            };
            return {
              resourcePath: REAL_EFFECT_RESOURCE,
              content,
              commitSha: checkout.subjectSha,
            };
          }
          if (realEffects && selectedTool === TOOLS.review.name) {
            const checkout = gitFixture.verifyReviewerCheckout({ implementationSha });
            const content = fs.readFileSync(
              path.join(reviewerCheckout.worktree, REAL_EFFECT_RESOURCE), "utf8",
            );
            const candidate = {
              resourcePath: value?.resourcePath,
              counterexample: value?.counterexample,
            };
            const candidateDigest = independentGitFindingDigest(candidate);
            if (
              value?.sourceEventId !== artifactEvent.messageId ||
              candidate.resourcePath !== REAL_EFFECT_RESOURCE ||
              candidate.counterexample !== content.trim() ||
              !content.includes(candidate.counterexample) ||
              checkout.subjectSha !== implementationSha ||
              typeof value?.reason !== "string" || value.reason.length < 1 ||
              value?.findingDigest !== candidateDigest
            ) throw scenarioError("threadmesh_real_effect_review_finding_not_reproduced");
            finding = Object.freeze(candidate);
            findingDigest = candidateDigest;
            payloads["review-failed"].findingDigest = findingDigest;
            payloads["review-failed"].reproductionEvidenceDigest = sha256Digest({
              commitSha: implementationSha,
              resourcePath: candidate.resourcePath,
              contentDigest: sha256Digest(content),
              findingDigest,
            });
            return { findingDigest, reproducible: true, implementationSha };
          }
          return { findingDigest, blocking: true, implementationSha };
        },
        async onLifecyclePublication({ activation }) {
          rActivation = activation;
          const execution = coordinator.getTurnExecution(
            activation.businessExecutionId, principal(actors.r),
          );
          const publicationOrdinal = 1;
          payloads["review-failed"].turnId = execution.actions[publicationOrdinal].turnId;
          payloads["review-failed"].toolCallDigest =
            execution.actions[publicationOrdinal].actionDigest;
          const promoted = promoteStage(
            coordinator, activation.businessExecutionId, "review-failed",
            payloads["review-failed"], evidenceRevision, evidenceHead, actors.r,
          );
          evidenceRevision = promoted.evidenceState.recordCount;
          evidenceHead = promoted.evidenceState.headDigest;
          coordinator.publishLifecycleFromCompletedAction(promoted.executionId, {
            actionOrdinal: publicationOrdinal,
            expectedTool: TOOLS.review.name,
            event: reviewEvent,
            expectedMaterial: { findingDigest },
            ...(realEffects ? { expectedActionEvidence: {
              resourcePath: finding.resourcePath,
              counterexample: finding.counterexample,
              reason: JSON.parse(execution.actions[publicationOrdinal].argsJson).reason,
            } } : {}),
          }, principal(actors.r));
          promoteAttention(coordinator, activation, promoted, actors.r);
        },
      }],
    });
    pump.registerReceiver({
      receiver: actors.a,
      principal: principal(actors.a),
      role: "a",
      cwd: roleBusinessCwds.a,
      ref: refs.a,
      routes: [{
        handlerId: routeHandlerConfigs[1].handlerId,
        eventType: "review-failed",
        subscribedEventTypes: ["review-failed"],
        grant: grants.ra,
        sourceTask: actors.r,
        targetTask: { ...actors.a, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "same-a-fix",
        businessTools: routeHandlerConfigs[1].businessTools,
        async onBusinessToolCall({ tool: selectedTool, arguments: value }) {
          if (selectedTool === (realEffects
            ? TOOLS.implementationCommit.name : TOOLS.fixApply.name)) {
            if (realEffects) {
              if (
                value?.phase !== "fix" || value?.content !== REAL_EFFECT_FIX ||
                value?.sourceEventId !== reviewEvent.messageId || !implementationSha
              ) {
                throw scenarioError("threadmesh_real_effect_fix_invalid");
              }
              gitFixture.writeImplementerFile(
                REAL_EFFECT_RESOURCE, value.content, { expectedHead: implementationSha },
              );
              fixEvidence = gitFixture.commitFix({ expectedParent: implementationSha });
              fixSha = fixEvidence.subjectSha;
              verifierCheckout = gitFixture.createVerifierCheckout({ fixSha });
              return fixEvidence;
            }
            return { appliedFindingDigest: findingDigest };
          }
          if (realEffects && value?.commitSha !== fixSha) {
            throw scenarioError("threadmesh_real_effect_fix_publication_invalid");
          }
          return { commitSha: fixSha, parentSha: implementationSha };
        },
        async onLifecyclePublication({ activation }) {
          sameAActivation = activation;
          const execution = coordinator.getTurnExecution(
            activation.businessExecutionId, principal(actors.a),
          );
          if (realEffects) {
            Object.assign(payloads.fix, {
              commitSha: fixEvidence.subjectSha,
              parentSha: fixEvidence.parentSha,
              treeSha: fixEvidence.treeSha,
              diffDigest: fixEvidence.diffDigest,
              resolvesFindingDigest: findingDigest,
              testEvidenceDigest: sha256Digest({
                fixedResourceDigest: sha256Digest(REAL_EFFECT_FIX),
              }),
            });
          }
          payloads.fix.turnId = execution.actions[1].turnId;
          payloads.fix.toolCallDigest = execution.actions[1].actionDigest;
          const promoted = promoteStage(
            coordinator, activation.businessExecutionId, "fix", payloads.fix,
            evidenceRevision, evidenceHead, actors.a,
          );
          evidenceRevision = promoted.evidenceState.recordCount;
          evidenceHead = promoted.evidenceState.headDigest;
          coordinator.publishLifecycleFromCompletedAction(promoted.executionId, {
            actionOrdinal: 1,
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
      cwd: roleBusinessCwds.v,
      ref: refs.v,
      routes: [{
        handlerId: routeHandlerConfigs[2].handlerId,
        eventType: "artifact-ready",
        subscribedEventTypes: ["artifact-ready"],
        grant: grants.av,
        sourceTask: actors.a,
        targetTask: { ...actors.v, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "v-verify",
        businessTools: routeHandlerConfigs[2].businessTools,
        async onBusinessToolCall({ tool: selectedTool }) {
          if (selectedTool === TOOLS.verifyRead.name) {
            return { evidenceHead, evidenceRevision };
          }
          verifiedActivationOrder.push("v-verification-tool-selected");
          if (realEffects) {
            gitFixture.verifyVerifierCheckout({ fixSha });
            const request = {
              repoPath: gitFixture.bareRepository,
              chain: {
                chainId: requirement.chainId,
                requirementDigest: requirement.requirementDigest,
                validatedBaseSha: requirement.validatedBaseSha,
                fixtureSeedSha: requirement.fixtureSeedSha,
                fixtureDefinitionDigest: requirement.fixtureDefinitionDigest,
              },
              implementation: {
                sha: implementationEvidence.subjectSha,
                treeSha: implementationEvidence.treeSha,
                diffDigest: implementationEvidence.diffDigest,
              },
              fix: {
                sha: fixEvidence.subjectSha,
                treeSha: fixEvidence.treeSha,
                diffDigest: fixEvidence.diffDigest,
              },
              finding: { ...finding, digest: findingDigest },
              trustedTest: {
                resourcePath: INDEPENDENT_GIT_VERIFIER_TEST.resourcePath,
                blobDigest: requirement.trustedTestBlobDigest,
              },
              subject: {
                messageId: verifiedEvent.messageId,
                senderIncarnationId: actors.v.incarnationId,
                receiver: taskRef(actors.dependent),
              },
            };
            const response = await verifierService.verify(request);
            verification = { request, response, expectedTrustAnchor: trustAnchor };
          } else {
            verification = createVerification({
              requirement, payloads, verifier: actors.v, dependent: actors.dependent,
              trustAnchor, privateKey,
            });
          }
          return verification;
        },
        async onLifecyclePublication({ activation }) {
          verifierActivation = activation;
          coordinator.publishLifecycleFromCompletedAction(activation.businessExecutionId, {
            actionOrdinal: 1,
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
      cwd: roleBusinessCwds.dependent,
      ref: refs.dependent,
      routes: [{
        handlerId: routeHandlerConfigs[3].handlerId,
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
        businessTools: routeHandlerConfigs[3].businessTools,
        async afterAdmissionPrepared() {
          verifiedActivationOrder.push("dependent-admission-prepared");
          if (injectPreverifiedTamper === "state-only") {
            coordinator.db.prepare(
              `UPDATE dispositions SET revision = 3, decision_state = 'accepted',
                 delivery_state = 'adapter-submitted', outcome_state = 'externally-verified'
               WHERE sender_incarnation_id = ? AND message_id = ?`,
            ).run(actors.v.incarnationId, verifiedEvent.messageId);
            coordinator.db.prepare(
              `UPDATE audit_events SET revision = 3
               WHERE sender_incarnation_id = ? AND message_id = ?
                 AND event_type = 'receiver-decided'`,
            ).run(actors.v.incarnationId, verifiedEvent.messageId);
            recordTamperedReopen();
            return;
          }
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
          const action = verifierExecution.actions[1];
          if (action.resultDigest !== gitEvidenceVerificationResultDigest(verification)) {
            throw new Error("threadmesh_verifier_result_digest_mismatch");
          }
          finalized = coordinator.finalizeGitEvidenceDependency(
            verifierExecution.executionId,
            {
              actionOrdinal: 1,
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
          if (injectPreverifiedTamper) {
            if (injectPreverifiedTamper === "missing-receipt") {
              coordinator.db.prepare(
                `DELETE FROM adapter_submissions
                 WHERE sender_incarnation_id = ? AND message_id = ?`,
              ).run(actors.v.incarnationId, verifiedEvent.messageId);
            } else if (injectPreverifiedTamper === "missing-satisfaction") {
              coordinator.db.pragma("foreign_keys = OFF");
              coordinator.db.prepare(
                "DELETE FROM dependency_satisfactions WHERE dependency_id = ?",
              ).run("dependency_no_plan_verified");
              coordinator.db.pragma("foreign_keys = ON");
            } else if (injectPreverifiedTamper === "missing-finalization") {
              coordinator.db.prepare(
                `DELETE FROM git_evidence_dependency_finalizations
                 WHERE dependency_id = ?`,
              ).run("dependency_no_plan_verified");
            } else if (injectPreverifiedTamper === "wrong-digest") {
              coordinator.db.prepare(
                `UPDATE dependency_satisfactions SET disposition_digest = ?
                 WHERE dependency_id = ?`,
              ).run(
                digest("tampered-preverified-disposition"),
                "dependency_no_plan_verified",
              );
            }
            recordTamperedReopen();
            return;
          }
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
        async onBusinessToolCall({ tool: selectedTool }) {
          const edge = coordinator.getDependencyEdge(
            "dependency_no_plan_verified", principal(actors.dependent),
          );
          const task = coordinator.getTask(taskRef(actors.dependent), owner);
          if (edge.version !== 1 || edge.status !== "satisfied" || task.state !== "ready") {
            throw new Error("threadmesh_dependent_pre_business_gate_unsatisfied");
          }
          if (selectedTool === TOOLS.dependentCheck.name) {
            return { edgeStatus: edge.status, taskState: task.state };
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
      cwd: roleBusinessCwds.irrelevant,
      ref: refs.irrelevant,
      routes: [{
        handlerId: routeHandlerConfigs[4].handlerId,
        eventType: "artifact-ready",
        subscribedEventTypes: ["review-failed"],
        grant: grants.ai,
        sourceTask: actors.a,
        targetTask: { ...actors.irrelevant, objectiveVersion: 1 },
        now: NOW,
        businessPhase: "irrelevant-never-runs",
        businessTools: routeHandlerConfigs[4].businessTools,
        async onBusinessToolCall() { throw new Error("irrelevant business turn ran"); },
        async onLifecyclePublication() { throw new Error("irrelevant publication ran"); },
      }],
    });

    const kickoff = await runKickoff({
      coordinator, runtime, actor: actors.a, ref: refs.a,
      event: artifactEvent, args: kickoffArgs,
      cwd: roleBusinessCwds.a,
      recoveryDirectory: journalDirectory,
      ownedJournalPaths,
      businessTools: realEffects
        ? [scenarioTools.implementationCommit, scenarioTools.implementation]
        : [scenarioTools.implementation],
      publicationOrdinal: realEffects ? 1 : 0,
      prompt: realEffects ? [
        `Implement and publish source ${artifactEvent.messageId}.`,
        `First call ${TOOLS.implementationCommit.name} with phase=implementation,`,
        `sourceEventId=${artifactEvent.messageId}, and the exact candidate content`,
        JSON.stringify(REAL_EFFECT_IMPLEMENTATION),
        `Then call ${TOOLS.implementation.name} and copy the returned subjectSha as commitSha.`,
      ].join(" ") : null,
      async onBusinessToolCall({ tool: selectedTool, arguments: value }) {
        if (!realEffects) return { commitSha: implementationSha, published: true };
        if (selectedTool === TOOLS.implementationCommit.name) {
          if (
            value?.phase !== "implementation" ||
            value?.content !== REAL_EFFECT_IMPLEMENTATION ||
            value?.sourceEventId !== artifactEvent.messageId
          ) {
            throw scenarioError("threadmesh_real_effect_implementation_invalid");
          }
          gitFixture.writeImplementerFile(
            REAL_EFFECT_RESOURCE, value.content, { expectedHead: gitFixture.seedSha },
          );
          implementationEvidence = gitFixture.commitImplementation({
            expectedParent: gitFixture.seedSha,
          });
          implementationSha = implementationEvidence.subjectSha;
          reviewerCheckout = gitFixture.createReviewerCheckout({ implementationSha });
          return implementationEvidence;
        }
        if (selectedTool === TOOLS.implementation.name &&
            value?.commitSha === implementationSha) {
          return { commitSha: implementationSha, published: true };
        }
        throw scenarioError("threadmesh_real_effect_implementation_publication_invalid");
      },
    });
    throwIfShutdownRequested(signal);
    const kickoffPublicationOrdinal = realEffects ? 1 : 0;
    if (realEffects) {
      Object.assign(payloads.implementation, {
        commitSha: implementationEvidence.subjectSha,
        parentSha: implementationEvidence.parentSha,
        treeSha: implementationEvidence.treeSha,
        diffDigest: implementationEvidence.diffDigest,
        testEvidenceDigest: sha256Digest({
          implementationResourceDigest: sha256Digest(REAL_EFFECT_IMPLEMENTATION),
        }),
      });
      payloads["review-failed"].implementationSha = implementationSha;
      payloads.fix.parentSha = implementationSha;
    }
    payloads.implementation.turnId = kickoff.execution.actions[kickoffPublicationOrdinal].turnId;
    payloads.implementation.toolCallDigest =
      kickoff.execution.actions[kickoffPublicationOrdinal].actionDigest;
    const promotedKickoff = promoteStage(
      coordinator, kickoff.execution.executionId, "implementation",
      payloads.implementation, evidenceRevision, evidenceHead, actors.a,
    );
    evidenceRevision = promotedKickoff.evidenceState.recordCount;
    evidenceHead = promotedKickoff.evidenceState.headDigest;
    coordinator.submit(projectLifecycleEventToEnvelope(irrelevantEvent), principal(actors.a));
    const pumpResult = await pump.runUntilIdle();
    throwIfShutdownRequested(signal);
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
    const nativeTurnBindingCount = coordinator.db.prepare(
      `SELECT COUNT(*) AS count FROM turn_execution_intents
       WHERE turn_id IS NOT NULL AND state IN ('completed-turn-bound', 'promoted')`,
    ).get().count;
    const protectedDecisionTurnCount = coordinator.db.prepare(
      `SELECT COUNT(*) AS count FROM attention_route_decision_bindings d
       JOIN turn_execution_intents i
         ON i.execution_id = d.receiver_decision_execution_id
       WHERE i.turn_id IS NOT NULL`,
    ).get().count;
    const protectedAdmissionTurnCount = coordinator.db.prepare(
      `SELECT COUNT(*) AS count FROM context_admission_turn_bindings b
       JOIN turn_execution_intents i ON i.execution_id = b.execution_id
       WHERE i.turn_id IS NOT NULL`,
    ).get().count;
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
      dependentActivation.decisionTurnEvidence?.turnId,
      dependentActivation.businessTurnEvidence?.turnId,
    ];
    const executionBindings = new Map([
      [kickoff.execution.executionId, { role: "a", phase: "user-kickoff", kind: "kickoff" }],
      [rActivation.decisionExecutionId, { role: "r", phase: "receiver-decision", kind: "decision" }],
      [rActivation.businessExecutionId, { role: "r", phase: "r-review", kind: "admission" }],
      [sameAActivation.decisionExecutionId, {
        role: "a", phase: "receiver-decision", kind: "decision",
      }],
      [sameAActivation.businessExecutionId, {
        role: "a", phase: "same-a-fix", kind: "admission",
      }],
      [verifierActivation.decisionExecutionId, {
        role: "v", phase: "receiver-decision", kind: "decision",
      }],
      [verifierActivation.businessExecutionId, {
        role: "v", phase: "v-verify", kind: "admission",
      }],
      [dependentActivation.decisionExecutionId, {
        role: "dependent", phase: "receiver-decision", kind: "decision",
      }],
      [dependentActivation.businessExecutionId, {
        role: "dependent", phase: "dependent-gated-activation", kind: "admission",
      }],
    ]);
    const nativeTurnRecords = coordinator.db.prepare(
      `SELECT i.execution_id, i.task_id, i.incarnation_id, i.state, i.turn_id,
              i.adapter_ref_digest, i.tool_allowlist_digest, i.prompt_digest, i.receipt_digest,
              i.action_count, i.action_head_digest,
              d.binding_digest AS decision_binding_digest,
              a.binding_digest AS admission_binding_digest,
              a.turn_receipt_digest AS admission_turn_receipt_digest
       FROM turn_execution_intents i
       LEFT JOIN attention_route_decision_bindings d
         ON d.receiver_decision_execution_id = i.execution_id
       LEFT JOIN context_admission_turn_bindings a
         ON a.execution_id = i.execution_id
       WHERE i.scenario_id = ?
       ORDER BY i.created_at, i.execution_id`,
    ).all("coordinator_driven_no_plan").map((row) => {
      const binding = executionBindings.get(row.execution_id);
      if (
        !binding || typeof row.turn_id !== "string" ||
        !/^sha256:[a-f0-9]{64}$/u.test(row.receipt_digest ?? "") ||
        !/^sha256:[a-f0-9]{64}$/u.test(row.action_head_digest ?? "") ||
        (binding.kind === "decision" && !row.decision_binding_digest) ||
        (binding.kind === "admission" && (
          !row.admission_binding_digest ||
          row.admission_turn_receipt_digest !== row.receipt_digest
        )) ||
        (binding.kind === "kickoff" && (
          row.decision_binding_digest !== null || row.admission_binding_digest !== null
        ))
      ) throw scenarioError("threadmesh_native_turn_manifest_invalid");
      const actions = coordinator.db.prepare(
        `SELECT ordinal, tool_name, args_digest, selection_digest, result_digest,
                result_status, previous_action_digest, action_digest
         FROM turn_tool_actions WHERE execution_id = ? ORDER BY ordinal`,
      ).all(row.execution_id).map((action) => ({
        ordinal: action.ordinal,
        tool: action.tool_name,
        argumentsDigest: action.args_digest,
        selectionDigest: action.selection_digest,
        resultDigest: action.result_digest,
        resultStatus: action.result_status,
        previousActionDigest: action.previous_action_digest,
        actionDigest: action.action_digest,
      }));
      if (actions.length !== row.action_count ||
          actions.some((action, index) =>
            action.ordinal !== index || action.resultStatus !== "completed" ||
            action.previousActionDigest !==
              (index === 0 ? null : actions[index - 1].selectionDigest) ||
            action.actionDigest !== sha256Digest({
              selectionDigest: action.selectionDigest,
              resultDigest: action.resultDigest,
              resultStatus: action.resultStatus,
            })) || actions.at(-1)?.selectionDigest !== row.action_head_digest) {
        throw scenarioError("threadmesh_native_turn_manifest_invalid");
      }
      const record = {
        sequence: 0,
        role: binding.role,
        phase: binding.phase,
        bindingKind: binding.kind,
        executionDigest: sha256Digest(row.execution_id),
        actorDigest: sha256Digest({
          taskId: row.task_id, incarnationId: row.incarnation_id,
        }),
        adapterRefDigest: row.adapter_ref_digest,
        turnDigest: sha256Digest(row.turn_id),
        toolAllowlistDigest: row.tool_allowlist_digest,
        promptDigest: row.prompt_digest,
        receiptDigest: row.receipt_digest,
        actionCount: row.action_count,
        actionHeadDigest: row.action_head_digest,
        actions,
        actionSequenceDigest: sha256Digest(actions),
        executionState: row.state,
        bindingDigest: row.decision_binding_digest ??
          row.admission_binding_digest ?? sha256Digest({
            kind: "explicit-user-kickoff", executionId: row.execution_id,
          }),
      };
      return record;
    }).map((record, index) => {
      const sequenced = { ...record, sequence: index + 1 };
      return { ...sequenced, recordDigest: sha256Digest(sequenced) };
    });
    if (nativeTurnRecords.length !== 9 || executionBindings.size !== 9 ||
        nativeTurnRecords.some(({ executionDigest }) =>
          typeof executionDigest !== "string")) {
      throw scenarioError("threadmesh_native_turn_manifest_invalid");
    }
    const selectionBindings = pump.selectionRecords.map((record) => ({
      kind: record.kind,
      handlerId: record.handlerId,
      handlerConfigDigest: record.handlerConfigDigest,
      recordDigest: record.recordDigest,
      registryDigest: record.registryDigest,
      pumpIdentityDigest: record.pumpIdentityDigest,
      routeDigest: record.routeDigest,
    }));
    if (injectSelectionBindingMismatch && selectionBindings.length > 0) {
      selectionBindings[0] = {
        ...selectionBindings[0],
        recordDigest: digest("injected-runtime-selection-binding-mismatch"),
      };
    }
    const registeredRoutes = pump.registrations.flatMap(({ routes }) => routes);
    const durableDispatchRecords = coordinator.db.prepare(
      `SELECT dispatch_id, receiver_task_id, receiver_incarnation_id,
              event_cursor, event_digest, registry_digest, pump_identity_digest,
              handler_id, route_digest, dispatch_intent_digest, state,
              selection_record_json, selection_digest
       FROM event_pump_dispatches
       ORDER BY created_at, dispatch_id`,
    ).all().map((row) => {
      const checkpoints = coordinator.db.prepare(
        `SELECT sequence, state, previous_checkpoint_digest, checkpoint_digest
         FROM event_pump_checkpoints WHERE dispatch_id = ? ORDER BY sequence`,
      ).all(row.dispatch_id);
      if (
        checkpoints.length < 2 ||
        checkpoints.some((checkpoint, index) =>
          checkpoint.sequence !== index + 1 ||
          checkpoint.previous_checkpoint_digest !==
            (index === 0 ? null : checkpoints[index - 1].checkpoint_digest)) ||
        checkpoints.at(-1).state !== row.state
      ) throw new Error("threadmesh_durable_dispatch_manifest_invalid");
      const selectionRecord = JSON.parse(row.selection_record_json);
      const registeredRoute = registeredRoutes.find(
        ({ handlerId }) => handlerId === row.handler_id,
      );
      if (
        sha256Digest(selectionRecord) !== row.selection_digest ||
        selectionRecord.handlerId !== row.handler_id ||
        selectionRecord.registryDigest !== row.registry_digest ||
        selectionRecord.pumpIdentityDigest !== row.pump_identity_digest ||
        selectionRecord.routeDigest !== row.route_digest ||
        !registeredRoute
      ) {
        throw scenarioError("threadmesh_durable_dispatch_manifest_invalid");
      }
      return {
        kind: selectionRecord.kind,
        receiverDigest: sha256Digest({
          taskId: row.receiver_task_id,
          incarnationId: row.receiver_incarnation_id,
        }),
        eventCursor: row.event_cursor,
        eventDigest: row.event_digest,
        registryDigest: row.registry_digest,
        pumpIdentityDigest: row.pump_identity_digest,
        handlerId: row.handler_id,
        handlerConfigDigest: sha256Digest(registeredRoute),
        routeDigest: row.route_digest,
        dispatchIntentDigest: row.dispatch_intent_digest,
        dispatchState: row.state,
        selectionDigest: row.selection_digest,
        checkpointCount: checkpoints.length,
        checkpointHeadDigest: checkpoints.at(-1).checkpoint_digest,
      };
    });
    const runtimeDispatchCorrelation = selectionBindings.map((record) => ({
      kind: record.kind,
      handlerId: record.handlerId,
      handlerConfigDigest: record.handlerConfigDigest,
      recordDigest: record.recordDigest,
      registryDigest: record.registryDigest,
      pumpIdentityDigest: record.pumpIdentityDigest,
      routeDigest: record.routeDigest,
    }));
    const durableDispatchCorrelation = durableDispatchRecords.map((record) => ({
      kind: record.kind,
      handlerId: record.handlerId,
      handlerConfigDigest: record.handlerConfigDigest,
      recordDigest: record.selectionDigest,
      registryDigest: record.registryDigest,
      pumpIdentityDigest: record.pumpIdentityDigest,
      routeDigest: record.routeDigest,
    }));
    if (canonicalJson(runtimeDispatchCorrelation) !==
        canonicalJson(durableDispatchCorrelation)) {
      throw scenarioError("threadmesh_durable_dispatch_runtime_correlation_invalid");
    }
    const nativeTurnManifest = {
      scope: "sqlite-turn-receipt-and-binding-records",
      recordCount: nativeTurnRecords.length,
      records: nativeTurnRecords,
      manifestDigest: sha256Digest(nativeTurnRecords),
    };
    const durableDispatchManifest = {
      scope: "sqlite-correlated-snapshot-not-global-chain",
      recordCount: durableDispatchRecords.length,
      records: durableDispatchRecords,
      manifestDigest: sha256Digest(durableDispatchRecords),
    };
    const runnerTraceRecords = [{
      sequence: 1,
      event: "explicit-user-kickoff",
      bindingDigest: nativeTurnRecords.find(
        ({ bindingKind }) => bindingKind === "kickoff",
      )?.recordDigest,
    }, {
      sequence: 2,
      event: "event-pump-run-until-idle",
      bindingDigest: durableDispatchManifest.manifestDigest,
    }].map((record) => ({ ...record, recordDigest: sha256Digest(record) }));
    const runnerTraceManifest = {
      recordCount: runnerTraceRecords.length,
      records: runnerTraceRecords,
      manifestDigest: sha256Digest(runnerTraceRecords),
    };
    const sessionRecords = Object.entries(refs).map(([role, ref]) => ({
      role,
      refDigest: sha256Digest(ref),
      worktreeDigest: sha256Digest({
        cwd: roleBusinessCwds[role] ?? roleCwds[role] ?? artifactsDirectory,
      }),
    }));
    const sessionManifest = {
      recordCount: sessionRecords.length,
      records: sessionRecords,
      sameARefDigest: sessionRecords.find(({ role }) => role === "a")?.refDigest,
      sameAWorktreeDigest: sessionRecords.find(({ role }) => role === "a")?.worktreeDigest,
      manifestDigest: sha256Digest(sessionRecords),
    };
    result = {
      state: "passed-full-functional-in-process-fixture",
      liveProductEvidence: false,
      promptBoundary: {
        initialUserKickoffPrompts: 1,
        phasePromptsSubmittedByRunner: 0,
        runnerDirectActivationDispatches: 0,
        logicalEventPumpLifecycleStarts: 1,
        pumpProtectedBoundNativeTurns:
          protectedDecisionTurnCount + protectedAdmissionTurnCount,
        boundNativeTurns: nativeTurnBindingCount,
        runnerOwnedCounterSource: "scenario-entry-and-no-dispatch-call-sites",
        boundTurnSource: "sqlite-exact-turn-and-binding-records",
      },
      deterministicPolicyOracle: providedRuntime === null,
      activationDispatchesByFixtureRunner: 0,
      eventPumpDispatches: pumpResult.dispatches,
      eventPumpSkips: pumpResult.skips,
      eventPumpSelectionRecordCount: pumpResult.selectionRecordCount,
      eventPumpSelectionHeadDigest: pumpResult.selectionHeadDigest,
      eventPumpSelectionChainValid: pumpResult.selectionChainValid,
      eventPumpSelectionChainScope: pumpResult.selectionChainScope,
      eventPumpSelectionDurable: true,
      durablePerDispatchRecordsValid: pumpResult.durablePerDispatchRecordsValid,
      durablePerDispatchRecordCount: pumpResult.durablePerDispatchRecordCount,
      eventPumpTerminalState: pumpResult.state,
      eventPumpAwaitingPromotion: pumpResult.awaitingPromotion === true,
      autonomousEventPump: true,
      autonomousEventPumpScope: "in-process-functional-fixture",
      rawPhasePromptsSubmittedByFixtureRunner: 0,
      humanRelayCount: 0,
      pollingCount: 0,
      completedRoles: ["a-kickoff", "r", "same-a", "v", "dependent"],
      pendingRoles: [],
      pendingReason: "OS-kill/long-turn lease heartbeat and a global selection chain remain outside this fixture.",
      pendingGates: [
        "cross-process-os-kill-and-long-turn-lease-heartbeat",
        "global-selection-chain",
      ],
      routeHandlerConfigs,
      executedHandlerIds: selectionBindings
        .filter(({ kind }) => kind === "coordinator-activation")
        .map(({ handlerId }) => handlerId),
      selectionBindings,
      durableDispatchManifest,
      nativeTurnManifest,
      runnerTraceManifest,
      sessionManifest,
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
        mode: realEffects
          ? "process-isolated-child-service-signed"
          : "deterministic-in-process-trusted-signing",
        externalIndependentVerifier: false,
        processIsolatedVerifier: realEffects,
        signer: realEffects
          ? "process-isolated-child-owned-ephemeral-key"
          : "fixture-owned-ephemeral-key",
        nativeVerifierSessionIndependent:
          refs.v.threadId !== refs.a.threadId && refs.v.threadId !== refs.r.threadId,
        nativeVerifierTurnIdDigest: sha256Digest(
          verifierActivation.businessTurnEvidence?.turnId,
        ),
        allLifecycleNativeTurnIdsDistinct:
          nativeTurnIds.every(Boolean) && new Set(nativeTurnIds).size === nativeTurnIds.length,
        lifecycleNativeTurnCount: nativeTurnIds.length,
        signatureVerified: true,
        trustAnchorDigest: sha256Digest(trustAnchor),
        resultDigestBound: coordinator.getTurnExecution(
          verifierActivation.businessExecutionId, principal(actors.v),
        ).actions[1].resultDigest === gitEvidenceVerificationResultDigest(verification),
      },
      gitEffects: {
        realBoundedWorktrees: realEffects,
        implementationSha: payloads.implementation.commitSha,
        fixSha: payloads.fix.commitSha,
        directDescendant: payloads.fix.parentSha === payloads.implementation.commitSha,
        reviewerDetached: realEffects ? reviewerCheckout?.evidence.detached === true : false,
        verifierDetached: realEffects ? verifierCheckout?.evidence.detached === true : false,
        fixtureDefinitionDigest: requirement.fixtureDefinitionDigest,
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
        turnCount: coordinator.db.prepare(
          "SELECT COUNT(*) AS count FROM turn_execution_intents WHERE task_id = ?",
        ).get(actors.irrelevant.taskId).count,
        durableSkip: coordinator.getAttentionCursor(
          taskRef(actors.irrelevant), principal(actors.irrelevant),
        ).cursor.commitCount === 1,
      },
      runtime: {
        productBoundary: providedRuntime === null
          ? "deterministic-fake-codex-app-server" : "injected-codex-runtime",
        adapterInvocationAuditAvailable: Array.isArray(adapter?.invocations),
        planSurfaceUsed: Array.isArray(adapter?.invocations)
          ? adapter.invocations.some((entry) =>
            ["plan", "deliverContext", "phasePrompt", "runnerPhasePrompts"]
              .some((key) => Object.hasOwn(entry, key)))
          : null,
        modelSelectedToolCalls: nativeTurnRecords.reduce(
          (count, record) => count + record.actionCount, 0,
        ),
      },
    };
  } catch (error) {
    try {
      failureProgress = captureCoordinatorDrivenFailureProgress(coordinator.db, error);
    } catch {}
    if (injectFinalizationFailure || injectPreverifiedTamper) {
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
          actors.dependent.taskId,
          JSON.stringify([TOOLS.dependentCheck.name, TOOLS.dependent.name]),
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
        ...(injectPreverifiedTamper ? { tamperedReopenRejectionCode } : {}),
      };
    }
    failure = error;
  } finally {
    if (runtime) {
      for (const [role, ref] of Object.entries(refs).reverse()) {
        try {
          cleanupRoles.push({ role, ...(await runtime.deleteRole({
            role, ref, cwd: roleCwds[role] ?? artifactsDirectory,
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
    try {
      coordinator.close();
    } catch (error) {
      failure ??= error;
    }
    if (verifierService) {
      try {
        const closed = await verifierService.close();
        verifierServiceClosed = closed?.closed === true && closed?.childExited === true;
      } catch (error) {
        failure ??= error;
      }
    }
    if (gitFixture) {
      gitFixtureCleanup = gitFixture.cleanup();
      if (gitFixtureCleanup.complete !== true && failure === undefined) {
        failure = scenarioError("threadmesh_real_effect_git_cleanup_incomplete");
      }
    }
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
      verifierServiceClosed && gitFixtureCleanup.complete === true &&
      remainingOwnedJournals.length === 0 && unknownJournalPaths.length === 0 &&
      journalRemovalFailures.length === 0 && databaseRemovalFailures.length === 0 &&
      journalDirectoryRemoved && runRootRemoved && !fs.existsSync(databasePath),
    roles: cleanupRoles,
    verifierServiceClosed,
    gitFixture: gitFixtureCleanup,
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
    if (failureProgress !== null) failure.partialProgress = failureProgress;
    if (failure.failureEvidence) failure.failureEvidence.cleanupComplete = cleanup.complete;
    throw failure;
  }
  return Object.freeze({ ...result, cleanup });
}
