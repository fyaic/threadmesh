import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AcpStdioAdapter } from "../adapters/acp-stdio.mjs";
import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { renderRegisteredPeerContext } from "../rendering/context-admission.mjs";
import {
  classifyCodexNativeTurnReconciliation,
  freezeCodexNativeTurnBaseline,
} from "../state/codex-turn-reconciliation.mjs";
import { createBoundedGitLoopFixture } from "./bounded-git-loop-fixture.mjs";
import { runIntegratedCoordinatorLoop } from "./integrated-coordinator-loop.mjs";
import {
  projectM52LiveTurnJournal,
  readM52LiveTurnJournal,
  retireM52LiveTurnJournal,
  writeM52LiveTurnJournal,
} from "./m5-2-live-turn-journal.mjs";

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
const LIVE_JOURNAL_SAFE_ENV_KEYS = new Set([
  "HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "TERM", "USER", "SHELL",
]);
const LIVE_CODEX_EVIDENCE_CLASS = "real-codex-integrated-gate";
const LIVE_CODEX_CANARY_EVIDENCE_CLASS = "real-codex-product-canary";
const LIVE_CODEX_CLAIM = "real-codex-a-r-same-a-v-integrated-gate";
const LIVE_CODEX_CANARY_CLAIM = "real_product_model_tool_canary";
const LIVE_CODEX_CANARY_CODE = "threadmesh_m52_live_codex_integrated_gate_incomplete";
const LIVE_CODEX_MISSING_GATES = Object.freeze([
  "coordinator-attention-routing",
  "receiver-owned-decisions",
  "context-admission-receipts",
  "durable-recovery-checkpoints",
  "independent-verifier-attestation",
  "dependency-finalization",
]);

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

function admissionOperationProjection(prepared, ref) {
  const expectedKeys = [
    "adapterRef", "admission", "admissionToken", "envelope", "rendering", "revision",
  ].sort();
  if (
    !prepared || typeof prepared !== "object" || Array.isArray(prepared) ||
    canonicalJson(Object.keys(prepared).sort()) !== canonicalJson(expectedKeys) ||
    typeof prepared.admissionToken !== "string" || prepared.admissionToken.length < 1 ||
    prepared.admissionToken.length > 512 || /[\r\n\0]/u.test(prepared.admissionToken) ||
    typeof prepared.envelope?.messageId !== "string" ||
    prepared.envelope.messageId.length < 1 || prepared.envelope.messageId.length > 512 ||
    !Number.isInteger(prepared.revision) || prepared.revision < 0 ||
    prepared.admission?.decision !== "accepted" ||
    prepared.admission.revision !== prepared.revision ||
    typeof prepared.admission.receiverIncarnationId !== "string" ||
    prepared.admission.receiverIncarnationId !== prepared.envelope?.target?.incarnationId ||
    typeof prepared.rendering !== "string" || prepared.rendering.length < 1 ||
    prepared.rendering.length > 20_000 ||
    prepared.rendering !== renderRegisteredPeerContext(prepared.envelope) ||
    canonicalJson(prepared.adapterRef) !== canonicalJson(ref)
  ) throw scenarioError("threadmesh_live_context_prepared_invalid");
  const journalAdapterRef = {
    kind: ref.kind,
    threadId: ref.threadId,
    snapshotDigest: ref.snapshotDigest,
  };
  return Object.freeze({
    kind: "context-admission",
    messageId: prepared.envelope.messageId,
    admissionToken: prepared.admissionToken,
    revision: prepared.revision,
    receiverIncarnationId: prepared.admission.receiverIncarnationId,
    adapterRefDigest: sha256Digest(journalAdapterRef),
    envelopeDigest: sha256Digest(prepared.envelope),
    admissionDigest: sha256Digest(prepared.admission),
    promptDigest: sha256Digest(prepared.rendering),
  });
}

function admissionOperationBinding(projection, adapterIdempotencyKey) {
  const preparedProjection = { ...projection, adapterIdempotencyKey };
  return Object.freeze({
    ...preparedProjection,
    preparedDigest: sha256Digest(preparedProjection),
  });
}

function assertCompletedContextAdmission(result, ref, started) {
  if (
    result?.state !== "completed" || !result.receipt || !result.evidence ||
    typeof result.receipt.adapterOperationId !== "string" ||
    typeof result.receipt.acceptedAt !== "string" ||
    !Array.isArray(result.receipt.evidenceRefs) ||
    result.receipt.evidenceRefs.length !== 1 ||
    result.evidence.threadId !== ref.threadId ||
    result.evidence.snapshotDigest !== ref.snapshotDigest ||
    result.evidence.turnStatus !== "completed" ||
    typeof result.evidence.turnId !== "string" ||
    result.receipt.adapterOperationId !== result.evidence.turnId ||
    result.receipt.evidenceRefs[0] !==
      `codex-app-server://thread/${ref.threadId}/turn/${result.evidence.turnId}` ||
    (started !== null && started.turnId !== result.evidence.turnId)
  ) throw scenarioError("threadmesh_live_context_result_invalid");
  return result;
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
      kind: "codex-app-server",
      threadId: `fixture-thread-${role}`,
      snapshotDigest: sha256Digest({ runtime: "deterministic-fixture", role }),
      userAgent: "threadmesh-deterministic-fixture/1",
    };
    this.created.push({ role, ref });
    return ref;
  }

  async runTurn({
    role, phase, ref, plan, onToolCall, beforeToolCall, afterToolCall,
    beforeTurnStart = async () => {}, onTurnStarted = async () => {},
  }) {
    const turnId = `fixture-turn-${role}-${phase}`;
    await beforeTurnStart({ threadId: ref.threadId });
    await onTurnStarted({ threadId: ref.threadId, turnId });
    const toolCalls = [];
    for (let ordinal = 0; ordinal < plan.length; ordinal += 1) {
      const selected = typeof plan[ordinal] === "function" ? plan[ordinal]() : plan[ordinal];
      const metadata = {
        threadId: ref.threadId,
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
        threadId: ref.threadId,
        snapshotDigest: ref.snapshotDigest,
      },
      toolCalls,
      nonThreadMeshToolCalls: 0,
    };
    this.turns.push({ role, phase, ref, turn });
    return turn;
  }

  async deliverContext({ role, ref, prepared }) {
    if (prepared.adapterRef.threadId !== ref.threadId ||
        prepared.adapterRef.snapshotDigest !== ref.snapshotDigest) {
      throw scenarioError("threadmesh_live_scenario_role_ref_mismatch", role);
    }
    const turnId = `fixture-turn-${role}-admission-${this.turns.length}`;
    const acceptedAt = "2026-08-31T12:00:00.000Z";
    const result = {
      text: "deterministic accepted peer context",
      truncated: false,
      receipt: {
        adapterOperationId: turnId,
        acceptedAt,
        evidenceRefs: [`fixture://thread/${ref.threadId}/turn/${turnId}`],
      },
      evidence: {
        kind: "codex-app-server",
        threadId: ref.threadId,
        turnId,
        turnStatus: "completed",
        snapshotDigest: ref.snapshotDigest,
        completedAt: acceptedAt,
        durationMs: 1,
        userAgent: ref.userAgent,
        serverRequestDeniedCount: 0,
        serverRequestHandledCount: 0,
        notificationCount: 1,
        deltaCount: 1,
      },
    };
    this.turns.push({ role, phase: "admission", ref, prepared, turn: result });
    return result;
  }

  async deleteRole({ role, ref }) {
    this.deleted.push({ role, ref });
    return { deleted: true };
  }
}

