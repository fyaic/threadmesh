import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { createCodexPersistedTurnObservation } from
  "../state/codex-turn-reconciliation.mjs";

const SNAPSHOT_DIGEST = sha256Digest({
  adapter: "deterministic-no-plan-codex-app-server",
  version: 1,
});

function fail(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function copy(value) {
  return JSON.parse(canonicalJson(value));
}

function assertThreadId(threadId) {
  if (typeof threadId !== "string" || threadId.length < 1) {
    fail("codex_app_server_thread_id_invalid");
  }
}

function assertInvocation({ command, args, cwd, env }) {
  if (
    typeof command !== "string" || command.length < 1 ||
    !Array.isArray(args) || typeof cwd !== "string" || cwd.length < 1 ||
    !env || typeof env !== "object" || Array.isArray(env)
  ) fail("codex_app_server_invocation_invalid");
}

function assertTools(dynamicTools) {
  if (
    !Array.isArray(dynamicTools) || dynamicTools.length < 1 ||
    dynamicTools.some((tool) =>
      !tool || typeof tool !== "object" || typeof tool.name !== "string" ||
      tool.name.length < 1
    ) || new Set(dynamicTools.map(({ name }) => name)).size !== dynamicTools.length
  ) fail("codex_app_server_dynamic_tools_invalid");
  return new Map(dynamicTools.map((tool) => [tool.name, tool]));
}

function assertRegisteredTools(thread, dynamicTools) {
  const registered = new Map(thread.registeredTools.map((tool) => [tool.name, tool]));
  for (const tool of dynamicTools) {
    const original = registered.get(tool.name);
    if (!original || canonicalJson(original) !== canonicalJson(tool)) {
      fail("threadmesh_deterministic_adapter_registered_tool_mismatch", tool.name);
    }
  }
}

function assertNoPlanSurface(options) {
  for (const forbidden of [
    "plan",
    "deliverContext",
    "phasePrompt",
    "phasePrompts",
    "runnerPhasePrompt",
    "runnerPhasePrompts",
  ]) {
    if (Object.hasOwn(options, forbidden)) {
      fail("threadmesh_deterministic_adapter_plan_surface_forbidden", forbidden);
    }
  }
}

function normalizeDecision(value, allowedTools) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("threadmesh_deterministic_adapter_decision_invalid");
  }
  const toolCalls = value.toolCalls ?? [];
  if (
    !Array.isArray(toolCalls) || toolCalls.length > 4 ||
    toolCalls.some((call) =>
      !call || typeof call !== "object" || Array.isArray(call) ||
      typeof call.tool !== "string" || !allowedTools.has(call.tool) ||
      !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)
    )
  ) fail("threadmesh_deterministic_adapter_decision_invalid");
  if (typeof (value.text ?? "") !== "string") {
    fail("threadmesh_deterministic_adapter_decision_invalid");
  }
  return Object.freeze({
    text: value.text ?? "",
    toolCalls: Object.freeze(toolCalls.map((call) => Object.freeze({
      tool: call.tool,
      arguments: Object.freeze(copy(call.arguments)),
    }))),
  });
}

/**
 * In-memory, deterministic double for the Codex App Server boundary.
 *
 * The policy receives one canonical string containing only the current prompt
 * and currently registered dynamic tools. There is deliberately no plan or
 * delivery side channel.
 */
export class DeterministicNoPlanCodexAdapter {
  constructor({
    decideTurn = () => ({ text: "No relevant action.", toolCalls: [] }),
    resolveToolArguments = ({ arguments: value }) => value,
    clock = () => new Date("2026-09-01T00:00:00.000Z"),
  } = {}) {
    if (typeof decideTurn !== "function" || typeof resolveToolArguments !== "function" ||
        typeof clock !== "function") {
      fail("threadmesh_deterministic_adapter_configuration_invalid");
    }
    this.decideTurn = decideTurn;
    this.resolveToolArguments = resolveToolArguments;
    this.clock = clock;
    this.threads = new Map();
    this.deletedThreadIds = new Set();
    this.nextThread = 1;
    this.invocations = [];
  }

