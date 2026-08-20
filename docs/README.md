# ThreadMesh documentation

The documentation is organized from intent to implementation. New readers should follow the numbered directories in order.

## Start here

1. [Vision](00-overview/vision.md)
2. [Scope](00-overview/scope.md)
3. [Design principles](00-overview/principles.md)
4. [Terminology](00-overview/terminology.md)
5. [Proactive coordination](01-concepts/proactive-coordination.md)
6. [Context sovereignty](01-concepts/context-sovereignty.md)
7. [Reference architecture](02-architecture/reference-architecture.md)
8. [Protocol overview](03-protocol/README.md)
9. [Threat model](04-safety/threat-model.md)
10. [Adapter contract](05-adapters/adapter-contract.md)

## Directory guide

| Directory | Purpose | Normative? |
|---|---|---|
| `00-overview` | Product intent, boundaries, vocabulary | No |
| `01-concepts` | Mental models for agency and task ownership | No |
| `02-architecture` | Reference components and lifecycle | Partly |
| `03-protocol` | Human-readable protocol requirements | Draft normative |
| `04-safety` | Threats, permissions, and safe defaults | Draft normative |
| `05-adapters` | Harness integration requirements | Draft normative |
| `06-guides` | Implementation walkthroughs | No |
| `07-research` | Prior art and unresolved questions | No |
| `08-decisions` | Accepted Architecture Decision Records | Decision record |
| `zh-CN` | Chinese orientation documents | No; English is canonical |

Machine-readable schemas live under [`spec/schema`](../spec/schema).

## Normative language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** indicate protocol requirements only in documents explicitly marked as draft normative. Until the first versioned release, all requirements remain subject to change.