export class CodexLiveAgentRuntime {
  constructor({
    command,
    args = ["app-server", "--listen", "stdio://"],
    env = {},
    model = null,
    adapter = new CodexAppServerAdapter(),
  }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.model = model;
    this.adapter = adapter;
    this.roles = new Map();
  }

  async probe(cwd) {
    return this.adapter.probe({ command: this.command, args: this.args, cwd, env: this.env });
  }

  async createRole({ role, cwd, tools, phaseTools = null, instructions, scenarioId }) {
    if (
      !Array.isArray(tools) || tools.length < 1 ||
      (phaseTools !== null && (
        !phaseTools || typeof phaseTools !== "object" || Array.isArray(phaseTools) ||
        Object.values(phaseTools).some((entry) => !Array.isArray(entry) || entry.length < 1)
      ))
    ) throw scenarioError("threadmesh_live_role_tools_invalid", role);
    const allTools = new Map();
    for (const tool of [tools, ...Object.values(phaseTools ?? {})].flat()) {
      const existing = allTools.get(tool?.name);
      if (existing && canonicalJson(existing) !== canonicalJson(tool)) {
        throw scenarioError("threadmesh_live_role_tools_invalid", role);
      }
      allTools.set(tool?.name, tool);
    }
    const registeredTools = [...allTools.values()];
    if (
      registeredTools.length < 1 || registeredTools.length > 4 ||
      Buffer.byteLength(canonicalJson(registeredTools)) > 32 * 1024
    ) throw scenarioError("threadmesh_live_role_tool_budget_exceeded", role);
    const marker = `THREADMESH_${role.toUpperCase()}_WAITING`;
    let ref;
    try {
      ref = await this.adapter.createDynamicToolThread({
        command: this.command,
        args: this.args,
        cwd,
        env: this.env,
        dynamicTools: registeredTools,
        developerInstructions: instructions,
        bootstrapMarker: marker,
        adapterIdempotencyKey: `idem_${scenarioId}_${role}_bootstrap`,
        model: this.model,
        timeoutMs: 180_000,
      });
    } catch (error) {
      const partial = error?.adapterRef;
      if (
        partial?.kind === "codex-app-server" &&
        typeof partial.threadId === "string" && partial.threadId.length > 0 &&
        /^sha256:[a-f0-9]{64}$/u.test(partial.snapshotDigest ?? "")
      ) {
        const cleanupArgs = {
          command: this.command,
          args: this.args,
          cwd,
          env: this.env,
          threadId: partial.threadId,
        };
        let deleted = false;
        let absenceVerified = false;
        try {
          const before = await this.adapter.confirmThreadAbsent(cleanupArgs);
          if (before.absent === true) {
            deleted = true;
          } else {
            const response = await this.adapter.deleteThread(cleanupArgs);
            deleted = response.deleted === true;
          }
          const after = before.absent === true
            ? before
            : await this.adapter.confirmThreadAbsent(cleanupArgs);
          absenceVerified = after.absent === true;
        } catch {
          // The caller receives a bounded cleanup projection and must fail closed.
        }
        error.partialRoleCleanup = Object.freeze({
          threadCreated: true,
          deleted,
          absenceVerified,
          identifierDigest: sha256Digest(partial.threadId),
        });
      }
      throw error;
    }
    this.roles.set(role, {
      ref, tools, phaseTools, allTools, registeredTools, instructions,
    });
    return ref;
  }

