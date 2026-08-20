# Delivery semantics

> Draft normative document.

## Guarantees

The reference protocol targets durable, at-least-once transport with exactly-once **application** through message idempotency.

- Senders MAY retry the same `messageId`.
- Routers MUST NOT create multiple logical messages for one `messageId`.
- Receivers MUST NOT apply a state-changing message more than once.
- Acknowledgement of queueing MUST NOT be reported as receiver acceptance.

## Expiry

Expired messages MUST NOT be applied. Implementations MAY retain redacted audit metadata after content expiry.

## Ordering

Global ordering is not required. Messages from the same sender to the same target SHOULD preserve creation order when possible. Receivers still evaluate freshness independently because network order does not prove semantic order.

## Offline receivers

`notify` and `suggest` MAY remain queued until expiry. `steer` and `interrupt` SHOULD use short expiry windows and MUST be re-authorized and freshness-checked at delivery.

## Backpressure

Receivers MAY enforce mailbox size, sender rate, intent rate, and interruption budgets. Rejection due to backpressure must be explicit.

## Forwarding

Forwarders MUST preserve origin provenance and append a forwarding hop. They MUST NOT imply that the original sender authorized a stronger intent.
