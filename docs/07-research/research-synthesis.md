# Research synthesis and project direction

> Research snapshot: 2026-08-20.

## Bottom line

The target behavior is feasible to reproduce without access to private Codex
internals.

The essential mechanism is not a special model capability. It is a composition
of:

- an LLM that can recognize undeclared task relationships;
- explicit coordination tools and policy;
- a durable task directory and mailbox;
- a wake/turn scheduler;
- harness-specific context injection;
- receiver-side permission, freshness, and audit enforcement.

Codex supplies the strongest end-to-end behavioral precedent. A2A, AAMP, SLIM,
Repowire, MCP Agent Mail, Aerial, and agent-inbox supply adjacent protocol,
transport, and mailbox precedent. The remaining opportunity is a compact,
open, cross-harness **context-governance contract**.

## The central design distinction

ThreadMesh should standardize five independent transitions:

```text
1. sent
2. durably received
3. target notified or woken
4. content admitted to model-visible context
5. requested state/action accepted and applied
```

Most adjacent systems combine at least two of them. Combining them creates the
exact negative behavior that motivated the project: a benign-looking message
can unexpectedly wake a task, enter prompt context, redirect active work, or be
mistaken for approval.

## What ThreadMesh should borrow

| Source | Borrow | Do not inherit blindly |
|---|---|---|
| Codex | Model-visible proactive policy; queue versus wake; expected-turn freshness; turn lineage; visible source label. | Root-tree-only addressing; product-specific dynamic tools; provider-specific message items. |
| A2A | Agent/task/message/artifact vocabulary; opaque-agent interoperability; extension mechanism. | Assuming a remote task protocol defines local prompt-entry policy. |
| AAMP | Small typed task intents; pairing and sender policy; mailbox thread as durable control history. | Email as the only transport or every dispatch as a new task. |
| Aerial | Durable pull mailbox as source of truth; wake as lossy hint; explicit acknowledgement. | Minimal authority semantics. |
| MCP Agent Mail | Human-readable audit; inbox/outbox; searchable threads; advisory resource leases. | Implementation code under its non-standard license; coupling mail to task authority. |
| Repowire | Cross-harness local daemon; session adapters; ask/ack/notify; schedules and human surfaces. | Product breadth before protocol invariants; code without a detected license. |
| SLIM | Future secure transport for cross-machine and cross-org deployments. | Internet-scale transport complexity in the local MVP. |

## What ThreadMesh should uniquely own

### 1. Context-entry capabilities

Capabilities should say not only who may send, but what the receiver may do
with the message:

- store only;
- show as a side-channel notification;
- offer at the next checkpoint;
- wake an idle task;
- steer an active turn;
- request interruption.

The receiver always enforces the final boundary.

### 2. Typed epistemic and authority state

A portable envelope needs to distinguish:

- observation, question, suggestion, result, state update, and action request;
- unverified, self-asserted, evidence-backed, and receiver-verified claims;
- permission to inform, request, steer, authorize, or interrupt;
- delivery status from receiver disposition;
- evidence references from embedded evidence content.

This is more important than inventing a novel wire format.

### 3. Freshness against active task state

Every state-changing request should bind to an expected target state, such as:

- task ID and incarnation;
- active run/turn ID;
- objective revision;
- optional artifact or dependency version.

The adapter must fail stale rather than silently applying a once-correct message
to a new objective.

### 4. Deterministic budgets

Enforcement should cover:

- messages per sender/target/time window;
- wake-ups and active steering per task;
- fan-out and recursion depth;
- maximum payload and evidence size;
- token or cost budget when available;
- repeated rejection and retry loops.

Prompts can teach restraint; only code can guarantee it.

### 5. Adapter conformance

A harness adapter should prove:

- task addressing is stable;
- store-only messages never enter model context;
- wake notifications can be lost without message loss;
- stale steer/interrupt requests fail;
- source provenance survives model-visible rendering;
- plain text cannot answer approval or structured input requests;
- duplicate event IDs are idempotent;
- receiver disposition is observable by the sender;
- revocation prevents later context entry even if a message was queued.

## Recommended MVP

> Historical research recommendation. The repository has since implemented a
> narrower SQLite/ACP prototype. Current milestone accounting and execution
> order live in the [project status](../10-planning/project-status.md) and
> [mainline plan](../10-planning/mainline-plan.md).

### Phase R0: research baseline

