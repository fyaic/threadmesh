# ThreadMesh

**A safe coordination layer for proactive agents across tasks and harnesses.**

[简体中文](README.zh-CN.md) · [Documentation](docs/README.md) · [Current status](docs/10-planning/project-status.md) · [Protocol draft](spec/README.md) · [Roadmap](ROADMAP.md)

> Status: pre-alpha. The protocol is not stable; an experimental SQLite
> coordinator and ACP adapter exist for conformance work, but no production
> adapter has been released.

The coordinator is currently a trusted, in-process, single-user experiment.
Caller-supplied principal objects are identity injection points, not an
authenticator; any network wrapper must bind them to authenticated transports.

New: [Codex implementation deep dive](docs/07-research/codex-orchestration-deep-dive.md) ·
[community evidence](docs/07-research/community-signals.md) ·
[ecosystem landscape](docs/07-research/ecosystem-landscape.md) ·
[design reviews](docs/09-reviews/README.md) ·
[Kimi Code smoke evidence](docs/09-reviews/2026-08-20-kimi-code-smoke.md) ·
[mainline plan](docs/10-planning/mainline-plan.md) ·
[中文调研摘要](docs/zh-CN/research-summary.md)

ThreadMesh explores a specific capability: an agent notices that another running task matters to its goal and proactively coordinates with it. The hard part is not message transport. The hard part is letting agents discover dependencies, communicate intent, and revise plans **without silently taking ownership of another task's context**.

ThreadMesh aims to make that capability portable across Codex, Claude Code, LangGraph, custom loops, and other agent harnesses through a small protocol, explicit capability negotiation, and adapter contracts.

## Why ThreadMesh

Most harnesses can start tasks, stream events, and cancel work. Far fewer provide a portable answer to these questions:

- How can an agent discover that another task is relevant?
- When may it notify, suggest, steer, or interrupt that task?
- How does the receiver preserve user intent and reject stale coordination?
- How can different harnesses exchange coordination without sharing private context?
- How do users inspect the complete causal chain afterward?

ThreadMesh treats these as protocol and governance concerns rather than prompt conventions.

## Core idea

```text
Agent A                 ThreadMesh control plane                 Agent B
   │                               │                                │
   │ discover related task        │                                │
   ├──────────────────────────────>│                                │
   │ task summary + capabilities  │                                │
   │<──────────────────────────────┤                                │
   │ suggest / steer request      │                                │
   ├──────────────────────────────>│ policy, freshness, consent      │
   │                               ├───────────────────────────────>│
   │                               │ accepted / rejected / deferred │
   │<──────────────────────────────┴────────────────────────────────┤
```

The initial protocol separates four intents:

| Intent | Default behavior | Typical use |
|---|---|---|
| `notify` | Side-channel information; does not enter the active prompt | Progress and dependency updates |
| `suggest` | Receiver inbox; receiver decides at a checkpoint | Peer-to-peer advice |
| `steer` | Changes the active task direction when explicitly authorized | Parent-to-child correction |
| `interrupt` | Requests cancellation; highest privilege | Safety stop or invalidated work |

## Design principles

1. **Context sovereignty** — a task owns its active objective and model-visible history.
2. **Least-authority coordination** — use the weakest intent that can solve the problem.
3. **Mailbox before injection** — peer messages are reviewable before becoming prompt context.
4. **Freshness is mandatory** — state-changing requests bind to an expected run or objective version.
5. **Provenance is visible** — every action records who sent it, why, and what evidence it referenced.
6. **Harnesses stay replaceable** — ThreadMesh standardizes coordination, not the agent loop or model provider.
7. **Users remain in control** — user-owned sessions have stronger protections than delegated child tasks.

## Repository map

```text
docs/
  00-overview/       Vision, scope, and terminology
  01-concepts/       Proactive coordination and context sovereignty
  02-architecture/   Reference architecture and lifecycle
  03-protocol/       Human-readable protocol design
  04-safety/         Threat and permission models
  05-adapters/       Harness adapter contracts and notes
  06-guides/         Implementation guides
  07-research/       Prior art and open research questions
  08-decisions/      Architecture Decision Records
  09-reviews/        Reviewer evidence and smoke-test limitations
  10-planning/       Current project status and mainline execution plan
  zh-CN/             Chinese project overview
spec/
  schema/            Machine-readable draft schemas
src/
  adapters/          Experimental harness adapters
  coordinator/       Experimental reference coordinator
test/                Behavioral and conformance tests
```

## Current progress

The repository now contains an executable `0.0-draft` specification and a
reviewed experimental path through SQLite and ACP. Pull request
[#20](https://github.com/fyaic/threadmesh/pull/20) added durable task and message
state, owner-scoped grants, idempotency and CAS, single-use admission claims, a
registered-session ACP adapter, and runtime coherence validation.

The implementation is deliberately narrower than the product vision:

- M0 has 6 closed and 5 open issues after the coherence work in #18;
- authenticated transport, normative reconciliation, typed
  interruption/verification, and external review remain open;
- M1 has partial prototype evidence, but all six acceptance issues remain open;
- Kimi Code ACP initialization passed, while the real model-turn marker test is
  blocked by account quota and is not counted as a pass.

The mainline is now protocol stabilization (#15/#17, #19, #16), followed
by independent M0 review (#7) and completion of the local M1 coordinator. See
the [project status](docs/10-planning/project-status.md),
[mainline plan](docs/10-planning/mainline-plan.md), and
[roadmap](ROADMAP.md).

## Non-goals

ThreadMesh is not intended to be:

- a general chat system for humans;
- a model gateway or LLM abstraction;
- a workflow DAG engine;
- a replacement for MCP or A2A;
- a license for agents to scan or modify unrelated user sessions;
- an autonomous organization framework.

## Contributing

The project is early enough that careful criticism is more useful than broad implementation. Start with the [vision](docs/00-overview/vision.md), [scope](docs/00-overview/scope.md), and [threat model](docs/04-safety/threat-model.md), then open a design issue.

See [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), and [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
