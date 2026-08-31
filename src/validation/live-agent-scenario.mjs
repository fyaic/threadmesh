import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AcpStdioAdapter } from "../adapters/acp-stdio.mjs";
import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { createBoundedGitLoopFixture } from "./bounded-git-loop-fixture.mjs";

export const LIVE_AGENT_SCENARIO_ACK =
  "maintainer-approved-threadmesh-live-agent-scenario";

const IMPLEMENTATION_PATH = "fixture/release-gate.mjs";
const CONTRACT_PATH = "fixture/contract.txt";
const INITIAL_IMPLEMENTATION = [
  "export function releaseGate(status) {",
  "  return String(status).toLowerCase() === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}",
  "",
].join("\n");
const FIXED_IMPLEMENTATION = [
  "export function releaseGate(status) {",
  "  return status === \"verified\" ? \"READY\" : \"BLOCKED\";",
  "}",
  "",
].join("\n");
const CONTRACT = [
  "releaseGate status matching is exact and case-sensitive.",
  "Only the exact string `verified` returns READY.",
  "Every other value, including `VERIFIED`, returns BLOCKED.",
  "",
].join("\n");

const A_TOOLS = Object.freeze([
  {
    type: "function",
    name: "threadmesh_fixture_write",
    description: "Write one bounded candidate file for the current implementation or fix phase.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["phase", "content"],
      properties: {
        phase: { enum: ["implementation", "fix"] },
        content: { type: "string", minLength: 1, maxLength: 4096 },
      },
    },
  },
  {
    type: "function",
    name: "threadmesh_commit_implementation",
    description: "Commit the bounded initial implementation after writing it.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    type: "function",
    name: "threadmesh_publish_artifact",
    description: "Publish the exact committed implementation candidate for independent review.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["commitSha"],
      properties: { commitSha: { type: "string", pattern: "^[a-f0-9]{40}$" } },
    },
  },
  {
    type: "function",
    name: "threadmesh_commit_fix",
    description: "Commit a bounded fix in the same implementer worktree after review feedback.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    type: "function",
    name: "threadmesh_publish_dependency",
    description: "Publish the exact direct-descendant fix candidate for independent verification.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["commitSha"],
      properties: { commitSha: { type: "string", pattern: "^[a-f0-9]{40}$" } },
    },
  },
]);

const R_TOOLS = Object.freeze([
  {
    type: "function",
    name: "threadmesh_review_read_artifact",
    description: "Read the exact detached implementation and its governing contract.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    type: "function",
    name: "threadmesh_report_review_finding",
    description: "Report one independently discovered, reproducible review finding.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["severity", "observedBehavior", "expectedBehavior", "reason"],
      properties: {
        severity: { enum: ["blocking", "non-blocking"] },
        observedBehavior: { type: "string", minLength: 1, maxLength: 500 },
        expectedBehavior: { type: "string", minLength: 1, maxLength: 500 },
        reason: { type: "string", minLength: 1, maxLength: 1000 },
      },
    },
  },
]);

const V_TOOLS = Object.freeze([
  {
    type: "function",
    name: "threadmesh_verify_exact_chain",
    description: "Request independent verification of the exact fixed commit and its parent chain.",
    inputSchema: { type: "object", additionalProperties: false },
  },
]);

function scenarioError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function assertDirectory(value, field) {
  if (!path.isAbsolute(value ?? "")) throw scenarioError("threadmesh_live_scenario_path_invalid", field);
  fs.mkdirSync(value, { recursive: true, mode: 0o700 });
  return fs.realpathSync(value);
}

function commandVersion(command) {
  try {
    return execFileSync(command, ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    }).trim();
  } catch {
    return null;
  }
}

class EvidenceRecorder {
  constructor({ artifactsDirectory, scenarioId, evidenceClass, product }) {
    this.directory = assertDirectory(artifactsDirectory, "artifactsDirectory");
    this.filename = path.join(this.directory, "private-trace.jsonl");
    if (fs.existsSync(this.filename)) {
      throw scenarioError("threadmesh_live_scenario_artifacts_not_empty", "evidence.jsonl");
    }
    this.records = [];
    this.headDigest = null;
    this.context = { scenarioId, evidenceClass, product };
  }