  async runTurn({
    role,
    phase,
    cwd,
    ref,
    prompt,
    onToolCall,
    beforeToolCall = null,
    afterToolCall = null,
    beforeTurnStart = async () => {},
    onTurnStarted = async () => {},
    scenarioId,
    turnRecovery = null,
    allowedToolNames = null,
  }) {
    const configured = this.roles.get(role);
    if (
      !configured || configured.ref.kind !== ref.kind ||
      configured.ref.threadId !== ref.threadId ||
      configured.ref.snapshotDigest !== ref.snapshotDigest
    ) {
      throw scenarioError("threadmesh_live_scenario_role_ref_mismatch", role);
    }
    let turnTools = configured.tools;
    if (configured.phaseTools !== null) {
      if (!Array.isArray(allowedToolNames) || allowedToolNames.length < 1) {
        throw scenarioError("threadmesh_live_phase_tool_allowlist_required", phase);
      }
      if (new Set(allowedToolNames).size !== allowedToolNames.length) {
        throw scenarioError("threadmesh_live_phase_tool_allowlist_invalid", phase);
      }
      const phaseDefinition = configured.phaseTools[phase];
      if (
        !phaseDefinition || canonicalJson(phaseDefinition.map(({ name }) => name)) !==
          canonicalJson(allowedToolNames)
      ) throw scenarioError("threadmesh_live_phase_tool_allowlist_invalid", phase);
      turnTools = allowedToolNames.map((name) => configured.allTools.get(name));
      if (turnTools.some((tool) => !tool)) {
        throw scenarioError("threadmesh_live_phase_tool_allowlist_invalid", phase);
      }
    } else if (
      allowedToolNames !== null &&
      canonicalJson(configured.tools.map(({ name }) => name)) !== canonicalJson(allowedToolNames)
    ) throw scenarioError("threadmesh_live_phase_tool_allowlist_invalid", phase);
    const adapterIdempotencyKey = `idem_${scenarioId}_${role}_${phase}`;
    let baseline = null;
    let journalProjection = null;
    if (turnRecovery === null) {
      throw scenarioError("threadmesh_live_turn_recovery_required", phase);
    }
    if (turnRecovery !== null) {
      if (
        !turnRecovery || typeof turnRecovery !== "object" ||
        typeof turnRecovery.filename !== "string" ||
        typeof turnRecovery.executionId !== "string" ||
        typeof turnRecovery.onOutcomeUnknown !== "function" ||
        typeof turnRecovery.onTerminalReconciliation !== "function"
      ) throw scenarioError("threadmesh_live_turn_recovery_invalid");
      const observation = await this.adapter.observePersistedTurns({
        command: this.command,
        args: this.args,
        cwd,
        env: this.env,
        threadId: ref.threadId,
        expectedSnapshotDigest: ref.snapshotDigest,
        includeItemsList: false,
        timeoutMs: 30_000,
      });
      baseline = freezeCodexNativeTurnBaseline(observation, {
        clientUserMessageId: adapterIdempotencyKey,
      });
      journalProjection = writeM52LiveTurnJournal({
        filename: turnRecovery.filename,
        scenarioId,
        executionId: turnRecovery.executionId,
        role,
        phase,
        adapterRef: ref,
        adapterIdempotencyKey,
        baseline,
        resourceManifest: {
          resources: [{
            kind: "codex-thread",
            exactId: ref.threadId,
            identifierDigest: sha256Digest(ref.threadId),
            cleanupContext: {
              method: "codex-thread-delete",
              parameters: {
                command: this.command,
                args: [...this.args],
                cwd,
                env: Object.fromEntries(Object.entries(this.env).filter(
                  ([key]) => LIVE_JOURNAL_SAFE_ENV_KEYS.has(key),
                )),
              },
              parametersDigest: sha256Digest({
                command: this.command,
                args: [...this.args],
                cwd,
                env: Object.fromEntries(Object.entries(this.env).filter(
                  ([key]) => LIVE_JOURNAL_SAFE_ENV_KEYS.has(key),
                )),
              }),
            },
          }],
        },
      });
    }
    let nativeStartRequested = false;
    try {
      const turn = await this.adapter.runAutonomousToolTurn({
        command: this.command,
        args: this.args,
        cwd,
        env: this.env,
        adapterRef: ref,
        prompt,
        dynamicTools: turnTools,
        onToolCall,
        beforeToolCall,
        afterToolCall,
        beforeTurnStart: async (metadata) => {
          await beforeTurnStart(metadata);
          nativeStartRequested = true;
        },
        onTurnStarted,
        adapterIdempotencyKey,
        timeoutMs: 180_000,
      });
      return journalProjection ? { ...turn, recoveryJournal: journalProjection } : turn;
    } catch (error) {
      if (turnRecovery === null || !nativeStartRequested) throw error;
      await turnRecovery.onOutcomeUnknown({
        reasonCode: "threadmesh_codex_native_turn_outcome_unknown",
        baseline,
      });
      const observation = await this.adapter.observePersistedTurns({
        command: this.command,
        args: this.args,
        cwd,
        env: this.env,
        threadId: ref.threadId,
        expectedSnapshotDigest: ref.snapshotDigest,
        includeItemsList: false,
        timeoutMs: 30_000,
      });
      const classified = classifyCodexNativeTurnReconciliation({ baseline, observation });
      if (classified.state !== "found-terminal") {
        const ambiguous = scenarioError(
          "threadmesh_codex_live_turn_reconciliation_ambiguous",
          classified.reasonCode,
        );
        ambiguous.recovery = {
          state: "ambiguous",
          reasonCode: classified.reasonCode,
          journal: journalProjection,
        };
        throw ambiguous;
      }
      await turnRecovery.onTerminalReconciliation({ baseline, observation });
      const terminal = scenarioError(
        "threadmesh_codex_live_turn_terminal_reconciled",
        classified.turnStatus,
      );
      terminal.recovery = {
        state: "found-terminal",
        turnStatus: classified.turnStatus,
        journal: journalProjection,
      };
      throw terminal;
    }
  }

