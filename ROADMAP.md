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

- [x] Versioned SQLite storage, migration, rollback, retention, and deletion contract.
- [x] Complete durable task registry, mailbox, and scoped audit API.
- [x] Complete relationship- and intent-based policy engine with stable reasons.
- [x] Complete freshness, idempotency, expiry, receipts, and reconciliation.
- [x] Local event stream and provenance inspector.
- [x] Two-profile mock-harness conformance kit.
- [x] Retention-driven sensitive-content purge.

M1 is merged and its GitHub milestone is closed. This is experimental reference
runtime evidence, not a production deployment claim.

Exit: two mock harnesses can discover, notify, suggest, accept, reject, defer,
and explicitly decline unsupported steer/interrupt behavior with a complete
audit trail. Successful interruption is not an M1 exit requirement unless the
typed cancellation contract is implemented.

## M2 — First real adapters

- [x] Codex App Server adapter.
- [x] Generic subprocess/JSON-RPC adapter.
- [x] Minimal installable harness SDK and short integration example.
- [x] One real non-Codex harness pass through the shared coordinator path.
- [x] Adapter capability negotiation and graceful degradation.

Kimi Code `0.38.0` now passes a real accepted suggestion through ACP with exact
binary/capability evidence, context admission, and delete-plus-absence cleanup.
The Codex App Server path has a real receiver pass, a model-selected A-to-B
case, and the first scored control/relevant/irrelevant comparison with exact
cleanup. Repetition and interference-budget evidence remain open.
Gemini CLI headless `stream-json` is selected as the materially different third
harness. Its pinned official package and no-model capability preflight pass;
the checklist remains open until an explicitly authorized real model executes
the shared scenario.
The same receiver-accepted suggestion passes real Codex App Server and Kimi ACP
products, plus deterministic ACP, Codex, and Gemini fakes. Gemini live remains
optional rather than a competing mainline.

Exit: the same scenario runs across at least two different harness families.

## M3 — Proactive dependency discovery

- [x] Explicit dependency graph.
- [x] Privacy-preserving task summaries.
- [x] Bounded model-selected relationship lookup and send experiment.
- [x] First no-contact and irrelevant control conditions.
- [ ] Receiver decision and interference-cost budget.
- [ ] Evaluation suite for useful versus harmful coordination.

The first three-run repetition matrix keeps proactive coordination default-off:
control was quiet 3/3, but relevant coordination completed only 1/3 because of
one operation timeout and one bootstrap marker mismatch. The next M3 slice is a
shorter reliability benchmark, not more protocol surface.

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
