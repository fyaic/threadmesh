# Adapter contract

> Draft normative document.

A ThreadMesh adapter maps portable task coordination onto one harness while preserving semantics and safety boundaries.

## Required adapter behavior

An adapter MUST:

- map stable local task and run references to ThreadMesh IDs;
- advertise supported intents and delivery modes;
- expose minimal task status and freshness values;
- preserve sender provenance when content becomes model-visible;
- distinguish queued, delivered, accepted, and applied states;
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

## Forbidden approximations

An adapter MUST NOT:

- map `suggest` to an unlabelled user message;
- report `interrupt` success when only text was appended;
- invent objective versions that cannot detect staleness;
- advertise private task discovery as relationship-scoped discovery;
- collapse sender identity into the target user identity.

## Graceful degradation

If a harness supports only new-turn messages, the adapter may support `notify` and `suggest` while declaring `steer` and `interrupt` unavailable. Portability is achieved through honest capability negotiation, not lowest-common-denominator ambiguity.
