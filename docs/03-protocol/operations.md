# Operations

> Draft normative document. Method names are transport-neutral logical operations.

This document describes the portable logical surface. The executable
[JSON-RPC binding](jsonrpc-binding.md) supplies authenticated operation context,
request/response schemas, typed errors, durable idempotency, CAS, and two mock
harness scenarios. Other bindings must preserve the same authority and state
semantics.

## Task registration

### `tasks.register`

Registers a task incarnation, owner scope, harness identity, capabilities, and
optional adapter-local reference. Registration is idempotent within the
authenticated operation scope.

### `tasks.attach`

Binds an adapter-local reference to an active task under revision CAS. Only the
task itself, its owner, or policy may attach it.

### `tasks.rotateIncarnation`

Atomically retires the previous incarnation and registers a new incarnation for
the same logical task under owner/policy authority and revision CAS. Retiring an
incarnation invalidates grants bound to it even if an old credential remains.

### `tasks.publishSummary`

Publishes a privacy-bounded summary for relationship-scoped discovery. Summary
visibility MUST remain constrained by the current effective grant. Publication
uses summary-version CAS.

## Discovery

### `tasks.listRelated`

Returns minimal summaries for tasks connected by visible relationship or dependency edges. It MUST NOT behave as unrestricted global task search by default.

### `tasks.getSummary`

Returns task state, objective summary, freshness information, and advertised capabilities. Full message history is outside the core operation.

For relationship-scoped reads, the implementation MUST verify that the
summary's `projection.relationshipId`, `grantId`, and `grantVersion` still name
the current effective grant. It MUST reject or reduce a stale projection rather
than returning fields authorized by an older grant version.

## Coordination

### `mailbox.listPending`

Returns receiver-owned, currently authorized pending messages using an opaque
cursor. Expired, revoked, superseded-grant, and retired-incarnation messages are
not disclosed.

### `mailbox.claim`

Creates or replays a bounded persistent receiver claim for one message and
disposition revision. A claim grants no adapter-effect authority.

### `mailbox.ack`

Acknowledges a claimed message with the exact claim token and records an
accepted, rejected, or deferred receiver decision under revision CAS.

### `messages.send`

Validates and submits a coordination envelope. Success returns acceptance by the control plane, not acceptance by the target.

### `messages.getDisposition`

Returns delivery and receiver state for a message.

### `messages.respond`

Records a receiver decision: accepted, rejected, deferred, stale, expired,
unsupported, or revoked. Delivery and observed outcome are reported separately;
there is no bare `applied` disposition.

### `messages.recordDelivery`

Records a substantiated delivery transition such as durable receipt,
notification, context admission, or native adapter submission.

An external effect MUST NOT be retried automatically when a durable claim or
receipt exists but its outcome is unknown.

### `adapter.prepareSubmission`

Creates or replays a durable submission bound to the authenticated receiver,
canonical envelope digest, disposition revision, adapter reference digest and
stable adapter idempotency key. It does not authorize reporting a harness call.

### `adapter.beginSubmission`

Moves a prepared submission to `outcome-unknown` durably and immediately before
the external harness call. Restart never rewinds this boundary.

### `adapter.recordReceipt`

Stores one exact native adapter acceptance receipt and moves delivery to
`adapter-submitted` under disposition CAS. A conflicting receipt is rejected.

### `adapter.reconcileSubmission`

Resolves an unknown attempt as confirmed submitted, confirmed not submitted, or
manual reconciliation. Evidence is mandatory. Only confirmed-not-submitted may
permit a fresh attempt.

### `messages.recordOutcome`

Records an observed effect, externally verified outcome, or adapter failure.
External verification requires evidence references and signed verification
attestations. The verifier authentication event, claim subject and digest,
method, evidence digest, verification time, trust-policy decision, key ID and
signature are mandatory. Ordinary task or adapter principals may record an
observation but cannot issue an external-verification attestation.

### `messages.recordInterruptionResult`

Records model-turn, tool-call, and subprocess cancellation results per target.
Every target uses a typed state and tool/process coverage is explicit. No
portable operation returns one umbrella interrupt-success value.

## Waiting

### `tasks.wait`

Waits for task state, new disposition, or checkpoint events. Implementations SHOULD use cursors to suppress already delivered events.

## Relationship management

### `relationships.propose`

Proposes a relationship edge. Proposal alone grants no task visibility or write
authority and expires independently.

### `relationships.grant`

Creates or updates an authorized relationship. Only an authenticated owner or
policy actor may grant it. The effective grant binds issuer, decision ID,
version, optional proposal ID, and canonical integrity digest.

### `relationships.revoke`

Revokes future authority. Queued, unapplied state-changing messages MUST be re-evaluated after revocation.

## Reference JSON-RPC mapping

| Portable concern | Public JSON-RPC method | Current limitation |
|---|---|---|
| Task lifecycle | `tasks.register`, `tasks.attach`, `tasks.rotateIncarnation` | Local token authenticator only |
| Summary projection | `tasks.publishSummary`, `tasks.getSummary` | Relationship-scoped profile only |
| Grant proposal/decision | `relationships.propose`, `relationships.grant`, `relationships.revoke` | No signed remote attestation |
| Envelope send | `messages.send` | Core state remains suggestion-focused |
| Mailbox receive | `mailbox.listPending`, `mailbox.claim`, `mailbox.ack` | Fixed 60-second local claim window |
| Receiver decision | `messages.respond` | Reference runtime supports accepted/rejected/deferred |
| Native submission | `adapter.prepareSubmission`, `adapter.beginSubmission`, `adapter.recordReceipt` | Trusted local receipt, not independent verification |
| Unknown-outcome reconciliation | `adapter.reconcileSubmission`, `adapter.getSubmission` | Receiver task supplies evidence; no remote attestation yet |
| Event observation | `tasks.wait` | Immediate cursor poll, not hosted long-poll |
| Disposition/audit read | `messages.getDisposition`, `audit.list` | Sender/receiver task projection only |

The older trusted-process `prepareContextAdmission` and
`confirmContextAdmission` methods remain an ACP experiment for model-visible
context. Public native-effect accounting uses the adapter submission methods
above; integrations must not collapse context admission into adapter receipt or
verified outcome.