  async deliverContext({ role, ref, prepared, cwd, scenarioId, turnRecovery = null }) {
    const configured = this.roles.get(role);
    if (
      !configured || configured.ref.kind !== ref.kind ||
      configured.ref.threadId !== ref.threadId ||
      configured.ref.snapshotDigest !== ref.snapshotDigest ||
      prepared?.adapterRef?.kind !== ref.kind ||
      prepared?.adapterRef?.threadId !== ref.threadId ||
      prepared?.adapterRef?.snapshotDigest !== ref.snapshotDigest
    ) throw scenarioError("threadmesh_live_scenario_role_ref_mismatch", role);
    if (turnRecovery === null) {
      throw scenarioError("threadmesh_live_context_recovery_required", role);
    }
    if (
      !turnRecovery || typeof turnRecovery !== "object" ||
      typeof turnRecovery.filename !== "string" ||
      typeof turnRecovery.executionId !== "string" ||
      typeof turnRecovery.onOutcomeUnknown !== "function" ||
      typeof turnRecovery.onTerminalReconciliation !== "function"
    ) throw scenarioError("threadmesh_live_context_recovery_invalid", role);
    const operationProjection = admissionOperationProjection(prepared, ref);
    const sourcePreparedDigest = sha256Digest(prepared);
    const adapterIdempotencyKey = `idem_threadmesh_admission_${sha256Digest({
      scenarioId, role, sourcePreparedDigest,
    }).slice("sha256:".length)}`;
    const operationBinding = admissionOperationBinding(
      operationProjection,
      adapterIdempotencyKey,
    );
    const observe = () => this.adapter.observePersistedTurns({
      command: this.command,
      args: this.args,
      cwd,
      env: this.env,
      threadId: ref.threadId,
      expectedSnapshotDigest: ref.snapshotDigest,
      includeItemsList: false,
      timeoutMs: 30_000,
    });
    const resourceManifest = {
      resources: [{
        kind: "codex-thread",
        exactId: ref.threadId,
        identifierDigest: sha256Digest(ref.threadId),
        cleanupContext: {
          method: "codex-thread-delete",
          parameters: {
            command: this.command,
            args: [...this.args],
            cwd,
            env: Object.fromEntries(Object.entries(this.env).filter(
              ([key]) => LIVE_JOURNAL_SAFE_ENV_KEYS.has(key),
            )),
          },
          parametersDigest: sha256Digest({
            command: this.command,
            args: [...this.args],
            cwd,
            env: Object.fromEntries(Object.entries(this.env).filter(
              ([key]) => LIVE_JOURNAL_SAFE_ENV_KEYS.has(key),
            )),
          }),
        },
      }],
    };
    const reconcile = async ({ baseline, journalProjection, startedTurnId = null }) => {
      await turnRecovery.onOutcomeUnknown({
        prepared,
        adapterIdempotencyKey,
        operationBinding,
        baseline,
      });
      const recoveredObservation = await observe();
      const classified = classifyCodexNativeTurnReconciliation({
        baseline,
        observation: recoveredObservation,
      });
      const exactTerminal = classified.state === "found-terminal" &&
        (startedTurnId === null || classified.candidateTurnId === startedTurnId);
      if (!exactTerminal) {
        const reasonCode = classified.state === "found-terminal"
          ? "codex-native-turn-started-id-mismatch"
          : classified.reasonCode;
        const ambiguous = scenarioError(
          "threadmesh_codex_live_context_reconciliation_ambiguous",
          reasonCode,
        );
        ambiguous.recovery = {
          state: "ambiguous",
          reasonCode,
          journal: journalProjection,
        };
        throw ambiguous;
      }
      await turnRecovery.onTerminalReconciliation({
        prepared,
        adapterIdempotencyKey,
        operationBinding,
        baseline,
        observation: recoveredObservation,
      });
      const terminal = scenarioError(
        "threadmesh_codex_live_context_terminal_reconciled",
        classified.turnStatus,
      );
      terminal.recovery = {
        state: "found-terminal",
        turnStatus: classified.turnStatus,
        journal: journalProjection,
      };
      throw terminal;
    };
    if (fs.existsSync(turnRecovery.filename)) {
      const stored = readM52LiveTurnJournal({
        filename: turnRecovery.filename,
        expectedScenarioId: scenarioId,
        expectedExecutionId: turnRecovery.executionId,
      });
      const expectedAdapterRef = {
        kind: ref.kind,
        threadId: ref.threadId,
        snapshotDigest: ref.snapshotDigest,
      };
      if (
        stored.role !== role || stored.phase !== "context-admission" ||
        stored.adapterIdempotencyKey !== adapterIdempotencyKey ||
        canonicalJson(stored.adapterRef) !== canonicalJson(expectedAdapterRef) ||
        canonicalJson(stored.operationBinding) !== canonicalJson(operationBinding) ||
        canonicalJson(stored.resourceManifest) !== canonicalJson(resourceManifest)
      ) throw scenarioError("threadmesh_live_context_recovery_binding_mismatch", role);
      return reconcile({
        baseline: stored.baseline,
        journalProjection: { ...projectM52LiveTurnJournal(stored), replay: true },
      });
    }
    const observation = await observe();
    const baseline = freezeCodexNativeTurnBaseline(observation, {
      clientUserMessageId: adapterIdempotencyKey,
    });
    const journalProjection = writeM52LiveTurnJournal({
      filename: turnRecovery.filename,
      scenarioId,
      executionId: turnRecovery.executionId,
      role,
      phase: "context-admission",
      adapterRef: ref,
      adapterIdempotencyKey,
      operationBinding,
      baseline,
      resourceManifest,
    });
    let nativeStartRequested = false;
    let started = null;
    try {
      const result = await this.adapter.runAcceptedSuggestion({
        command: this.command,
        args: this.args,
        cwd,
        env: this.env,
        adapterRef: ref,
        envelope: prepared.envelope,
        admission: prepared.admission,
        adapterIdempotencyKey,
        preparedRendering: prepared.rendering,
        beforeTurnStart: async (metadata) => {
          if (
            metadata?.threadId !== ref.threadId ||
            metadata?.snapshotDigest !== ref.snapshotDigest ||
            metadata?.adapterIdempotencyKey !== adapterIdempotencyKey
          ) throw scenarioError("threadmesh_live_context_start_binding_mismatch");
          nativeStartRequested = true;
        },
        onTurnStarted: async (metadata) => {
          if (
            metadata?.threadId !== ref.threadId ||
            metadata?.snapshotDigest !== ref.snapshotDigest ||
            metadata?.adapterIdempotencyKey !== adapterIdempotencyKey ||
            typeof metadata.turnId !== "string" || metadata.turnId.length < 1
          ) throw scenarioError("threadmesh_live_context_start_binding_mismatch");
          started = Object.freeze({ ...metadata });
        },
        timeoutMs: 180_000,
      });
      return {
        ...assertCompletedContextAdmission(result, ref, started),
        recoveryJournal: journalProjection,
      };
    } catch (error) {
      if (!nativeStartRequested) {
        retireM52LiveTurnJournal({
          filename: turnRecovery.filename,
          expectedScenarioId: scenarioId,
          expectedExecutionId: turnRecovery.executionId,
          expectedRecordDigest: journalProjection.recordDigest,
        });
        throw error;
      }
      return reconcile({
        baseline,
        journalProjection,
        startedTurnId: started?.turnId ?? null,
      });
    }
  }

  async deleteRole({ role, ref, cwd }) {
    const configured = this.roles.get(role);
    if (
      !configured || configured.ref.kind !== ref?.kind ||
      configured.ref.threadId !== ref?.threadId ||
      configured.ref.snapshotDigest !== ref?.snapshotDigest
    ) throw scenarioError("threadmesh_live_scenario_role_ref_mismatch", role);
    const cleanupArgs = {
      command: this.command,
      args: this.args,
      cwd,
      env: this.env,
      threadId: ref.threadId,
    };
    const before = await this.adapter.confirmThreadAbsent(cleanupArgs);
    if (before.absent === true) {
      return {
        deleted: true,
        absenceVerified: true,
        checkedBy: before.checkedBy,
        snapshotDigest: before.snapshotDigest,
        identifierDigest: sha256Digest(ref.threadId),
        replay: true,
      };
    }
    const deleted = await this.adapter.deleteThread(cleanupArgs);
    const absence = await this.adapter.confirmThreadAbsent(cleanupArgs);
    if (deleted.deleted !== true || absence.absent !== true) {
      throw scenarioError("threadmesh_live_role_cleanup_unconfirmed");
    }
    return {
      deleted: true,
      absenceVerified: true,
      checkedBy: absence.checkedBy,
      snapshotDigest: absence.snapshotDigest,
      identifierDigest: sha256Digest(ref.threadId),
    };
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

function exactObject(value, keys, field) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid", field);
  return value;
}

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", field);
  }
  return value;
}

function bool(value, field) {
  if (typeof value !== "boolean") {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", field);
  }
  return value;
}

function digest(value, field) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", field);
  }
  return value;
}

function commitSha(value, field) {
  if (!/^[a-f0-9]{40}$/u.test(value ?? "")) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", field);
  }
  return value;
}

function optionalDigest(value, field) {
  return value === null ? null : digest(value, field);
}

function optionalCommitSha(value, field) {
  return value === null ? null : commitSha(value, field);
}

