import path from "node:path";

import { sha256Digest } from "../canonical-json.mjs";
import { renderRegisteredPeerOffer } from "../rendering/context-admission.mjs";
import {
  createAdmittedTurnBinding,
  createCompletedDecisionCommit,
  createRecoveredDecisionCommit,
} from "../validation/live-agent-scenario.mjs";

const DECISION_TOOL = "threadmesh_decide_offer";
const DECISION_REASONS = Object.freeze({
  accepted: "accepted",
  deferred: "receiver-deferred",
  rejected: "receiver-rejected",
});

function coded(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function digestId(prefix, value) {
  return `${prefix}_${sha256Digest(value).slice("sha256:".length, "sha256:".length + 32)}`;
}

function recovery(filename, executionId) {
  return Object.freeze({
    filename,
    executionId,
    async onOutcomeUnknown() {},
    async onTerminalReconciliation() {},
  });
}

function completionBinding(turn, execution) {
  return {
    evidence: turn.evidence,
    receipt: turn.receipt,
    adapterReceiptDigest: sha256Digest(turn.receipt),
    toolCalls: execution.actions.map((action) => ({
      ordinal: action.ordinal,
      turnId: action.turnId,
      callId: action.callId,
      tool: action.name,
      argumentsDigest: action.argumentsDigest,
      outputDigest: action.resultDigest,
      resultStatus: action.resultStatus,
    })),
    nonThreadMeshToolCalls: 0,
  };
}

function decisionProjection(messageId, receiver, decision, revision) {
  return {
    messageId,
    receiver: {
      taskId: receiver.taskId,
      incarnationId: receiver.incarnationId,
    },
    decision: {
      state: decision,
      reasonCode: DECISION_REASONS[decision],
      decisionRevision: revision + 1,
    },
  };
}

function exactNextEvent(coordinator, receiver, principal, cursorState) {
  if (cursorState.activeClaim) {
    return {
      cursor: cursorState.activeClaim.eventCursor,
      eventId: cursorState.activeClaim.eventId,
      messageId: cursorState.activeClaim.messageId,
      senderIncarnationId: cursorState.activeClaim.senderIncarnationId,
    };
  }
  const page = coordinator.readAttentionEvents(
    receiver,
    { afterCursor: cursorState.cursor.committedCursor, limit: 1 },
    principal,
  );
  const next = page.events[0];
  if (!next || next.cursor <= cursorState.cursor.committedCursor) {
    throw coded("threadmesh_activation_next_event_missing");
  }
  if (next.eventType !== "message-durably-received") {
    throw coded("threadmesh_activation_next_event_not_lifecycle_message");
  }
  return next;
}

function getExecution(coordinator, executionId, principal) {
  try { return coordinator.getTurnExecution(executionId, principal); } catch (error) {
    if (error?.code === "threadmesh_turn_execution_not_found") return null;
    throw error;
  }
}

function recoverDecision(coordinator, claimEpoch, executionId, principal) {
  try {
    return coordinator.recoverReceiverDecisionCommit(claimEpoch, executionId, principal);
  } catch (error) {
    if (error?.code === "threadmesh_receiver_decision_commit_missing") return null;
    throw error;
  }
}

function recoverAdmission(coordinator, senderIncarnationId, messageId, principal) {
  try {
    return coordinator.recoverContextAdmission(senderIncarnationId, messageId, principal);
  } catch (error) {
    if (error?.code === "threadmesh_context_admission_missing") return null;
    throw error;
  }
}

/**
 * Execute exactly one coordinator-selected lifecycle activation. The driver never
 * accepts a raw prompt or a plan, and it deliberately stops before publishing a
 * subsequent lifecycle event.
 */
export async function runCoordinatorActivation({
  coordinator: initialCoordinator,
  runtime,
  receiver,
  principal,
  role,
  cwd,
  ref,
  routeProjection,
  scenarioId,
  chainId,
  recoveryDirectory,
  businessPhase = "admitted-business",
  decisionPhase = "receiver-decision",
  businessTool,
  onBusinessToolCall,
  afterDecisionCommitted = async () => null,
  afterAdmissionPrepared = async () => null,
}) {
  if (
    !initialCoordinator || !runtime || !receiver || !principal || !ref ||
    !routeProjection || routeProjection.state !== "offered" || routeProjection.offer !== true ||
    typeof businessTool?.name !== "string" || typeof onBusinessToolCall !== "function" ||
    typeof recoveryDirectory !== "string" || recoveryDirectory.length < 1
  ) throw coded("threadmesh_activation_input_invalid");
  let coordinator = initialCoordinator;
  const cursorState = coordinator.getAttentionCursor(receiver, principal);
  const observed = exactNextEvent(coordinator, receiver, principal, cursorState);
  if (
    observed.messageId !== routeProjection.messageId ||
    observed.senderIncarnationId !== routeProjection.envelope?.sender?.incarnationId
  ) throw coded("threadmesh_activation_route_event_mismatch");

  const claimEpoch = digestId("claim_activation", {
    receiver, eventId: observed.eventId, messageId: observed.messageId,
  });
  let activeClaim = cursorState.activeClaim;
  if (activeClaim && activeClaim.claimEpoch !== claimEpoch) {
    throw coded("threadmesh_activation_active_claim_mismatch");
  }
  if (!activeClaim) {
    activeClaim = coordinator.claimAttentionEvent(receiver, {
      claimEpoch,
      eventCursor: observed.cursor,
      eventId: observed.eventId,
      expectedRevision: cursorState.cursor.revision,
    }, principal).claim;
  }

  const messageId = observed.messageId;
  const senderIncarnationId = observed.senderIncarnationId;
  const decisionExecutionId = digestId("intent_activation_decision", {
    scenarioId, chainId, claimEpoch, messageId,
  });
  let committed = recoverDecision(coordinator, claimEpoch, decisionExecutionId, principal);
  let decisionExecution = getExecution(coordinator, decisionExecutionId, principal);
  let decisionTurn = null;

  if (!committed) {
    const offer = {
      envelope: routeProjection.envelope,
      disposition: { revision: 0, decision: "pending" },
      claim: null,
    };
    const renderedOffer = renderRegisteredPeerOffer(offer);
    const adapterIdempotencyKey = `idem_threadmesh_decision_${sha256Digest({
      scenarioId,
      role,
      phase: decisionPhase,
      messageId,
      revision: 0,
      promptDigest: sha256Digest(renderedOffer),
    }).slice("sha256:".length)}`;
    if (!decisionExecution) {
      decisionExecution = coordinator.createTurnExecutionIntent({
        intentId: decisionExecutionId,
        scenarioId,
        chainId,
        messageId,
        eventId: observed.eventId,
        actor: receiver,
        adapterIdempotencyKey,
        promptDigest: sha256Digest(renderedOffer),
        allowedTools: [DECISION_TOOL],
      }, 0, principal);
    }
    const mailbox = coordinator.claimPending(senderIncarnationId, messageId, 0, principal);
    decisionTurn = await runtime.runReceiverDecisionTurn({
      role,
      phase: decisionPhase,
      cwd,
      ref,
      offer,
      scenarioId,
      turnRecovery: recovery(
        path.join(recoveryDirectory, `${decisionExecutionId}.json`),
        decisionExecutionId,
      ),
      beforeTurnStart: async ({ adapterIdempotencyKey: actual }) => {
        if (actual !== adapterIdempotencyKey) {
          throw coded("threadmesh_activation_decision_adapter_key_mismatch");
        }
        decisionExecution = coordinator.markTurnExecutionStarted(
          decisionExecutionId,
          { expectedRevision: decisionExecution.revision },
          principal,
        );
      },
      onTurnStarted: async ({ turnId }) => {
        decisionExecution = coordinator.bindStartedTurnExecutionOperation(
          decisionExecutionId,
          { turnId, expectedRevision: decisionExecution.revision },
          principal,
        );
      },
      onCompletedDecisionTurn: async ({
        decision, turn, recoveryJournal, decisionActionJournal,
      }) => {
        const completedCall = turn.toolCalls[0];
        const decisionArguments = { messageId, decision: decision.decision };
        if (
          turn.toolCalls.length !== 1 || completedCall?.ordinal !== 0 ||
          completedCall?.tool !== DECISION_TOOL ||
          completedCall?.argumentsDigest !== sha256Digest(decisionArguments)
        ) throw coded("threadmesh_activation_decision_turn_mismatch");
        decisionExecution = coordinator.recordModelSelectedTurnToolAction(
          decisionExecutionId,
          {
            turnId: completedCall.turnId,
            callId: completedCall.callId,
            ordinal: completedCall.ordinal,
            name: completedCall.tool,
            arguments: decisionArguments,
            expectedRevision: decisionExecution.revision,
            expectedActionHeadDigest: decisionExecution.actionHeadDigest,
          },
          principal,
        );
        const selected = decisionExecution.actions[0];
        decisionExecution = coordinator.completeModelSelectedTurnToolAction(
          decisionExecutionId,
          {
            turnId: selected.turnId,
            callId: selected.callId,
            ordinal: 0,
            resultDigest: completedCall.outputDigest,
            resultStatus: "completed",
            expectedRevision: decisionExecution.revision,
            expectedActionHeadDigest: decisionExecution.actionHeadDigest,
          },
          principal,
        );
        decisionExecution = coordinator.bindCompletedTurnExecution(
          decisionExecutionId,
          {
            binding: completionBinding(turn, decisionExecution),
            expectedRevision: decisionExecution.revision,
          },
          principal,
        );
        committed = coordinator.commitReceiverDecision(claimEpoch, {
          routeProjection,
          receiverDecisionExecutionId: decisionExecutionId,
          mailboxClaimToken: mailbox.claimToken,
          decision: decision.decision,
          expectedDispositionRevision: 0,
        }, principal);
        return createCompletedDecisionCommit({
          messageId,
          decision: decision.decision,
          executionId: decisionExecutionId,
          journalRecordDigest: recoveryJournal.recordDigest,
          adapterIdempotencyKey: decisionActionJournal.adapterIdempotencyKey,
          turnId: turn.evidence.turnId,
          decisionActionRecordDigest: decisionActionJournal.recordDigest,
        });
      },
      recoverCompletedDecision: async ({
        decision, adapterIdempotencyKey: actual, journal, observedTurn, decisionAction,
      }) => {
        committed = coordinator.recoverReceiverDecisionCommit(
          claimEpoch, decisionExecutionId, principal,
        );
        if (committed.decisionProjection.decision.state !== decision) {
          throw coded("threadmesh_activation_decision_recovery_mismatch");
        }
        return createRecoveredDecisionCommit({
          messageId,
          decision,
          executionId: decisionExecutionId,
          journalRecordDigest: journal.recordDigest,
          adapterIdempotencyKey: actual,
          turnId: observedTurn.turnId,
          decisionActionRecordDigest: decisionAction.recordDigest,
        });
      },
    });
    const replacement = await afterDecisionCommitted({
      coordinator, claimEpoch, decisionExecutionId, committed,
    });
    if (replacement) coordinator = replacement;
  }

  const decision = committed.decisionProjection.decision.state;
  decisionExecution = coordinator.getTurnExecution(decisionExecutionId, principal);
  if (decision !== "accepted") {
    const handler = coordinator.bindCompletedAttentionHandler(claimEpoch, {
      turnExecutionId: decisionExecutionId,
      expectedRevision: activeClaim.revision,
    }, principal);
    return Object.freeze({
      state: "completed", decision, admitted: false, replay: decisionTurn === null,
      claim: handler.claim, decisionExecutionId, businessExecutionId: null,
    });
  }

  let recoveredAdmission = recoverAdmission(
    coordinator, senderIncarnationId, messageId, principal,
  );
  if (!recoveredAdmission) {
    const prepared = coordinator.prepareContextAdmission(
      senderIncarnationId, messageId, 1, principal,
    );
    recoveredAdmission = { state: "in-flight", prepared };
  }
  const replacement = await afterAdmissionPrepared({
    coordinator, prepared: recoveredAdmission.prepared,
  });
  if (replacement) coordinator = replacement;
  recoveredAdmission = recoverAdmission(
    coordinator, senderIncarnationId, messageId, principal,
  );
  const prepared = recoveredAdmission.prepared;
  if (prepared.adapterRef.threadId !== ref.threadId ||
      prepared.adapterRef.snapshotDigest !== ref.snapshotDigest) {
    throw coded("threadmesh_activation_admission_ref_mismatch");
  }

  const businessExecutionId = digestId("intent_activation_business", {
    scenarioId, chainId, claimEpoch, messageId, admissionToken: prepared.admissionToken,
  });
  let businessExecution = getExecution(coordinator, businessExecutionId, principal);
  let businessTurn = null;
  if (recoveredAdmission.state !== "completed") {
    const allowedToolNames = [businessTool.name];
    const adapterIdempotencyKey = `idem_threadmesh_admitted_${sha256Digest({
      scenarioId,
      role,
      phase: businessPhase,
      sourcePreparedDigest: sha256Digest(prepared),
      allowedToolNames,
    }).slice("sha256:".length)}`;
    if (!businessExecution) {
      businessExecution = coordinator.createTurnExecutionIntent({
        intentId: businessExecutionId,
        scenarioId,
        chainId,
        messageId,
        eventId: prepared.admissionToken,
        actor: receiver,
        adapterIdempotencyKey,
        promptDigest: sha256Digest(prepared.rendering),
        allowedTools: allowedToolNames,
      }, 0, principal);
    }
    businessTurn = await runtime.runAdmittedToolTurn({
      role,
      phase: businessPhase,
      cwd,
      ref,
      prepared,
      admissionBinding: createAdmittedTurnBinding(prepared),
      scenarioId,
      allowedToolNames,
      turnRecovery: recovery(
        path.join(recoveryDirectory, `${businessExecutionId}.json`),
        businessExecutionId,
      ),
      beforeTurnStart: async ({ adapterIdempotencyKey: actual }) => {
        if (actual !== adapterIdempotencyKey) {
          throw coded("threadmesh_activation_business_adapter_key_mismatch");
        }
        businessExecution = coordinator.markTurnExecutionStarted(
          businessExecutionId,
          { expectedRevision: businessExecution.revision },
          principal,
        );
      },
      onTurnStarted: async ({ turnId }) => {
        businessExecution = coordinator.bindStartedTurnExecutionOperation(
          businessExecutionId,
          { turnId, expectedRevision: businessExecution.revision },
          principal,
        );
      },
      beforeToolCall: async (selected) => {
        businessExecution = coordinator.recordModelSelectedTurnToolAction(
          businessExecutionId,
          {
            turnId: selected.turnId,
            callId: selected.callId,
            ordinal: selected.ordinal,
            name: selected.tool,
            arguments: selected.arguments,
            expectedRevision: businessExecution.revision,
            expectedActionHeadDigest: businessExecution.actionHeadDigest,
          },
          principal,
        );
      },
      onToolCall: onBusinessToolCall,
      afterToolCall: async (completed) => {
        businessExecution = coordinator.completeModelSelectedTurnToolAction(
          businessExecutionId,
          {
            turnId: completed.turnId,
            callId: completed.callId,
            ordinal: completed.ordinal,
            resultDigest: completed.outputDigest,
            resultStatus: completed.resultStatus,
            expectedRevision: businessExecution.revision,
            expectedActionHeadDigest: businessExecution.actionHeadDigest,
          },
          principal,
        );
      },
      onAdmissionReceipt: async ({ turn, receipt }) => {
        if (sha256Digest(receipt) !== sha256Digest(turn.receipt)) {
          throw coded("threadmesh_activation_admission_receipt_mismatch");
        }
        businessExecution = coordinator.bindCompletedTurnExecution(
          businessExecutionId,
          {
            binding: completionBinding(turn, businessExecution),
            expectedRevision: businessExecution.revision,
          },
          principal,
        );
        return coordinator.confirmContextAdmissionFromTurn(
          senderIncarnationId,
          messageId,
          {
            executionId: businessExecutionId,
            expectedRevision: 1,
            admissionToken: prepared.admissionToken,
          },
          principal,
        );
      },
    });
  } else {
    if (!businessExecution) throw coded("threadmesh_activation_business_execution_missing");
    coordinator.confirmContextAdmissionFromTurn(
      senderIncarnationId,
      messageId,
      {
        executionId: businessExecutionId,
        expectedRevision: 1,
        admissionToken: prepared.admissionToken,
      },
      principal,
    );
  }

  const currentClaim = coordinator.getAttentionCursor(receiver, principal).activeClaim;
  const handler = coordinator.bindCompletedAttentionHandler(claimEpoch, {
    turnExecutionId: businessExecutionId,
    expectedRevision: currentClaim.revision,
  }, principal);
  return Object.freeze({
    state: "completed", decision: "accepted", admitted: true,
    replay: decisionTurn === null && businessTurn === null,
    claim: handler.claim, decisionExecutionId, businessExecutionId,
  });
}
