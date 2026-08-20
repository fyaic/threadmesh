# ADR 0004: Separate coordination transitions

- Status: Accepted
- Date: 2026-08-20
- Issues: [#3](https://github.com/fyaic/threadmesh/issues/3),
  [#5](https://github.com/fyaic/threadmesh/issues/5)

## Context

Cross-task coordination is often described as one operation: send a message.
In practice, the control plane, target harness, receiver, model, and external
environment observe different facts at different times.

Reporting a message as "applied" is especially dangerous. A harness may prove
that it persisted content, offered it at a checkpoint, admitted it to model
context, or submitted a native steer request. It generally cannot prove that a
model followed the content or that an external outcome occurred.

## Decision

ThreadMesh separates five transitions:

1. **Submitted:** the control plane accepted the envelope.
2. **Durably received:** the target mailbox persisted it.
3. **Notified or offered:** the target was notified, woken, or shown a
   checkpoint offer.
4. **Context admitted:** the receiver authorized model-visible rendering.
5. **Adapter submitted or outcome verified:** a native harness operation was
   accepted, or an independently evidenced outcome was later verified.

Receiver decision is orthogonal to delivery. A receiver may keep a message
pending, accept, reject, defer, mark it stale, expire it, report it unsupported,
or revoke a prior non-terminal acceptance.

The core protocol does not use bare `applied` as a disposition. It uses the
narrower `adapter-submitted`, `effect-observed`, and `externally-verified`
states. None of these claims that a model semantically followed advice unless a
separate verifier produces evidence for that claim.

## Consequences

- Delivery metrics cannot be mistaken for receiver acceptance.
- Wake notification may fail or duplicate without losing durable mail.
- User interfaces need to show several compact but distinct statuses.
- Adapters report only observations they can substantiate.
- Conformance tests need delivery, decision, and outcome state machines.
- End-to-end completion can take more events than a generic chat send.

## Rejected alternatives

### One linear status enum

A single state cannot represent a durably received message that was rejected,
or an accepted message whose native adapter operation later failed.

### `applied` means model-visible

This overstates causality and makes adapters appear to guarantee model behavior.

### Wake event as delivery proof

Wake paths are often best-effort. Treating them as the source of truth loses
messages during dropped notifications and creates duplicate processing during
retries.
