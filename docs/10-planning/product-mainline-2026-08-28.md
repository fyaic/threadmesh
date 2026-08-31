# Product mainline: attention and handoff routing

> Decision snapshot: 2026-08-28. This is the canonical product-direction
> reference until the next evidence-backed roadmap review. Protocol and safety
> documents remain authoritative for their own contracts.

## Decision

ThreadMesh will not compete as another general agent messaging protocol or
multi-agent workflow engine.

The product wedge is an **attention and handoff router for parallel agent
sessions**:

> Stop babysitting parallel agents. Route completion, blockers, review
> findings, and dependency-ready events to the right session without
> surrendering receiver control.

The user-visible job is not "send an agent message." It is:

> Keep several long-running agent sessions productive without making the user
> copy results, poll status, remember dependencies, or decide which session to
> wake next.

## Why the mainline changed

The repository has already proved a bounded proactive send, receiver-mediated
admission, cross-harness delivery, provenance, and cleanup. More protocol work
does not by itself make that proof useful.

Public community evidence now shows three simultaneous facts:

1. Cross-session transport is becoming native or commoditized through Codex,
   A2A, Cotal, ACP, and mailbox projects.
2. Users still act as the message bus for completion reports, blockers,
   review findings, and dependent work.
3. The difficult unsolved layer is deciding what deserves attention, when a
   receiver should wake, whether a claim is verified, and what dependency may
   advance.

This makes ThreadMesh's existing permission, provenance, freshness,
disposition, and verification work more valuable as a routing policy layer
than as a standalone wire protocol.

## Research basis and limits

This plan synthesizes public GitHub issues, repository activity, official
project documentation, and ThreadMesh's own real-product evidence observed
through 2026-08-28. It is qualitative discovery, not representative market
research. Multiple issues can come from the same person, stars are not usage,
and maintainer-authored proposals are hypotheses rather than independent user
validation.

### Highest-confidence needs

