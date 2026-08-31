import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { createBoundedGitLoopFixture } from "./bounded-git-loop-fixture.mjs";
import { retireM52LiveTurnJournal } from "./m5-2-live-turn-journal.mjs";

const IMPLEMENTATION_PATH = "fixture/release-gate.mjs";
const CONTRACT_PATH = "fixture/contract.txt";
const INITIAL_IMPLEMENTATION = [
  "export function releaseGate(status) {",
  "  return String(status).toLowerCase() === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}", "",
].join("\n");
const FIXED_IMPLEMENTATION = [
  "export function releaseGate(status) {",
  "  return status === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}", "",
].join("\n");
const CONTRACT = [
  "releaseGate status matching is exact and case-sensitive.",
  "Only the exact string `verified` returns READY.",
  "Every other value, including `VERIFIED`, returns BLOCKED.", "",
].join("\n");
const MISSING_GATES = Object.freeze([
  "coordinator-attention-routing",
  "receiver-owned-decisions",
  "context-admission-receipts",
  "durable-recovery-checkpoints",
  "independent-verifier-attestation",
  "dependency-finalization",
]);

const DECIDE = Object.freeze({
  type: "function", name: "threadmesh_decide_offer",
  description: "Choose whether to accept a pending ThreadMesh offer. This canary does not invoke it.",
  inputSchema: { type: "object", additionalProperties: false, required: ["decision"], properties: {
    decision: { enum: ["accepted", "deferred"] },
  } },
});
const COMMIT_CANDIDATE = Object.freeze({
  type: "function", name: "threadmesh_commit_candidate",
  description: "Write and commit the exact bounded implementation or fix candidate.",
  inputSchema: { type: "object", additionalProperties: false, required: ["phase", "content"], properties: {
    phase: { enum: ["implementation", "fix"] },
    content: { type: "string", minLength: 1, maxLength: 4096 },
  } },
});
const PUBLISH_ARTIFACT = Object.freeze({
  type: "function", name: "threadmesh_publish_artifact",
  description: "Publish the exact committed implementation for independent review.",
  inputSchema: { type: "object", additionalProperties: false, required: ["commitSha"], properties: {
    commitSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
  } },
});
const PUBLISH_DEPENDENCY = Object.freeze({
  type: "function", name: "threadmesh_publish_dependency",
  description: "Publish the exact direct-descendant fix for independent verification.",
  inputSchema: { type: "object", additionalProperties: false, required: ["commitSha"], properties: {
    commitSha: { type: "string", pattern: "^[a-f0-9]{40}$" },
  } },
});
const REVIEW_READ = Object.freeze({
  type: "function", name: "threadmesh_review_read_artifact",
  description: "Read the exact detached implementation and governing contract.",
  inputSchema: { type: "object", additionalProperties: false },
});
const REPORT_FINDING = Object.freeze({
  type: "function", name: "threadmesh_report_review_finding",
  description: "Report one independently discovered reproducible review finding.",
  inputSchema: { type: "object", additionalProperties: false,
    required: ["severity", "observedBehavior", "expectedBehavior", "reason"], properties: {
      severity: { enum: ["blocking", "non-blocking"] },
      observedBehavior: { type: "string", minLength: 1, maxLength: 500 },
      expectedBehavior: { type: "string", minLength: 1, maxLength: 500 },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    } },
});
const VERIFY = Object.freeze({
  type: "function", name: "threadmesh_verify_exact_chain",
  description: "Request exact direct-chain verification of the fixed candidate.",
  inputSchema: { type: "object", additionalProperties: false },
});

function gateError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function refDigest(ref) {
  const identifier = ref?.threadId ?? ref?.sessionId;
  if (typeof identifier !== "string" || identifier.length < 1) {
    throw gateError("threadmesh_m52_live_codex_canary_ref_invalid");
  }
  return sha256Digest({ kind: ref.kind, identifier, snapshotDigest: ref.snapshotDigest });
}

function readExact(worktree, relativePath) {
  return fs.readFileSync(path.join(worktree, ...relativePath.split("/")), "utf8");
}

function reproducibleFinding(value, implementation, contract) {
  const text = [value?.observedBehavior, value?.expectedBehavior, value?.reason]
    .join(" ").toLowerCase();
  return value?.severity === "blocking" && implementation === INITIAL_IMPLEMENTATION &&
    contract === CONTRACT && text.includes("case") && text.includes("verified") &&
    (text.includes("lower") || text.includes("uppercase") || text.includes("exact"));
}

