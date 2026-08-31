import assert from "node:assert/strict";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  abandonDurableTurnIntent,
  bindStartedTurnOperation,
  bindCompletedTurnIntent,
  createProposedDurableTurnIntent,
  completeModelSelectedToolAction,
  markTurnOutcomeUnknown,
  promoteDurableTurnIntent,
  reconcileUnknownDurableTurnIntent,
  recordModelSelectedToolAction,
  startDurableTurnIntent,
  validateDurableTurnIntent,
} from "../src/state/durable-turn-intent.mjs";

const digest = (value) => sha256Digest({ value });
const snapshot = `sha256:${"a".repeat(64)}`;
const expectCode = (fn, code) => assert.throws(fn, (error) => error?.code === code);

function proposed(overrides = {}) {
  return {
    intentId: "intent_a_publish_01", scenarioId: "scenario_m5_2_01", chainId: "chain_m5_2_01",
    messageId: "message_a_to_r_01", eventId: "event_artifact_ready_01",
    actor: { taskId: "task_implementer", incarnationId: "inc_implementer_01", threadId: "thread-implementer", snapshotDigest: snapshot },
    adapterIdempotencyKey: "idem_a_implementation_01", promptDigest: digest("prompt"),
    allowedTools: ["threadmesh_fixture_write", "threadmesh_publish_artifact"], ...overrides,
  };
}
function started() { return bindStartedTurnOperation(startDurableTurnIntent(createProposedDurableTurnIntent(proposed())), { turnId: "turn-implementer-01" }); }
function selection(ordinal, overrides = {}) {
  const values = [
    { turnId: "turn-implementer-01", callId: "call-write-01", ordinal: 0, name: "threadmesh_fixture_write", argumentsDigest: digest("write arguments") },
    { turnId: "turn-implementer-01", callId: "call-publish-01", ordinal: 1, name: "threadmesh_publish_artifact", argumentsDigest: digest("publish arguments") },
  ];
  return { ...values[ordinal], ...overrides };
}
function completion(ordinal, overrides = {}) {
  const result = ordinal === 0 ? digest("write result") : digest("publish result");
  const selectedAction = selection(ordinal);
  return { turnId: selectedAction.turnId, callId: selectedAction.callId, ordinal, resultDigest: result, resultStatus: "completed", ...overrides };
}
function selected() {
  let current = recordModelSelectedToolAction(recordModelSelectedToolAction(started(), selection(0)), selection(1));
  current = completeModelSelectedToolAction(current, completion(0));
  return completeModelSelectedToolAction(current, completion(1));
}
function binding(overrides = {}) {
  const receipt = { adapterOperationId: "turn-implementer-01", acceptedAt: "2026-08-31T09:00:00.000Z", evidenceRefs: ["codex-app-server://thread/thread-implementer/turn/turn-implementer-01"] };
  return {
    evidence: { threadId: "thread-implementer", turnId: "turn-implementer-01", turnStatus: "completed", completedAt: "2026-08-31T09:00:02.000Z", durationMs: 2000, userAgent: "codex-app-server-test", snapshotDigest: snapshot, serverRequestDeniedCount: 0, serverRequestHandledCount: 2, notificationCount: 4, deltaCount: 1 },
    receipt, adapterReceiptDigest: sha256Digest(receipt),
    toolCalls: [
      { ordinal: 0, turnId: "turn-implementer-01", callId: "call-write-01", tool: "threadmesh_fixture_write", argumentsDigest: digest("write arguments"), outputDigest: digest("write result"), resultStatus: "completed" },
      { ordinal: 1, turnId: "turn-implementer-01", callId: "call-publish-01", tool: "threadmesh_publish_artifact", argumentsDigest: digest("publish arguments"), outputDigest: digest("publish result"), resultStatus: "completed" },
    ], nonThreadMeshToolCalls: 0, ...overrides,
  };
}

test("native start precedes model-selected callbacks, completed binding, and CAS promotion", () => {
  const first = createProposedDurableTurnIntent(proposed());
  assert.equal(first.state, "proposed"); assert.equal(first.turnStart, null); assert.ok(Object.isFrozen(first));
  const preRequest = startDurableTurnIntent(first);
  assert.equal(preRequest.state, "started"); assert.equal(preRequest.turnStart.turnId, null);
  const execution = bindStartedTurnOperation(preRequest, { turnId: "turn-implementer-01" });
  assert.strictEqual(bindStartedTurnOperation(execution, { turnId: "turn-implementer-01" }), execution);
  const withActions = selected();
  assert.deepEqual(withActions.toolActions.map((item) => item.ordinal), [0, 1]);
  const bound = bindCompletedTurnIntent(withActions, binding());
  assert.equal(bound.state, "completed-turn-bound");
  assert.strictEqual(bindCompletedTurnIntent(bound, binding()), bound);
  const expected = { expectedEvidenceChainRevision: 2, expectedEvidenceChainHead: digest("review record") };
  const promoted = promoteDurableTurnIntent(bound, expected);
  assert.equal(promoted.state, "promoted"); assert.strictEqual(promoteDurableTurnIntent(promoted, expected), promoted);
  assert.deepEqual(validateDurableTurnIntent(promoted), promoted);
});

