# ThreadMesh documentation

Help independent agent tasks share relevant changes while keeping their own
context. Choose the path that matches how you work.

[Project overview](../README.md) · [中文文档](zh-CN/README.md)

## Choose a path

| Your setup | What ThreadMesh adds | Start here |
|---|---|---|
| Selected Codex desktop tasks | An optional skill using Codex's own task tools | [Candidate plugin and native-task guide](06-guides/codex-native-tasks.md) |
| Locally launched agent sessions | A workspace with peer discovery, persistent advice inboxes and saved checkpoints | [CLI alpha.3: first workspace](06-guides/first-workspace.md) |

These are separate entry points. The Codex skill does not provide the CLI's
persistent inbox or checkpoint storage. The CLI example starts new sessions;
it does not attach to your existing desktop chats. If native Codex already
meets your needs, the skill may add little. See [the capability comparison](00-overview/native-capabilities-and-value.md).

## Find an answer

| I want to… | Read this |
|---|---|
| Understand the use case and limits | [What ThreadMesh is](00-overview/product-guide.md) |
| Check supported products and versions | [Integration support matrix](00-overview/harness-support.md) |
| Continue from explicitly saved context | [Portable checkpoints](06-guides/portable-checkpoints.md) |
| Inspect actual model behavior | [Cases and evidence](06-guides/real-world-cases.md) · [Desktop messages and diffs](evidence/codex-native-2026-09-07/README.md) |
| Understand permissions and privacy | [Threat model](04-safety/threat-model.md) · [Context ownership](01-concepts/context-sovereignty.md) |
| Add another agent application | [MCP configuration](06-guides/first-workspace.md#kimi-and-custom-harnesses) · [SDK adapter guide](06-guides/implement-an-adapter.md) |
| Share an installation or collaboration problem | [Operator report](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) |
| Follow project priorities | [Roadmap](../ROADMAP.md) · [Current status](10-planning/project-status.md) |

Real-project validation is currently paused; see [project status](10-planning/project-status.md).

## What has been demonstrated

Controlled Codex native-task exchanges produced receiver edits. Installed-plugin
use, old-task loading, independent first use and savings over native Codex remain
unverified. See the [desktop guide](06-guides/codex-native-tasks.md).

A [CLI installed-package case](09-reviews/2026-09-07-codex-first-use-release.md)
used two new Codex sessions. The receiver correctly edited copy and preserved
earlier decisions. This does not establish existing desktop adoption or general
reliability.

The [Codex → Pi record](09-reviews/2026-09-05-workspace-awareness.md) includes
an API collaboration pass, an unrelated-change case that stayed quiet and a
copy case that delivered successfully but omitted a required free-plan detail.
**Delivery alone is not a correct result.**

Preview commands use simulated agents. DeepSeek has no-model integration checks,
not a live initiative pass. Checkpoint continuation has a seeded-context test,
not verified recovery of a quota-blocked long conversation.

## Explore the implementation

| Directory | Contents |
|---|---|
| [00-overview](00-overview/product-guide.md) | Product explanation and compatibility |
| [01-concepts](01-concepts/proactive-coordination.md) | Initiative and session ownership |
| [02-architecture](02-architecture/reference-architecture.md) | Reference components and lifecycle |
| [03-protocol](03-protocol/README.md) | Draft protocol requirements |
| [04-safety](04-safety/threat-model.md) | Threats, permissions and boundaries |
| [05-adapters](05-adapters/adapter-contract.md) | Integration contracts |
| [06-guides](06-guides/first-workspace.md) | User and developer walkthroughs |
| [07-research](07-research/research-synthesis.md) | Codex research, community signals and prior art |
| [08-decisions](08-decisions/README.md) | Architecture decisions |
| [09-reviews](09-reviews/README.md) | Dated evidence, failures and reviews |
| [10-planning](10-planning/project-status.md) | Current status and historical milestone ledger |
| [zh-CN](zh-CN/README.md) | Chinese orientation and user guides |

Machine-readable schemas live under [spec/schema](../spec/schema). Only
documents explicitly labelled draft normative define protocol requirements;
English is canonical for those requirements.

## Historical experiments

The [attention-router demo](06-guides/attention-router-demo.md),
[manual-relay baseline](06-guides/manual-relay-baseline.md) and
[non-interrupting handoff case](06-guides/non-interrupting-handoff.md) are historical
experiments, not setup prerequisites, current speed claims or universal busy-session
safety evidence. Their records remain in the [review index](09-reviews/README.md).
