import { sha256Digest } from "../canonical-json.mjs";

export const DURABLE_TURN_INTENT_STATES = Object.freeze([
  "proposed", "started", "outcome-unknown", "completed-turn-bound", "promoted", "abandoned",
]);

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const TOOL = /^threadmesh_[a-z0-9_]{1,120}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REASON = /^threadmesh_[a-z0-9_]{1,120}$/u;
const MAX_TOOLS = 4;

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}
function id(value, code) { if (typeof value !== "string" || !ID.test(value)) fail(code); }
function digest(value, code) { if (typeof value !== "string" || !DIGEST.test(value)) fail(code); }
function clone(value) { return structuredClone(value); }
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function same(left, right) { return sha256Digest(left) === sha256Digest(right); }

function actor(value, code) {
  exact(value, ["taskId", "incarnationId", "threadId", "snapshotDigest"], code);
  id(value.taskId, code); id(value.incarnationId, code); id(value.threadId, code); digest(value.snapshotDigest, code);
}
function allowlist(value, code) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_TOOLS || new Set(value).size !== value.length) fail(code);
  for (const name of value) if (typeof name !== "string" || !TOOL.test(name)) fail(code);
}
function proposedBody(value) {
  exact(value, ["intentId", "scenarioId", "chainId", "messageId", "eventId", "actor", "adapterIdempotencyKey", "promptDigest", "allowedTools"], "threadmesh_durable_turn_intent_invalid");
  for (const key of ["intentId", "scenarioId", "chainId", "messageId", "eventId", "adapterIdempotencyKey"]) id(value[key], "threadmesh_durable_turn_intent_invalid");
  digest(value.promptDigest, "threadmesh_durable_turn_intent_invalid");
  actor(value.actor, "threadmesh_durable_turn_intent_invalid");
  allowlist(value.allowedTools, "threadmesh_durable_turn_intent_invalid");
}
function start(value) {
  exact(value, ["turnId"], "threadmesh_durable_turn_intent_start_invalid");
  if (value.turnId !== null) id(value.turnId, "threadmesh_durable_turn_intent_start_invalid");
}
function operation(value) {
  exact(value, ["turnId"], "threadmesh_durable_turn_intent_start_invalid");
  id(value.turnId, "threadmesh_durable_turn_intent_start_invalid");
}
function action(value, intent, code = "threadmesh_durable_turn_intent_tool_action_invalid") {
  exact(value, ["turnId", "callId", "ordinal", "name", "argumentsDigest", "resultDigest", "resultStatus"], code);
  id(value.turnId, code); id(value.callId, code);
  if (!Number.isInteger(value.ordinal) || value.ordinal < 0 || value.ordinal >= MAX_TOOLS) fail(code);
  if (typeof value.name !== "string" || !intent.allowedTools.includes(value.name)) fail(code);
  digest(value.argumentsDigest, code);
  if (value.resultDigest === null && value.resultStatus === null) {
    // Durable admission is recorded before the callback executes its side effect.
  } else {
    digest(value.resultDigest, code);
    if (value.resultStatus !== "completed") fail(code);
  }
  if (value.turnId !== intent.turnStart?.turnId) fail("threadmesh_durable_turn_intent_turn_binding_mismatch");
}
function selection(value, intent, code = "threadmesh_durable_turn_intent_tool_action_invalid") {
  exact(value, ["turnId", "callId", "ordinal", "name", "argumentsDigest"], code);
  const stored = { ...clone(value), resultDigest: null, resultStatus: null };
  action(stored, intent, code);
  return stored;
}
function completion(value, selected, code = "threadmesh_durable_turn_intent_tool_completion_invalid") {
  exact(value, ["turnId", "callId", "ordinal", "resultDigest", "resultStatus"], code);
  if (value.turnId !== selected.turnId || value.callId !== selected.callId || value.ordinal !== selected.ordinal) {
    fail("threadmesh_durable_turn_intent_tool_completion_mismatch");
  }
  digest(value.resultDigest, code);
  if (value.resultStatus !== "completed") fail(code);
  return { ...clone(selected), resultDigest: value.resultDigest, resultStatus: value.resultStatus };
}
function evidence(value) {
  exact(value, ["threadId", "turnId", "turnStatus", "completedAt", "durationMs", "userAgent", "snapshotDigest", "serverRequestDeniedCount", "serverRequestHandledCount", "notificationCount", "deltaCount"], "threadmesh_durable_turn_intent_evidence_invalid");
  id(value.threadId, "threadmesh_durable_turn_intent_evidence_invalid"); id(value.turnId, "threadmesh_durable_turn_intent_evidence_invalid");
  if (value.turnStatus !== "completed") fail("threadmesh_durable_turn_intent_turn_not_completed");
  if (value.completedAt !== null && (typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)))) fail("threadmesh_durable_turn_intent_evidence_invalid");
  if (value.durationMs !== null && (!Number.isFinite(value.durationMs) || value.durationMs < 0)) fail("threadmesh_durable_turn_intent_evidence_invalid");
  if (typeof value.userAgent !== "string" || value.userAgent.length < 1 || value.userAgent.length > 512) fail("threadmesh_durable_turn_intent_evidence_invalid");
  digest(value.snapshotDigest, "threadmesh_durable_turn_intent_evidence_invalid");
  for (const key of ["serverRequestDeniedCount", "serverRequestHandledCount", "notificationCount", "deltaCount"]) if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1_000_000) fail("threadmesh_durable_turn_intent_evidence_invalid");
}
function receipt(value) {
  exact(value, ["adapterOperationId", "acceptedAt", "evidenceRefs"], "threadmesh_durable_turn_intent_receipt_invalid");
  id(value.adapterOperationId, "threadmesh_durable_turn_intent_receipt_invalid");
  if (typeof value.acceptedAt !== "string" || !Number.isFinite(Date.parse(value.acceptedAt))) fail("threadmesh_durable_turn_intent_receipt_invalid");
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length < 1 || value.evidenceRefs.length > 8) fail("threadmesh_durable_turn_intent_receipt_invalid");
  for (const ref of value.evidenceRefs) if (typeof ref !== "string" || ref.length < 1 || ref.length > 512 || /[\r\n\0]/u.test(ref)) fail("threadmesh_durable_turn_intent_receipt_invalid");
}
function calls(value, intent) {
  if (!Array.isArray(value) || value.length !== intent.toolActions.length || value.length > MAX_TOOLS) fail("threadmesh_durable_turn_intent_tool_calls_invalid");
  for (let ordinal = 0; ordinal < value.length; ordinal += 1) {
    const call = value[ordinal]; const selected = intent.toolActions[ordinal];
    exact(call, ["ordinal", "turnId", "callId", "tool", "argumentsDigest", "outputDigest", "resultStatus"], "threadmesh_durable_turn_intent_tool_calls_invalid");
    if (call.ordinal !== ordinal || call.turnId !== intent.turnStart.turnId || call.callId !== selected.callId || !intent.allowedTools.includes(call.tool)) fail("threadmesh_durable_turn_intent_tool_calls_invalid");
    digest(call.argumentsDigest, "threadmesh_durable_turn_intent_tool_calls_invalid"); digest(call.outputDigest, "threadmesh_durable_turn_intent_tool_calls_invalid");
    if (call.resultStatus !== "completed") fail("threadmesh_durable_turn_intent_tool_calls_invalid");
    if (selected.resultDigest === null || selected.resultStatus === null) fail("threadmesh_durable_turn_intent_tool_action_not_completed");
    if (selected.name !== call.tool || selected.argumentsDigest !== call.argumentsDigest || selected.resultDigest !== call.outputDigest || selected.resultStatus !== call.resultStatus) fail("threadmesh_durable_turn_intent_tool_binding_mismatch");
  }
}
function binding(value, intent) {
  exact(value, ["evidence", "receipt", "adapterReceiptDigest", "toolCalls", "nonThreadMeshToolCalls"], "threadmesh_durable_turn_intent_binding_invalid");
  evidence(value.evidence); receipt(value.receipt); digest(value.adapterReceiptDigest, "threadmesh_durable_turn_intent_binding_invalid");
  if (sha256Digest(value.receipt) !== value.adapterReceiptDigest) fail("threadmesh_durable_turn_intent_receipt_digest_mismatch");
  if (value.nonThreadMeshToolCalls !== 0) fail("threadmesh_durable_turn_intent_non_threadmesh_tool_observed");
  if (value.evidence.threadId !== intent.actor.threadId || value.evidence.snapshotDigest !== intent.actor.snapshotDigest || (intent.turnStart.turnId !== null && value.evidence.turnId !== intent.turnStart.turnId) || (intent.turnStart.turnId !== null && value.receipt.adapterOperationId !== intent.turnStart.turnId) || value.receipt.adapterOperationId !== value.evidence.turnId) fail("threadmesh_durable_turn_intent_actor_binding_mismatch");
  calls(value.toolCalls, intent);
  return { evidence: clone(value.evidence), adapterReceiptDigest: value.adapterReceiptDigest, toolCalls: clone(value.toolCalls) };
}
function promotion(value) {
  exact(value, ["expectedEvidenceChainRevision", "expectedEvidenceChainHead"], "threadmesh_durable_turn_intent_promotion_invalid");
  if (!Number.isInteger(value.expectedEvidenceChainRevision) || value.expectedEvidenceChainRevision < 0 || value.expectedEvidenceChainRevision > 1_000_000) fail("threadmesh_durable_turn_intent_promotion_invalid");
  if (value.expectedEvidenceChainRevision === 0) { if (value.expectedEvidenceChainHead !== null) fail("threadmesh_durable_turn_intent_promotion_invalid"); } else digest(value.expectedEvidenceChainHead, "threadmesh_durable_turn_intent_promotion_invalid");
}
function abandonment(value) { exact(value, ["reasonCode"], "threadmesh_durable_turn_intent_abandonment_invalid"); if (typeof value.reasonCode !== "string" || !REASON.test(value.reasonCode)) fail("threadmesh_durable_turn_intent_abandonment_invalid"); }

