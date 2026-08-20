# Scope

## In scope

- Task identity and privacy-preserving discovery.
- Directional `supervisor`, `parent`, `child`, `peer`, `dependency`, and
  `observer` relationship grants; user ownership remains a control-plane property.
- Coordination intents and their expected receiver behavior.
- Capability negotiation between harness adapters.
- Message envelopes, acknowledgements, expiry, replay protection, and freshness.
- Receiver mailboxes and checkpoint-based delivery.
- Authorization and consent for state-changing coordination.
- Provenance, causal chains, and audit events.
- Adapter contracts and conformance tests.
- Evaluation of useful versus harmful proactive coordination.

## Out of scope

- Model inference APIs and model routing.
- General-purpose human chat.
- Prompt, memory, or vector database standardization.
- Tool protocols already covered by MCP.
- General agent interoperability already covered by A2A.
- Workflow scheduling and arbitrary DAG execution.
- Agent payments, marketplaces, negotiation economics, or identity federation.
- A universal agent persona or reasoning policy.
- Cross-user discovery or communication without an explicit trust-domain design.

## Boundary with adjacent systems

ThreadMesh is a coordination semantics layer. It may be exposed to a model as tools, transported through JSON-RPC, mapped onto A2A extensions, or backed by an ordinary message broker. Those choices do not change the core intent semantics.

MCP can expose ThreadMesh operations as tools. A2A can transport task interactions across agent endpoints. A harness still owns its agent loop, model context, sandbox, approvals, and tool execution.

## Initial deployment boundary

The first reference implementation targets one trusted user or team operating multiple local agent harnesses. It does not assume hostile multi-tenancy. However, the protocol defaults should avoid choices that make future trust-domain separation impossible.
