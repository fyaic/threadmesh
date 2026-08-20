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

  acceptNext({ afterCursor = 0 } = {}) {
    const page = this.client.call("mailbox.listPending", {
      receiver: this.task,
      afterCursor,
      limit: 1,
    });
    const next = page.messages[0];
    if (!next) return { page, accepted: null };
    const claim = this.client.call("mailbox.claim", {
      senderIncarnationId: next.envelope.sender.incarnationId,
      messageId: next.envelope.messageId,
      expectedRevision: next.disposition.revision,
      idempotencyKey: `idem_claim_${next.envelope.messageId}`,
    });
    const accepted = this.client.call("mailbox.ack", {
      senderIncarnationId: next.envelope.sender.incarnationId,
      messageId: next.envelope.messageId,
      claimToken: claim.value.claimToken,
      decision: "accepted",
      expectedRevision: next.disposition.revision,
      idempotencyKey: `idem_ack_${next.envelope.messageId}`,
    });
    return { page, claim, accepted };
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
}