  async probe() {
    return {
      ok: true,
      product: "deterministic-no-plan-codex-app-server",
      snapshotDigest: SNAPSHOT_DIGEST,
    };
  }

  async createDynamicToolThread(options) {
    assertNoPlanSurface(options);
    assertInvocation(options);
    assertTools(options.dynamicTools);
    if (
      typeof options.developerInstructions !== "string" ||
      options.developerInstructions.length < 1 ||
      typeof options.bootstrapMarker !== "string" || options.bootstrapMarker.length < 1 ||
      typeof options.adapterIdempotencyKey !== "string" ||
      options.adapterIdempotencyKey.length < 1
    ) fail("codex_app_server_bootstrap_invalid");
    const threadId = `thread-deterministic-${String(this.nextThread).padStart(4, "0")}`;
    this.nextThread += 1;
    const ref = Object.freeze({
      kind: "codex-app-server",
      threadId,
      snapshotDigest: SNAPSHOT_DIGEST,
      userAgent: "threadmesh-deterministic-no-plan/1",
    });
    this.threads.set(threadId, {
      ref,
      cwd: options.cwd,
      developerInstructions: options.developerInstructions,
      registeredTools: copy(options.dynamicTools),
      turns: [],
    });
    this.invocations.push(Object.freeze({ operation: "create", threadId }));
    return ref;
  }

  async observePersistedTurns(options) {
    assertNoPlanSurface(options);
    assertInvocation(options);
    assertThreadId(options.threadId);
    const thread = this.threads.get(options.threadId);
    if (!thread) fail("codex_app_server_thread_not_found", options.threadId);
    if (options.expectedSnapshotDigest !== SNAPSHOT_DIGEST) {
      fail("codex_app_server_snapshot_mismatch");
    }
    const turns = thread.turns.map((turn) => ({
      id: turn.turnId,
      status: turn.status,
      items: [{ type: "userMessage", clientId: turn.adapterIdempotencyKey }],
    }));
    this.invocations.push(Object.freeze({
      operation: "observe",
      threadId: options.threadId,
      turnCount: turns.length,
    }));
    return createCodexPersistedTurnObservation({
      threadId: options.threadId,
      snapshotDigest: SNAPSHOT_DIGEST,
      threadStatus: turns.length === 0 ? "idle" : "notLoaded",
      readTurns: turns,
      listedTurns: turns,
    });
  }