test("proposal is bounded and contains only identities, prompt digest, and allowlist", () => {
  expectCode(() => createProposedDurableTurnIntent({ ...proposed(), prompt: "raw prose" }), "threadmesh_durable_turn_intent_invalid");
  expectCode(() => createProposedDurableTurnIntent(proposed({ messageId: "/absolute/path" })), "threadmesh_durable_turn_intent_invalid");
  expectCode(() => createProposedDurableTurnIntent(proposed({ allowedTools: ["threadmesh_fixture_write", "threadmesh_fixture_write"] })), "threadmesh_durable_turn_intent_invalid");
  expectCode(() => createProposedDurableTurnIntent(proposed({ allowedTools: ["web_search"] })), "threadmesh_durable_turn_intent_invalid");
});

test("tool callbacks require a started turn, allowlist membership, and unique contiguous ordinals", () => {
  expectCode(() => recordModelSelectedToolAction(createProposedDurableTurnIntent(proposed()), selection(0)), "threadmesh_durable_turn_intent_not_started");
  const one = recordModelSelectedToolAction(started(), selection(0));
  assert.strictEqual(recordModelSelectedToolAction(one, selection(0)), one);
  expectCode(() => recordModelSelectedToolAction(one, selection(1, { name: "threadmesh_not_allowlisted" })), "threadmesh_durable_turn_intent_tool_action_invalid");
  expectCode(() => recordModelSelectedToolAction(one, selection(1, { ordinal: 2 })), "threadmesh_durable_turn_intent_tool_ordinal_invalid");
  expectCode(() => recordModelSelectedToolAction(one, selection(1, { callId: "call-write-01" })), "threadmesh_durable_turn_intent_tool_call_conflict");
  expectCode(() => recordModelSelectedToolAction(one, selection(1, { turnId: "other-turn" })), "threadmesh_durable_turn_intent_turn_binding_mismatch");
});

test("selection admission is durable before the callback side effect and carries no result", () => {
  const observed = recordModelSelectedToolAction(started(), selection(0));
  assert.equal(observed.toolActions[0].resultDigest, null);
  assert.equal(observed.toolActions[0].resultStatus, null);
  expectCode(() => bindCompletedTurnIntent(observed, binding({ toolCalls: [binding().toolCalls[0]] })), "threadmesh_durable_turn_intent_tool_action_not_completed");
});

test("tool completion requires an existing exact selection and has CAS replay/conflict semantics", () => {
  expectCode(() => completeModelSelectedToolAction(started(), completion(0)), "threadmesh_durable_turn_intent_tool_completion_missing_selection");
  const observed = recordModelSelectedToolAction(started(), selection(0));
  const completed = completeModelSelectedToolAction(observed, completion(0));
  assert.equal(completed.toolActions[0].resultStatus, "completed");
  assert.strictEqual(completeModelSelectedToolAction(completed, completion(0)), completed);
  expectCode(() => completeModelSelectedToolAction(completed, completion(0, { resultDigest: digest("other result") })), "threadmesh_durable_turn_intent_tool_completion_conflict");
});

test("completed turn binding requires every admitted action to have completed before promotion evidence", () => {
  let intent = recordModelSelectedToolAction(started(), selection(0));
  intent = recordModelSelectedToolAction(intent, selection(1));
  intent = completeModelSelectedToolAction(intent, completion(0));
  expectCode(() => bindCompletedTurnIntent(intent, binding()), "threadmesh_durable_turn_intent_tool_action_not_completed");
});

test("unknown reconciliation fills results only for already observed selections and rejects a receipt-invented call", () => {
  const observed = recordModelSelectedToolAction(started(), selection(0));
  const unknown = markTurnOutcomeUnknown(observed, { reasonCode: "threadmesh_adapter_timeout" });
  const found = reconcileUnknownDurableTurnIntent(unknown, { state: "found", binding: binding({ toolCalls: [binding().toolCalls[0]] }) });
  assert.equal(found.toolActions[0].resultDigest, digest("write result"));
  const noSelection = markTurnOutcomeUnknown(started(), { reasonCode: "threadmesh_adapter_timeout" });
  expectCode(() => reconcileUnknownDurableTurnIntent(noSelection, { state: "found", binding: binding() }), "threadmesh_durable_turn_intent_tool_calls_invalid");
  const wrongArgs = binding({ toolCalls: [{ ...binding().toolCalls[0], argumentsDigest: digest("invented") }] });
  expectCode(() => reconcileUnknownDurableTurnIntent(unknown, { state: "found", binding: wrongArgs }), "threadmesh_durable_turn_intent_tool_binding_mismatch");
});