function validate(intent) {
  exact(intent, ["intentId", "scenarioId", "chainId", "messageId", "eventId", "actor", "adapterIdempotencyKey", "promptDigest", "allowedTools", "state", "turnStart", "toolActions", "completedTurn", "promotion", "abandonment"], "threadmesh_durable_turn_intent_invalid");
  proposedBody({ intentId: intent.intentId, scenarioId: intent.scenarioId, chainId: intent.chainId, messageId: intent.messageId, eventId: intent.eventId, actor: intent.actor, adapterIdempotencyKey: intent.adapterIdempotencyKey, promptDigest: intent.promptDigest, allowedTools: intent.allowedTools });
  if (!DURABLE_TURN_INTENT_STATES.includes(intent.state) || !Array.isArray(intent.toolActions) || intent.toolActions.length > MAX_TOOLS) fail("threadmesh_durable_turn_intent_invalid");
  if (intent.state === "proposed") { if (intent.turnStart !== null || intent.toolActions.length || intent.completedTurn !== null || intent.promotion !== null || intent.abandonment !== null) fail("threadmesh_durable_turn_intent_invalid"); return; }
  if (intent.state === "abandoned" && intent.turnStart === null) {
    if (intent.toolActions.length || intent.completedTurn !== null || intent.promotion !== null) fail("threadmesh_durable_turn_intent_invalid");
    abandonment(intent.abandonment);
    return;
  }
  start(intent.turnStart);
  const callIds = new Set();
  if (intent.turnStart.turnId === null && intent.toolActions.length !== 0) fail("threadmesh_durable_turn_intent_invalid");
  for (let ordinal = 0; ordinal < intent.toolActions.length; ordinal += 1) { const current = intent.toolActions[ordinal]; action(current, intent, "threadmesh_durable_turn_intent_invalid"); if (current.ordinal !== ordinal || callIds.has(current.callId)) fail("threadmesh_durable_turn_intent_invalid"); callIds.add(current.callId); }
  if (["started", "outcome-unknown"].includes(intent.state)) { if (intent.completedTurn !== null || intent.promotion !== null || (intent.state === "started" && intent.abandonment !== null) || (intent.state === "outcome-unknown" && intent.abandonment === null)) fail("threadmesh_durable_turn_intent_invalid"); if (intent.state === "outcome-unknown") abandonment(intent.abandonment); return; }
  if (intent.completedTurn !== null) { exact(intent.completedTurn, ["evidence", "adapterReceiptDigest", "toolCalls"], "threadmesh_durable_turn_intent_invalid"); evidence(intent.completedTurn.evidence); digest(intent.completedTurn.adapterReceiptDigest, "threadmesh_durable_turn_intent_invalid"); if (intent.turnStart.turnId === null || intent.completedTurn.evidence.threadId !== intent.actor.threadId || intent.completedTurn.evidence.snapshotDigest !== intent.actor.snapshotDigest || intent.completedTurn.evidence.turnId !== intent.turnStart.turnId) fail("threadmesh_durable_turn_intent_invalid"); calls(intent.completedTurn.toolCalls, intent); }
  if (intent.state === "completed-turn-bound") { if (intent.completedTurn === null || intent.promotion !== null || intent.abandonment !== null) fail("threadmesh_durable_turn_intent_invalid"); return; }
  if (intent.state === "promoted") { if (intent.completedTurn === null || intent.abandonment !== null) fail("threadmesh_durable_turn_intent_invalid"); promotion(intent.promotion); return; }
  if (intent.state === "abandoned") { if (intent.promotion !== null) fail("threadmesh_durable_turn_intent_invalid"); abandonment(intent.abandonment); return; }
  fail("threadmesh_durable_turn_intent_invalid");
}
function replace(intent, fields) { return freeze({ intentId: intent.intentId, scenarioId: intent.scenarioId, chainId: intent.chainId, messageId: intent.messageId, eventId: intent.eventId, actor: clone(intent.actor), adapterIdempotencyKey: intent.adapterIdempotencyKey, promptDigest: intent.promptDigest, allowedTools: clone(intent.allowedTools), ...fields }); }

