# ThreadMesh documentation

Connect independent agent sessions without relaying every useful change yourself.
Start with the user guides; the protocol and historical benchmarks are optional.

[Project overview](../README.md) · [中文文档](zh-CN/README.md)

## Choose your next step

| I want to… | Start here |
|---|---|
| Understand the idea | [What ThreadMesh is](00-overview/product-guide.md) |
| Connect Codex, Pi, Kimi or DeepSeek | [Your first workspace](06-guides/first-workspace.md) |
| See actual model behavior | [Everyday cases and evidence](06-guides/real-world-cases.md) |
| Continue from saved context | [Portable checkpoints](06-guides/portable-checkpoints.md) |
| Check compatibility before installing | [Versioned harness support](00-overview/harness-support.md) |
| Integrate another harness | [MCP configuration](06-guides/first-workspace.md#kimi-and-custom-harnesses) · [SDK adapter guide](06-guides/implement-an-adapter.md) |
| Understand permissions and privacy | [Threat model](04-safety/threat-model.md) · [Context sovereignty](01-concepts/context-sovereignty.md) |
| Report an unsuccessful first run | [Operator report](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) |
| Follow what ships next | [Roadmap](../ROADMAP.md) · [Active acceptance](10-planning/cross-harness-acceptance-2026-09-05.md) |

## Current evidence, not just intent

The [2026-09-05 cross-harness record](09-reviews/2026-09-05-workspace-awareness.md)
retains three ordinary Codex → Pi runs: API collaboration **passed**, unrelated
work stayed quiet, and brand-copy correctness **failed** despite successful
delivery and same-session continuation. Exact prompts, timelines and final
files are linked. Generic collaboration guidance and the initial Pi dependency
message are disclosed.

Preview commands use simulated agents. DeepSeek's new integration has no-model
native evidence, not a live initiative pass. Checkpoint continuation has a
seeded-context test, not a lossless quota-blocked chat migration.

## Explore the implementation

| Directory | Contents |
|---|---|
| [00-overview](00-overview/product-guide.md) | Product explanation and compatibility |
| [01-concepts](01-concepts/proactive-coordination.md) | Initiative and session ownership |
| [02-architecture](02-architecture/reference-architecture.md) | Reference components and lifecycle |
| [03-protocol](03-protocol/README.md) | Draft protocol requirements |
| [04-safety](04-safety/threat-model.md) | Threats, permissions and boundaries |
| [05-adapters](05-adapters/adapter-contract.md) | Harness integration contracts |
| [06-guides](06-guides/first-workspace.md) | User and developer walkthroughs |
| [07-research](07-research/research-synthesis.md) | Codex research, community signals and prior art |
| [08-decisions](08-decisions/README.md) | Architecture decisions |
| [09-reviews](09-reviews/README.md) | Dated evidence, failures and reviews |
| [10-planning](10-planning/project-status.md) | Current status and historical milestone ledger |
| [zh-CN](zh-CN/README.md) | Chinese orientation and first-use guide |

Machine-readable schemas live under [spec/schema](../spec/schema). Only
documents explicitly labelled draft normative define protocol requirements;
English is canonical for those requirements.

## Historical experiments

The [attention-router demo](06-guides/attention-router-demo.md),
[manual-relay baseline](06-guides/manual-relay-baseline.md) and
[non-interrupting handoff case](06-guides/non-interrupting-handoff.md) document
earlier experiments. They are **not first-use prerequisites**, a current speed
claim, or proof that every busy native session is safe to wake.

For the deeper history, see the [case portfolio](06-guides/real-world-cases.md)
and [review index](09-reviews/README.md). Evidence labels distinguish real model
runs, deterministic fixtures, no-model preflights and unverified adapter targets.
