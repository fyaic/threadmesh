import { createHash, randomUUID } from "node:crypto";

const DECISIONS = new Set(["accepted", "rejected", "deferred"]);
const MAX_SUGGESTION_TTL_MS = 30 * 60 * 1000;
const MAX_PROACTIVE_RELATIONSHIPS = 20;
const MAX_PROACTIVE_TURN_BUDGET = 10;
const INCARNATION_ID_PATTERN = /^inc_[A-Za-z0-9][A-Za-z0-9._:-]{6,196}$/;
const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9][A-Za-z0-9._:-]{6,196}$/;
const RELATIONSHIP_ID_PATTERN = /^rel_[A-Za-z0-9][A-Za-z0-9._:-]{2,196}$/;

export const THREADMESH_PROACTIVE_TOOL_NAMES = Object.freeze({
  discover: "threadmesh_related_tasks",
  suggest: "threadmesh_send_suggestion",
});

export class ThreadMeshClientError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = "ThreadMeshClientError";
    this.code = code;
    if (options.rpcCode !== undefined) this.rpcCode = options.rpcCode;
    if (options.retryable !== undefined) this.retryable = options.retryable;
  }
}

function fail(code) {
  throw new ThreadMeshClientError(code);
}

function idempotencyKey(scope, value) {
  const digest = createHash("sha256").update(String(value)).digest("hex");
  return `idem_${scope}_${digest}`;
}

function operationValue(result) {
  if (
    result && typeof result === "object" &&
    typeof result.operationReplay === "boolean" &&
    Object.hasOwn(result, "value")
  ) {
    return {
      ...result.value,
      operationReplay: result.operationReplay,
    };
  }
  return result;
}

function assertTaskRef(task, { harness = false } = {}) {
  if (
    !task || typeof task.taskId !== "string" || task.taskId.length < 1 ||
    task.taskId.length > 200 || typeof task.incarnationId !== "string" ||
    !INCARNATION_ID_PATTERN.test(task.incarnationId) ||
    (harness && (
      typeof task.harness !== "string" || task.harness.length < 1 || task.harness.length > 200
    ))
  ) fail("threadmesh_client_task_invalid");
}

function assertExactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
}

function assertTurnBudget(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_PROACTIVE_TURN_BUDGET) {
    fail("threadmesh_proactive_bridge_budget_invalid");
  }
}

function normalizeRelationships(relationships) {
  if (
    !Array.isArray(relationships) || relationships.length < 1 ||
    relationships.length > MAX_PROACTIVE_RELATIONSHIPS
  ) fail("threadmesh_proactive_bridge_relationships_invalid");

  const taskIds = new Set();
  const relationshipIds = new Set();
  return relationships.map((relationship) => {
    if (
      !relationship || typeof relationship !== "object" ||
      typeof relationship.relationshipId !== "string" ||
      !RELATIONSHIP_ID_PATTERN.test(relationship.relationshipId)
    ) fail("threadmesh_proactive_bridge_relationships_invalid");
    assertTaskRef(relationship.target, { harness: true });
    if (
      taskIds.has(relationship.target.taskId) ||
      relationshipIds.has(relationship.relationshipId)
    ) fail("threadmesh_proactive_bridge_relationships_invalid");
    taskIds.add(relationship.target.taskId);
    relationshipIds.add(relationship.relationshipId);
    return Object.freeze({
      relationshipId: relationship.relationshipId,
      target: Object.freeze({
        taskId: relationship.target.taskId,
        incarnationId: relationship.target.incarnationId,
        harness: relationship.target.harness,
      }),
    });
  });
}

function proactiveTools(targetTaskIds) {
  return Object.freeze([
    Object.freeze({
      type: "function",
      name: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
      description:
        "Read the bounded summaries of host-authorized related tasks before deciding whether the current result should be shared. This tool never sends or changes another task.",
      inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
    }),
    Object.freeze({
      type: "function",
      name: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
      description:
        "After related-task discovery, send one advisory suggestion only when a returned summary explicitly needs the current result. The receiver decides whether to admit it.",
      inputSchema: Object.freeze({
        type: "object",
        additionalProperties: false,
        required: Object.freeze(["targetTaskId", "content", "reason"]),
        properties: Object.freeze({
          targetTaskId: Object.freeze({ type: "string", enum: Object.freeze([...targetTaskIds]) }),
          content: Object.freeze({
            type: "string",
            minLength: 1,
            maxLength: 20_000,
          }),
          reason: Object.freeze({
            type: "string",
            minLength: 1,
            maxLength: 2_000,
          }),
        }),
      }),
    }),
  ]);
}