- Maintain the evidence-separated Codex deep dive.
- Track adjacent protocol changes and license constraints.
- Convert community failure reports into conformance fixtures.
- Keep claims about private Desktop implementation explicitly bounded.

### Phase M0: protocol and simulator

Build no live steering yet.

- JSON Schema envelope and capability grant.
- Local SQLite task directory, inbox, outbox, and audit log.
- Deterministic simulator for sender, receiver, wake, stale state, revocation,
  duplication, and message storms.
- Inspector UI or CLI that shows all five transitions separately.

### Phase M1: Codex-to-Codex reference adapter

Status update: a conservative App Server candidate now implements
receiver-mediated suggestion delivery and passes a real CLI `0.145.0` no-model
preflight. The model marker and existing-receiver A-to-B scenario remain gated
until the normative review and local coordinator stack are merged.

- Use App Server thread/turn primitives where documented.
- Start with `notify` and receiver-mediated `suggest`.
- Implement `wake-idle` only after mailbox durability and audit are proven.
- Keep active `steer` and `interrupt` behind explicit per-task grants.
- Render accepted content with unmistakable peer-task provenance.

This phase validates the semantics against the closest behavioral reference
without claiming parity with private Desktop tools.

### Phase M2: first true cross-harness pair

Add one adapter for a harness with a materially different control surface,
preferably Claude Code hooks/SDK or a minimal open agent loop.

The milestone succeeds only if:

- the same envelope and dispositions work in both directions;
- no adapter-specific field leaks into the core schema;
- a queued message survives both processes stopping and restarting;
- each receiver can decline context entry independently;
- provenance is visible in both harnesses.

### Phase M3: A2A and remote transport mapping

- Map ThreadMesh messages and results onto A2A tasks/messages/extensions.
- Add a transport interface and evaluate SLIM or ordinary authenticated HTTP.
- Keep recipient-local context policy outside the remote transport.

## Proposed reference flow

```text
Agent A notices possible dependency
  │
  ├─ queries bounded task summaries
  │
  ├─ chooses the least-authority intent
  │
  ├─ submits envelope + expected target state
  ▼
ThreadMesh broker authenticates, authorizes, persists, deduplicates
  │
  ├─ store-only ──────────────────────────────┐
  ├─ notify side-channel                      │
  ├─ offer at checkpoint                      │
  ├─ wake idle adapter                        │
  └─ request active steer/interrupt grant     │
                                                ▼
Receiver adapter validates freshness and decides context rendering
  │
  ├─ reject / defer / accept without acting
  └─ apply through normal harness approval and sandbox path
                                                │
                                                ▼
                         durable disposition + evidence back to A
```

## Product positioning

ThreadMesh should describe itself as:

> A vendor-neutral safety and interoperability layer for proactive coordination
> between already-running agent tasks.

It should not describe itself as another:

- agent framework;
- autonomous team manager;
- workflow engine;
- generic message broker;
- shared-memory system;
- internet-wide agent discovery network.

## Research-derived decision proposals

These should become ADRs after review:

1. **Separate persistence from wake delivery.** A wake is a hint; the mailbox is
   authoritative.
2. **Make context admission receiver-owned.** Sender authority never directly
   writes model-visible history.
3. **Use a provider-neutral core envelope.** Harness/model item conversion occurs
   only inside adapters.
4. **Treat structured gates as separate capabilities.** Plain peer messages
   cannot approve tools, permissions, or user-input requests.
5. **Support explicit and proactive policy modes.** Mode is visible to the model,
   but deterministic budgets always dominate it.
6. **Target durable peers, not only parent-child trees.** Relationships and
   capabilities replace a universal supervisor hierarchy.

## Remaining validation questions

- Which Codex Desktop cross-thread operations are stable enough to depend on,
  and which remain product-private dynamic tools?
- What is the safest model-visible role/item for accepted peer advice in each
  harness?
- Can task summaries enable relationship discovery without leaking objective or
  workspace content?
- How should a receiver surface an offer at a checkpoint without creating a new
  model turn?
- What objective revision token is portable across harnesses?
- Can A2A extensions carry ThreadMesh authority and disposition without forking
  the base task model?
- How should a user distinguish "another agent asserted this" from "the runtime
  verified this" in compact UI?

## Related research

- [Codex orchestration deep dive](codex-orchestration-deep-dive.md)
- [Community signals](community-signals.md)
- [Ecosystem landscape](ecosystem-landscape.md)
- [Prior art and adjacent protocols](prior-art.md)
- [Open questions](open-questions.md)
