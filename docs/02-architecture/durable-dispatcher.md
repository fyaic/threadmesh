# Durable dispatcher

> M1 implementation contract. Merge remains gated by independent M0 review
> issue #7.

The reference `DurableDispatcher` owns the native-effect sequence that was
previously left to each caller:

```text
validate accepted disposition and current policy
  → persist prepared submission and stable adapter idempotency key
  → preflight exact adapter kind
  → revalidate incarnation, freshness, expiry, grant, and adapter reference
  → persist outcome-unknown
  → call native adapter exactly once
  → atomically persist exact receipt + adapter-submitted disposition
```

The shared transition table in
[`disposition-transitions.mjs`](../../src/state/disposition-transitions.mjs)
drives both the conformance validator and runtime mutations. The coordinator
therefore cannot accept a receiver transition that the manifest declares
illegal.

## External-attempt boundary

`outcome-unknown` is written immediately before the adapter call. Any throw,
timeout, malformed receipt, process crash, or lost response after that write is
ambiguous: bytes may have crossed and an effect may exist. The dispatcher
returns `outcome-unknown`, sets `retrySuppressed = true`, and never calls the
adapter again on replay or restart.

Only evidence-backed reconciliation may resolve the record:

- `confirmed-submitted` records the exact durable receipt;
- `confirmed-not-submitted` permits a new submission ID and adapter key;
- `manual-required` remains quarantined.

If no registered adapter supports the target, failure is recorded before the
irreversible boundary with `delivery = failed`; the adapter is never called.

## Freshness and adapter binding

Task metadata stores an optional run ID, objective version, and checkpoint under
task revision CAS. `steer` and `interrupt` compare their declared freshness to
the target snapshot at message admission and again immediately before begin.
The second check prevents an accepted request for objective N from affecting
objective N+1.

Preparation binds a digest of the adapter reference. Begin rejects an adapter
reference changed between prepare and dispatch. A receiver cannot silently
redirect an already prepared effect to another native session.

## Explicit results

The runtime stores receiver reason codes and supports the legal terminal
decision states `rejected`, `stale`, `expired`, `unsupported`, and `revoked`, in
addition to `accepted` and `deferred`. Delivery failure has a bounded failure
reason. There is no `applied` field or status: native acceptance is
`adapter-submitted`, while observed and externally verified outcomes remain
separate state machines.

This dispatcher is an in-process reference component. It does not provide an
OS sandbox, remote adapter authentication, signed native receipts, or automatic
unknown-outcome adjudication.
