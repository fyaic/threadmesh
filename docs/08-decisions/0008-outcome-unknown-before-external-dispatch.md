# ADR 0008: Persist outcome unknown before external dispatch

- Status: Accepted
- Date: 2026-08-20
- Issue: [#19](https://github.com/fyaic/threadmesh/issues/19)

## Context

A coordinator cannot atomically commit its local database transaction and an
arbitrary harness operation. If it crashes after the harness accepted a steer,
interrupt, or other state change but before storing the receipt, restart cannot
know whether repeating the call is safe. Exactly-once transport does not solve
this external-effect ambiguity.

Message-level deduplication is also insufficient. The same message may be read,
decided, rendered, and finally submitted by different workers, while a stale
worker races a newer disposition revision.

## Decision

ThreadMesh scopes logical message identity to authenticated sender incarnation
plus message ID and persists the canonical envelope digest. A different digest
under that identity is a conflict.

Every native state-changing harness call has a durable submission record bound
to its message digest, receiver task, expected disposition revision, adapter
reference digest, and stable adapter idempotency key. The dispatcher writes
`outcome-unknown` immediately before the external call. Receipt storage and the
disposition CAS to `adapter-submitted` occur atomically afterward.

Restart preserves unknown state and never blindly retries it. Reconciliation
requires evidence and yields one of:

- confirmed submitted, with a receipt;
- confirmed not submitted, which alone permits a fresh attempt;
- manual reconciliation, which remains quarantined.

Adapters may advertise `steer` or `interrupt` only when they provide stable-key
or queryable-receipt idempotency. Local receipts prove adapter acceptance, not
semantic model compliance or an independently verified external outcome.

## Consequences

- A crash can leave work unavailable pending reconciliation, favoring safety
  over duplicate effects.
- Harness adapters need a stable operation key and preferably a receipt query.
- Disposition updates require expected-revision CAS across dispatch and
  reconciliation.
- Operators can inspect an explicit unknown state instead of inferring from
  missing logs.
- True exactly-once external effects remain impossible without cooperation from
  the target harness or resource.

## Rejected alternatives

### Retry on process restart

This duplicates effects when the first call succeeded but its receipt was lost.

### Mark submitted before calling the harness

This reports an observation that did not occur and can permanently lose work
when the process crashes before the call.

### Treat timeout as failure

A timeout describes the observer, not the external operation. The harness may
have accepted the request after the caller stopped waiting.

### Hold only an in-memory lock

Locks disappear on crash and do not provide replay or audit evidence.
