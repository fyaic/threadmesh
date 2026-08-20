# Roadmap

ThreadMesh uses milestone exit criteria rather than date promises. Priorities
may change as the safety and adapter contracts become clearer. See the
[current status](docs/10-planning/project-status.md) and
[mainline plan](docs/10-planning/mainline-plan.md) for the evidence-backed
snapshot and ordered workstreams.

## M0 — Foundation and protocol draft

- [x] Define the problem, scope, and core terminology.
- [x] Separate `notify`, `suggest`, `steer`, and `interrupt`.
- [x] Establish context sovereignty and least-authority principles.
- [x] Publish draft envelope and capability schemas.
- [x] Resolve the initial design questions captured by ADRs 0004–0007.
- [x] Run distributed-systems, safety, and adapter internal review lanes.
- [ ] Resolve normative review blockers
  [#15](https://github.com/fyaic/threadmesh/issues/15)–
  [#19](https://github.com/fyaic/threadmesh/issues/19).
- [ ] Accept two independent design reviews.

Current accounting: 5 milestone issues closed and 6 open. The internal reviews
approved the conservative experimental prototype after fixes, but they do not
satisfy [#7](https://github.com/fyaic/threadmesh/issues/7).

Exit: a reader can implement a compatible prototype without relying on
undocumented assumptions, and two independent reviews have accepted the safety
and distributed-systems boundaries.

## M1 — Local reference coordinator

- [ ] Versioned SQLite storage, migration, rollback, retention, and deletion contract.
- [ ] Complete durable task registry, mailbox, and scoped audit API.
- [ ] Complete relationship- and intent-based policy engine with stable reasons.
- [ ] Complete freshness, idempotency, expiry, receipts, and reconciliation.
- [ ] Local event stream and provenance inspector.
- [ ] Two-profile mock-harness conformance kit.

Prototype evidence already exists for task registration, mailbox persistence,
grant checks, CAS, admission claims, ACP session reload, and provenance. All M1
issues remain open because their full acceptance criteria are not yet met.

Exit: two mock harnesses can discover, notify, suggest, accept, reject, defer,
and explicitly decline unsupported steer/interrupt behavior with a complete
audit trail. Successful interruption is not an M1 exit requirement unless the
typed cancellation contract is implemented.

## M2 — First real adapters

- [ ] Codex App Server adapter.
- [ ] Generic subprocess/JSON-RPC adapter.
- [ ] One production-oriented adapter for a non-Codex harness.
- [ ] Adapter capability negotiation and graceful degradation.

The Kimi ACP work is experimental evidence, not an M2 completion claim.

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