function instructions(role) {
  if (role === "a") return "You are implementer A. Use only offered ThreadMesh tools. Commit and publish the exact bounded candidate. A later fix stays in this same task.";
  if (role === "r") return "You are reviewer R. Read the exact candidate and contract before reporting a blocking finding. The expected finding is not disclosed.";
  if (role === "v") return "You are verifier V. Request exact-chain verification and never infer success from prose.";
  return "Remain idle unless a bounded ThreadMesh decision tool is explicitly offered later.";
}

function phasePrompt(phase) {
  if (phase === "implementation") return [
    "Create the bounded initial release-gate candidate.",
    "First call threadmesh_commit_candidate with phase=implementation and exactly this content:",
    INITIAL_IMPLEMENTATION,
    "Then call threadmesh_publish_artifact with the returned subjectSha. Use no other tools.",
  ].join("\n");
  if (phase === "review") return "Independently review the detached candidate. First call threadmesh_review_read_artifact. If and only if you reproduce a blocking defect, call threadmesh_report_review_finding. The expected finding is not supplied.";
  if (phase === "fix") return [
    "A reviewer reported a reproducible case-sensitivity defect in your original candidate.",
    "Resume this same task. First call threadmesh_commit_candidate with phase=fix and exactly this content:",
    FIXED_IMPLEMENTATION,
    "Then call threadmesh_publish_dependency with the returned subjectSha. Use no other tools.",
  ].join("\n");
  return "Independently call threadmesh_verify_exact_chain once for the exact fixed candidate. Use no other tools.";
}

function exactToolSequence(turn, expected, phase) {
  if (turn?.evidence?.turnStatus !== "completed" || turn.nonThreadMeshToolCalls !== 0 ||
      canonicalJson(turn.toolCalls?.map((call) => call.tool)) !== canonicalJson(expected)) {
    throw gateError("threadmesh_m52_live_codex_canary_turn_invalid", phase);
  }
}

function makeResult({ scenarioId, state, code, data, cleanup }) {
  return {
    schemaVersion: 1, scenarioId, state, code, product: "codex",
    evidenceClass: "real-codex-product-canary", liveProductEvidence: false,
    claim: "real_product_model_tool_canary",
    counts: {
      rolesPrecreated: data.rolesPrecreated,
      postBootstrapTurns: data.postBootstrapTurns,
      modelSelectedToolCalls: data.modelSelectedToolCalls,
      commits: data.commits,
      verifierRequests: data.verifierRequests,
    },
    chain: {
      validatedBaseSha: data.validatedBaseSha,
      fixtureSeedSha: data.fixtureSeedSha,
      implementationSha: data.implementationSha,
      fixSha: data.fixSha,
      directDescendant: data.directDescendant,
      verified: data.verified,
      unlocked: false,
    },
    initiative: {
      aPublishedArtifact: data.aPublishedArtifact,
      rReportedFinding: data.rReportedFinding,
      sameAFixed: data.sameAFixed,
      vRequestedVerification: data.vRequestedVerification,
      humanRelayActions: 0,
      phasePromptsSubmittedByRunner: data.phasePromptsSubmittedByRunner,
      lifecycleHandoffsByThreadMesh: false,
    },
    identityDigests: { ...data.identityDigests },
    recovery: {
      businessTurnJournalsRetired: data.businessTurnJournalsRetired,
      admissionJournalsRetired: 0,
      reconciledWithoutResend: data.outcomeUnknownReconciliations > 0,
      duplicateNativeTurnsPrevented: data.duplicateNativeTurnsPrevented,
    },
    controls: {
      sameARef: data.sameARef,
      sameAWorktree: data.sameAWorktree,
      dependentUnlocked: false,
      dependentPostBootstrapTurns: 0,
      irrelevantPostBootstrapTurns: 0,
      allRolesDeleted: cleanup.threadsDeleted === cleanup.threadsCreated,
      fixtureRemoved: cleanup.fixtureRemoved,
      cleanupComplete: cleanup.complete,
    },
    cleanup,
    missingGates: [...MISSING_GATES],
  };
}

