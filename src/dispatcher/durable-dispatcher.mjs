import { codedError } from "../protocol-validator.mjs";

function publicDispatchError(error) {
  return typeof error?.code === "string" && error.code.startsWith("threadmesh_")
    ? error.code
    : "threadmesh_adapter_dispatch_error";
}

export class DurableDispatcher {
  constructor({ coordinator, adapters = [] } = {}) {
    if (!coordinator) throw codedError("threadmesh_dispatcher_configuration_invalid");
    this.coordinator = coordinator;
    this.adapters = new Map();
    for (const adapter of adapters) {
      if (
        !adapter ||
        typeof adapter.kind !== "string" ||
        typeof adapter.submit !== "function" ||
        this.adapters.has(adapter.kind)
      ) {
        throw codedError("threadmesh_dispatcher_adapter_invalid");
      }
      this.adapters.set(adapter.kind, adapter);
    }
  }

  async dispatch(
    { senderIncarnationId, messageId, expectedRevision },
    principal,
  ) {
    const prepared = this.coordinator.prepareAdapterSubmission(
      senderIncarnationId,
      messageId,
      expectedRevision,
      principal,
    );
    const prior = prepared.submission;
    if (prior.state === "receipt-recorded") {
      return { state: "receipt-recorded", replay: true, submission: prior };
    }
    if (prior.state === "outcome-unknown") {
      return {
        state: "outcome-unknown",
        replay: true,
        retrySuppressed: true,
        submission: prior,
      };
    }
    if (prior.state === "manual-reconciliation") {
      return {
        state: "manual-reconciliation",
        replay: true,
        retrySuppressed: true,
        submission: prior,
      };
    }

    const adapter = this.adapters.get(prepared.adapterRef.kind);
    const supported =
      adapter &&
      (typeof adapter.supports !== "function" ||
        adapter.supports({
          adapterRef: prepared.adapterRef,
          envelope: prepared.envelope,
        }) === true);
    if (!supported) {
      const disposition = this.coordinator.failDelivery(
        senderIncarnationId,
        messageId,
        expectedRevision,
        "adapter-kind-unsupported",
        principal,
      );
      return {
        state: "failed",
        replay: false,
        adapterCalled: false,
        reasonCode: "unsupported-delivery-mode",
        disposition,
      };
    }

    const begun = this.coordinator.beginAdapterSubmission(
      prior.submissionId,
      expectedRevision,
      principal,
    );
    if (begun.replay || !begun.dispatch) {
      return {
        state: "outcome-unknown",
        replay: true,
        retrySuppressed: true,
        submission: begun.submission,
      };
    }

    let receipt;
    try {
      receipt = await adapter.submit({
        submissionId: begun.submission.submissionId,
        adapterIdempotencyKey: begun.submission.adapterIdempotencyKey,
        adapterRef: begun.dispatch.adapterRef,
        envelope: begun.dispatch.envelope,
      });
      if (
        !receipt ||
        typeof receipt.adapterOperationId !== "string" ||
        typeof receipt.acceptedAt !== "string"
      ) {
        throw codedError("threadmesh_adapter_receipt_invalid");
      }
    } catch (error) {
      return {
        state: "outcome-unknown",
        replay: false,
        retrySuppressed: true,
        dispatchErrorCode: publicDispatchError(error),
        submission: this.coordinator.getAdapterSubmission(
          begun.submission.submissionId,
          principal,
        ),
      };
    }

    const recorded = this.coordinator.recordAdapterReceipt(
      begun.submission.submissionId,
      expectedRevision,
      receipt,
      principal,
    );
    return {
      state: "receipt-recorded",
      replay: false,
      adapterCalled: true,
      ...recorded,
    };
  }
}
