# Distributed-systems review — 2026-08-20

- Reviewer: internal Codex sub-agent
- Reviewed commit: `c38873026222175433fb86f2fcac1a655ffcc932`
- Method: read-only protocol, schema, fixture, and validator review
- Verdict: **Request changes**

No P0 issue was found. The review identified three P1 correctness gaps that
must be resolved before ThreadMesh can safely advertise state-changing adapter
support.

## P1 findings

### Adapter submission has an unresolved crash window

At-least-once transport and exactly-once state-changing adapter submission
cannot both be guaranteed unless the harness accepts an idempotency receipt or
an equivalent atomic compare-and-submit operation. A crash after the harness
acts but before the coordinator records the receipt otherwise creates an
unknowable outcome.

Required follow-up:

- bind submission to message ID, both task incarnations, freshness, expiry, and
  grant version;
- require durable harness idempotency before advertising `steer` or `interrupt`;
- represent unknown outcomes and reconciliation explicitly;
- add crash-before-receipt recovery scenarios.

### Message ID conflicts are undefined

Two individually valid envelopes can use the same message ID with different
content. The reviewed draft did not define sender scope or a canonical payload
digest.

Required follow-up:

- scope idempotency to authenticated sender incarnation plus message ID;
- persist a canonical envelope digest on first receipt;
- return the original disposition for the same digest;
- return `idempotency-conflict` for a different digest.

The experimental SQLite coordinator now demonstrates this conservative rule,
but it is not yet a versioned normative binding.

### Orthogonal states need cross-state invariants and CAS

The reviewed disposition schema allowed combinations such as
`adapter-submitted + rejected`. Independent delivery, decision, and outcome
state machines still need cross-state authorization invariants. Concurrent
updates also need expected-revision compare-and-swap or append-only event
projection.

The experimental coordinator uses expected revisions and permits context
admission only after acceptance and current-grant reauthorization. The
normative schemas still require follow-up.

## P2 findings

- Runtime expiry and grant/disposition timestamp ordering need a shared semantic
  validator with an injected trusted clock.
- Audit integrity needs stream identity, monotonic sequence, digest linkage, and
  fork detection or equivalent database constraints.
- Creation-order guidance should either become an explicit sender sequence or
  be removed in favor of freshness and causality.

## Approval condition

Resolve the three P1 findings in normative text and conformance cases, then
repeat the crash, conflict, and concurrent-update review.

## Prototype follow-up

After the initial review, pull request
[#20](https://github.com/fyaic/threadmesh/pull/20) added canonical envelope
digests, same-ID conflict rejection, expected-revision CAS, highest-version
grant semantics, persistent single-use admission claims, restart tests, and an
explicit revocation linearization boundary. The reviewer approved that
conservative experimental prototype after re-review.

The approval does not close the normative receipt, `outcome-unknown`,
cross-state invariant, or transport-idempotency work in
[#19](https://github.com/fyaic/threadmesh/issues/19).
