# ADR 0001: Mailbox before injection

- Status: Accepted
- Date: 2026-08-20

## Context

Cross-task content can redirect an agent, consume context, trigger tools, and persist into future summaries. Directly appending every delivered message to the target conversation gives senders implicit control over receiver context.

## Decision

ThreadMesh separates durable mailbox delivery from model-context injection. Peer `suggest` messages enter a receiver-controlled mailbox by default and are evaluated at a checkpoint.

## Consequences

- Receivers can reject, defer, or mark messages stale.
- Delivery metrics no longer imply model exposure.
- Adapters need a mailbox even when the harness has a native steer API.
- Coordination may be slower than direct injection.
- User interfaces can display pending advice without disturbing execution.

## Rejected alternative

Treat all cross-task messages as ordinary user turns. This is simple but erases provenance and violates context sovereignty.
