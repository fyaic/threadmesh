import { assertProtocolObject, codedError } from "../protocol-validator.mjs";

const RETRYABLE_CODES = new Set([
  "threadmesh_revision_conflict",
  "threadmesh_mailbox_claim_expired",
  "threadmesh_relationship_proposal_not_pending",
]);

function rpcCode(code) {
  if (code === "threadmesh_authentication_required") return -32001;
  if (
    code === "threadmesh_policy_denied" ||
    code.includes("not_authorized") ||
    code.includes("authority_required")
  ) {
    return -32003;
  }
  if (code.includes("not_found") || code.includes("not_registered")) return -32004;
  if (code.includes("conflict") || code.includes("in_flight")) return -32009;
  if (code.includes("expired") || code.includes("retired")) return -32010;
  if (code.endsWith("_invalid") || code === "threadmesh_jsonrpc_invalid") return -32602;
  return -32000;
}

function rpcError(id, error) {
  const threadmeshCode =
    typeof error?.code === "string" && error.code.startsWith("threadmesh_")
      ? error.code
      : "threadmesh_internal_error";
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code: rpcCode(threadmeshCode),
      message: threadmeshCode,
      data: {
        threadmeshCode,
        retryable: RETRYABLE_CODES.has(threadmeshCode),
        ...(error?.message && error.message !== threadmeshCode
          ? { detail: error.message.slice(0, 2000) }
          : {}),
      },
    },
  };
}

export class StaticTokenAuthenticator {
  constructor(credentials = []) {
    this.credentials = new Map();
    const authenticationIds = new Set();
    for (const credential of credentials) {
      if (!credential?.token || !credential?.context) {
        throw codedError("threadmesh_authenticator_configuration_invalid");
      }
      assertProtocolObject("auth-context", credential.context);
      if (credential.context.mechanism !== "local-static-token") {
        throw codedError("threadmesh_authenticator_mechanism_mismatch");
      }
      if (
        this.credentials.has(credential.token) ||
        authenticationIds.has(credential.context.authenticationId)
      ) {
        throw codedError("threadmesh_authenticator_configuration_invalid");
      }
      this.credentials.set(credential.token, structuredClone(credential.context));
      authenticationIds.add(credential.context.authenticationId);
    }
  }

  authenticate(transportContext) {
    const authorization = transportContext?.authorization;
    if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
      throw codedError("threadmesh_authentication_required");
    }
    const token = authorization.slice("Bearer ".length);
    const context = this.credentials.get(token);
    if (!context) throw codedError("threadmesh_authentication_required");
    return structuredClone(context);
  }
}

export class ThreadMeshJsonRpcBinding {
  constructor({ coordinator, authenticator, clock = Date.now }) {
    if (!coordinator || !authenticator) {
      throw codedError("threadmesh_binding_configuration_invalid");
    }
    this.coordinator = coordinator;
    this.authenticator = authenticator;
    this.clock = clock;
  }

  handle(request, transportContext = {}) {
    const id = request && typeof request === "object" ? request.id : null;
    try {
      assertProtocolObject("jsonrpc-request", request);
      const auth = this.authenticator.authenticate(transportContext);
      const value = this.#dispatch(request.method, request.params, auth);
      const response = {
        jsonrpc: "2.0",
        id: request.id,
        result: { method: request.method, value },
      };
      assertProtocolObject("jsonrpc-response", response);
      return response;
    } catch (error) {
      const response = rpcError(id, error);
      assertProtocolObject("jsonrpc-response", response);
      return response;
    }
  }

  #dispatch(method, params, auth) {
    const principal = auth.principal;
    const invoke = () => {
      switch (method) {
        case "tasks.register":
          return this.coordinator.registerTask(params.task, principal);
        case "tasks.get":
          return this.coordinator.getTask(params.task, principal);
        case "tasks.attach":
          return this.coordinator.attachTask(
            params.task,
            params.adapterRef,
            params.expectedRevision,
            principal,
          );
        case "tasks.rotateIncarnation":
          return this.coordinator.rotateTaskIncarnation(
            params.previous,
            params.next,
            params.expectedRevision,
            principal,
          );
        case "tasks.publishSummary":
          return this.coordinator.publishTaskSummary(
            params.summary,
            params.expectedPreviousVersion,
            principal,
          );
        case "tasks.getSummary":
          return this.coordinator.getTaskSummary(
            params.task,
            params.relationshipId,
            principal,
          );
        case "relationships.propose":
          return this.coordinator.proposeRelationship(params.proposal, principal);
        case "relationships.grant":
          return this.coordinator.issueGrant(
            params.grant,
            {
              ...params.decision,
              authenticationId: auth.authenticationId,
              decidedAt: new Date(this.clock()).toISOString(),
            },
            principal,
          );
        case "relationships.revoke":
          return this.coordinator.revokeGrant(
            params.grantId,
            params.expectedGrantVersion,
            principal,
          );
        case "messages.send":
          return this.coordinator.submit(params.envelope, principal);
        case "messages.respond":
          return this.coordinator.respond(
            params.senderIncarnationId,
            params.messageId,
            params.decision,
            params.expectedRevision,
            principal,
          );
        case "messages.getDisposition":
          return this.coordinator.getDisposition(
            params.senderIncarnationId,
            params.messageId,
            principal,
          );
        case "adapter.prepareSubmission":
          return this.coordinator.prepareAdapterSubmission(
            params.senderIncarnationId,
            params.messageId,
            params.expectedRevision,
            principal,
          );
        case "adapter.beginSubmission":
          return this.coordinator.beginAdapterSubmission(
            params.submissionId,
            params.expectedRevision,
            principal,
          );
        case "adapter.recordReceipt":
          return this.coordinator.recordAdapterReceipt(
            params.submissionId,
            params.expectedRevision,
            params.receipt,
            principal,
          );
        case "adapter.reconcileSubmission":
          return this.coordinator.reconcileAdapterSubmission(
            params.submissionId,
            params.expectedRevision,
            params.reconciliation,
            principal,
          );
        case "adapter.getSubmission":
          return this.coordinator.getAdapterSubmission(params.submissionId, principal);
        case "maintenance.expireDue":
          return this.coordinator.expireDueMessages(
            { limit: params.limit },
            principal,
          );
        case "mailbox.listPending":
          return this.coordinator.listPending(
            params.receiver,
            { afterCursor: params.afterCursor, limit: params.limit },
            principal,
          );
        case "mailbox.claim":
          return this.coordinator.claimPending(
            params.senderIncarnationId,
            params.messageId,
            params.expectedRevision,
            principal,
          );
        case "mailbox.ack":
          return this.coordinator.acknowledgePending(
            params.senderIncarnationId,
            params.messageId,
            params.claimToken,
            params.decision,
            params.expectedRevision,
            principal,
          );
        case "tasks.wait":
          return this.coordinator.waitTask(
            params.task,
            { afterCursor: params.afterCursor, limit: params.limit },
            principal,
          );
        case "audit.list":
          return this.coordinator.auditEvents(
            params.senderIncarnationId,
            params.messageId,
            principal,
          );
        default:
          throw codedError("threadmesh_jsonrpc_method_not_found");
      }
    };

    if (!params.idempotencyKey) return invoke();
    const outcome = this.coordinator.executeIdempotent(
      auth.authenticationId,
      method,
      params.idempotencyKey,
      params,
      invoke,
    );
    return { operationReplay: outcome.replay, value: outcome.value };
  }
}