  append(type, detail = {}) {
    const body = {
      schemaVersion: 1,
      sequence: this.records.length + 1,
      previousDigest: this.headDigest,
      ...this.context,
      type,
      detail,
    };
    const record = { ...body, recordDigest: sha256Digest(body) };
    this.records.push(record);
    this.headDigest = record.recordDigest;
    fs.appendFileSync(this.filename, `${canonicalJson(record)}\n`, { encoding: "utf8", mode: 0o600 });
    return record;
  }

  writeResult(result) {
    fs.writeFileSync(
      path.join(this.directory, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }

  writeCleanupManifest(manifest) {
    fs.writeFileSync(
      path.join(this.directory, "cleanup-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
}

export function verifyLiveAgentEvidence(records) {
  let head = null;
  for (let index = 0; index < records.length; index += 1) {
    const { recordDigest, ...body } = records[index];
    if (
      body.sequence !== index + 1 || body.previousDigest !== head ||
      recordDigest !== sha256Digest(body)
    ) return { valid: false, index, headDigest: head };
    head = recordDigest;
  }
  return { valid: true, count: records.length, headDigest: head };
}

function publicRef(ref) {
  const identifier = ref?.threadId ?? ref?.sessionId ?? null;
  return {
    kind: ref?.kind ?? null,
    identifierDigest: identifier ? sha256Digest(identifier) : null,
    snapshotDigest: ref?.snapshotDigest ?? null,
  };
}

function exactTools(turn, expected, code) {
  const names = turn.toolCalls.map((call) => call.tool);
  if (JSON.stringify(names) !== JSON.stringify(expected)) throw scenarioError(code);
}

function readExact(worktree, relativePath) {
  return fs.readFileSync(path.join(worktree, ...relativePath.split("/")), "utf8");
}

function findingIsReproducible(value, implementation, contract) {
  const text = [
    value?.observedBehavior,
    value?.expectedBehavior,
    value?.reason,
  ].join(" ").toLowerCase();
  return value?.severity === "blocking" &&
    implementation === INITIAL_IMPLEMENTATION && contract === CONTRACT &&
    text.includes("case") && text.includes("verified") &&
    (text.includes("lower") || text.includes("uppercase") || text.includes("exact"));
}

function fixedCandidateIsValid(implementation) {
  return implementation === FIXED_IMPLEMENTATION;
}

export class DeterministicLiveAgentRuntime {
  constructor() {
    this.created = [];
    this.deleted = [];
    this.turns = [];
  }

  async createRole({ role }) {
    const ref = {
      kind: "deterministic-fixture",
      sessionId: `fixture-session-${role}`,
      snapshotDigest: sha256Digest({ runtime: "deterministic-fixture", role }),
    };
    this.created.push({ role, ref });
    return ref;
  }

  async runTurn({ role, phase, ref, plan, onToolCall, beforeToolCall, afterToolCall }) {
    const turnId = `fixture-turn-${role}-${phase}`;
    const toolCalls = [];
    for (let ordinal = 0; ordinal < plan.length; ordinal += 1) {
      const selected = typeof plan[ordinal] === "function" ? plan[ordinal]() : plan[ordinal];
      const metadata = {
        threadId: ref.sessionId,
        turnId,
        callId: `fixture-call-${role}-${phase}-${ordinal}`,
        ordinal,
        tool: selected.tool,
        arguments: selected.arguments,
        argumentsDigest: sha256Digest(selected.arguments),
      };
      await beforeToolCall(metadata);
      const result = await onToolCall(metadata);
      const completed = {
        ...metadata,
        outputDigest: sha256Digest(result),
        resultStatus: "completed",
      };
      delete completed.arguments;
      await afterToolCall(completed);
      toolCalls.push(completed);
    }
    const turn = {
      text: `deterministic ${role} ${phase} completed`,
      truncated: false,
      adapterRef: ref,
      evidence: {
        turnId,
        turnStatus: "completed",
        threadId: ref.sessionId,
        snapshotDigest: ref.snapshotDigest,
      },
      toolCalls,
      nonThreadMeshToolCalls: 0,
    };
    this.turns.push({ role, phase, ref, turn });
    return turn;
  }

  async deleteRole({ role, ref }) {
    this.deleted.push({ role, ref });
    return { deleted: true };
  }
}

export class CodexLiveAgentRuntime {
  constructor({ command, args = ["app-server", "--listen", "stdio://"], env = {}, model = null }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.model = model;
    this.adapter = new CodexAppServerAdapter();
    this.roles = new Map();
  }

  async probe(cwd) {
    return this.adapter.probe({ command: this.command, args: this.args, cwd, env: this.env });
  }

  async createRole({ role, cwd, tools, instructions, scenarioId }) {
    const marker = `THREADMESH_${role.toUpperCase()}_WAITING`;
    const ref = await this.adapter.createDynamicToolThread({
      command: this.command,
      args: this.args,
      cwd,
      env: this.env,
      dynamicTools: tools,
      developerInstructions: instructions,
      bootstrapMarker: marker,
      adapterIdempotencyKey: `idem_${scenarioId}_${role}_bootstrap`,
      model: this.model,
      timeoutMs: 180_000,
    });
    this.roles.set(role, { ref, tools, instructions });
    return ref;
  }

  async runTurn({ role, phase, cwd, ref, prompt, onToolCall, beforeToolCall, afterToolCall, scenarioId }) {
    const configured = this.roles.get(role);
    if (!configured || configured.ref.threadId !== ref.threadId) {
      throw scenarioError("threadmesh_live_scenario_role_ref_mismatch", role);
    }
    return this.adapter.runAutonomousToolTurn({
      command: this.command,
      args: this.args,
      cwd,
      env: this.env,
      adapterRef: ref,
      prompt,
      dynamicTools: configured.tools,
      onToolCall,
      beforeToolCall,
      afterToolCall,
      adapterIdempotencyKey: `idem_${scenarioId}_${role}_${phase}`,
      timeoutMs: 180_000,
    });
  }

  async deleteRole({ ref, cwd }) {
    return this.adapter.deleteThread({
      command: this.command,
      args: this.args,
      cwd,
      env: this.env,
      threadId: ref.threadId,
    });
  }
}

function roleInstructions(role) {
  if (role === "a") {
    return "You are implementer A. Use only ThreadMesh dynamic tools. Publish only a committed candidate. When review context arrives later, fix it in this same task and worktree.";
  }
  if (role === "r") {
    return "You are independent reviewer R. Use only ThreadMesh dynamic tools. Read the exact candidate and contract, then report a blocking finding only when you can reproduce it. The expected finding is not disclosed to you.";
  }
  return "You are independent verifier V. Use only ThreadMesh dynamic tools. Request exact-chain verification and do not claim success from prose.";
}

function plans(state) {
  return {
    implementation: [
      { tool: "threadmesh_fixture_write", arguments: { phase: "implementation", content: INITIAL_IMPLEMENTATION } },
      { tool: "threadmesh_commit_implementation", arguments: {} },
      () => ({ tool: "threadmesh_publish_artifact", arguments: { commitSha: state.implementation.subjectSha } }),
    ],
    review: [
      { tool: "threadmesh_review_read_artifact", arguments: {} },
      {
        tool: "threadmesh_report_review_finding",
        arguments: {
          severity: "blocking",
          observedBehavior: "The implementation lowercases status, so uppercase VERIFIED returns READY.",
          expectedBehavior: "The contract requires exact case-sensitive verified; uppercase must be BLOCKED.",
          reason: "Case folding violates the explicit exact-match release boundary.",
        },
      },
    ],
    fix: [
      { tool: "threadmesh_fixture_write", arguments: { phase: "fix", content: FIXED_IMPLEMENTATION } },
      { tool: "threadmesh_commit_fix", arguments: {} },
      () => ({ tool: "threadmesh_publish_dependency", arguments: { commitSha: state.fix.subjectSha } }),
    ],
    verification: [{ tool: "threadmesh_verify_exact_chain", arguments: {} }],
  };
}

function phasePrompt(phase, state) {
  if (phase === "implementation") {
    return `Implement the initial release gate candidate using the bounded tools. Candidate source:\n${INITIAL_IMPLEMENTATION}`;
  }
  if (phase === "review") {
    return "Review the exact detached candidate against its contract. Read first; report only a reproducible finding. No expected finding is supplied.";
  }
  if (phase === "fix") {
    return `THREADMESH_UNTRUSTED_REVIEW_CONTEXT_V1\n${canonicalJson(state.finding)}\nResume your original task without user relay. Correct the bounded candidate, commit it, and publish the direct descendant.`;
  }
  return "Independently request exact-chain verification of the fixed detached candidate.";
}

async function runKimiCapabilityPreflight({ command, cwd, recorder }) {
  const adapter = new AcpStdioAdapter();
  const probe = await adapter.probe({ command, args: ["acp"], cwd });
  const missing = [
    "bounded dynamic tool callbacks",
    "pre-effect tool selection receipt",
    "queryable prompt submission receipt",
  ];
  recorder.append("harness.capability-preflight", {
    harness: "kimi-acp",
    version: probe.agentInfo?.version ?? commandVersion(command),
    protocolVersion: probe.protocolVersion,
    snapshotDigest: probe.snapshotDigest,
    loadSession: probe.agentCapabilities?.loadSession === true,
    sessionList: probe.agentCapabilities?.sessionCapabilities?.list !== undefined,
    missing,
  });
  return {
    state: "blocked",
    code: "threadmesh_kimi_bounded_turn_evidence_unavailable",
    evidenceClass: "real-product-capability-preflight",
    liveProductEvidence: false,
    product: "kimi",
    missingCapabilities: missing,
    cleanup: { attempted: false, complete: true, sessionsCreated: 0 },
  };
}

const PENDING_CODEX_LIVE_GATES = Object.freeze([
  "sqlite event to next-only attention cursor claim",
  "receiver-owned model decision tool",
  "context admission receipt bound to exact registered task",
  "completed turn binding and evidence promotion before cursor commit",
  "trusted exact-chain finalize and dependency satisfaction",
  "restart recovery at event-created, native-started, receipt, final verification, and satisfaction",
]);

async function runCodexCapabilityPreflight({ runtime, cwd, recorder }) {
  const probe = await runtime.probe(cwd);
  recorder.append("harness.capability-preflight", {
    harness: "codex-app-server",
    userAgent: probe.userAgent,
    snapshotDigest: probe.snapshotDigest,
    pendingClosureGates: PENDING_CODEX_LIVE_GATES,
    modelTurnsStarted: 0,
  });
  return {
    state: "blocked",
    code: "threadmesh_codex_live_attention_glue_not_closed",
    evidenceClass: "real-product-capability-preflight",
    liveProductEvidence: false,
    product: "codex",
    missingCapabilities: [...PENDING_CODEX_LIVE_GATES],
    cleanup: { attempted: false, complete: true, threadsCreated: 0 },
  };
}

export async function runLiveAgentScenario({
  mode = "dry-run",
  product = mode === "live" ? "codex" : "fixture",
  sourceRoot,
  validatedBaseSha,
  artifactsDirectory,
  temporaryParent = os.tmpdir(),
  command = null,
  commandArgs,
  env = {},
  model = null,
  ack = null,
  scenarioId = `m52-${Date.now()}`,
  runtime = null,
} = {}) {
  if (!["dry-run", "live"].includes(mode)) throw scenarioError("threadmesh_live_scenario_mode_invalid");
  if (!path.isAbsolute(sourceRoot ?? "") || !path.isAbsolute(artifactsDirectory ?? "")) {
    throw scenarioError("threadmesh_live_scenario_path_invalid");
  }
  if (mode === "live" && ack !== LIVE_AGENT_SCENARIO_ACK) {
    throw scenarioError("threadmesh_live_scenario_ack_required");
  }
  if (mode === "live" && !path.isAbsolute(command ?? "")) {
    throw scenarioError("threadmesh_live_scenario_command_invalid");
  }
  if (mode === "dry-run" && product !== "fixture") {
    throw scenarioError("threadmesh_live_scenario_dry_run_product_invalid");
  }
  if (mode === "live" && !["codex", "kimi"].includes(product)) {
    throw scenarioError("threadmesh_live_scenario_product_invalid");
  }
  const evidenceClass = mode === "live"
    ? "real-product-capability-preflight"
    : "deterministic-fixture";
  const recorder = new EvidenceRecorder({ artifactsDirectory, scenarioId, evidenceClass, product });
  recorder.append("scenario.started", {
    mode,
    commandVersion: mode === "live" ? commandVersion(command) : null,
    dependencyUnlockInScope: false,
  });

  if (product === "kimi") {
    const result = await runKimiCapabilityPreflight({ command, cwd: sourceRoot, recorder });
    const integrity = verifyLiveAgentEvidence(recorder.records);
    const complete = { ...result, scenarioId, evidence: integrity };
    recorder.writeCleanupManifest(result.cleanup);
    recorder.writeResult(complete);
    return complete;
  }

  const activeRuntime = runtime ?? (mode === "live"
    ? new CodexLiveAgentRuntime({ command, args: commandArgs, env, model })
    : new DeterministicLiveAgentRuntime());
  if (mode === "live") {
    const result = await runCodexCapabilityPreflight({
      runtime: activeRuntime,
      cwd: sourceRoot,
      recorder,
    });
    const integrity = verifyLiveAgentEvidence(recorder.records);
    const complete = { ...result, scenarioId, evidence: integrity };
    recorder.writeCleanupManifest(result.cleanup);
    recorder.writeResult(complete);
    return complete;
  }
  let fixture;
  const refs = new Map();
  const state = {
    implementation: null,
    fix: null,
    finding: null,
    reviewer: null,
    verifier: null,
    reviewRead: false,
  };
  let failure = null;
  let cleanup = { attempted: false, complete: false };

  const recordBeforeTool = async (metadata) => recorder.append("tool.selected", {
    role: state.activeRole,
    phase: state.activePhase,
    turnIdDigest: sha256Digest(metadata.turnId),
    callIdDigest: sha256Digest(metadata.callId),
    ordinal: metadata.ordinal,
    tool: metadata.tool,
    argumentsDigest: metadata.argumentsDigest,
    persistedBeforeEffect: true,
  });
  const recordAfterTool = async (metadata) => recorder.append("tool.completed", {
    role: state.activeRole,
    phase: state.activePhase,
    turnIdDigest: sha256Digest(metadata.turnId),
    callIdDigest: sha256Digest(metadata.callId),
    ordinal: metadata.ordinal,
    tool: metadata.tool,
    outputDigest: metadata.outputDigest,
    resultStatus: metadata.resultStatus,
  });

  const onToolCall = async ({ tool, arguments: value }) => {
    if (tool === "threadmesh_fixture_write") {
      const expectedHead = value?.phase === "implementation"
        ? fixture.seedSha
        : state.implementation?.subjectSha;
      const expectedContent = value?.phase === "implementation"
        ? INITIAL_IMPLEMENTATION
        : FIXED_IMPLEMENTATION;
      if (!expectedHead || value?.content !== expectedContent || value?.phase !== state.activePhase) {
        throw scenarioError("threadmesh_live_scenario_candidate_invalid");
      }
      return fixture.writeImplementerFile(IMPLEMENTATION_PATH, value.content, { expectedHead });
    }
    if (tool === "threadmesh_commit_implementation") {
      state.implementation = fixture.commitImplementation({ expectedParent: fixture.seedSha });
      return state.implementation;
    }
    if (tool === "threadmesh_publish_artifact") {
      if (!state.implementation || value?.commitSha !== state.implementation.subjectSha) {
        throw scenarioError("threadmesh_live_scenario_publish_invalid");
      }
      return { published: true, commitSha: value.commitSha };
    }
    if (tool === "threadmesh_review_read_artifact") {
      const implementation = readExact(state.reviewer.worktree, IMPLEMENTATION_PATH);
      const contract = readExact(state.reviewer.worktree, CONTRACT_PATH);
      state.reviewRead = true;
      return { implementation, contract, commitSha: state.implementation.subjectSha };
    }
    if (tool === "threadmesh_report_review_finding") {
      const implementation = readExact(state.reviewer.worktree, IMPLEMENTATION_PATH);
      const contract = readExact(state.reviewer.worktree, CONTRACT_PATH);
      if (!state.reviewRead || !findingIsReproducible(value, implementation, contract)) {
        throw scenarioError("threadmesh_live_scenario_finding_not_reproducible");
      }
      state.finding = { ...value, commitSha: state.implementation.subjectSha };
      return { accepted: true, findingDigest: sha256Digest(state.finding) };
    }
    if (tool === "threadmesh_commit_fix") {
      state.fix = fixture.commitFix({ expectedParent: state.implementation.subjectSha });
      return state.fix;
    }
    if (tool === "threadmesh_publish_dependency") {
      if (!state.fix || value?.commitSha !== state.fix.subjectSha) {
        throw scenarioError("threadmesh_live_scenario_fix_publish_invalid");
      }
      return { published: true, commitSha: value.commitSha, parentSha: state.fix.parentSha };
    }
    if (tool === "threadmesh_verify_exact_chain") {
      const evidence = fixture.verifyVerifierCheckout({ fixSha: state.fix.subjectSha });
      const implementation = readExact(state.verifier.worktree, IMPLEMENTATION_PATH);
      if (!fixedCandidateIsValid(implementation) || evidence.parentSha !== state.implementation.subjectSha) {
        throw scenarioError("threadmesh_live_scenario_verification_failed");
      }
      return {
        verified: true,
        commitSha: evidence.subjectSha,
        parentSha: evidence.parentSha,
        testEvidenceDigest: sha256Digest({ exactContract: true, uppercaseBlocked: true }),
      };
    }
    throw scenarioError("threadmesh_live_scenario_tool_unsupported", tool);
  };

  try {
    fixture = createBoundedGitLoopFixture({
      sourceRoot,
      validatedBaseSha,
      temporaryParent,
      seedFiles: {
        [IMPLEMENTATION_PATH]: "export function releaseGate() { return \"TODO\"; }\n",
        [CONTRACT_PATH]: CONTRACT,
      },
    });
    recorder.append("fixture.created", {
      fixtureDefinitionDigest: fixture.fixtureDefinitionDigest,
      seedSha: fixture.seedSha,
      sourceSha: validatedBaseSha,
    });

    if (mode === "live") {
      const probe = await activeRuntime.probe(sourceRoot);
      recorder.append("harness.probed", {
        snapshotDigest: probe.snapshotDigest,
        userAgent: probe.userAgent,
      });
    }

    const roleDefinitions = [
      ["a", fixture.implementerWorktree, A_TOOLS],
      ["r", fixture.root, R_TOOLS],
      ["v", fixture.root, V_TOOLS],
    ];
    for (const [role, cwd, tools] of roleDefinitions) {
      const ref = await activeRuntime.createRole({
        role, cwd, tools, instructions: roleInstructions(role), scenarioId,
      });
      refs.set(role, ref);
      recorder.append("role.precreated", {
        role,
        adapterRef: publicRef(ref),
        privateAdapterRef: ref,
      });
    }

    const runPhase = async ({ role, phase, cwd, expectedTools }) => {
      state.activeRole = role;
      state.activePhase = phase;
      const turn = await activeRuntime.runTurn({
        role,
        phase,
        cwd,
        ref: refs.get(role),
        prompt: phasePrompt(phase, state),
        plan: plans(state)[phase],
        onToolCall,
        beforeToolCall: recordBeforeTool,
        afterToolCall: recordAfterTool,
        scenarioId,
      });
      exactTools(turn, expectedTools, `threadmesh_live_scenario_${phase}_tool_sequence_invalid`);
      if (turn.nonThreadMeshToolCalls !== 0 || turn.evidence?.turnStatus !== "completed") {
        throw scenarioError(`threadmesh_live_scenario_${phase}_turn_invalid`);
      }
      recorder.append("turn.completed", {
        role,
        phase,
        adapterRef: publicRef(refs.get(role)),
        turnIdDigest: sha256Digest(turn.evidence.turnId),
        toolCalls: turn.toolCalls.map((call) => ({
          ordinal: call.ordinal,
          tool: call.tool,
          argumentsDigest: call.argumentsDigest,
          outputDigest: call.outputDigest,
        })),
      });
      return turn;
    };

    await runPhase({
      role: "a",
      phase: "implementation",
      cwd: fixture.implementerWorktree,
      expectedTools: [
        "threadmesh_fixture_write",
        "threadmesh_commit_implementation",
        "threadmesh_publish_artifact",
      ],
    });
    recorder.append("handoff.promoted", {
      from: "a", to: "r", triggerTool: "threadmesh_publish_artifact",
      commitSha: state.implementation.subjectSha,
    });
    state.reviewer = fixture.createReviewerCheckout({
      implementationSha: state.implementation.subjectSha,
    });

    await runPhase({
      role: "r",
      phase: "review",
      cwd: state.reviewer.worktree,
      expectedTools: ["threadmesh_review_read_artifact", "threadmesh_report_review_finding"],
    });
    recorder.append("review.finding.promoted", {
      reviewer: "r",
      triggerTool: "threadmesh_report_review_finding",
      findingDigest: sha256Digest(state.finding),
      findingBoundToCompletedTurn: true,
    });
    recorder.append("fixture.handoff.simulated", {
      from: "r",
      to: "a",
      triggerSource: "scripted-fixture-plan",
      targetAdapterRef: publicRef(refs.get("a")),
      humanRelayActions: 0,
      orchestratorPromptSubmissionsAfterReview: 1,
      productEvidence: false,
    });

    const originalAIdentifier = refs.get("a").threadId ?? refs.get("a").sessionId;
    await runPhase({
      role: "a",
      phase: "fix",
      cwd: fixture.implementerWorktree,
      expectedTools: [
        "threadmesh_fixture_write",
        "threadmesh_commit_fix",
        "threadmesh_publish_dependency",
      ],
    });
    const resumedAIdentifier = refs.get("a").threadId ?? refs.get("a").sessionId;
    if (originalAIdentifier !== resumedAIdentifier) {
      throw scenarioError("threadmesh_live_scenario_same_a_not_resumed");
    }
    recorder.append("same-session.fix-promoted", {
      role: "a",
      adapterRef: publicRef(refs.get("a")),
      sameSession: true,
      sameWorktree: true,
      fixSha: state.fix.subjectSha,
      parentSha: state.fix.parentSha,
    });

    state.verifier = fixture.createVerifierCheckout({ fixSha: state.fix.subjectSha });
    recorder.append("handoff.promoted", {
      from: "a", to: "v", triggerTool: "threadmesh_publish_dependency",
      commitSha: state.fix.subjectSha,
    });
    await runPhase({
      role: "v",
      phase: "verification",
      cwd: state.verifier.worktree,
      expectedTools: ["threadmesh_verify_exact_chain"],
    });
    recorder.append("verification.completed", {
      verifier: "v",
      independentSession: true,
      exactChain: true,
      dependencyUnlocked: false,
      finalSha: state.fix.subjectSha,
    });
  } catch (error) {
    failure = error;
    recorder.append("scenario.failed", { code: error?.code ?? "threadmesh_live_scenario_failed" });
  } finally {
    cleanup.attempted = true;
    const roleCleanup = {};
    for (const [role, ref] of [...refs.entries()].reverse()) {
      try {
        const deleted = await activeRuntime.deleteRole({
          role,
          ref,
          cwd: fixture?.root ?? sourceRoot,
        });
        roleCleanup[role] = deleted.deleted === true;
      } catch {
        roleCleanup[role] = false;
      }
    }
    const fixtureCleanup = fixture?.cleanup() ?? { complete: true };
    cleanup = {
      attempted: true,
      complete: Object.values(roleCleanup).every(Boolean) && fixtureCleanup.complete === true,
      roles: roleCleanup,
      fixture: fixtureCleanup,
    };
    recorder.append("cleanup.completed", cleanup);
    recorder.writeCleanupManifest({
      ...cleanup,
      fixtureRootDigest: fixture?.root ? sha256Digest(fixture.root) : null,
      registeredRoles: [...refs.keys()],
    });
  }

  const integrity = verifyLiveAgentEvidence(recorder.records);
  const stateValue = failure || !cleanup.complete || !integrity.valid ? "failed" : "passed";
  const result = {
    schemaVersion: 1,
    scenarioId,
    state: stateValue,
    ...(failure ? { code: failure.code ?? "threadmesh_live_scenario_failed" } : {}),
    mode,
    product,
    evidenceClass,
    liveProductEvidence: mode === "live" && stateValue === "passed",
    claim: "runner-contract-only-not-product-evidence",
    fixtureAssertions: {
      scriptedToolPlan: true,
      scriptedHandoff: true,
      reviewerPlanIncludedFindingTool: state.finding !== null,
      receiver: "same-a-session",
      humanRelayActions: 0,
      orchestratorPromptSubmissionsAfterReview: 1,
    },
    chain: {
      implementationSha: state.implementation?.subjectSha ?? null,
      fixSha: state.fix?.subjectSha ?? null,
      directDescendant: state.fix?.parentSha === state.implementation?.subjectSha,
      fixtureVerificationPassed: state.verifier !== null && !failure,
      verificationMode: "deterministic-direct-check",
      signedIndependentAttestation: false,
      dependencyUnlocked: false,
    },
    cleanup,
    liveClosureGates: {
      satisfied: false,
      pending: [...PENDING_CODEX_LIVE_GATES],
      restartCheckpoints: {
        eventCreated: false,
        nativeStarted: false,
        receiptRecorded: false,
        finalVerification: false,
        satisfaction: false,
      },
    },
    evidence: integrity,
  };
  recorder.writeResult(result);
  return result;
}
