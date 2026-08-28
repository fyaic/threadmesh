# Roadmap

ThreadMesh uses milestone exit criteria rather than date promises. Priorities
may change as the safety and adapter contracts become clearer. See the
[current status](docs/10-planning/project-status.md) and
[product mainline](docs/10-planning/product-mainline-2026-08-28.md) for the
evidence-backed snapshot, current product decision, and ordered workstreams.

The roadmap now optimizes for one outcome: **parallel agent sessions hand off
completion, blockers, review findings, and dependency-ready state without the
user acting as their message bus**. ThreadMesh is the attention and admission
policy layer; A2A, Cotal, ACP, or harness-native APIs may supply transport.

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
- [x] Receiver decision and interference-cost budget.
- [x] Evaluation suite for useful versus harmful coordination.

The initial repetition matrix rejected default enablement. The shorter
outcome-bearing benchmark and two-stage policy subsequently passed relevant
3/3, while fresh control used no tool and fresh irrelevant performed one
read-only lookup without sending or activating B. A real Codex-to-Kimi case
then passed with exact cleanup. The bounded profile is therefore eligible for
explicit experimental opt-in, while repository-wide default enablement remains
off during pre-alpha.

Exit: proactive coordination improves task outcomes in a benchmark without exceeding the defined interference budget.

## M4 — Reusable harness integration kit

- [x] Export a transport-agnostic proactive tool bridge from the package.
- [x] Bound relationship discovery and suggestion budgets per model turn.
- [x] Publish a runnable sender-plus-receiver harness example.
- [x] Verify the packed package from an external consumer project.
- [ ] Collect the first independent harness-integration feedback.

Exit: a harness can add bounded proactive discovery and suggestion without
importing coordinator, adapter, or validation internals.

## M5 — Attention and handoff router MVP

- [ ] Ship a one-command local demo with generated identities, grants, example
  sessions, and an inspector
  ([#89](https://github.com/fyaic/threadmesh/issues/89)).
- [ ] Make `completed`, `blocked`, `needs-input`, `review-failed`,
  `artifact-ready`, and `dependency-satisfied` the primary product events
  ([#90](https://github.com/fyaic/threadmesh/issues/90)).
- [ ] Route accepted and sufficiently verified events to eligible dependent
  sessions without treating receipt as verification or authority
  ([#90](https://github.com/fyaic/threadmesh/issues/90)).
- [ ] Demonstrate a real Codex-first implementation/review/fix loop with zero
  manual relay and zero polling turns
  ([#91](https://github.com/fyaic/threadmesh/issues/91)).
- [ ] Repeat the loop across Codex and one ACP-compatible harness
  ([#93](https://github.com/fyaic/threadmesh/issues/93)).
- [ ] Publish an inspector, reproducible evidence record, and 60–90 second
  visual demo ([#92](https://github.com/fyaic/threadmesh/issues/92)).

Exit: a new operator can run and understand the closed loop in under 15
minutes; the bounded scenario has zero manual relay, irrelevant wakes, and
incorrect dependency unlocks.

## M6 — Independent adoption and ecosystem bridges

- [ ] Collect three independent setup attempts and one completed real workflow.
- [ ] Close [#79](https://github.com/fyaic/threadmesh/issues/79) with independent
  harness-author feedback.
- [ ] Make ACP the preferred multi-harness gateway.
- [ ] Map ThreadMesh lifecycle, evidence, and admission semantics to A2A without
  duplicating A2A transport.
- [ ] Prototype a Cotal transport bridge only after the local loop passes.
- [ ] Receive one external connector contribution or equivalent clean-room
  integration.

Exit: an operator outside the maintainer organization completes a useful loop
without maintainer intervention, and the integration contract is ready for a
versioned `0.1` release candidate.

## M7 — Evidence-driven production hardening

- [ ] Prioritize claimant leases, crash recovery, authentication, isolation,
  and remote transport from observed operator failures.
- [ ] Define service-level expectations only after a real persistent deployment.
- [ ] Add wake, steer, or interruption capabilities only for a validated
  workflow that cannot use checkpoint admission.

Exit: production claims are backed by real deployment evidence rather than
prototype inference.

## Explicitly deferred

- Public agent discovery across trust domains.
- Payments, markets, or autonomous contracting.
- Cross-user coordination without an identity and consent design.
- A hosted multi-tenant control plane.
- A general-purpose orchestrator, DAG engine, or agent-team framework.
- New protocol intentions that are not required by the M5 closed loop.
- Gemini live validation as a competing product mainline.
