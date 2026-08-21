# Prior art and adjacent protocols

> This is the concise index. See the
> [Codex deep dive](codex-orchestration-deep-dive.md),
> [community signals](community-signals.md),
> [ecosystem landscape](ecosystem-landscape.md), and
> [research synthesis](research-synthesis.md) for the evidence-backed research
> snapshot dated 2026-08-20.

ThreadMesh should extend existing standards where possible and remain narrow where they already provide the right abstraction.

## Codex App Server

Codex App Server demonstrates practical primitives for persistent agent threads, active turns, streamed events, approvals, steering, and interruption. ThreadMesh's Codex adapter can map to these lifecycle controls while adding cross-harness relationships, receiver mailboxes, and intent-level permissions.

Codex also supplies two distinct precedents: an open-source, root-tree-scoped
multi-agent mailbox and a shipped Desktop surface for persistent cross-thread
list/read/send/fork/archive operations. They are related but should not be
treated as the same implementation boundary.

Reference: [Codex App Server](https://developers.openai.com/codex/app-server/).

## Agent2Agent Protocol (A2A)

A2A defines interoperable agents, stateful tasks, messages, artifacts, streaming updates, and task interaction. ThreadMesh should investigate an A2A extension or mapping rather than inventing a conflicting remote-agent transport.

ThreadMesh's narrower contribution is proactive coordination policy between already-running tasks: relationship authority, context sovereignty, intent classes, freshness, and interference controls.

Reference: [A2A Protocol specification](https://a2a-protocol.org/dev/specification/).

## Model Context Protocol (MCP)

MCP standardizes how model applications connect to tools and context providers. ThreadMesh operations can be exposed through MCP tools, but MCP does not itself define cross-task ownership or steering semantics.

Reference: [MCP specification](https://modelcontextprotocol.io/specification/).

## Agent mailboxes and live session meshes

MCP Agent Mail, Repowire, Aerial, agent-inbox, MAGI, and AIPass demonstrate
active community demand for persistent identities, inboxes, acknowledgements,
wake-up, and cross-harness session coordination. AAMP adds a portable typed
task vocabulary over ordinary mail infrastructure.

ThreadMesh should interoperate where useful, but its core differentiation is
receiver-owned context entry, typed authority, freshness, and conformance across
harnesses. License constraints also rule out casually copying several adjacent
implementations.

References:
[ecosystem landscape](ecosystem-landscape.md) and
[community signals](community-signals.md).

## Message brokers and actor systems

Durable queues, actor mailboxes, idempotent consumers, supervision trees, and causal tracing are established distributed-systems patterns. ThreadMesh should reuse them. The novel design pressure comes from model-visible context and user intent: delivery can change future reasoning even without mutating an external database.

## Workflow engines

Workflow engines excel at explicit dependencies and deterministic routing. ThreadMesh is complementary: it addresses relationships discovered or acted upon by models during execution. Explicit workflow edges should remain preferable when the dependency is known in advance.

## Differentiation test

A proposed ThreadMesh feature belongs in the core only if it is necessary to preserve coordination meaning, safety, or portability across harnesses. General transport, tool invocation, workflow scheduling, and agent capability description should be delegated to adjacent standards when possible.