function projectLiveCodexProof(coreResult) {
  const counts = exactObject(coreResult.counts, [
    "rolesCreated", "modelTurnsStarted", "modelTurnsCompleted", "toolEffectsCommitted",
    "receiverDecisionTurnsCompleted", "contextAdmissionReceipts",
  ], "counts");
  const chain = exactObject(coreResult.chain, [
    "implementationSha", "fixSha", "directDescendant", "verified",
    "dependencyUnlocked", "verificationMode", "attestationDigest",
  ], "chain");
  const initiative = exactObject(coreResult.initiative, [
    "reviewTriggeredByLifecycle", "fixTriggeredByAdmittedContext",
    "verificationTriggeredByLifecycle", "sameAResumed", "humanRelayActions",
    "orchestratorPromptSubmissionsAfterReview", "pollingWakeups",
    "scriptedPromptSubmissions",
  ], "initiative");
  const identityDigests = exactObject(coreResult.identityDigests, [
    "implementerThreadDigest", "resumedImplementerThreadDigest",
    "reviewerThreadDigest", "verifierThreadDigest", "dependentThreadDigest",
    "irrelevantThreadDigest",
  ], "identityDigests");
  const recovery = exactObject(coreResult.recovery, [
    "status", "restartCheckpointsPassed", "replayChecksPassed",
    "outcomeUnknownReconciliations", "processKillCanaryDigest",
  ], "recovery");
  const controls = exactObject(coreResult.controls, [
    "dependencyLockedBefore", "dependencySatisfiedAfter", "irrelevantAuthorized",
    "irrelevantSkipped", "irrelevantModelTurns", "receiverOwnedDecisions",
    "exactAdmissionReceiptsBound",
  ], "controls");
  if (![
    "independent-service-signed", "product-model-tool-canary",
  ].includes(chain.verificationMode)) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", "verificationMode");
  }
  if (!["complete", "partial", "not-run"].includes(recovery.status)) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", "recovery.status");
  }
  return {
    claim: coreResult.claim,
    counts: {
      rolesCreated: count(counts.rolesCreated, "rolesCreated"),
      modelTurnsStarted: count(counts.modelTurnsStarted, "modelTurnsStarted"),
      modelTurnsCompleted: count(counts.modelTurnsCompleted, "modelTurnsCompleted"),
      toolEffectsCommitted: count(counts.toolEffectsCommitted, "toolEffectsCommitted"),
      receiverDecisionTurnsCompleted: count(counts.receiverDecisionTurnsCompleted, "receiverDecisionTurnsCompleted"),
      contextAdmissionReceipts: count(counts.contextAdmissionReceipts, "contextAdmissionReceipts"),
    },
    chain: {
      implementationSha: commitSha(chain.implementationSha, "implementationSha"),
      fixSha: commitSha(chain.fixSha, "fixSha"),
      directDescendant: bool(chain.directDescendant, "directDescendant"),
      verified: bool(chain.verified, "verified"),
      dependencyUnlocked: bool(chain.dependencyUnlocked, "dependencyUnlocked"),
      verificationMode: chain.verificationMode,
      attestationDigest: digest(chain.attestationDigest, "attestationDigest"),
    },
    initiative: {
      reviewTriggeredByLifecycle: bool(initiative.reviewTriggeredByLifecycle, "reviewTriggeredByLifecycle"),
      fixTriggeredByAdmittedContext: bool(initiative.fixTriggeredByAdmittedContext, "fixTriggeredByAdmittedContext"),
      verificationTriggeredByLifecycle: bool(initiative.verificationTriggeredByLifecycle, "verificationTriggeredByLifecycle"),
      sameAResumed: bool(initiative.sameAResumed, "sameAResumed"),
      humanRelayActions: count(initiative.humanRelayActions, "humanRelayActions"),
      orchestratorPromptSubmissionsAfterReview: count(initiative.orchestratorPromptSubmissionsAfterReview, "orchestratorPromptSubmissionsAfterReview"),
      pollingWakeups: count(initiative.pollingWakeups, "pollingWakeups"),
      scriptedPromptSubmissions: count(initiative.scriptedPromptSubmissions, "scriptedPromptSubmissions"),
    },
    identityDigests: {
      implementerThreadDigest: digest(identityDigests.implementerThreadDigest, "implementerThreadDigest"),
      resumedImplementerThreadDigest: digest(identityDigests.resumedImplementerThreadDigest, "resumedImplementerThreadDigest"),
      reviewerThreadDigest: digest(identityDigests.reviewerThreadDigest, "reviewerThreadDigest"),
      verifierThreadDigest: digest(identityDigests.verifierThreadDigest, "verifierThreadDigest"),
      dependentThreadDigest: digest(identityDigests.dependentThreadDigest, "dependentThreadDigest"),
      irrelevantThreadDigest: digest(identityDigests.irrelevantThreadDigest, "irrelevantThreadDigest"),
    },
    recovery: {
      status: recovery.status,
      restartCheckpointsPassed: count(recovery.restartCheckpointsPassed, "restartCheckpointsPassed"),
      replayChecksPassed: count(recovery.replayChecksPassed, "replayChecksPassed"),
      outcomeUnknownReconciliations: count(recovery.outcomeUnknownReconciliations, "outcomeUnknownReconciliations"),
      processKillCanaryDigest: digest(recovery.processKillCanaryDigest, "processKillCanaryDigest"),
    },
    controls: {
      dependencyLockedBefore: bool(controls.dependencyLockedBefore, "dependencyLockedBefore"),
      dependencySatisfiedAfter: bool(controls.dependencySatisfiedAfter, "dependencySatisfiedAfter"),
      irrelevantAuthorized: bool(controls.irrelevantAuthorized, "irrelevantAuthorized"),
      irrelevantSkipped: bool(controls.irrelevantSkipped, "irrelevantSkipped"),
      irrelevantModelTurns: count(controls.irrelevantModelTurns, "irrelevantModelTurns"),
      receiverOwnedDecisions: bool(controls.receiverOwnedDecisions, "receiverOwnedDecisions"),
      exactAdmissionReceiptsBound: bool(controls.exactAdmissionReceiptsBound, "exactAdmissionReceiptsBound"),
    },
  };
}

