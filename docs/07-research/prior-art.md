# Prior art and adjacent protocols

ThreadMesh should extend existing standards where possible and remain narrow where they already provide the right abstraction.

## Codex App Server

Codex App Server demonstrates practical primitives for persistent agent threads, active turns, streamed events, approvals, steering, and interruption. ThreadMesh's Codex adapter can map to these lifecycle controls while adding cross-harness relationships, receiver mailboxes, and intent-level permissions.

Reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).

## Agent2Agent Protocol (A2A)

A2A defines interoperable agents, stateful tasks, messages, artifacts, streaming updates, and task interaction. ThreadMesh should investigate an A2A extension or mapping rather than inventing a conflicting remote-agent transport.

ThreadMesh's narrower contribution is proactive coordination policy between already-running tasks: relationship authority, context sovereignty, intent classes, freshness, and interference controls.

Reference: [A2A Protocol specification](https://a2a-protocol.org/dev/specification/).

## Model Context Protocol (MCP)

MCP standardizes how model applications connect to tools and context providers. ThreadMesh operations can be exposed through MCP tools, but MCP does not itself define cross-task ownership or steering semantics.

Reference: [MCP specification](https://modelcontextprotocol.io/specification/).

## Message brokers and actor systems

Durable queues, actor mailboxes, idempotent consumers, supervision trees, and causal tracing are established distributed-systems patterns. ThreadMesh should reuse them. The novel design pressure comes from model-visible context and user intent: delivery can change future reasoning even without mutating an external database.

## Workflow engines

Workflow engines excel at explicit dependencies and deterministic routing. ThreadMesh is complementary: it addresses relationships discovered or acted upon by models during execution. Explicit workflow edges should remain preferable when the dependency is known in advance.

## Differentiation test

A proposed ThreadMesh feature belongs in the core only if it is necessary to preserve coordination meaning, safety, or portability across harnesses. General transport, tool invocation, workflow scheduling, and agent capability description should be delegated to adjacent standards when possible.
