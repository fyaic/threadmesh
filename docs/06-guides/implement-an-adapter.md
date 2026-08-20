# Implement an adapter

This guide describes the intended implementation sequence. A concrete but
experimental ACP implementation now lives in
[`src/adapters/acp-stdio.mjs`](../../src/adapters/acp-stdio.mjs); it is evidence,
not a production compatibility claim.

For the portable control-plane surface, start with the
[JSON-RPC binding](../03-protocol/jsonrpc-binding.md). Keep transport credentials
outside JSON-RPC params and map verified identity to an `AuthContext` before
dispatch.

For a deliberately conservative ACP example, see the
[Kimi Code experiment](../05-adapters/kimi-code.md) and its
[smoke evidence](../09-reviews/2026-08-20-kimi-code-smoke.md).

## 1. Identify local primitives

Document how the harness represents sessions, active runs, model messages, tool calls, cancellation, waiting, and approvals. Mark anything that is not observable or controllable.

## 2. Create stable mappings

Persist ThreadMesh task IDs separately from ephemeral process IDs. Record adapter-local references and verify them on every state-changing operation.

## 3. Publish capabilities

Start conservative. Advertise only semantics that can be enforced and observed. It is acceptable to support only `notify` and mailbox-based `suggest`.

## 4. Add checkpoints

Check the receiver mailbox before model calls and after tool results. Do not inject content merely because it was delivered.

## 5. Preserve provenance

Render cross-task content with a distinct source role or explicit wrapper. Never present it as direct user speech.

## 6. Enforce freshness

Bind `steer` and `interrupt` to a local run and objective version. Fail closed on mismatch.

## 7. Report dispositions

Return separate delivery, receiver-decision, context-admission,
adapter-submission, and outcome events. Report partial cancellation honestly.

For interruption, always return a model-turn result and explicit tool-call and
subprocess coverage. Enumerate each known target. If the harness cannot inspect
a target class, report `unavailable`; never infer that session cancellation
stopped external work.

Keep ordinary evidence at `effect-observed`. Only accept
`externally-verified` after recomputing the attestation digest, resolving the
key ID through a configured trust store, validating the signature, matching the
message/receiver subject, and enforcing the trust-policy decision.

For external model-visible dispatch, durably claim the message before invoking
the harness. Bind the claim to message revision, grant version, and the resolved
adapter reference. Confirm it only with matching adapter evidence. If the
process crashes while the claim is in flight, reconcile rather than blindly
redeliver.

For native state-changing operations, use the public submission sequence:

1. call `adapter.prepareSubmission`;
2. call `adapter.beginSubmission` and persist the returned
   `outcome-unknown` state before touching the harness;
3. pass its stable `adapterIdempotencyKey` to the harness;
4. call `adapter.recordReceipt` only for an exact native acceptance receipt;
5. after a crash, query the same key and call `adapter.reconcileSubmission`;
6. create a fresh attempt only after `confirmed-not-submitted`.

## 8. Run conformance scenarios

At minimum test:

- duplicated message ID;
- expired suggestion;
- stale steering request;
- peer interruption attempt;
- objective change between queue and delivery;
- unavailable receiver;
- adapter restart;
- provenance preservation;
- unsupported intent;
- repeated interruption rate limit.
- partial cancellation where the turn stops but a tool or subprocess continues;
- attacker-controlled evidence URL, self-signed adapter attestation, tampered
  digest, invalid signature, and untrusted key ID;
- crash before native receipt, restart recovery, conflicting receipt, and
  concurrent disposition CAS.

The checked-in ACP fixture additionally tests persistent session reload,
rejection of unknown sessions, historical replay isolation, permission denial,
timeout escalation, and crash-safe duplicate admission claims.