export async function runM52LiveCodexGate({
  runtime, sourceRoot, validatedBaseSha, artifactsDirectory,
  temporaryParent = os.tmpdir(), scenarioId, record = () => {}, turnTimeoutMs = 180_000,
} = {}) {
  if (!runtime || typeof runtime.createRole !== "function" ||
      typeof runtime.runTurn !== "function" || typeof runtime.deleteRole !== "function" ||
      !path.isAbsolute(sourceRoot ?? "") || !path.isAbsolute(artifactsDirectory ?? "") ||
      !path.isAbsolute(temporaryParent ?? "") ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(scenarioId ?? "") ||
      !/^[a-f0-9]{40}$/u.test(validatedBaseSha ?? "") ||
      !Number.isInteger(turnTimeoutMs) || turnTimeoutMs < 30_000 || turnTimeoutMs > 300_000) {
    throw gateError("threadmesh_m52_live_codex_canary_input_invalid");
  }
  const journalDirectory = path.join(artifactsDirectory, "live-turns");
  fs.mkdirSync(journalDirectory, { mode: 0o700 });
  fs.chmodSync(journalDirectory, 0o700);
  const refs = new Map();
  const roleCwds = new Map();
  const journals = new Map();
  let fixture = null;
  let reviewer = null;
  let verifier = null;
  let failure = null;
  const data = {
    rolesPrecreated: 0, postBootstrapTurns: 0, modelSelectedToolCalls: 0,
    commits: 0, verifierRequests: 0, validatedBaseSha, fixtureSeedSha: null,
    implementationSha: null, fixSha: null, directDescendant: false, verified: false,
    aPublishedArtifact: false, rReportedFinding: false, sameAFixed: false,
    vRequestedVerification: false, phasePromptsSubmittedByRunner: 0,
    businessTurnJournalsRetired: 0, outcomeUnknownReconciliations: 0,
    duplicateNativeTurnsPrevented: false, sameARef: false, sameAWorktree: false,
    finding: null, reviewRead: false,
    identityDigests: {
      implementerThread: null, resumedImplementerThread: null,
      reviewerThread: null, verifierThread: null, dependentThread: null,
      irrelevantThread: null,
    },
  };
  const cleanup = {
    attempted: false, complete: false, threadsCreated: 0, threadsDeleted: 0,
    absenceChecksPassed: 0, fixtureRemoved: false,
  };

  const retireJournal = (phase, turn) => {
    const filename = journals.get(phase);
    if (!filename || !fs.existsSync(filename)) return;
    const recordDigest = turn?.recoveryJournal?.recordDigest;
    if (typeof recordDigest !== "string") {
      throw gateError("threadmesh_m52_live_codex_canary_journal_receipt_missing", phase);
    }
    retireM52LiveTurnJournal({
      filename, expectedScenarioId: scenarioId,
      expectedExecutionId: `execution_${scenarioId}_${phase}`,
      expectedRecordDigest: recordDigest,
    });
    data.businessTurnJournalsRetired += 1;
  };

  const onToolCall = async ({ tool, arguments: value }) => {
    if (tool === COMMIT_CANDIDATE.name) {
      const implementation = value?.phase === "implementation";
      const expectedContent = implementation ? INITIAL_IMPLEMENTATION : FIXED_IMPLEMENTATION;
      const expectedParent = implementation ? fixture.seedSha : data.implementationSha;
      if (value?.content !== expectedContent || !expectedParent) {
        throw gateError("threadmesh_m52_live_codex_canary_candidate_invalid");
      }
      fixture.writeImplementerFile(IMPLEMENTATION_PATH, value.content, { expectedHead: expectedParent });
      const committed = implementation
        ? fixture.commitImplementation({ expectedParent })
        : fixture.commitFix({ expectedParent });
      if (implementation) data.implementationSha = committed.subjectSha;
      else data.fixSha = committed.subjectSha;
      data.commits += 1;
      return { phase: value.phase, subjectSha: committed.subjectSha,
        parentSha: committed.parentSha, treeSha: committed.treeSha };
    }
    if (tool === PUBLISH_ARTIFACT.name) {
      if (!data.implementationSha || value?.commitSha !== data.implementationSha) {
        throw gateError("threadmesh_m52_live_codex_canary_publish_invalid", "implementation");
      }
      data.aPublishedArtifact = true;
      return { published: true, commitSha: value.commitSha };
    }
    if (tool === REVIEW_READ.name) {
      data.reviewRead = true;
      return { implementation: readExact(reviewer.worktree, IMPLEMENTATION_PATH),
        contract: readExact(reviewer.worktree, CONTRACT_PATH), commitSha: data.implementationSha };
    }
    if (tool === REPORT_FINDING.name) {
      const implementation = readExact(reviewer.worktree, IMPLEMENTATION_PATH);
      const contract = readExact(reviewer.worktree, CONTRACT_PATH);
      if (!data.reviewRead || !reproducibleFinding(value, implementation, contract)) {
        throw gateError("threadmesh_m52_live_codex_canary_finding_invalid");
      }
      data.finding = { ...value, commitSha: data.implementationSha };
      data.rReportedFinding = true;
      return { accepted: true, findingDigest: sha256Digest(data.finding) };
    }
    if (tool === PUBLISH_DEPENDENCY.name) {
      if (!data.fixSha || value?.commitSha !== data.fixSha) {
        throw gateError("threadmesh_m52_live_codex_canary_publish_invalid", "fix");
      }
      data.sameAFixed = true;
      return { published: true, commitSha: value.commitSha };
    }
    if (tool === VERIFY.name) {
      const evidence = fixture.verifyVerifierCheckout({ fixSha: data.fixSha });
      const implementation = readExact(verifier.worktree, IMPLEMENTATION_PATH);
      if (implementation !== FIXED_IMPLEMENTATION || evidence.parentSha !== data.implementationSha) {
        throw gateError("threadmesh_m52_live_codex_canary_verification_invalid");
      }
      data.verifierRequests += 1;
      data.vRequestedVerification = true;
      data.verified = true;
      return { verified: true, commitSha: evidence.subjectSha, parentSha: evidence.parentSha,
        evidenceDigest: sha256Digest({ exactContract: true, uppercaseBlocked: true }) };
    }
    throw gateError("threadmesh_m52_live_codex_canary_tool_unsupported", tool);
  };

  const runPhase = async ({ role, phase, cwd, allowedToolNames, expectedTools }) => {
    const filename = path.join(journalDirectory, `${phase}.json`);
    journals.set(phase, filename);
    data.phasePromptsSubmittedByRunner += 1;
    const turn = await runtime.runTurn({
      role, phase, cwd, ref: refs.get(role), prompt: phasePrompt(phase), onToolCall,
      beforeToolCall: async (metadata) => record("canary.tool.selected", {
        role, phase, tool: metadata.tool, argumentsDigest: metadata.argumentsDigest,
      }),
      afterToolCall: async (metadata) => record("canary.tool.completed", {
        role, phase, tool: metadata.tool, outputDigest: metadata.outputDigest,
      }),
      scenarioId, allowedToolNames, turnTimeoutMs,
      turnRecovery: {
        filename, executionId: `execution_${scenarioId}_${phase}`,
        async onOutcomeUnknown() {
          data.outcomeUnknownReconciliations += 1;
          record("canary.turn.outcome-unknown", { role, phase });
        },
        async onTerminalReconciliation() {
          data.duplicateNativeTurnsPrevented = true;
          record("canary.turn.terminal-reconciled", { role, phase });
        },
      },
    });
    exactToolSequence(turn, expectedTools, phase);
    data.postBootstrapTurns += 1;
    data.modelSelectedToolCalls += turn.toolCalls.length;
    retireJournal(phase, turn);
    record("canary.turn.completed", { role, phase,
      turnDigest: sha256Digest(turn.evidence.turnId), toolCount: turn.toolCalls.length });
  };

  try {
    fixture = createBoundedGitLoopFixture({
      sourceRoot, validatedBaseSha, temporaryParent,
      seedFiles: {
        [IMPLEMENTATION_PATH]: "export function releaseGate() { return \"TODO\"; }\n",
        [CONTRACT_PATH]: CONTRACT,
      },
    });
    data.fixtureSeedSha = fixture.seedSha;
    const definitions = [
      ["a", fixture.implementerWorktree, [DECIDE], {
        implementation: [COMMIT_CANDIDATE, PUBLISH_ARTIFACT],
        fix: [COMMIT_CANDIDATE, PUBLISH_DEPENDENCY],
      }],
      ["r", fixture.root, [DECIDE], { review: [REVIEW_READ, REPORT_FINDING] }],
      ["v", fixture.root, [DECIDE], { verification: [VERIFY] }],
      ["dependent", fixture.root, [DECIDE], null],
      ["irrelevant", fixture.root, [DECIDE], null],
    ];
    for (const [role, cwd, tools, phaseTools] of definitions) {
      let ref;
      try {
        ref = await runtime.createRole({
          role, cwd, tools, phaseTools, instructions: instructions(role), scenarioId,
        });
      } catch (error) {
        if (error?.partialRoleCleanup?.threadCreated === true) {
          cleanup.threadsCreated += 1;
          if (error.partialRoleCleanup.deleted === true) cleanup.threadsDeleted += 1;
          if (error.partialRoleCleanup.absenceVerified === true) {
            cleanup.absenceChecksPassed += 1;
          }
        }
        throw error;
      }
      refs.set(role, ref);
      roleCwds.set(role, cwd);
      cleanup.threadsCreated += 1;
      data.rolesPrecreated += 1;
      const identityKey = {
        a: "implementerThread",
        r: "reviewerThread",
        v: "verifierThread",
        dependent: "dependentThread",
        irrelevant: "irrelevantThread",
      }[role];
      data.identityDigests[identityKey] = refDigest(ref);
      record("canary.role.precreated", { role, refDigest: refDigest(ref) });
    }
    await runPhase({ role: "a", phase: "implementation", cwd: fixture.implementerWorktree,
      allowedToolNames: [COMMIT_CANDIDATE.name, PUBLISH_ARTIFACT.name],
      expectedTools: [COMMIT_CANDIDATE.name, PUBLISH_ARTIFACT.name] });
    reviewer = fixture.createReviewerCheckout({ implementationSha: data.implementationSha });
    await runPhase({ role: "r", phase: "review", cwd: reviewer.worktree,
      allowedToolNames: [REVIEW_READ.name, REPORT_FINDING.name],
      expectedTools: [REVIEW_READ.name, REPORT_FINDING.name] });
    const initialA = refDigest(refs.get("a"));
    await runPhase({ role: "a", phase: "fix", cwd: fixture.implementerWorktree,
      allowedToolNames: [COMMIT_CANDIDATE.name, PUBLISH_DEPENDENCY.name],
      expectedTools: [COMMIT_CANDIDATE.name, PUBLISH_DEPENDENCY.name] });
    const resumedA = refDigest(refs.get("a"));
    data.identityDigests.resumedImplementerThread = resumedA;
    data.sameARef = initialA === resumedA;
    data.sameAWorktree = roleCwds.get("a") === fixture.implementerWorktree;
    verifier = fixture.createVerifierCheckout({ fixSha: data.fixSha });
    await runPhase({ role: "v", phase: "verification", cwd: verifier.worktree,
      allowedToolNames: [VERIFY.name], expectedTools: [VERIFY.name] });
    data.directDescendant = data.fixSha !== null &&
      fixture.verifyVerifierCheckout({ fixSha: data.fixSha }).parentSha === data.implementationSha;
    if (!data.sameARef || !data.sameAWorktree || !data.directDescendant) {
      throw gateError("threadmesh_m52_live_codex_canary_identity_invalid");
    }
  } catch (error) {
    failure = error;
    record("canary.failed", { code: error?.code ?? "threadmesh_m52_live_codex_canary_failed" });
  } finally {
    cleanup.attempted = true;
    for (const [role, ref] of [...refs.entries()].reverse()) {
      try {
        const deleted = await runtime.deleteRole({
          role, ref, cwd: roleCwds.get(role) ?? fixture?.root ?? sourceRoot,
        });
        if (deleted?.deleted === true && deleted?.absenceVerified === true) {
          cleanup.threadsDeleted += 1;
          cleanup.absenceChecksPassed += 1;
        }
      } catch { /* completeness is reflected below */ }
    }
    const fixtureCleanup = fixture?.cleanup() ?? { complete: true };
    cleanup.fixtureRemoved = fixtureCleanup.complete === true;
    if (fs.existsSync(journalDirectory) && fs.readdirSync(journalDirectory).length === 0) {
      fs.rmdirSync(journalDirectory);
    }
    cleanup.complete = cleanup.threadsDeleted === cleanup.threadsCreated &&
      cleanup.absenceChecksPassed === cleanup.threadsCreated && cleanup.fixtureRemoved === true &&
      !fs.existsSync(journalDirectory);
  }
  const completed = !failure && data.rolesPrecreated === 5 &&
    data.postBootstrapTurns === 4 && data.commits === 2 &&
    data.modelSelectedToolCalls === 7 && data.verifierRequests === 1 &&
    data.verified && cleanup.complete;
  return makeResult({
    scenarioId,
    state: completed ? "blocked" : "failed",
    code: completed ? "threadmesh_m52_live_codex_integrated_gate_incomplete"
      : (/^[a-z][a-z0-9_]{0,127}$/u.test(failure?.code ?? "")
          ? failure.code
          : "threadmesh_m52_live_codex_canary_failed"),
    data,
    cleanup,
  });
}
