# Provenance inspector and local event stream

> M1 implementation contract. The current implementation is local and
> experimental; it is not a hosted observability service.

## Purpose

Coordination must be inspectable without turning the inspector into a second
path for reading private task content. The reference slice separates two
surfaces:

- `tasks.wait` exposes task-scoped lifecycle events through a monotonic cursor;
- `inspector.snapshot` exposes one authorized message's provenance, redacted
  content state, delivery, receiver decision, outcome, and safe audit metadata.

Delivery, decision, and outcome remain independent. A snapshot therefore never
uses one ambiguous “applied” field.

## Restart-safe local stream

[`LocalTaskEventStream`](../../src/inspector/local-event-stream.mjs) polls any
authenticated `tasks.wait`-compatible reader. It validates strict cursor order,
returns a caller-owned checkpoint, supports bounded timeout and cancellation,
and accepts that checkpoint in a new instance after process or coordinator
restart.

The cursor is local to one SQLite coordinator. It proves neither global order
across hosts nor exactly-once event processing. Consumers persist their own
checkpoint and must make downstream handling idempotent.

## Snapshot authorization

The snapshot can be read by:

- the exact source or target task incarnation;
- the user owner of either participating task;
- a provisioned policy principal, for metadata-only inspection.

Missing and unauthorized records return the same
`threadmesh_inspection_not_authorized` error so the method is not a message-ID
enumeration oracle. Policy is a privileged local control-plane role; it does
not receive message content or evidence references.

Content and evidence are visible to an authorized participant only while the
envelope is unexpired and the exact relationship grant remains current. A
snapshot keeps non-content lifecycle and disposition metadata after expiry or
revocation, but replaces content with one of these reasons:

- `expired`;
- `purged`;
- `authorization-no-longer-current`;
- `metadata-only-policy-view`.

Evidence references are redacted with the content. The inspector reports only
their count once hidden.

## Provenance and safe metadata

The snapshot renders the authenticated envelope projection rather than
inventing a new speaker role. It distinguishes `user-authored` from
`peer-authored` and includes actor type, exact source and target incarnations,
harness identities, relationship, intent, and claim status.

Audit events are projected to cursor, event type, disposition revision, and
timestamp. Arbitrary audit detail is not returned. Adapter submission metadata
may include identifiers and canonical digests, but the raw adapter idempotency
key is replaced by its SHA-256 digest.

## Retention boundary

Expiry and revocation redaction are authorization responses, not physical
deletion. Once policy runs `maintenance.purgeContent`, the inspector reports
`purged` and the live envelope/evidence fields are replaced by tombstones while
identity, digest, disposition, and safe audit metadata remain. Exporters must
apply the same authorization and retention rules and must not create an
unmanaged copy of visible content.

## Current evidence

Deterministic tests cover:

- cursor continuation after closing and reopening the SQLite coordinator;
- peer-authored and user-authored provenance;
- participant visibility and metadata-only policy inspection;
- indistinguishable missing and unauthorized reads;
- revocation-driven content and evidence redaction;
- separate delivery, decision, outcome, and ordered audit projections.

Hosted streaming, a user interface, cross-host ordering, managed backup expiry,
and forensic storage erasure remain outside this slice.
