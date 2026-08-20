# Delivery semantics

> Draft normative document.

## Guarantees

The reference protocol targets durable, at-least-once transport with
idempotent state-changing adapter submission.

- Senders MAY retry the same `messageId`.
- Routers MUST NOT create multiple logical messages for one `messageId`.
- Receivers MUST NOT submit the same state-changing message to an adapter more than once.
- Acknowledgement of queueing MUST NOT be reported as receiver acceptance.

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

### Observed outcome

```text
not-observed → effect-observed | externally-verified | failed
effect-observed → externally-verified
```

`adapter-submitted` proves only that a native harness operation accepted the
request. `context-admitted` proves only that authorized peer content entered a
model-visible rendering. Neither proves that the model followed the advice.
`externally-verified` requires evidence references.

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
