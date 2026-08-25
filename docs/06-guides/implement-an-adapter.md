# Implement an adapter

The pre-alpha SDK reduces the first integration to six methods. A harness does
not need the SQLite coordinator, protocol validator, or adapter implementations
in its process.

## 30-minute path

Install the current GitHub package:

```sh
npm install github:fyaic/threadmesh
```

Create a client with a transport that accepts a JSON-RPC request plus a separate
transport authorization context:

```js
import { createThreadMeshClient } from "@fyaic/threadmesh";

const mesh = createThreadMeshClient({
  authorization: `Bearer ${token}`,
  send: async (request, { authorization }) => {
    const response = await fetch(threadMeshUrl, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});
```

The host, not the model, supplies `token`. The server derives the principal from
that credential; never put a principal or token inside JSON-RPC params.

### Public methods

| Method | Harness use |
|---|---|
| `registerTask(task)` | Register one durable task incarnation using an owner or policy client |
| `publishSummary(summary)` | Publish the receiver's bounded, relationship-scoped coordination summary |
| `discoverRelated({ task, relationshipId })` | Read one authorized related-task summary; there is no global task scan |
| `sendSuggestion(input)` | Send one expiring advisory suggestion; SDK TTL is capped at 30 minutes |
| `pollMailbox({ receiver, afterCursor })` | Poll pending, unexpired, currently authorized messages at a checkpoint |
| `decide({ message, decision })` | Durably claim and accept, reject, or defer one mailbox message |

Relationship grants are control-plane policy and deliberately are not part of
the harness SDK. Provision them through an owner/policy administration path.

At each safe harness checkpoint:

```js
const page = await mesh.pollMailbox({ receiver: myTask, afterCursor });
for (const message of page.messages) {
  const decision = await localReceiverPolicy(message);
  await mesh.decide({ message, decision });
}
afterCursor = page.nextCursor;
```

Acceptance is consent to consider the content, not permission for external side
effects. Preserve peer provenance when rendering accepted content and keep it
separate from user or developer instructions. The full runnable wiring is in
[`examples/minimal-harness.mjs`](../../examples/minimal-harness.mjs).

## Advanced implementation sequence

A concrete but experimental ACP implementation lives in
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
