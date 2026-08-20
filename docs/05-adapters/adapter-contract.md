# Adapter contract

> Draft normative document.

A ThreadMesh adapter maps portable task coordination onto one harness while preserving semantics and safety boundaries.

## Required adapter behavior

An adapter MUST:

- map stable local task, incarnation, and run references to ThreadMesh IDs;
- advertise supported intents and delivery modes;
- expose minimal task status and freshness values;
- preserve sender provenance when content becomes model-visible;
- distinguish durable receipt, notification, context admission, adapter
  submission, receiver decision, and observed outcome;
- reject unsupported or unsafe mappings explicitly;
- implement idempotent state-changing operations;
- emit audit events for state changes;
- fail closed when the local task or run cannot be resolved.

## Capability document

Capabilities include:

- task discovery modes;
- supported intents;
- mailbox support;
- checkpoint events;
- active-run steering;
- model-turn cancellation;
- subprocess cancellation;
- objective versioning;
- provenance roles;
- disposition callbacks.

The draft schema is in [`spec/schema/threadmesh-capabilities.schema.json`](../../spec/schema/threadmesh-capabilities.schema.json).

The checked-in Kimi ACP profile intentionally advertises only `suggest` with
receiver-mediated `checkpoint-offer`. It advertises no checkpoint events,
disposition callbacks, steer, interrupt, model-turn cancellation, or subprocess
cancellation. See the [Kimi experiment](kimi-code.md).

## Forbidden approximations

An adapter MUST NOT:

- map `suggest` to an unlabelled user message;
- report `interrupt` success when only text was appended;
- reuse an incarnation ID when task identity continuity cannot be proven;
- invent objective versions that cannot detect staleness;
- advertise private task discovery as relationship-scoped discovery;
- collapse sender identity into the target user identity.
- parse peer prose as a structured approval or permission response.

## Graceful degradation

If a harness supports only new-turn messages, the adapter may support `notify` and `suggest` while declaring `steer` and `interrupt` unavailable. Portability is achieved through honest capability negotiation, not lowest-common-denominator ambiguity.

## Current implementation status

The ACP adapter is conformance evidence for session binding, replay separation,
permission denial, timeout cleanup, and model-visible provenance labels. ACP v1
still carries the peer object over an ordinary prompt surface, and the spawned
agent retains native process privileges. Production adapter acceptance requires
authenticated binding, OS isolation guidance, two-profile behavior tests, and
the normative receipt/reconciliation contract.
