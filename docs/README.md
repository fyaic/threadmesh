# ThreadMesh documentation

The documentation is organized from product intent to implementation and
evidence. New readers do not need to read every numbered directory in order.

## Start here

1. [What ThreadMesh is](00-overview/product-guide.md)
2. [See the real proactive-agent cases](06-guides/real-world-cases.md)
3. [Run the closed-loop attention-router demo](06-guides/attention-router-demo.md)
4. [Compare manual relay with one kickoff](06-guides/manual-relay-baseline.md)
5. [Inspect the active-session safety case](06-guides/non-interrupting-handoff.md)
6. [Try the 15-minute operator challenge](06-guides/15-minute-operator-challenge.md)
7. [Check harness support](00-overview/harness-support.md)
8. [Read the active product mainline](10-planning/product-mainline-2026-08-28.md)
9. [Current project status](10-planning/project-status.md)
10. [Context sovereignty](01-concepts/context-sovereignty.md)
11. [Reference architecture](02-architecture/reference-architecture.md)
12. [Protocol overview](03-protocol/README.md)
13. [Threat model](04-safety/threat-model.md)
14. [30-minute adapter guide](06-guides/implement-an-adapter.md)

## Choose a path

| Goal | Read or run |
|---|---|
| Understand the product | [Product guide](00-overview/product-guide.md) → [proactive coordination](01-concepts/proactive-coordination.md) |
| See the intelligence effect | [12-second proactive-session moment](assets/demo/session-initiative-wow.mp4) → [76-second proof](assets/demo/threadmesh-proof-walkthrough.mp4) → [real case portfolio](06-guides/real-world-cases.md) |
| Evaluate user value | [Manual baseline](06-guides/manual-relay-baseline.md) → [15-minute operator challenge](06-guides/15-minute-operator-challenge.md) |
| Run it locally | [Attention-router demo](06-guides/attention-router-demo.md) → [active-session safety](06-guides/non-interrupting-handoff.md) → [real Codex attention validation](06-guides/codex-attention-validation.md) |
| Integrate a harness | [Harness matrix](00-overview/harness-support.md) → [adapter guide](06-guides/implement-an-adapter.md) → [adapter contract](05-adapters/adapter-contract.md) |
| Evaluate safety | [Context sovereignty](01-concepts/context-sovereignty.md) → [permission model](04-safety/permission-model.md) → [threat model](04-safety/threat-model.md) |
| Inspect real evidence | [Design reviews](09-reviews/README.md) → [Pi integration record](09-reviews/2026-08-25-pi-integration-kit-validation.md) → [Codex-to-Kimi case](09-reviews/2026-08-25-codex-to-kimi-proactive.md) |
| Follow product direction | [Product mainline](10-planning/product-mainline-2026-08-28.md) → [roadmap](../ROADMAP.md) → [project status](10-planning/project-status.md) |
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

## Evidence versus aspiration

The repository uses four evidence labels consistently:

- **real model pass**: a pinned agent product completed the bounded scenario;
- **deterministic conformance**: the same contract passed with scripted fakes;
- **no-model preflight**: a real binary and protocol surface were probed without
  starting a model turn;
- **adapter target**: a plausible future integration with no compatibility
  claim yet.

See the [harness support matrix](00-overview/harness-support.md) before treating
any product name as a tested integration.

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
