# Roadmap

ThreadMesh uses milestone exit criteria rather than date promises. Priorities may change as the safety and adapter contracts become clearer.

## M0 — Foundation and protocol draft

- [x] Define the problem, scope, and core terminology.
- [x] Separate `notify`, `suggest`, `steer`, and `interrupt`.
- [x] Establish context sovereignty and least-authority principles.
- [x] Publish draft envelope and capability schemas.
- [ ] Resolve the open questions marked **M0 blocker**.
- [ ] Accept two independent design reviews.

Exit: a reader can implement a compatible prototype without relying on undocumented assumptions.

## M1 — Local reference coordinator

- [ ] Durable SQLite task registry and mailbox.
- [ ] Policy engine with relationship- and intent-based authorization.
- [ ] Freshness, idempotency, expiry, and acknowledgement handling.
- [ ] Local event stream and provenance inspector.
- [ ] Conformance test kit.

Exit: two mock harnesses can discover, suggest, accept, reject, and interrupt tasks with a complete audit trail.

## M2 — First real adapters

- [ ] Codex App Server adapter.
- [ ] Generic subprocess/JSON-RPC adapter.
- [ ] One adapter for a non-Codex harness.
- [ ] Adapter capability negotiation and graceful degradation.

Exit: the same scenario runs across at least two different harness families.

## M3 — Proactive dependency discovery

- [ ] Explicit dependency graph.
- [ ] Privacy-preserving task summaries.
- [ ] Pluggable relevance signals.
- [ ] Agent decision policy and interruption-cost budget.
- [ ] Evaluation suite for useful versus harmful coordination.

Exit: proactive coordination improves task outcomes in a benchmark without exceeding the defined interference budget.

## M4 — Interoperability proposal

- [ ] Map ThreadMesh envelopes to relevant A2A concepts.
- [ ] Define MCP exposure for local harness tools.
- [ ] Publish version negotiation and extension rules.
- [ ] Collect adapter implementation feedback.

Exit: the protocol is ready for a versioned `0.1` release candidate.

## Explicitly deferred

- Public agent discovery across trust domains.
- Payments, markets, or autonomous contracting.
- Cross-user coordination without an identity and consent design.
- A hosted multi-tenant control plane.
