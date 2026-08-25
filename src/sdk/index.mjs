import { createHash } from "node:crypto";

const DECISIONS = new Set(["accepted", "rejected", "deferred"]);
const MAX_SUGGESTION_TTL_MS = 30 * 60 * 1000;

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
    !task || typeof task.taskId !== "string" ||
    typeof task.incarnationId !== "string" ||
    (harness && typeof task.harness !== "string")
  ) fail("threadmesh_client_task_invalid");
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
      typeof messageId !== "string" || typeof relationshipId !== "string" ||
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

export const THREADMESH_ADAPTER_LIMITS = Object.freeze({
  maxSuggestionTtlMs: MAX_SUGGESTION_TTL_MS,
  maxSuggestionContentLength: 20_000,
  maxSuggestionReasonLength: 2_000,
});
