# ThreadMesh

**A safe coordination layer for proactive agents across tasks and harnesses.**

[简体中文](README.zh-CN.md) · [Documentation](docs/README.md) · [Current status](docs/10-planning/project-status.md) · [Protocol draft](spec/README.md) · [Roadmap](ROADMAP.md)

ThreadMesh lets an agent task discover a pre-authorized relationship, offer a
bounded suggestion to another task, and let the receiving harness decide
whether that suggestion enters its model context. It is designed for developers
running multiple Codex, Kimi Code, Gemini CLI, or custom-agent sessions—not for
sharing global chat history or silently controlling another session.

**Start with the concrete story:**
[what ThreadMesh is](docs/00-overview/product-guide.md) ·
[run the A-to-B demo](docs/06-guides/end-to-end-demo.md) ·
[integrate a harness](docs/06-guides/implement-an-adapter.md)

> Status: pre-alpha. The protocol is not stable. A minimal transport-agnostic
> adapter SDK and experimental SQLite, ACP, Codex App Server, and Gemini
> implementations exist for integration work; no production adapter has been
> released.

The executable JSON-RPC reference derives principals from a host authenticator
outside the request body. Its static-token mechanism is local-only; production
network credential verification and process isolation are not supplied.

More: [Codex implementation deep dive](docs/07-research/codex-orchestration-deep-dive.md) ·
[community evidence](docs/07-research/community-signals.md) ·
[ecosystem landscape](docs/07-research/ecosystem-landscape.md) ·
[design reviews](docs/09-reviews/README.md) ·
[authenticated JSON-RPC binding](docs/03-protocol/jsonrpc-binding.md) ·
[Kimi Code smoke evidence](docs/09-reviews/2026-08-20-kimi-code-smoke.md) ·
[Codex App Server preflight](docs/09-reviews/2026-08-20-codex-app-server-preflight.md) ·
[Gemini third-harness selection](docs/09-reviews/2026-08-20-third-harness-selection.md) ·
[mainline plan](docs/10-planning/mainline-plan.md) ·
[中文调研摘要](docs/zh-CN/research-summary.md)

ThreadMesh explores a specific capability: an agent notices that another running task matters to its goal and proactively coordinates with it. The hard part is not message transport. The hard part is letting agents discover dependencies, communicate intent, and revise plans **without silently taking ownership of another task's context**.

ThreadMesh aims to make that capability portable across Codex, Claude Code, LangGraph, custom loops, and other agent harnesses through a small protocol, explicit capability negotiation, and adapter contracts.

## The motivating example

Agent A finishes an artifact and learns its verified checksum. Agent B owns the
release manifest and is waiting for that checksum. ThreadMesh lets A see only
B's relationship-scoped objective hint, decide that the result is useful, and
send one expiring `suggest` message. B receives it in a mailbox and retains the
right to accept, reject, or defer it before it becomes model-visible context.

The same behavior test also requires A to stay silent when B is unrelated. The
product goal is therefore **useful coordination under an explicit interference
budget**, not maximum message volume.

Run the three-condition demonstration:

```sh
npm ci
npm run validate:behavior:fake
```

## Minimal adapter SDK

Install the pre-alpha package directly from GitHub:

```sh
npm install github:fyaic/threadmesh
```

Then connect the SDK to any authenticated JSON-RPC transport:

```js
import { createThreadMeshClient } from "@fyaic/threadmesh";

const mesh = createThreadMeshClient({
  authorization: `Bearer ${process.env.THREADMESH_TOKEN}`,
  send: async (request, { authorization }) => {
    const response = await fetch(process.env.THREADMESH_URL, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  },
});

const page = await mesh.pollMailbox({ receiver: myTask });
for (const message of page.messages) {
  await mesh.decide({ message, decision: "accepted" });
}
```

The public surface is intentionally small: task registration, relationship-
scoped summary publication and discovery, bounded suggestion sending, mailbox
polling, and receiver disposition. The SDK has no runtime package dependencies.
See the
[30-minute adapter guide](docs/06-guides/implement-an-adapter.md) and
[complete example](examples/minimal-harness.mjs).

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
  sdk/               Minimal public harness integration API
  adapters/          Experimental harness adapters
  bindings/          Executable authenticated operation bindings
  client/            Reference clients and mock harness profiles
  coordinator/       Experimental reference coordinator
  dispatcher/        Crash-safe native-effect orchestration
  inspector/         Restart-safe local cursor stream
  policy/            Pure fail-closed relationship authorization
  state/             Shared disposition transition rules
test/                Behavioral and conformance tests
```

## Current progress

The repository contains an executable `0.0-draft` specification, an
experimental SQLite coordinator, authenticated JSON-RPC operations, and ACP,
Codex App Server, and Gemini headless adapters. The complete suite currently has
134 unit/subtests plus schema and transition conformance. M1 and M2 are closed.
A real Codex Agent A has selected ThreadMesh relationship discovery and sent one
bounded suggestion to a persisted Agent B; the coordinator admitted it and both
exact tasks were deleted.

The first scored Codex comparison found that relevant coordination changed the
receiver outcome from missing dependency to completed, while the irrelevant
condition did not send or activate the receiver. Two additional repetitions
kept control quiet 3/3, but relevant completed only 1/3 and irrelevant completed
2/3. Proactive coordination therefore remains disabled by default. The product
reset used three gates:

1. compare no-contact, relevant-dependency, and irrelevant/stale real Codex
   conditions, measuring outcome quality and receiver interference — first
   scored pass complete;
2. expose a minimal installable adapter API and one short integration example —
   complete in `@fyaic/threadmesh` `0.1.0-alpha.0`;
3. pass the receiver-accepted scenario on one materially different real harness
   — Kimi Code `0.38.0` passed with exact cleanup.

All three reset gates are complete. The shorter M3 flow removes one model turn
from every condition and preserves exact cleanup. A two-stage discovery/send
policy then passed three fresh relevant runs in a row; a current control made no
tool call, and a current irrelevant task performed one read-only lookup without
sending or activating B. The bounded profile now qualifies for explicit
maintainer-experimental opt-in use. It remains off by default while the project
is pre-alpha and M0 external review is open.

Protocol expansion, hostile-worker validation, steer/interrupt, and production
hardening are deferred until these gates pass. Independent M0 review continues
in parallel and does not block explicitly labeled maintainer experiments. See
the [project status](docs/10-planning/project-status.md),
[mainline plan](docs/10-planning/mainline-plan.md), and
[milestone acceptance audit](docs/10-planning/acceptance-audit.md),
[real product validation runbook](docs/09-reviews/real-product-e2e-runbook.md), and
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

M0 also needs independent distributed-systems and agent-safety verdicts,
including at least one reviewer outside `fyaic`. The bounded path and template
are in the [reviewer packet](docs/09-reviews/m0-external-reviewer-packet.md),
with submissions tracked in [issue #7](https://github.com/fyaic/threadmesh/issues/7).

See [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), and [SECURITY.md](SECURITY.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