/**
 * Minimal transport-agnostic client for adding ThreadMesh to an agent harness.
 * The caller supplies an authenticated JSON-RPC transport; credentials never
 * enter request params.
 */
export class ThreadMeshClient {
  #authorization;
  #clock;
  #idPrefix;
  #send;
  #sequence = 0;

  constructor({ send, authorization, idPrefix = "adapter", clock = Date.now }) {
    if (
      typeof send !== "function" || typeof authorization !== "string" ||
      authorization.length === 0 || typeof idPrefix !== "string" ||
      idPrefix.length === 0 || typeof clock !== "function"
    ) fail("threadmesh_client_configuration_invalid");
    this.#send = send;
    this.#authorization = authorization;
    this.#idPrefix = idPrefix;
    this.#clock = clock;
  }

  async #call(method, params) {
    this.#sequence += 1;
    const response = await this.#send({
      jsonrpc: "2.0",
      id: `${this.#idPrefix}-${this.#sequence}`,
      method,
      params,
    }, { authorization: this.#authorization });

    if (!response || typeof response !== "object") {
      fail("threadmesh_client_response_invalid");
    }
    if (response.error) {
      const code = typeof response.error.data?.threadmeshCode === "string"
        ? response.error.data.threadmeshCode
        : "threadmesh_remote_error";
      throw new ThreadMeshClientError(code, {
        rpcCode: response.error.code,
        retryable: response.error.data?.retryable === true,
      });
    }
    if (!response.result || !Object.hasOwn(response.result, "value")) {
      fail("threadmesh_client_response_invalid");
    }
    return response.result.value;
  }

  async registerTask(task, { idempotencyKey: key } = {}) {
    assertTaskRef(task, { harness: true });
    return operationValue(await this.#call("tasks.register", {
      task,
      idempotencyKey: key ?? idempotencyKey("register", task.incarnationId),
    }));
  }

  async publishSummary(summary, { expectedPreviousVersion = null, idempotencyKey: key } = {}) {
    if (!summary || typeof summary.summaryId !== "string") {
      fail("threadmesh_client_summary_invalid");
    }
    return operationValue(await this.#call("tasks.publishSummary", {
      summary,
      expectedPreviousVersion,
      idempotencyKey: key ?? idempotencyKey(
        "summary",
        `${summary.summaryId}:${summary.summaryVersion}`,
      ),
    }));
  }

  async discoverRelated({ task, relationshipId }) {
    assertTaskRef(task);
    if (typeof relationshipId !== "string" || relationshipId.length === 0) {
      fail("threadmesh_client_relationship_invalid");
    }
    return this.#call("tasks.getSummary", { task, relationshipId });
  }

  async sendSuggestion({
    messageId,
    from,
    to,
    relationshipId,
    content,
    reason,
    ttlMs = 5 * 60 * 1000,
    deliveryMode = "checkpoint-offer",
    idempotencyKey: key,
  }) {
    assertTaskRef(from, { harness: true });
    assertTaskRef(to);
    if (
      typeof messageId !== "string" || !MESSAGE_ID_PATTERN.test(messageId) ||
      typeof relationshipId !== "string" || !RELATIONSHIP_ID_PATTERN.test(relationshipId) ||
      typeof content !== "string" || content.length < 1 || content.length > 20_000 ||
      typeof reason !== "string" || reason.length < 1 || reason.length > 2_000 ||
      !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_SUGGESTION_TTL_MS ||
      !["store-only", "side-channel", "checkpoint-offer", "wake-idle"].includes(deliveryMode)
    ) fail("threadmesh_client_suggestion_invalid");

    const createdAt = new Date(this.#clock()).toISOString();
    const envelope = {
      specVersion: "0.0-draft",
      messageId,
      messageType: "suggestion",
      intent: "suggest",
      claimStatus: "sender-asserted",
      sender: { ...from, actorType: "agent" },
      target: to,
      relationshipId,
      content,
      reason,
      delivery: { requestedMode: deliveryMode, requiresDisposition: true },
      createdAt,
      expiresAt: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
    };
    return operationValue(await this.#call("messages.send", {
      envelope,
      idempotencyKey: key ?? idempotencyKey("send", messageId),
    }));
  }

  async pollMailbox({ receiver, afterCursor = 0, limit = 10 }) {
    assertTaskRef(receiver);
    if (!Number.isInteger(afterCursor) || afterCursor < 0) {
      fail("threadmesh_client_cursor_invalid");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      fail("threadmesh_client_limit_invalid");
    }
    return this.#call("mailbox.listPending", { receiver, afterCursor, limit });
  }

  async decide({ message, decision }) {
    if (
      !message?.envelope || !message?.disposition ||
      !DECISIONS.has(decision)
    ) fail("threadmesh_client_decision_invalid");
    const senderIncarnationId = message.envelope.sender?.incarnationId;
    const messageId = message.envelope.messageId;
    const expectedRevision = message.disposition.revision;
    if (
      typeof senderIncarnationId !== "string" || typeof messageId !== "string" ||
      !Number.isInteger(expectedRevision)
    ) fail("threadmesh_client_message_invalid");

    // A deferred message has already consumed its mailbox claim. Its later
    // terminal decision uses disposition CAS directly instead of attempting to
    // reuse an acknowledged claim.
    if (message.claim?.state === "acknowledged") {
      const disposition = operationValue(await this.#call("messages.respond", {
        senderIncarnationId,
        messageId,
        decision,
        expectedRevision,
        idempotencyKey: idempotencyKey(
          "respond",
          `${senderIncarnationId}:${messageId}:${expectedRevision}:${decision}`,
        ),
      }));
      return { claim: null, disposition };
    }

    const claim = operationValue(await this.#call("mailbox.claim", {
      senderIncarnationId,
      messageId,
      expectedRevision,
      idempotencyKey: idempotencyKey(
        "claim",
        `${senderIncarnationId}:${messageId}:${expectedRevision}`,
      ),
    }));
    const disposition = operationValue(await this.#call("mailbox.ack", {
      senderIncarnationId,
      messageId,
      claimToken: claim.claimToken,
      decision,
      expectedRevision,
      idempotencyKey: idempotencyKey(
        "ack",
        `${senderIncarnationId}:${messageId}:${decision}`,
      ),
    }));
    return {
      claim: {
        expiresAt: claim.expiresAt,
        replay: claim.replay,
        operationReplay: claim.operationReplay,
      },
      disposition,
    };
  }
}

