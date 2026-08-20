# Delivery semantics

> Draft normative document.

## Guarantees

The reference protocol targets durable, at-least-once transport with
idempotent state-changing adapter submission.

- Senders MAY retry the same `messageId`.
- Routers MUST NOT create multiple logical messages for one `messageId`.
- Receivers MUST NOT submit the same state-changing message to an adapter more than once.
- Acknowledgement of queueing MUST NOT be reported as receiver acceptance.

Message identity is scoped to the authenticated sender incarnation plus
`messageId`. A coordinator MUST persist the canonical envelope digest. Reuse of
that scoped identity with a different digest is an idempotency conflict, not a
new version of the message.

## Three orthogonal state machines

ThreadMesh does not use one ambiguous linear status. A disposition snapshot
reports delivery, receiver decision, and observed outcome independently.

### Delivery

```text
control-plane-accepted
  → durably-received
    → receiver-notified | checkpoint-offered
      → context-admitted
        → adapter-submitted
```

Some native operations may move from `durably-received` directly to
`adapter-submitted`. Any non-terminal delivery state may instead become
`failed` or `expired` where the transition table permits it.

### Receiver decision

```text
pending → accepted | rejected | deferred | stale | expired | unsupported | revoked
deferred → accepted | rejected | stale | expired | revoked
accepted → revoked
```

Decision reason codes are state-constrained:

| Decision state | Compatible reason codes |
|---|---|
| `pending` | none |
| `accepted` | `accepted` |
| `rejected` | `policy-denied`, `receiver-rejected`, `structured-gate-required`, `backpressure`, `evidence-insufficient`, or `other` |
| `deferred` | `receiver-deferred`, `backpressure`, or `other` |
| `stale` | `stale-incarnation`, `stale-run`, or `stale-objective` |
| `expired` | `expired` |
| `unsupported` | `unsupported-intent`, `unsupported-delivery-mode`, or `structured-gate-required` |
| `revoked` | `revoked` |

An implementation MUST reject contradictory pairs such as
`accepted + policy-denied` rather than treating the reason as free-form detail.

### Observed outcome

```text
not-observed → effect-observed | externally-verified | failed
effect-observed → externally-verified
```

`adapter-submitted` proves only that a native harness operation accepted the
request. `context-admitted` proves only that authorized peer content entered a
model-visible rendering. Neither proves that the model followed the advice.
`externally-verified` requires evidence references plus at least one signed,
trusted verification attestation whose subject matches the disposition message
and receiver. An ordinary adapter receipt or evidence URI remains
`effect-observed` or evidence-referenced; it cannot self-upgrade to independent
verification.

Verification consumers MUST recompute the canonical signed-payload digest,
resolve the proof key through an operator-configured trust anchor, verify the
signature, and enforce the recorded trust-policy decision. The attestation's
own key ID is a lookup key, not a trust grant.

## Durable adapter submission

A state-changing harness call uses a separate durable submission record:

```text
prepared
  → outcome-unknown
    → receipt-recorded
    → confirmed-not-submitted
    → manual-reconciliation
```

`prepared` means no external-attempt boundary has been crossed. Immediately
before calling the harness, the dispatcher MUST durably move the record to
`outcome-unknown` and bind it to the envelope digest, receiver task,
disposition revision, adapter reference digest, and stable adapter idempotency
key. A crash after that write may have occurred before or after the external
effect, so restart MUST NOT convert it back to `prepared` or blindly redeliver.

A native harness acceptance becomes `receipt-recorded` only when its durable
receipt is stored in the same transaction as the disposition CAS to
`adapter-submitted`. An identical receipt may replay; a different receipt for
the same submission is a conflict.

Reconciliation of `outcome-unknown` requires evidence from a queryable adapter
receipt, an operator, or another trusted binding. `confirmed-not-submitted` may
authorize a fresh attempt with a new submission ID and idempotency key.
`confirmed-submitted` records the receipt. `manual-required` remains
quarantined. Local adapter evidence is not an independently verified outcome.

## Cross-state invariants

- `context-admitted` and `adapter-submitted` require an accepted or subsequently
  revoked receiver decision.
- `effect-observed` and `externally-verified` require
  `delivery.state = adapter-submitted`.
- An expired or rejected message cannot later become context-admitted or
  adapter-submitted.
- Every disposition mutation uses expected-revision CAS; reconciliation does
  not bypass it.

## Expiry

Expired messages MUST NOT be context-admitted or adapter-submitted.
Implementations MAY retain redacted audit metadata after content expiry.

## Ordering

Global ordering is not required. Messages from the same sender to the same target SHOULD preserve creation order when possible. Receivers still evaluate freshness independently because network order does not prove semantic order.

## Offline receivers

`notify` and `suggest` MAY remain queued until expiry. `steer` and `interrupt`
SHOULD use short expiry windows and MUST be re-authorized and freshness-checked
immediately before adapter submission.

## Backpressure

Receivers MAY enforce mailbox size, sender rate, intent rate, and interruption budgets. Rejection due to backpressure must be explicit.

## Forwarding

Forwarders MUST preserve origin provenance and append a forwarding hop. They MUST NOT imply that the original sender authorized a stronger intent.

## Conformance

The legal draft transitions and representative invalid regressions are
executable in [`spec/conformance`](../../spec/conformance/README.md).
