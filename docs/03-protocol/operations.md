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

### `tasks.updateRuntime`

Publishes the current run ID, objective version, and optional checkpoint under
task revision CAS. State-changing envelopes are compared with this snapshot at
admission and again immediately before native dispatch.

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

### `messages.failDelivery`

Records a legal transition to delivery failure with a bounded reason. It is
permitted only before `adapter-submitted` and when no native attempt is
`outcome-unknown`; ambiguity must be reconciled, not relabelled as failure.

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

Waits for task state, new disposition, or checkpoint events. Implementations
SHOULD use cursors to suppress already delivered events. A local stream may
persist the last cursor and resume after restart; downstream processing remains
idempotent because cursor delivery is not a global exactly-once guarantee.

## Inspection

### `inspector.snapshot`

Returns one authorized message's provenance, content visibility state,
delivery, receiver decision, outcome, adapter-submission metadata, and bounded
audit projection. It MUST distinguish user-authored from peer-authored input
and MUST NOT collapse delivery, decision, and outcome into one status.

Content and evidence references MUST be redacted after expiry or loss of the
exact grant. A policy-only view is metadata-only. Missing and unauthorized
records SHOULD be indistinguishable to prevent message-ID enumeration.

## Maintenance

### `maintenance.expireDue`

Transitions due, non-terminal messages to expired under disposition CAS and
appends one audit event in the same transaction. Pending and deferred receiver
decisions become expired; a prior accepted decision remains historically
accepted while delivery expires before adapter submission.

Messages with an active irreversible context-admission claim or native
`outcome-unknown` boundary are excluded. Expiry cannot overwrite an unknown
external effect. The operation is control-plane-only, bounded, and idempotent.
A user sweep covers only messages whose source and target tasks that user owns;
cross-owner maintenance requires policy authority.

### `maintenance.purgeContent`

Applies a policy-selected retention cutoff to bounded storage classes. The
operation replaces eligible content with tombstones while retaining message and
task identities, original canonical digests, grant/version, dispositions,
timestamps, and safe audit event metadata. It is policy-only and idempotent in
the authenticated operation scope.

The operation MUST exclude an in-flight context-admission claim and any native
submission whose result is `outcome-unknown` or still requires manual
reconciliation. Expired envelope content and evidence, associated audit detail,
inactive proposal/summary content, completed admission references, and retired
task adapter references may then be scrubbed. A future cutoff MUST fail closed.
Physical WAL truncation is a separate operator checkpoint and is not proof of
forensic erasure from backups or storage snapshots.

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
The reference coordinator atomically marks eligible queued `steer` and
`interrupt` decisions revoked and records audit evidence. Attempts already past
the durable `outcome-unknown` boundary remain quarantined for reconciliation.

## Reference JSON-RPC mapping

| Portable concern | Public JSON-RPC method | Current limitation |
|---|---|---|
| Task lifecycle | `tasks.register`, `tasks.attach`, `tasks.updateRuntime`, `tasks.rotateIncarnation` | Local token authenticator only |
| Summary projection | `tasks.publishSummary`, `tasks.getSummary` | Relationship-scoped profile only |
| Grant proposal/decision | `relationships.propose`, `relationships.grant`, `relationships.revoke` | No signed remote attestation |
| Envelope send | `messages.send` | Core state remains suggestion-focused |
| Mailbox receive | `mailbox.listPending`, `mailbox.claim`, `mailbox.ack` | Fixed 60-second local claim window |
| Receiver decision | `messages.respond` | All legal decision states and constrained reasons; no structured approval gate |
| Delivery failure | `messages.failDelivery` | Pre-effect failure only; unknown outcomes require reconciliation |
| Native submission | `adapter.prepareSubmission`, `adapter.beginSubmission`, `adapter.recordReceipt` | Trusted local receipt, not independent verification |
| Unknown-outcome reconciliation | `adapter.reconcileSubmission`, `adapter.getSubmission` | Receiver task supplies evidence; no remote attestation yet |
| Expiry maintenance | `maintenance.expireDue` | Control-plane-only bounded sweep; in-flight effects excluded |
| Retention maintenance | `maintenance.purgeContent` | Policy-only tombstoning; unresolved effects excluded; backups remain operator-managed |
| Event observation | `tasks.wait` | Immediate cursor poll plus local restart checkpoint; not a hosted stream |
| Provenance inspection | `inspector.snapshot` | Exact-message read; policy metadata-only; revoked/expired content redacted |
| Disposition/audit read | `messages.getDisposition`, `audit.list` | Sender/receiver task projection only |

The older trusted-process `prepareContextAdmission` and
`confirmContextAdmission` methods remain an ACP experiment for model-visible
context. Public native-effect accounting uses the adapter submission methods
above; integrations must not collapse context admission into adapter receipt or
verified outcome.
