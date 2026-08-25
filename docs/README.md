# ThreadMesh documentation

The documentation is organized from product intent to implementation and
evidence. New readers do not need to read every numbered directory in order.

## Start here

1. [What ThreadMesh is](00-overview/product-guide.md)
2. [Run the end-to-end A-to-B demo](06-guides/end-to-end-demo.md)
3. [Current project status](10-planning/project-status.md)
4. [Vision](00-overview/vision.md) and [scope](00-overview/scope.md)
5. [Context sovereignty](01-concepts/context-sovereignty.md)
6. [Reference architecture](02-architecture/reference-architecture.md)
7. [Protocol overview](03-protocol/README.md)
8. [Threat model](04-safety/threat-model.md)
9. [Adapter contract](05-adapters/adapter-contract.md)
10. [30-minute adapter guide](06-guides/implement-an-adapter.md)

## Choose a path

| Goal | Read or run |
|---|---|
| Understand the product | [Product guide](00-overview/product-guide.md) → [proactive coordination](01-concepts/proactive-coordination.md) |
| See it work | [End-to-end demo](06-guides/end-to-end-demo.md) → [Pi-to-Kimi demo](06-guides/pi-to-kimi-demo.md) → [Codex-to-Kimi case](09-reviews/2026-08-25-codex-to-kimi-proactive.md) |
| Integrate a harness | [Adapter guide](06-guides/implement-an-adapter.md) → [adapter contract](05-adapters/adapter-contract.md) → [mock conformance](06-guides/mock-harness-conformance.md) |
| Evaluate safety | [Context sovereignty](01-concepts/context-sovereignty.md) → [permission model](04-safety/permission-model.md) → [threat model](04-safety/threat-model.md) |
| Inspect real evidence | [Design reviews](09-reviews/README.md) → [Pi integration record](09-reviews/2026-08-25-pi-integration-kit-validation.md) → [Codex-to-Kimi case](09-reviews/2026-08-25-codex-to-kimi-proactive.md) |
| Contribute to the protocol | [Protocol overview](03-protocol/README.md) → [ADRs](08-decisions/README.md) → [mainline plan](10-planning/mainline-plan.md) |

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
| `09-reviews` | Reviewer evidence, verdicts, and test limitations | No |
| `10-planning` | Current status, milestone accounting, and execution plan | No |
| `zh-CN` | Chinese orientation documents | No; English is canonical |

Machine-readable schemas live under [`spec/schema`](../spec/schema).

## Research dossiers

- [Codex proactive and cross-task orchestration deep dive](07-research/codex-orchestration-deep-dive.md)
- [Community signals](07-research/community-signals.md)
- [Ecosystem landscape](07-research/ecosystem-landscape.md)
- [Research synthesis and project direction](07-research/research-synthesis.md)
- [Open questions](07-research/open-questions.md)

Research dossiers explain why the project chose its direction. Current
execution priority is maintained separately in the
[mainline plan](10-planning/mainline-plan.md).

## Normative language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** indicate protocol requirements only in documents explicitly marked as draft normative. Until the first versioned release, all requirements remain subject to change.