export function createThreadMeshClient(options) {
  return new ThreadMeshClient(options);
}

/**
 * Creates one bounded model-turn bridge between a harness's native tool API and
 * ThreadMesh. Create a fresh bridge for every model turn; counters are reserved
 * before transport calls so concurrent or failed calls cannot exceed budgets.
 *
 * Relationship candidates are supplied by the authenticated host. The model
 * cannot enumerate global tasks or choose an unconfigured relationship.
 */
export function createProactiveToolBridge({
  client,
  source,
  relationships,
  discoveryBudget = 1,
  sendBudget = 1,
  ttlMs = 5 * 60 * 1000,
  deliveryMode = "checkpoint-offer",
  createMessageId = () => `msg_${randomUUID().replaceAll("-", "")}`,
}) {
  if (
    !client || typeof client.discoverRelated !== "function" ||
    typeof client.sendSuggestion !== "function" ||
    typeof createMessageId !== "function"
  ) fail("threadmesh_proactive_bridge_configuration_invalid");
  assertTaskRef(source, { harness: true });
  assertTurnBudget(discoveryBudget);
  assertTurnBudget(sendBudget);
  if (
    !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_SUGGESTION_TTL_MS ||
    !["store-only", "side-channel", "checkpoint-offer", "wake-idle"].includes(deliveryMode)
  ) fail("threadmesh_proactive_bridge_configuration_invalid");

  const boundedRelationships = normalizeRelationships(relationships);
  const boundedSource = Object.freeze({
    taskId: source.taskId,
    incarnationId: source.incarnationId,
    harness: source.harness,
  });
  const byTaskId = new Map(boundedRelationships.map((value) => [value.target.taskId, value]));
  const tools = proactiveTools(byTaskId.keys());
  const discoveredSuggestTargets = new Set();
  const sentTaskIds = [];
  let discoveryCalls = 0;
  let sendCalls = 0;
  let discoveryCompleted = false;

  async function discover(value) {
    assertExactObject(value, [], "threadmesh_proactive_bridge_discovery_invalid");
    if (discoveryCalls >= discoveryBudget) {
      fail("threadmesh_proactive_bridge_discovery_budget_exceeded");
    }
    discoveryCalls += 1;

    const tasks = [];
    for (const relationship of boundedRelationships) {
      const summary = await client.discoverRelated({
        task: relationship.target,
        relationshipId: relationship.relationshipId,
      });
      if (
        summary?.task?.taskId !== relationship.target.taskId ||
        summary.task.incarnationId !== relationship.target.incarnationId
      ) fail("threadmesh_proactive_bridge_summary_mismatch");
      if (summary.coordination?.intents?.includes("suggest")) {
        discoveredSuggestTargets.add(relationship.target.taskId);
      }
      tasks.push(summary);
    }
    discoveryCompleted = true;
    return { tasks };
  }

  async function suggest(value) {
    if (!discoveryCompleted) fail("threadmesh_proactive_bridge_discovery_required");
    if (sendCalls >= sendBudget) fail("threadmesh_proactive_bridge_send_budget_exceeded");
    sendCalls += 1;
    assertExactObject(
      value,
      ["targetTaskId", "content", "reason"],
      "threadmesh_proactive_bridge_suggestion_invalid",
    );
    if (
      typeof value.targetTaskId !== "string" ||
      typeof value.content !== "string" || value.content.length < 1 ||
      value.content.length > 20_000 ||
      typeof value.reason !== "string" || value.reason.length < 1 ||
      value.reason.length > 2_000
    ) fail("threadmesh_proactive_bridge_suggestion_invalid");

    const relationship = byTaskId.get(value.targetTaskId);
    if (!relationship) fail("threadmesh_proactive_bridge_target_unknown");
    if (!discoveredSuggestTargets.has(value.targetTaskId)) {
      fail("threadmesh_proactive_bridge_target_not_suggestable");
    }
    const messageId = createMessageId({
      source: { ...boundedSource },
      target: { ...relationship.target },
      relationshipId: relationship.relationshipId,
      sendIndex: sendCalls,
    });
    if (typeof messageId !== "string" || !MESSAGE_ID_PATTERN.test(messageId)) {
      fail("threadmesh_proactive_bridge_message_id_invalid");
    }

    const sent = await client.sendSuggestion({
      messageId,
      from: boundedSource,
      to: relationship.target,
      relationshipId: relationship.relationshipId,
      content: value.content,
      reason: value.reason,
      ttlMs,
      deliveryMode,
    });
    sentTaskIds.push(value.targetTaskId);
    return {
      sent: true,
      messageId,
      targetTaskId: value.targetTaskId,
      relationshipId: relationship.relationshipId,
      delivery: sent?.disposition?.delivery ?? "queued",
      decision: sent?.disposition?.decision ?? "pending",
    };
  }

  async function handleToolCall(call) {
    if (!call || typeof call !== "object" || typeof call.tool !== "string") {
      fail("threadmesh_proactive_bridge_tool_unsupported");
    }
    const value = call.arguments;
    if (call.tool === THREADMESH_PROACTIVE_TOOL_NAMES.discover) return discover(value ?? {});
    if (call.tool === THREADMESH_PROACTIVE_TOOL_NAMES.suggest) return suggest(value);
    fail("threadmesh_proactive_bridge_tool_unsupported");
  }

  function usage() {
    return Object.freeze({
      discoveryCalls,
      sendCalls,
      discoveryCompleted,
      sentTaskIds: Object.freeze([...sentTaskIds]),
    });
  }

  return Object.freeze({ tools, handleToolCall, usage });
}

export const THREADMESH_ADAPTER_LIMITS = Object.freeze({
  maxSuggestionTtlMs: MAX_SUGGESTION_TTL_MS,
  maxSuggestionContentLength: 20_000,
  maxSuggestionReasonLength: 2_000,
  maxProactiveRelationships: MAX_PROACTIVE_RELATIONSHIPS,
  maxProactiveTurnBudget: MAX_PROACTIVE_TURN_BUDGET,
});