| Need | Public evidence | Product implication |
|---|---|---|
| Remove manual relay between durable sessions | [Codex #22768](https://github.com/openai/codex/issues/22768), [#21027](https://github.com/openai/codex/issues/21027), and [#36472](https://github.com/openai/codex/issues/36472) describe copy/paste, parent relay, and scattered handoffs. | Optimize a closed loop, not a one-off message. |
| Route typed work events, not ambiguous prose | [Codex #36843](https://github.com/openai/codex/issues/36843) separates delivered, verified, accepted, and authorized; [#40416](https://github.com/openai/codex/issues/40416) asks for a bounded handoff artifact. | Make lifecycle events and dependency effects first-class. |
| Replace polling with event-driven attention | [Codex #37299](https://github.com/openai/codex/issues/37299) reports extreme cost from repeated wait/status turns; [#38609](https://github.com/openai/codex/issues/38609) shows idle-target delivery races. | A durable mailbox is truth; wake is a bounded hint; no model polling loop. |
| Preserve receiver control and least authority | [Codex #33885](https://github.com/openai/codex/issues/33885) exposes parent-relay friction, while [#38687](https://github.com/openai/codex/issues/38687) shows the danger of inherited thread-control capabilities. | Route attention separately from authority; require receiver admission. |
| Address logical work, not transient harness identity | [MCP Agent Mail #263](https://github.com/Dicklesworthstone/mcp_agent_mail/issues/263) asks for project-addressed mail across Claude Code, OpenCode, and Codex; [#118](https://github.com/Dicklesworthstone/mcp_agent_mail/issues/118) reports identity persistence and discovery friction. | Bind stable workstream identity to replaceable session endpoints. |
| Make delivery state and recovery visible | [MCP Agent Mail #153](https://github.com/Dicklesworthstone/mcp_agent_mail/issues/153) reports a contact-gated payload being dropped; Cotal [#804](https://github.com/Cotal-AI/Cotal/issues/804), [#442](https://github.com/Cotal-AI/Cotal/issues/442), and [#444](https://github.com/Cotal-AI/Cotal/issues/444) expose wake, routing, and lifecycle-addressability failures. | Show queued, admitted, delivered, acknowledged, and blocked states with actionable recovery. |

### Competitive lessons

| Project or ecosystem | What it is winning | What ThreadMesh should learn | What ThreadMesh should not become |
|---|---|---|---|
| [Cotal](https://github.com/Cotal-AI/Cotal) | One-command local mesh, channels, presence, wake, dashboard, and many harness connectors. | Make installation, session visibility, and live demos obvious. Test wake and lifecycle races as product behavior. | Another broad pub/sub standard or open shared chat space. |
| [A2A](https://github.com/a2aproject/A2A) | Large interoperability ecosystem around agents, tasks, messages, artifacts, streaming, and extensions. Active epics cover task history, lifecycle, offline delivery, and swarm routing. | Map to A2A and use its transport semantics where useful. Keep ThreadMesh policy additive. | A competing universal remote-agent protocol. |
| [ACP](https://github.com/agentclientprotocol/agent-client-protocol) | A common editor-to-agent control surface with a growing registry of harnesses. | Prefer one robust ACP gateway over many bespoke subprocess adapters. | A second editor-agent protocol. |
| [MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail) | Practical identities, mailboxes, audit history, and file coordination for coding agents. | Preserve durable workstream addressing and inspectable delivery state. | A mailbox whose receipt is confused with context admission or authority. |
| General orchestration frameworks | DAGs, teams, checkpoints, budgets, traces, and polished control UIs. | Interoperate at event boundaries and export traces. | A general workflow engine; that market is crowded and dilutes the wedge. |

## Target user and primary workflow

The first target is a technical operator running three to ten durable coding
agent sessions across one or more repositories and harnesses. They already use
parallel agents, understand task boundaries, and currently relay status by
copy/paste or repeated polling.

The flagship workflow is an event-driven implementation and review loop:

```text
coordinator authorizes implementation
  -> implementer publishes artifact-ready + evidence
  -> reviewer is offered the handoff and wakes at a safe checkpoint
  -> reviewer publishes review-failed + bounded findings
  -> implementer receives only the relevant findings and fixes them
  -> verifier publishes verified-complete
  -> coordinator unlocks the next approved dependency
```

This demonstrates session initiative because each session chooses and performs
the next useful coordination action from typed state. It also demonstrates
control because no peer message silently becomes approval or execution
authority.

## Product architecture

```text
A2A / Cotal / ACP / harness-native transport
                     |
                     v
       ThreadMesh attention + admission policy
                     |
                     v
          Codex / Kimi / Pi / ACP receiver
```

ThreadMesh owns:

- stable task and workstream identity;
- typed lifecycle and handoff events;
- dependency and relevance evaluation;
- receiver-owned queue, notify, checkpoint, and wake policy;
- provenance, evidence, verification, authority, and disposition;
- an observable record of why an event moved or did not move work.

ThreadMesh consumes or delegates:

- generic remote-agent discovery and transport to A2A-compatible systems;
- broad pub/sub, presence, and networking to Cotal or another transport;
- harness process/session control to ACP or native APIs;
- workflow planning and execution to the user's chosen orchestrator.

## Current M5.2 execution order — 2026-09-01

The deterministic vertical slice is foundation evidence. The active product
gate is one real Codex A -> R -> same-A -> V loop, with a waiting dependent and
an authorized irrelevant control in the same correlated run. M5.2 remains
open; a scripted fixture is never labeled as live initiative.

Five blockers must close in order:

1. observe the complete persisted Codex turn set and reconcile unknown starts
   fail-closed;
2. classify a turn by exact client identity; a missing client id is ambiguous
   in the current slice. Unique-delta classification under a durable
   exclusive-writer proof remains a future option;
3. wire real persistent roles and bounded multi-tool callbacks so the models,
   not the runner, own decisions, findings, publications, fixes, and verifier
   requests;
4. survive killed-runner boundaries without blind retry, replacement turns, or
   duplicate effects;
5. correlate native turns, admissions, lifecycle events, signed evidence,
   dependent unlock, irrelevant zero-wake behavior, restart, and exact cleanup.

The acceptance run requires A to publish an implementation, R to discover and
publish a reproducible finding, the original A session/worktree to fix it, and
V to request the pinned verifier. The dependent is `waiting` before trusted
finalization and `ready` afterward. The irrelevant task receives no claim,
admission, native turn, publication, or dependency effect after its
precreation/bootstrap baseline.

Only a correlated real-product record may advance to Kimi parity and
cross-harness repetition. Kimi remains post-gate and does not block the Codex
critical path.

## Roadmap: Now / Next / Later

### Now — prove the attention-router value

Outcome: a new user runs one local closed loop and understands the benefit in
under 15 minutes.

1. Ship `npx threadmesh demo` or an equivalent one-command entry point that
   creates identities and grants, runs the flagship loop, and opens an
   inspector without manual token or task-ID setup
   ([#89](https://github.com/fyaic/threadmesh/issues/89)).
2. Promote six lifecycle events as the primary product vocabulary:
   `completed`, `blocked`, `needs-input`, `review-failed`, `artifact-ready`,
   and `dependency-satisfied`. Reuse existing envelope and disposition
   primitives before adding protocol surface
   ([#90](https://github.com/fyaic/threadmesh/issues/90)).
3. Add a small dependency router that converts accepted, sufficiently verified
   events into eligible next-session attention. It must never convert receipt
   alone into a dependency unlock
   ([#90](https://github.com/fyaic/threadmesh/issues/90)).
4. Run the first real Codex-first implementation/review/same-session-fix/
   verification loop, including dependent and irrelevant controls. Only after
   that correlated live-product pass, repeat it across Codex and one ACP
   harness using the existing adapters
   ([#91](https://github.com/fyaic/threadmesh/issues/91),
   [#93](https://github.com/fyaic/threadmesh/issues/93)).
5. Add a minimal inspector view for session status, dependency edges, recent
   events, routing reason, receiver disposition, and verification state.
6. Record a 60–90 second README demo and a reproducible evidence document
   ([#92](https://github.com/fyaic/threadmesh/issues/92)).

### Next — prove independent adoption and ecosystem fit

Outcome: someone outside the maintainer organization integrates an existing
harness and completes a real loop without maintainer intervention.

1. Turn the existing ACP adapter into the preferred multi-harness gateway and
   document the registry-compatible path.
2. Publish an A2A mapping for task, message, artifact, lifecycle, and extension
   fields; keep receiver admission local to ThreadMesh.
3. Prototype a Cotal transport bridge only after the core loop works locally.
4. Recruit three external operators for a 15-minute setup task. Capture
   installation outcome, time to first value, failed steps, and whether they
   would use the loop again.
5. Close [#79](https://github.com/fyaic/threadmesh/issues/79) only with feedback
   from an independent harness author; seek one external connector pull
   request.
6. Prepare `0.1` only after the workflow and integration contract survive the
   external attempts.

### Later — harden only proven usage

Outcome: strengthen the components that real operators depend on, based on
observed failure modes.

- claimant-specific mailbox leases and crash recovery;
- production authentication and remote transport profiles;
- OS isolation and secret minimization;
- hosted or multi-user coordinator only with demonstrated demand;
- additional wake, steer, or interruption capabilities only when a validated
  workflow requires them.

## Success metrics and guardrails

### Product metrics

| Metric | Initial target |
|---|---|
| Manual copy/paste or relay actions in flagship loop | `0` |
| Continuous user polling | `0`; exception-only attention |
| Correctly routed required events | `100%` in bounded demo |
| Irrelevant receiver wakes | `0` |
| Receipt incorrectly treated as verified or authorized | `0` |
| Time from eligible event to receiver offer | Under 10 seconds locally |
| Time to first successful external loop | Under 15 minutes |
| Real harness families in one loop | At least 2 |
| Independent setup attempts before `0.1` | 3 |

### Stop conditions

Pause or narrow the initiative if, after three independent setup attempts:

- no operator completes a real loop;
- setup still requires protocol expertise or manual identity/grant editing;
- users prefer ordinary chat or native harness messaging for the same job;
- routing does not measurably remove relay or polling work;
- the inspector cannot explain every wake and dependency transition.

## Explicitly paused

Until the **Now** outcome is demonstrated, do not put these on the product
critical path:

- new coordination intentions or a new universal wire format;
- a general-purpose orchestrator, DAG engine, or agent-team framework;
- distributed or hosted production coordinator work;
- hostile multi-worker support;
- Gemini live validation as a parallel mainline;
- autonomous steer or interrupt expansion;
- additional internal review loops that do not change user-visible evidence.

Normative external review [#7](https://github.com/fyaic/threadmesh/issues/7)
continues as a parallel governance gate. It must not block bounded product
learning, and product experiments do not satisfy it.

## Community-observation cadence

Review adjacent communities monthly and before each milestone decision:

1. sample new issues in Codex, Cotal, A2A, ACP, and practical mailbox projects;
2. tag each observation as independent user report, maintainer proposal, bug,
   workaround, or shipped behavior;
3. update the evidence table only when a signal changes a decision;
4. prefer workflow pain and observed behavior over stars or feature breadth;
5. publish a dated change note when the roadmap is reprioritized.

The next review should answer one question: **does the closed loop remove enough
human relay work that an external operator wants to keep it enabled?**