function projectLiveCodexCleanup(cleanup) {
  const value = exactObject(cleanup, [
    "attempted", "complete", "threadsCreated", "threadsDeleted",
    "absenceChecksPassed", "temporaryResourcesRemoved", "unexpectedArtifacts",
    "verifierServiceExited", "verifierKeyMaterialRemoved", "gitResourcesRemoved",
    "sqliteSidecarsAbsent", "journalsRetired", "temporaryFilesAbsent",
  ], "cleanup");
  return {
    attempted: bool(value.attempted, "cleanup.attempted"),
    complete: bool(value.complete, "cleanup.complete"),
    threadsCreated: count(value.threadsCreated, "cleanup.threadsCreated"),
    threadsDeleted: count(value.threadsDeleted, "cleanup.threadsDeleted"),
    absenceChecksPassed: count(value.absenceChecksPassed, "cleanup.absenceChecksPassed"),
    temporaryResourcesRemoved: bool(value.temporaryResourcesRemoved, "cleanup.temporaryResourcesRemoved"),
    unexpectedArtifacts: count(value.unexpectedArtifacts, "cleanup.unexpectedArtifacts"),
    verifierServiceExited: bool(value.verifierServiceExited, "cleanup.verifierServiceExited"),
    verifierKeyMaterialRemoved: bool(value.verifierKeyMaterialRemoved, "cleanup.verifierKeyMaterialRemoved"),
    gitResourcesRemoved: bool(value.gitResourcesRemoved, "cleanup.gitResourcesRemoved"),
    sqliteSidecarsAbsent: bool(value.sqliteSidecarsAbsent, "cleanup.sqliteSidecarsAbsent"),
    journalsRetired: bool(value.journalsRetired, "cleanup.journalsRetired"),
    temporaryFilesAbsent: bool(value.temporaryFilesAbsent, "cleanup.temporaryFilesAbsent"),
  };
}