export function createProposedDurableTurnIntent(input) {
  proposedBody(input);
  return freeze({ ...clone(input), state: "proposed", turnStart: null, toolActions: [], completedTurn: null, promotion: null, abandonment: null });
}
export function validateDurableTurnIntent(intent) {
  validate(intent);
  return Object.isFrozen(intent) ? intent : freeze(clone(intent));
}
export function startDurableTurnIntent(intent, ...unexpected) {
  if (unexpected.length !== 0) fail("threadmesh_durable_turn_intent_start_invalid");
  const current = validateDurableTurnIntent(intent);
  if (current.state === "started") fail("threadmesh_durable_turn_intent_start_already_claimed");
  if (current.state !== "proposed") fail("threadmesh_durable_turn_intent_terminal");
  return replace(current, { state: "started", turnStart: { turnId: null }, toolActions: [], completedTurn: null, promotion: null, abandonment: null });
}
/** Bind the irreversible native turn/start response; callbacks remain forbidden before this. */
export function bindStartedTurnOperation(intent, turnStart) {
  const current = validateDurableTurnIntent(intent); operation(turnStart);
  if (current.state !== "started") fail("threadmesh_durable_turn_intent_not_started");
  if (current.turnStart.turnId !== null) {
    if (same(current.turnStart, turnStart)) return current;
    fail("threadmesh_durable_turn_intent_start_conflict");
  }
  return replace(current, { state: "started", turnStart: clone(turnStart), toolActions: [], completedTurn: null, promotion: null, abandonment: null });
}
export function recordModelSelectedToolAction(intent, toolAction) {
  const current = validateDurableTurnIntent(intent); if (current.state !== "started") fail("threadmesh_durable_turn_intent_not_started"); if (current.turnStart.turnId === null) fail("threadmesh_durable_turn_intent_operation_not_bound");
  const observed = selection(toolAction, current);
  const existing = current.toolActions[observed.ordinal];
  if (existing) {
    const existingSelection = { turnId: existing.turnId, callId: existing.callId, ordinal: existing.ordinal, name: existing.name, argumentsDigest: existing.argumentsDigest };
    if (same(existingSelection, toolAction)) return current;
    fail("threadmesh_durable_turn_intent_tool_action_conflict");
  }
  if (observed.ordinal !== current.toolActions.length) fail("threadmesh_durable_turn_intent_tool_ordinal_invalid");
  if (current.toolActions.some((item) => item.callId === observed.callId)) fail("threadmesh_durable_turn_intent_tool_call_conflict");
  return replace(current, { state: "started", turnStart: clone(current.turnStart), toolActions: [...clone(current.toolActions), observed], completedTurn: null, promotion: null, abandonment: null });
}
/** Record the callback result only after a durable selection admission exists. */
export function completeModelSelectedToolAction(intent, toolCompletion) {
  const current = validateDurableTurnIntent(intent);
  if (current.state !== "started") fail("threadmesh_durable_turn_intent_not_started");
  if (current.turnStart.turnId === null) fail("threadmesh_durable_turn_intent_operation_not_bound");
  if (!Number.isInteger(toolCompletion?.ordinal) || toolCompletion.ordinal < 0 || toolCompletion.ordinal >= current.toolActions.length) {
    fail("threadmesh_durable_turn_intent_tool_completion_missing_selection");
  }
  const existing = current.toolActions[toolCompletion.ordinal];
  const completed = completion(toolCompletion, existing);
  if (existing.resultDigest !== null || existing.resultStatus !== null) {
    if (same(existing, completed)) return current;
    fail("threadmesh_durable_turn_intent_tool_completion_conflict");
  }
  const actions = clone(current.toolActions); actions[toolCompletion.ordinal] = completed;
  return replace(current, { state: "started", turnStart: clone(current.turnStart), toolActions: actions, completedTurn: null, promotion: null, abandonment: null });
}
export function bindCompletedTurnIntent(intent, completed) {
  const current = validateDurableTurnIntent(intent); if (current.state === "started" && current.turnStart.turnId === null) fail("threadmesh_durable_turn_intent_operation_not_bound"); const bound = binding(completed, current);
  if (current.state === "completed-turn-bound") { if (same(current.completedTurn, bound)) return current; fail("threadmesh_durable_turn_intent_completed_binding_conflict"); }
  if (current.state !== "started") fail("threadmesh_durable_turn_intent_not_started");
  return replace(current, { state: "completed-turn-bound", turnStart: clone(current.turnStart), toolActions: clone(current.toolActions), completedTurn: bound, promotion: null, abandonment: null });
}
export function markTurnOutcomeUnknown(intent, marker) {
  const current = validateDurableTurnIntent(intent); abandonment(marker);
  if (current.state === "outcome-unknown") { if (same(current.abandonment, marker)) return current; fail("threadmesh_durable_turn_intent_unknown_conflict"); }
  if (current.state !== "started") fail("threadmesh_durable_turn_intent_not_started");
  return replace(current, { state: "outcome-unknown", turnStart: clone(current.turnStart), toolActions: clone(current.toolActions), completedTurn: null, promotion: null, abandonment: clone(marker) });
}
export function reconcileUnknownDurableTurnIntent(intent, result) {
  const current = validateDurableTurnIntent(intent); if (current.state !== "outcome-unknown") fail("threadmesh_durable_turn_intent_not_unknown");
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("threadmesh_durable_turn_intent_reconcile_invalid");
  if (result.state === "ambiguous") { exact(result, ["state"], "threadmesh_durable_turn_intent_reconcile_invalid"); return current; }
  if (result.state === "found") {
    exact(result, ["state", "binding"], "threadmesh_durable_turn_intent_reconcile_invalid");
    const inferredTurn = result.binding?.evidence?.turnId;
    const reconstructed = replace(current, { state: "started", turnStart: { turnId: inferredTurn }, toolActions: clone(current.toolActions), completedTurn: null, promotion: null, abandonment: null });
    const actions = clone(reconstructed.toolActions);
    const callsFromReceipt = result.binding?.toolCalls;
    if (!Array.isArray(callsFromReceipt) || callsFromReceipt.length !== actions.length) fail("threadmesh_durable_turn_intent_tool_calls_invalid");
    for (let ordinal = 0; ordinal < callsFromReceipt.length; ordinal += 1) {
      const call = callsFromReceipt[ordinal]; const selected = reconstructed.toolActions[ordinal];
      if (!selected || call?.ordinal !== ordinal || call.turnId !== inferredTurn || call.callId !== selected.callId || call.tool !== selected.name || call.argumentsDigest !== selected.argumentsDigest) {
        fail("threadmesh_durable_turn_intent_tool_binding_mismatch");
      }
      if (selected.resultDigest === null) actions[ordinal] = completion({ turnId: call.turnId, callId: call.callId, ordinal, resultDigest: call.outputDigest, resultStatus: call.resultStatus }, selected);
    }
    const recovered = replace(current, { state: "started", turnStart: { turnId: inferredTurn }, toolActions: actions, completedTurn: null, promotion: null, abandonment: null });
    const bound = binding(result.binding, recovered);
    return replace(recovered, { state: "completed-turn-bound", turnStart: { turnId: bound.evidence.turnId }, toolActions: clone(recovered.toolActions), completedTurn: bound, promotion: null, abandonment: null });
  }
  if (result.state === "not-found") { exact(result, ["state", "reasonCode"], "threadmesh_durable_turn_intent_reconcile_invalid"); const marker = { reasonCode: result.reasonCode }; abandonment(marker); return replace(current, { state: "abandoned", turnStart: clone(current.turnStart), toolActions: clone(current.toolActions), completedTurn: null, promotion: null, abandonment: marker }); }
  fail("threadmesh_durable_turn_intent_reconcile_invalid");
}
export function promoteDurableTurnIntent(intent, expected) {
  const current = validateDurableTurnIntent(intent); promotion(expected);
  if (current.state === "promoted") { if (same(current.promotion, expected)) return current; fail("threadmesh_durable_turn_intent_promotion_conflict"); }
  if (current.state !== "completed-turn-bound") fail(current.state === "abandoned" ? "threadmesh_durable_turn_intent_terminal" : "threadmesh_durable_turn_intent_not_completed");
  if (current.toolActions.length === 0) fail("threadmesh_durable_turn_intent_no_model_selected_tool");
  return replace(current, { state: "promoted", turnStart: clone(current.turnStart), toolActions: clone(current.toolActions), completedTurn: clone(current.completedTurn), promotion: clone(expected), abandonment: null });
}
export function abandonDurableTurnIntent(intent, marker) {
  const current = validateDurableTurnIntent(intent); abandonment(marker);
  if (current.state === "abandoned") { if (same(current.abandonment, marker)) return current; fail("threadmesh_durable_turn_intent_abandonment_conflict"); }
  if (current.state === "promoted") fail("threadmesh_durable_turn_intent_terminal");
  return replace(current, { state: "abandoned", turnStart: current.turnStart === null ? null : clone(current.turnStart), toolActions: clone(current.toolActions), completedTurn: current.completedTurn === null ? null : clone(current.completedTurn), promotion: null, abandonment: clone(marker) });
}