test("completion accepts only Codex completed evidence and exact action receipts, never final prose", () => {
  const intent = selected();
  expectCode(() => bindCompletedTurnIntent(intent, { ...binding(), text: "model says success" }), "threadmesh_durable_turn_intent_binding_invalid");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ adapterReceiptDigest: digest("tampered") })), "threadmesh_durable_turn_intent_receipt_digest_mismatch");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ evidence: { ...binding().evidence, turnStatus: "failed" } })), "threadmesh_durable_turn_intent_turn_not_completed");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ evidence: { ...binding().evidence, snapshotDigest: `sha256:${"b".repeat(64)}` } })), "threadmesh_durable_turn_intent_actor_binding_mismatch");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ nonThreadMeshToolCalls: 1 })), "threadmesh_durable_turn_intent_non_threadmesh_tool_observed");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ toolCalls: [binding().toolCalls[1], binding().toolCalls[0]] })), "threadmesh_durable_turn_intent_tool_calls_invalid");
  expectCode(() => bindCompletedTurnIntent(intent, binding({ toolCalls: [binding().toolCalls[0], { ...binding().toolCalls[1], outputDigest: digest("other") }] })), "threadmesh_durable_turn_intent_tool_binding_mismatch");
});

test("timeout becomes reconcile-only: found binds, not-found abandons, ambiguous does not rerun", () => {
  const unknown = markTurnOutcomeUnknown(selected(), { reasonCode: "threadmesh_adapter_timeout" });
  assert.equal(unknown.state, "outcome-unknown");
  expectCode(() => startDurableTurnIntent(unknown), "threadmesh_durable_turn_intent_terminal");
  assert.strictEqual(reconcileUnknownDurableTurnIntent(unknown, { state: "ambiguous" }), unknown);
  assert.equal(reconcileUnknownDurableTurnIntent(unknown, { state: "found", binding: binding() }).state, "completed-turn-bound");
  assert.equal(reconcileUnknownDurableTurnIntent(unknown, { state: "not-found", reasonCode: "threadmesh_adapter_turn_not_found" }).state, "abandoned");
  expectCode(() => reconcileUnknownDurableTurnIntent(unknown, { state: "found" }), "threadmesh_durable_turn_intent_reconcile_invalid");
});

test("crash after pre-request durable start cannot blind-rerun and only reconciliation may bind a discovered turn", () => {
  const preRequest = startDurableTurnIntent(createProposedDurableTurnIntent(proposed()));
  assert.equal(preRequest.turnStart.turnId, null);
  expectCode(() => startDurableTurnIntent(preRequest), "threadmesh_durable_turn_intent_start_already_claimed");
  expectCode(() => recordModelSelectedToolAction(preRequest, selection(0)), "threadmesh_durable_turn_intent_operation_not_bound");
  const unknown = markTurnOutcomeUnknown(preRequest, { reasonCode: "threadmesh_start_response_lost" });
  const empty = binding({ toolCalls: [] });
  const found = reconcileUnknownDurableTurnIntent(unknown, { state: "found", binding: empty });
  assert.equal(found.turnStart.turnId, "turn-implementer-01");
  expectCode(() => promoteDurableTurnIntent(found, { expectedEvidenceChainRevision: 0, expectedEvidenceChainHead: null }), "threadmesh_durable_turn_intent_no_model_selected_tool");
});

test("promotion has an exact chain CAS fence and any nonterminal state may abandon", () => {
  const bound = bindCompletedTurnIntent(selected(), binding());
  expectCode(() => promoteDurableTurnIntent(bound, { expectedEvidenceChainRevision: 1, expectedEvidenceChainHead: null }), "threadmesh_durable_turn_intent_promotion_invalid");
  const promoted = promoteDurableTurnIntent(bound, { expectedEvidenceChainRevision: 0, expectedEvidenceChainHead: null });
  expectCode(() => promoteDurableTurnIntent(promoted, { expectedEvidenceChainRevision: 1, expectedEvidenceChainHead: digest("other") }), "threadmesh_durable_turn_intent_promotion_conflict");
  const abandonedProposal = abandonDurableTurnIntent(createProposedDurableTurnIntent(proposed()), { reasonCode: "threadmesh_cancelled" });
  assert.equal(validateDurableTurnIntent(abandonedProposal).state, "abandoned");
  assert.equal(abandonDurableTurnIntent(bound, { reasonCode: "threadmesh_chain_append_failed" }).state, "abandoned");
  expectCode(() => abandonDurableTurnIntent(promoted, { reasonCode: "threadmesh_too_late" }), "threadmesh_durable_turn_intent_terminal");
});
