# ThreadMesh documentation

The documentation is organized from intent to implementation. New readers should follow the numbered directories in order.

## Start here

1. [Current project status](10-planning/project-status.md)
2. [Vision](00-overview/vision.md)
3. [Scope](00-overview/scope.md)
4. [Design principles](00-overview/principles.md)
5. [Terminology](00-overview/terminology.md)
6. [Proactive coordination](01-concepts/proactive-coordination.md)
7. [Context sovereignty](01-concepts/context-sovereignty.md)
8. [Reference architecture](02-architecture/reference-architecture.md)
9. [SQLite storage contract](02-architecture/sqlite-storage-contract.md)
10. [Relationship policy engine](02-architecture/relationship-policy-engine.md)
11. [Durable dispatcher](02-architecture/durable-dispatcher.md)
12. [Provenance inspector](02-architecture/provenance-inspector.md)
13. [Protocol overview](03-protocol/README.md)
14. [JSON-RPC binding](03-protocol/jsonrpc-binding.md)
15. [Threat model](04-safety/threat-model.md)
16. [Adapter contract](05-adapters/adapter-contract.md)
17. [Mock harness conformance kit](06-guides/mock-harness-conformance.md)
18. [Multi-product admission conformance](06-guides/multi-product-admission-conformance.md)
19. [Design reviews](09-reviews/README.md)
20. [Real agent-product validation runbook](09-reviews/real-product-e2e-runbook.md)
21. [Codex App Server experiment](05-adapters/codex-app-server.md)
22. [Codex App Server preflight](09-reviews/2026-08-20-codex-app-server-preflight.md)
23. [Gemini CLI experiment](05-adapters/gemini-cli.md)
24. [Third-harness selection](09-reviews/2026-08-20-third-harness-selection.md)
25. [M0 external reviewer packet](09-reviews/m0-external-reviewer-packet.md)
26. [Mainline plan](10-planning/mainline-plan.md)

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
