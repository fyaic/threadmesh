# Operations

> Draft normative document. Method names are transport-neutral logical operations.

## Discovery

### `tasks.listRelated`

Returns minimal summaries for tasks connected by visible relationship or dependency edges. It MUST NOT behave as unrestricted global task search by default.

### `tasks.getSummary`

Returns task state, objective summary, freshness information, and advertised capabilities. Full message history is outside the core operation.

## Coordination

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