function projectLiveCodexCanaryResult(coreResult, { scenarioId, integrity }) {
  exactObject(coreResult, [
    "schemaVersion", "scenarioId", "state", "code", "product", "evidenceClass",
    "liveProductEvidence", "claim", "counts", "chain", "initiative",
    "identityDigests", "recovery", "controls", "cleanup", "missingGates",
  ], "canary.result");
  if (
    coreResult.schemaVersion !== 1 || coreResult.scenarioId !== scenarioId ||
    !["blocked", "failed"].includes(coreResult.state) ||
    coreResult.product !== "codex" ||
    coreResult.evidenceClass !== LIVE_CODEX_CANARY_EVIDENCE_CLASS ||
    coreResult.liveProductEvidence !== false || coreResult.claim !== LIVE_CODEX_CANARY_CLAIM ||
    integrity.valid !== true
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid", "canary");
  if (
    canonicalJson(coreResult.missingGates) !== canonicalJson(LIVE_CODEX_MISSING_GATES)
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid", "missingGates");
  if (
    coreResult.state === "blocked" && coreResult.code !== LIVE_CODEX_CANARY_CODE
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid", "canary.code");
  if (
    coreResult.state === "failed" && !/^[a-z][a-z0-9_]{0,127}$/u.test(coreResult.code)
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid", "canary.code");
  const counts = exactObject(coreResult.counts, [
    "rolesPrecreated", "postBootstrapTurns", "modelSelectedToolCalls", "commits",
    "verifierRequests",
  ], "canary.counts");
  const chain = exactObject(coreResult.chain, [
    "validatedBaseSha", "fixtureSeedSha", "implementationSha", "fixSha",
    "directDescendant", "verified", "unlocked",
  ], "canary.chain");
  const initiative = exactObject(coreResult.initiative, [
    "aPublishedArtifact", "rReportedFinding", "sameAFixed", "vRequestedVerification",
    "humanRelayActions", "phasePromptsSubmittedByRunner", "lifecycleHandoffsByThreadMesh",
  ], "canary.initiative");
  const identityDigests = exactObject(coreResult.identityDigests, [
    "implementerThread", "resumedImplementerThread", "reviewerThread", "verifierThread",
    "dependentThread", "irrelevantThread",
  ], "canary.identityDigests");
  const recovery = exactObject(coreResult.recovery, [
    "businessTurnJournalsRetired", "admissionJournalsRetired",
    "reconciledWithoutResend", "duplicateNativeTurnsPrevented",
  ], "canary.recovery");
  const controls = exactObject(coreResult.controls, [
    "sameARef", "sameAWorktree", "dependentUnlocked", "dependentPostBootstrapTurns",
    "irrelevantPostBootstrapTurns", "allRolesDeleted", "fixtureRemoved", "cleanupComplete",
  ], "canary.controls");
  const cleanup = exactObject(coreResult.cleanup, [
    "attempted", "complete", "threadsCreated", "threadsDeleted",
    "absenceChecksPassed", "fixtureRemoved",
  ], "canary.cleanup");
  const projected = {
    schemaVersion: 1,
    scenarioId,
    state: coreResult.state,
    code: coreResult.code,
    mode: "live",
    product: "codex",
    evidenceClass: LIVE_CODEX_CANARY_EVIDENCE_CLASS,
    liveProductEvidence: false,
    claim: LIVE_CODEX_CANARY_CLAIM,
    counts: {
      rolesPrecreated: count(counts.rolesPrecreated, "rolesPrecreated"),
      postBootstrapTurns: count(counts.postBootstrapTurns, "postBootstrapTurns"),
      modelSelectedToolCalls: count(counts.modelSelectedToolCalls, "modelSelectedToolCalls"),
      commits: count(counts.commits, "commits"),
      verifierRequests: count(counts.verifierRequests, "verifierRequests"),
    },
    chain: {
      validatedBaseSha: optionalCommitSha(chain.validatedBaseSha, "validatedBaseSha"),
      fixtureSeedSha: optionalCommitSha(chain.fixtureSeedSha, "fixtureSeedSha"),
      implementationSha: optionalCommitSha(chain.implementationSha, "implementationSha"),
      fixSha: optionalCommitSha(chain.fixSha, "fixSha"),
      directDescendant: bool(chain.directDescendant, "directDescendant"),
      verified: bool(chain.verified, "verified"),
      unlocked: bool(chain.unlocked, "unlocked"),
    },
    initiative: {
      aPublishedArtifact: bool(initiative.aPublishedArtifact, "aPublishedArtifact"),
      rReportedFinding: bool(initiative.rReportedFinding, "rReportedFinding"),
      sameAFixed: bool(initiative.sameAFixed, "sameAFixed"),
      vRequestedVerification: bool(initiative.vRequestedVerification, "vRequestedVerification"),
      humanRelayActions: count(initiative.humanRelayActions, "humanRelayActions"),
      phasePromptsSubmittedByRunner: count(initiative.phasePromptsSubmittedByRunner, "phasePromptsSubmittedByRunner"),
      lifecycleHandoffsByThreadMesh: bool(initiative.lifecycleHandoffsByThreadMesh, "lifecycleHandoffsByThreadMesh"),
    },
    identityDigests: Object.fromEntries(
      Object.entries(identityDigests).map(([key, value]) => [key, optionalDigest(value, key)]),
    ),
    recovery: {
      businessTurnJournalsRetired: count(recovery.businessTurnJournalsRetired, "businessTurnJournalsRetired"),
      admissionJournalsRetired: count(recovery.admissionJournalsRetired, "admissionJournalsRetired"),
      reconciledWithoutResend: bool(recovery.reconciledWithoutResend, "reconciledWithoutResend"),
      duplicateNativeTurnsPrevented: bool(recovery.duplicateNativeTurnsPrevented, "duplicateNativeTurnsPrevented"),
    },
    controls: {
      sameARef: bool(controls.sameARef, "sameARef"),
      sameAWorktree: bool(controls.sameAWorktree, "sameAWorktree"),
      dependentUnlocked: bool(controls.dependentUnlocked, "dependentUnlocked"),
      dependentPostBootstrapTurns: count(controls.dependentPostBootstrapTurns, "dependentPostBootstrapTurns"),
      irrelevantPostBootstrapTurns: count(controls.irrelevantPostBootstrapTurns, "irrelevantPostBootstrapTurns"),
      allRolesDeleted: bool(controls.allRolesDeleted, "allRolesDeleted"),
      fixtureRemoved: bool(controls.fixtureRemoved, "fixtureRemoved"),
      cleanupComplete: bool(controls.cleanupComplete, "cleanupComplete"),
    },
    cleanup: {
      attempted: bool(cleanup.attempted, "cleanup.attempted"),
      complete: bool(cleanup.complete, "cleanup.complete"),
      threadsCreated: count(cleanup.threadsCreated, "cleanup.threadsCreated"),
      threadsDeleted: count(cleanup.threadsDeleted, "cleanup.threadsDeleted"),
      absenceChecksPassed: count(cleanup.absenceChecksPassed, "cleanup.absenceChecksPassed"),
      fixtureRemoved: bool(cleanup.fixtureRemoved, "cleanup.fixtureRemoved"),
    },
    missingGates: [...coreResult.missingGates],
    evidence: integrity,
  };
  if (coreResult.state === "blocked") {
    const successfulCanary =
      projected.counts.rolesPrecreated === 5 && projected.counts.postBootstrapTurns === 4 &&
      projected.counts.modelSelectedToolCalls > 0 && projected.counts.commits === 2 &&
      projected.counts.verifierRequests === 1 && projected.chain.directDescendant === true &&
      projected.chain.verified === true && projected.chain.unlocked === false &&
      [projected.chain.validatedBaseSha, projected.chain.fixtureSeedSha,
        projected.chain.implementationSha, projected.chain.fixSha]
        .every((value) => value !== null) &&
      projected.initiative.aPublishedArtifact === true &&
      projected.initiative.rReportedFinding === true &&
      projected.initiative.sameAFixed === true &&
      projected.initiative.vRequestedVerification === true &&
      projected.initiative.humanRelayActions === 0 &&
      projected.initiative.phasePromptsSubmittedByRunner === 4 &&
      projected.initiative.lifecycleHandoffsByThreadMesh === false &&
      Object.values(projected.identityDigests).every((value) => value !== null) &&
      projected.identityDigests.implementerThread === projected.identityDigests.resumedImplementerThread &&
      new Set(Object.values(projected.identityDigests)).size === 5 &&
      projected.controls.sameARef === true && projected.controls.sameAWorktree === true &&
      projected.controls.dependentUnlocked === false &&
      projected.controls.dependentPostBootstrapTurns === 0 &&
      projected.controls.irrelevantPostBootstrapTurns === 0 &&
      projected.controls.allRolesDeleted === true && projected.controls.fixtureRemoved === true &&
      projected.controls.cleanupComplete === true && projected.cleanup.attempted === true &&
      projected.cleanup.complete === true && projected.cleanup.threadsCreated === 5 &&
      projected.cleanup.threadsDeleted === 5 && projected.cleanup.absenceChecksPassed === 5 &&
      projected.cleanup.fixtureRemoved === true;
    if (!successfulCanary) {
      throw scenarioError("threadmesh_live_codex_gate_result_invalid", "canary.invariants");
    }
  }
  return projected;
}

function projectLiveCodexGateResult(coreResult, { scenarioId, integrity }) {
  if (!coreResult || typeof coreResult !== "object" || Array.isArray(coreResult)) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid");
  }
  const canary = coreResult.evidenceClass === LIVE_CODEX_CANARY_EVIDENCE_CLASS;
  if (canary) return projectLiveCodexCanaryResult(coreResult, { scenarioId, integrity });
  const topLevel = [
    "schemaVersion", "scenarioId", "state", "product", "evidenceClass",
    "liveProductEvidence", "claim", "counts", "chain", "initiative",
    "identityDigests", "recovery", "controls", "cleanup",
    ...(coreResult.code === undefined ? [] : ["code"]),
  ];
  exactObject(coreResult, topLevel, "result");
  if (
    coreResult.schemaVersion !== 1 ||
    !["passed", "failed", "blocked"].includes(coreResult.state) ||
    coreResult.product !== "codex" ||
    ![LIVE_CODEX_EVIDENCE_CLASS, LIVE_CODEX_CANARY_EVIDENCE_CLASS]
      .includes(coreResult.evidenceClass) ||
    typeof coreResult.liveProductEvidence !== "boolean" ||
    coreResult.scenarioId !== scenarioId ||
    ![LIVE_CODEX_CLAIM, LIVE_CODEX_CANARY_CLAIM].includes(coreResult.claim)
  ) throw scenarioError("threadmesh_live_codex_gate_result_invalid");
  if (coreResult.claim !== LIVE_CODEX_CLAIM) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", "claim");
  }
  const cleanup = projectLiveCodexCleanup(coreResult.cleanup);
  const proof = projectLiveCodexProof(coreResult);
  let state = coreResult.state;
  let code = coreResult.code;
  if (code !== undefined && !/^[a-z][a-z0-9_]{0,127}$/u.test(code)) {
    throw scenarioError("threadmesh_live_codex_gate_result_invalid", "code");
  }
  const fullProof =
    proof.claim === LIVE_CODEX_CLAIM &&
    proof.counts.rolesCreated === 5 &&
    proof.counts.modelTurnsStarted >= 4 &&
    proof.counts.modelTurnsCompleted === proof.counts.modelTurnsStarted &&
    proof.counts.toolEffectsCommitted >= 4 &&
    proof.counts.receiverDecisionTurnsCompleted >= 4 &&
    proof.counts.contextAdmissionReceipts >= 4 &&
    proof.chain.directDescendant === true && proof.chain.verified === true &&
    proof.chain.dependencyUnlocked === true &&
    proof.chain.verificationMode === "independent-service-signed" &&
    proof.initiative.reviewTriggeredByLifecycle === true &&
    proof.initiative.fixTriggeredByAdmittedContext === true &&
    proof.initiative.verificationTriggeredByLifecycle === true &&
    proof.initiative.sameAResumed === true &&
    proof.initiative.humanRelayActions === 0 &&
    proof.initiative.orchestratorPromptSubmissionsAfterReview === 0 &&
    proof.initiative.pollingWakeups === 0 &&
    proof.initiative.scriptedPromptSubmissions === 0 &&
    proof.identityDigests.implementerThreadDigest === proof.identityDigests.resumedImplementerThreadDigest &&
    proof.identityDigests.implementerThreadDigest !== proof.identityDigests.reviewerThreadDigest &&
    proof.identityDigests.implementerThreadDigest !== proof.identityDigests.verifierThreadDigest &&
    proof.identityDigests.reviewerThreadDigest !== proof.identityDigests.verifierThreadDigest &&
    new Set(Object.values(proof.identityDigests)).size === 5 &&
    proof.recovery.status === "complete" &&
    proof.recovery.restartCheckpointsPassed >= 5 && proof.recovery.replayChecksPassed >= 1 &&
    proof.recovery.outcomeUnknownReconciliations >= 1 &&
    proof.controls.dependencyLockedBefore === true &&
    proof.controls.dependencySatisfiedAfter === true &&
    proof.controls.receiverOwnedDecisions === true &&
    proof.controls.exactAdmissionReceiptsBound === true &&
    proof.controls.irrelevantAuthorized === true && proof.controls.irrelevantSkipped === true &&
    proof.controls.irrelevantModelTurns === 0;
  const completeCleanup =
    cleanup.attempted === true && cleanup.complete === true &&
    cleanup.threadsCreated === 5 && cleanup.threadsDeleted === 5 &&
    cleanup.absenceChecksPassed === 5 && cleanup.temporaryResourcesRemoved === true &&
    cleanup.unexpectedArtifacts === 0 && cleanup.verifierServiceExited === true &&
    cleanup.verifierKeyMaterialRemoved === true && cleanup.gitResourcesRemoved === true &&
    cleanup.sqliteSidecarsAbsent === true && cleanup.journalsRetired === true &&
    cleanup.temporaryFilesAbsent === true;
  const completePass =
    state === "passed" && coreResult.liveProductEvidence === true &&
    fullProof && completeCleanup && integrity.valid === true;
  if (state === "passed" && !completePass) {
    state = "failed";
    code = !completeCleanup
      ? "threadmesh_live_codex_gate_cleanup_incomplete"
      : "threadmesh_live_codex_gate_evidence_incomplete";
  }
  if (state !== "passed" && coreResult.liveProductEvidence === true) {
    state = "failed";
    code = "threadmesh_live_codex_gate_claim_inconsistent";
  }
  if (!integrity.valid) {
    state = "failed";
    code = "threadmesh_live_codex_gate_evidence_invalid";
  }
  return {
    schemaVersion: 1,
    scenarioId,
    state,
    ...(code ? { code } : {}),
    mode: "live",
    product: "codex",
    evidenceClass: coreResult.evidenceClass,
    liveProductEvidence: completePass,
    ...proof,
    cleanup,
    evidence: integrity,
  };
}

async function resolveLiveCodexGate(injected) {
  if (injected !== null && injected !== undefined) {
    if (typeof injected !== "function") {
      throw scenarioError("threadmesh_live_codex_gate_invalid");
    }
    return injected;
  }
  const module = await import("./m5-2-live-codex-gate.mjs");
  if (typeof module.runM52LiveCodexGate !== "function") {
    throw scenarioError("threadmesh_live_codex_gate_invalid");
  }
  return module.runM52LiveCodexGate;
}

async function runCodexLiveGate({
  runtime,
  sourceRoot,
  validatedBaseSha,
  artifactsDirectory,
  temporaryParent,
  scenarioId,
  recorder,
  liveCodexGate,
}) {
  const probe = await runtime.probe(sourceRoot);
  recorder.append("harness.capability-probe", {
    harness: "codex-app-server",
    userAgent: probe.userAgent,
    snapshotDigest: probe.snapshotDigest,
    provesIntegratedGate: false,
  });
  const gate = await resolveLiveCodexGate(liveCodexGate);
  return gate({
    runtime,
    sourceRoot,
    validatedBaseSha,
    artifactsDirectory,
    temporaryParent,
    scenarioId,
    record: (type, detail) => recorder.append(type, detail),
  });
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
  liveCodexGate = null,
} = {}) {
  if (!["dry-run", "live"].includes(mode)) throw scenarioError("threadmesh_live_scenario_mode_invalid");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(scenarioId ?? "")) {
    throw scenarioError("threadmesh_live_scenario_id_invalid");
  }
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
  const evidenceClass = mode === "dry-run"
    ? "deterministic-fixture"
    : product === "codex"
      ? "real-codex-live-gate-entry"
      : "real-product-capability-preflight";
  const recorder = new EvidenceRecorder({ artifactsDirectory, scenarioId, evidenceClass, product });
  recorder.append("scenario.started", {
    mode,
    commandVersion: mode === "live" ? commandVersion(command) : null,
    dependencyUnlockInScope: mode === "dry-run" || (mode === "live" && product === "codex"),
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
    const coreResult = await runCodexLiveGate({
      runtime: activeRuntime,
      sourceRoot,
      validatedBaseSha,
      artifactsDirectory,
      temporaryParent,
      scenarioId,
      recorder,
      liveCodexGate,
    });
    const integrity = verifyLiveAgentEvidence(recorder.records);
    const complete = projectLiveCodexGateResult(coreResult, { scenarioId, integrity });
    recorder.writeCleanupManifest(complete.cleanup);
    recorder.writeResult(complete);
    return complete;
  }
  if (mode === "dry-run") {
    const integrated = await runIntegratedCoordinatorLoop({
      runtime: activeRuntime,
      artifactsDirectory,
      scenarioId,
      record: (type, detail) => recorder.append(type, detail),
    });
    recorder.append("scenario.completed", {
      state: integrated.state,
      evidenceClass: integrated.evidenceClass,
      liveProductEvidence: false,
    });
    const integrity = verifyLiveAgentEvidence(recorder.records);
    const complete = {
      schemaVersion: 1,
      scenarioId,
      mode,
      product,
      ...integrated,
      evidence: integrity,
    };
    recorder.writeCleanupManifest(integrated.cleanup);
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
