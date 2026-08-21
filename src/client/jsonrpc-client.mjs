import { codedError } from "../protocol-validator.mjs";

export class ThreadMeshJsonRpcClient {
  constructor({ send, authorization, idPrefix = "rpc" }) {
    if (typeof send !== "function" || typeof authorization !== "string") {
      throw codedError("threadmesh_client_configuration_invalid");
    }
    this.send = send;
    this.authorization = authorization;
    this.idPrefix = idPrefix;
    this.sequence = 0;
  }

  call(method, params) {
    this.sequence += 1;
    const response = this.send(
      {
        jsonrpc: "2.0",
        id: `${this.idPrefix}-${this.sequence}`,
        method,
        params,
      },
      { authorization: this.authorization },
    );
    if (response.error) {
      const error = codedError(
        response.error.data.threadmeshCode,
        response.error.data.detail,
      );
      error.rpcCode = response.error.code;
      error.retryable = response.error.data.retryable;
      throw error;
    }
    return response.result.value;
  }
}

export class PullMailboxHarness {
  constructor(client, task) {
    this.client = client;
    this.task = task;
  }

  next({ afterCursor = 0, limit = 1 } = {}) {
    return this.client.call("mailbox.listPending", {
      receiver: this.task,
      afterCursor,
      limit,
    });
  }

  sideChannelNext({ afterCursor = 0 } = {}) {
    const page = this.next({ afterCursor });
    const message = page.messages[0] ?? null;
    if (
      message &&
      (message.envelope.intent !== "notify" ||
        message.envelope.delivery.requestedMode !== "side-channel")
    ) {
      throw codedError("threadmesh_mock_side_channel_message_invalid");
    }
    return { page, message, modelVisible: false };
  }

  decideNext(decision, { afterCursor = 0 } = {}) {
    if (!["accepted", "rejected", "deferred"].includes(decision)) {
      throw codedError("threadmesh_mock_decision_invalid");
    }
    const page = this.next({ afterCursor });
    const next = page.messages[0];
    if (!next) return { page, decision: null };
    const claim = this.client.call("mailbox.claim", {
      senderIncarnationId: next.envelope.sender.incarnationId,
      messageId: next.envelope.messageId,
      expectedRevision: next.disposition.revision,
      idempotencyKey: `idem_claim_${next.envelope.messageId}`,
    });
    const acknowledged = this.client.call("mailbox.ack", {
      senderIncarnationId: next.envelope.sender.incarnationId,
      messageId: next.envelope.messageId,
      claimToken: claim.value.claimToken,
      decision,
      expectedRevision: next.disposition.revision,
      idempotencyKey: `idem_ack_${next.envelope.messageId}`,
    });
    return { page, claim, decision: acknowledged };
  }

  respond(message, decision, reasonCode) {
    return this.client.call("messages.respond", {
      senderIncarnationId: message.envelope.sender.incarnationId,
      messageId: message.envelope.messageId,
      decision,
      reasonCode,
      expectedRevision: message.disposition.revision,
      idempotencyKey: `idem_respond_${message.envelope.messageId}_${decision}`,
    });
  }

  acceptNext(options = {}) {
    const result = this.decideNext("accepted", options);
    return {
      ...result,
      accepted: result.decision,
    };
  }
}

export class EventWatchingHarness {
  constructor(client, task) {
    this.client = client;
    this.task = task;
  }

  observe({ afterCursor = 0 } = {}) {
    return this.client.call("tasks.wait", {
      task: this.task,
      afterCursor,
      limit: 100,
    });
  }

  disposition(senderIncarnationId, messageId) {
    return this.client.call("messages.getDisposition", {
      senderIncarnationId,
      messageId,
    });
  }

  summary(task, relationshipId) {
    return this.client.call("tasks.getSummary", { task, relationshipId });
  }

  audit(senderIncarnationId, messageId) {
    return this.client.call("audit.list", { senderIncarnationId, messageId });
  }

  inspect(senderIncarnationId, messageId) {
    return this.client.call("inspector.snapshot", {
      senderIncarnationId,
      messageId,
    });
  }
}

export const MOCK_HARNESS_PROFILES = Object.freeze({
  eventWatcher: Object.freeze({
    specVersion: "0.0-draft",
    adapterName: "threadmesh-mock-event-watcher",
    adapterVersion: "0.0.0",
    harness: { name: "mock-event-watcher" },
    intents: ["notify", "suggest"],
    deliveryModes: ["side-channel", "checkpoint-offer"],
    features: {
      relatedTaskDiscovery: "relationship-scoped",
      taskIncarnation: true,
      objectiveVersioning: false,
      checkpointEvents: true,
      idleWake: false,
      modelTurnCancellation: false,
      subprocessCancellation: false,
      contextAdmission: "none",
      provenanceRendering: "side-channel-only",
      dispositionCallbacks: true,
      structuredGateResponses: "none",
      durableSubmissionIdempotency: "none",
      typedInterruptionResults: false,
    },
  }),
  pullMailbox: Object.freeze({
    specVersion: "0.0-draft",
    adapterName: "threadmesh-mock-pull-mailbox",
    adapterVersion: "0.0.0",
    harness: { name: "mock-pull-mailbox" },
    intents: ["notify", "suggest"],
    deliveryModes: ["side-channel", "checkpoint-offer"],
    features: {
      relatedTaskDiscovery: "relationship-scoped",
      taskIncarnation: true,
      objectiveVersioning: true,
      checkpointEvents: true,
      idleWake: false,
      modelTurnCancellation: false,
      subprocessCancellation: false,
      contextAdmission: "receiver-mediated",
      provenanceRendering: "model-visible",
      dispositionCallbacks: true,
      structuredGateResponses: "none",
      durableSubmissionIdempotency: "none",
      typedInterruptionResults: false,
    },
  }),
});
