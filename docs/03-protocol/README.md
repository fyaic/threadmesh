# Protocol overview

> Draft normative document. Subject to breaking change before the first release.

ThreadMesh defines coordination semantics between addressable tasks. It does not prescribe a network transport.

The draft is executable but incomplete. Schemas and fixtures cover envelopes,
capabilities, dispositions, grants, summaries, audit events, and selected state
transitions. The remaining M0 normative gaps are summarized in the
[project status](../10-planning/project-status.md).

## Required concepts

A conforming implementation provides:

- stable task identities;
- an advertised capability document;
- explicit task relationships or authorization grants;
- message envelopes with provenance and expiry;
- idempotent delivery;
- receiver dispositions;
- freshness checks for `steer` and `interrupt`;
- an audit trail for state-changing requests;
- explicit unsupported behavior.

## Intent semantics

### `notify`

Informational. A receiver MAY display or store it without making it model-visible. It MUST NOT change the active objective merely by being delivered.

### `suggest`

Advisory. A receiver MUST retain the right to accept, reject, defer, or mark it stale. Peer coordination defaults to this intent.

### `steer`

State-changing. A receiver MUST verify authorization and freshness before
submitting it to an active run. Delivery alone is not adapter submission.

### `interrupt`

Cancellation request. A receiver MUST verify elevated authority and report whether cancellation succeeded, failed, or was only requested. It MUST NOT be downgraded to ordinary prompt text.

## Documents

- [Message envelope](message-envelope.md)
- [Operations](operations.md)
- [Delivery semantics](delivery-semantics.md)
- [Permission model](../04-safety/permission-model.md)
- [Adapter contract](../05-adapters/adapter-contract.md)

## Current conformance boundary

`npm test` validates schema compilation, 29 positive/negative fixture cases,
and 7 transition cases. It does not yet validate an authenticated wire binding,
two harness profiles, interruption results, verification attestations, or crash
reconciliation. Those are mainline M0 work rather than inferred behavior.