  async runAutonomousToolTurn(options) {
    assertNoPlanSurface(options);
    assertInvocation(options);
    const allowedTools = assertTools(options.dynamicTools);
    if (
      typeof options.prompt !== "string" || options.prompt.length < 1 ||
      typeof options.onToolCall !== "function" ||
      typeof options.adapterIdempotencyKey !== "string" ||
      options.adapterIdempotencyKey.length < 1
    ) fail("codex_app_server_turn_invalid");
    const thread = this.threads.get(options.adapterRef?.threadId);
    if (
      !thread || options.adapterRef.snapshotDigest !== SNAPSHOT_DIGEST ||
      thread.ref.threadId !== options.adapterRef.threadId
    ) fail("codex_app_server_thread_not_found");

    const canonicalInput = canonicalJson({
      prompt: options.prompt,
      dynamicTools: options.dynamicTools,
    });
    assertRegisteredTools(thread, options.dynamicTools);
    const decision = normalizeDecision(
      await Reflect.apply(this.decideTurn, undefined, [canonicalInput]),
      allowedTools,
    );
    const turnId = `turn-${thread.ref.threadId}-${String(thread.turns.length + 1).padStart(4, "0")}`;
    const turn = {
      turnId,
      adapterIdempotencyKey: options.adapterIdempotencyKey,
      status: "inProgress",
      canonicalInputDigest: sha256Digest(canonicalInput),
      toolCalls: [],
    };
    thread.turns.push(turn);
    this.invocations.push(Object.freeze({
      operation: "turn",
      threadId: thread.ref.threadId,
      turnId,
      canonicalInputDigest: turn.canonicalInputDigest,
    }));

    await options.beforeTurnStart?.({
      threadId: thread.ref.threadId,
      snapshotDigest: SNAPSHOT_DIGEST,
      adapterIdempotencyKey: options.adapterIdempotencyKey,
    });
    await options.onTurnStarted?.({
      threadId: thread.ref.threadId,
      turnId,
      snapshotDigest: SNAPSHOT_DIGEST,
      adapterIdempotencyKey: options.adapterIdempotencyKey,
    });

    try {
      const priorOutputs = [];
      for (const [ordinal, selected] of decision.toolCalls.entries()) {
        const resolvedArguments = await Reflect.apply(
          this.resolveToolArguments,
          undefined,
          [{
            canonicalInput,
            ordinal,
            tool: selected.tool,
            arguments: copy(selected.arguments),
            priorOutputs: copy(priorOutputs),
          }],
        );
        if (!resolvedArguments || typeof resolvedArguments !== "object" ||
            Array.isArray(resolvedArguments)) {
          fail("threadmesh_deterministic_adapter_decision_invalid");
        }
        const metadata = {
          threadId: thread.ref.threadId,
          turnId,
          callId: `call-${turnId}-${ordinal}`,
          ordinal,
          tool: selected.tool,
          arguments: copy(resolvedArguments),
          argumentsDigest: sha256Digest(resolvedArguments),
        };
        await options.beforeToolCall?.(metadata);
        const output = await options.onToolCall(metadata);
        const completed = {
          threadId: metadata.threadId,
          turnId,
          callId: metadata.callId,
          ordinal,
          tool: metadata.tool,
          argumentsDigest: metadata.argumentsDigest,
          outputDigest: sha256Digest(output),
          resultStatus: "completed",
        };
        await options.afterToolCall?.(completed);
        turn.toolCalls.push(Object.freeze(completed));
        priorOutputs.push(copy(output));
      }
      turn.status = "completed";
    } catch (error) {
      turn.status = "failed";
      throw error;
    }

    const acceptedAt = this.clock().toISOString();
    return {
      state: "completed",
      text: decision.text,
      truncated: false,
      receipt: {
        adapterOperationId: turnId,
        acceptedAt,
        evidenceRefs: [`codex-app-server://thread/${thread.ref.threadId}/turn/${turnId}`],
      },
      evidence: {
        threadId: thread.ref.threadId,
        turnId,
        turnStatus: "completed",
        completedAt: acceptedAt,
        durationMs: 0,
        userAgent: thread.ref.userAgent,
        snapshotDigest: SNAPSHOT_DIGEST,
        serverRequestDeniedCount: 0,
        serverRequestHandledCount: turn.toolCalls.length,
        notificationCount: 0,
        deltaCount: decision.text.length === 0 ? 0 : 1,
      },
      toolCalls: [...turn.toolCalls],
      nonThreadMeshToolCalls: 0,
    };
  }

  async deleteThread(options) {
    assertNoPlanSurface(options);
    assertInvocation(options);
    assertThreadId(options.threadId);
    this.threads.delete(options.threadId);
    this.deletedThreadIds.add(options.threadId);
    this.invocations.push(Object.freeze({ operation: "delete", threadId: options.threadId }));
    return {
      threadId: options.threadId,
      deleted: true,
      snapshotDigest: SNAPSHOT_DIGEST,
    };
  }

  async confirmThreadAbsent(options) {
    assertNoPlanSurface(options);
    assertInvocation(options);
    assertThreadId(options.threadId);
    const absent = !this.threads.has(options.threadId);
    this.invocations.push(Object.freeze({
      operation: "confirm-absence",
      threadId: options.threadId,
      absent,
    }));
    return {
      absent,
      checkedBy: "deterministic-thread-store",
      snapshotDigest: SNAPSHOT_DIGEST,
    };
  }
}

export const DETERMINISTIC_NO_PLAN_CODEX_SNAPSHOT = SNAPSHOT_DIGEST;
