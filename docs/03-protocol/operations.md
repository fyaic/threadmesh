# Operations

> Draft normative document. Method names are transport-neutral logical operations.

This document describes the intended portable surface. The SQLite prototype
does not constitute a transport binding. Registration, mailbox reads,
authenticated operation context, request/response schemas, and typed errors are
tracked in [#17](https://github.com/fyaic/threadmesh/issues/17).

## Task registration

### `tasks.register`

Registers a task incarnation, owner scope, harness identity, capabilities, and
adapter-local reference. The normative identity proof, attach flow, and
incarnation-rotation semantics are not yet defined.

### `tasks.publishSummary`

Publishes a privacy-bounded summary for relationship-scoped discovery. Summary
visibility MUST remain constrained by the current effective grant.

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
cursor. The portable claim, acknowledgement, expiry, and restart behavior is
not yet specified; the experimental coordinator provides only an in-process
method.

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
receipt exists but its outcome is unknown. The receipt and reconciliation model
is tracked in [#19](https://github.com/fyaic/threadmesh/issues/19).

### `messages.recordOutcome`

Records an observed effect, externally verified outcome, or adapter failure.
External verification requires evidence references.

## Waiting

### `tasks.wait`

Waits for task state, new disposition, or checkpoint events. Implementations SHOULD use cursors to suppress already delivered events.

## Relationship management

### `relationships.propose`

Proposes a dependency or peer edge. Proposal alone grants no task visibility or write authority.

### `relationships.grant`

Creates or updates an authorized relationship. Only an appropriate owner or policy actor may grant it.

### `relationships.revoke`

Revokes future authority. Queued, unapplied state-changing messages MUST be re-evaluated after revocation.

## Experimental implementation mapping

| Portable concern | Current in-process method | Limitation |
|---|---|---|
| Task registration | `registerTask` | Trusted principal injection, no attach/rotation binding |
| Task resolution | `getTask` | No relationship-scoped summary projection |
| Grant install/revoke | `installGrant`, `revokeGrant` | Owner checks are local, not transport-authenticated |
| Envelope send | `submit` | Suggestion-focused prototype |
| Mailbox read | `listPending` | No published wire schema |
| Receiver decision | `respond` | Subset of normative disposition states |
| External dispatch claim | `prepareContextAdmission` | ACP-specific adapter reference |
| Delivery confirmation | `confirmContextAdmission` | Trusted process evidence, not signed attestation |
| Disposition/audit read | `getDisposition`, `auditEvents` | No cursor event stream or redaction projection |
