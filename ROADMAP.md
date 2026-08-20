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
- [x] Publish authenticated authority and executable operation bindings
  ([#15](https://github.com/fyaic/threadmesh/issues/15),
  [#17](https://github.com/fyaic/threadmesh/issues/17)).
- [x] Define crash-safe receipts, unknown-outcome reconciliation, disposition
  CAS, and durable harness-idempotency gating
  ([#19](https://github.com/fyaic/threadmesh/issues/19)).
- [x] Define typed interruption results and authenticated verification
  attestations ([#16](https://github.com/fyaic/threadmesh/issues/16)).
- [x] Enforce summary, relationship, disposition, and capability coherence (#18).
- [ ] Accept two independent design reviews.

Current accounting: 10 milestone issues closed and 1 open. The internal reviews
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
- [ ] Retention-driven sensitive-content purge.

Prototype evidence already exists for task registration, mailbox persistence,
grant checks, CAS, admission claims, ACP session reload, and provenance. Stacked
Draft candidates now cover the versioned storage baseline, audited expiry,
fail-closed policy, runtime freshness, crash-safe native dispatch, and a local
restart-safe cursor stream with an authorization-aware provenance inspector.
The final stacked candidate adds the deterministic two-profile behavior matrix
and explicit unsupported degradation. A retention follow-up adds schema-v3
tombstones, unknown-effect protection, replay preservation, and explicit WAL
checkpoint behavior.
All M1 issues remain open because merge is gated by
[issue #7](https://github.com/fyaic/threadmesh/issues/7) and the remaining
acceptance criteria are not yet met.

Exit: two mock harnesses can discover, notify, suggest, accept, reject, defer,
and explicitly decline unsupported steer/interrupt behavior with a complete
audit trail. Successful interruption is not an M1 exit requirement unless the
typed cancellation contract is implemented.

## M2 — First real adapters

- [ ] Codex App Server adapter.
- [ ] Generic subprocess/JSON-RPC adapter.
- [ ] One production-oriented adapter for a non-Codex harness.
- [ ] Adapter capability negotiation and graceful degradation.

The Kimi ACP candidate now proves a real no-model create/list/delete/absence
lifecycle with exact binary and capability digests. Its earlier live marker is
quota-blocked, so this remains experimental evidence rather than M2 completion.
The Codex App Server candidate now has deterministic tests and a real no-model
CLI `0.145.0` preflight. Its live first turn, persisted resume, exact cleanup,
and coordinator-mediated A-to-B scenario remain gated and therefore do not
complete the Codex checklist item.
Gemini CLI headless `stream-json` is selected as the materially different third
harness. Its pinned official package and no-model capability preflight pass;
the checklist remains open until an explicitly authorized real model executes
the shared scenario.
A stacked conformance slice now removes the coordinator's ACP-only admission
assumption and executes the same accepted suggestion across ACP, Codex, and
Gemini fake products with kind-specific evidence. Real products remain required
for M2 exit.
A further gated runner rehearses the full mailbox, receiver acceptance,
admission, exact marker, evidence, audit, and cleanup path across all three fake
products. It defaults every live product to `not-run` until the external-review
gate is explicitly acknowledged.

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
