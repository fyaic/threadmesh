# Community signals around cross-task agent coordination

> Research snapshot: 2026-08-20. GitHub issues are community reports unless an
> OpenAI contributor explicitly confirms product status. They are evidence of
> demand and failure modes, not a stable API contract.

## The discussion exists and closely matches ThreadMesh

The clearest public discussion is not a generic multi-agent thread. It is a
specific progression from ephemeral subagents to durable peer-session
coordination.

### Timeline

| Date | Signal | Why it matters |
|---|---|---|
| 2026-03-17 | [`openai/codex#14923`](https://github.com/openai/codex/issues/14923) requests opt-in cross-thread list/read/send/fork/archive with permissions and audit. | Establishes the durable peer-thread abstraction separately from subagents. |
| 2026-05-15 | Community comments distinguish "main-agent-to-main-agent" communication from child delegation. | Matches the user's intuition that B is an already-situated peer, not a fresh tool call. |
| 2026-06-05 | Comments request explicit queue/steer/interrupt/fail-if-busy delivery outcomes. | Shows that transport without interruption semantics is insufficient. |
| 2026-06-21 | Users report that Desktop thread management and cross-thread messaging are visible in practice. | Early product evidence, still community-reported. |
| 2026-08-04 | An OpenAI contributor closes the request and says persistent list/read/send/fork/archive and cross-thread messaging shipped. | Strongest public ship confirmation. |
| 2026-08 onward | Follow-up issues focus on consent, typed events, structured gates, lifecycle races, and interoperability. | The problem moves from "can messages move?" to "can they move safely and portably?" |

## What users like

The positive case is consistent across the thread:

- durable sessions keep specialized project, repo, and worktree context;
- an architect task can coordinate focused worker tasks without manual
  copy/paste;
- peers can cross-check assumptions without flattening all work into one giant
  context window;
- a model can react to blockers and results rather than following only a
  predetermined workflow graph;
- the originating and receiving tasks remain inspectable and resumable.

This is the source of the "emergent intelligence" feeling: the coordinator can
discover a need, consult another situated task, and adapt.

## What users fear or observe going wrong

### Ambiguous queue versus interruption

[`openai/codex#30499`](https://github.com/openai/codex/issues/30499) asks for a
non-interrupting queued delivery mode so worker completion notices do not muddy
an active parent turn.

[`openai/codex#34933`](https://github.com/openai/codex/issues/34933) reports that
a cross-task follow-up can pivot an active target before its current unit of
work reaches a checkpoint. The proposal is to make queue, interrupt, or
checkpoint delivery explicit.

ThreadMesh implication: `delivered` must not imply `injected`, and `injected`
must not imply `interrupted`.

### Missing consent and mute controls

[`openai/codex#35516`](https://github.com/openai/codex/issues/35516) describes
cross-chat relay as a consent and control problem when the target owns active,
uncommitted work. Requested controls include per-message confirmation, per-task
mute, an outbound audit log, and a quiet coordinator mode.

ThreadMesh implication: proactive sending authority and target context-entry
authority are different capabilities. A user-owned session needs a cheap way to
say "receive side-channel notifications but do not wake or inject."

### Delivery is not verification or authority

[`openai/codex#36843`](https://github.com/openai/codex/issues/36843) proposes a
typed, evidence-aware `CrossThreadEvent`. Its central distinction is:

```text
message delivered
!= statement verified
!= state accepted
!= action authorized
```

It proposes source identity, trajectory, event type, evidence references,
verification status, and explicit authority flags.

ThreadMesh implication: this is unusually close prior art. ThreadMesh should
interoperate with or generalize the useful semantics rather than merely invent
new names for the same safety boundary.

### Prose cannot resolve a structured gate

[`openai/codex#37995`](https://github.com/openai/codex/issues/37995) observes
that sending text to a task blocked on `request_user_input` does not resolve the
pending structured request. It proposes a typed operation bound to one exact
thread, request ID, and answer schema.

ThreadMesh implication: ordinary peer text must never be interpreted as an
approval, permission grant, or structured answer. Typed control responses need
separate operations and stale-request rejection.

### Late result delivery and lifecycle races

[`openai/codex#31178`](https://github.com/openai/codex/issues/31178) reports that
parent interaction can feel serial and that a child result completing after a
parent interruption may remain undisplayed until the parent explicitly queries
agent state.

ThreadMesh implication: durable result availability and wake notification must
be independent. A dropped wake must not lose the result; a result needs an
acknowledged disposition path.

### Portability breaks at model-provider boundaries

[`openai/codex#33551`](https://github.com/openai/codex/issues/33551) reports
that Multi-Agent V2 can send an OpenAI-specific `agent_message` item to external
Responses-compatible providers that only understand standard message types.
Several users built conversion proxies or patches.

ThreadMesh implication: the core envelope must be provider-neutral. Each
adapter should render the accepted message into a harness-native role/item only
at the final boundary.

### Proactivity can overspend or violate configuration expectations

[`openai/codex#35177`](https://github.com/openai/codex/issues/35177) reports a
high-effort model spawning many subagent sessions despite a feature flag, with
large token and credit impact. Regardless of the eventual root-cause finding,
it is a strong community signal that proactive delegation needs visible budgets
and enforceable hard limits.

ThreadMesh implication: policy text is not an enforcement boundary. Fan-out,
wake, token, message, and interruption budgets belong in deterministic code.

## Community-built responses

Several projects emerged because users did not want to remain the clipboard
transport between agents:

- [Repowire](https://github.com/prassanna-ravishankar/repowire) gives live CLI
  sessions mesh addresses and ask/ack/notify/broadcast operations; Codex uses an
  App Server bridge.
- [MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail) provides
  identities, inbox/outbox, searchable threads, acknowledgements, and advisory
  file leases through MCP.
- [Aerial](https://github.com/dcdeniz/aerial) combines durable pull mailboxes
  with lossy wake notifications and can supervise Codex workers.
- [agent-inbox](https://github.com/salimfadhley/agent-inbox) supplies a local
  SQLite mailbox and harness-specific wake hooks.
- [MAGI](https://github.com/kent8192/magi-system) uses Redis Streams for durable
  history, Pub/Sub for wake-up, and an App Server bridge for Codex injection.
- [AAMP](https://github.com/larksuite/aamp) standardizes asynchronous task
  intents over ordinary mail infrastructure and ships runtime bridges.

Their existence supports the demand thesis. Their divergent choices also show
that no interoperability center has yet won.

## Design conclusions from the discussion

The community is converging on seven requirements:

1. Durable peer identity is different from child-agent identity.
2. Queue, wake, steer, and interrupt are different delivery contracts.
3. Source authenticity is different from content verification.
4. A request to act is different from authority to act.
5. Mailbox durability is different from wake reliability.
6. Cross-harness portability requires a neutral envelope plus adapters.
7. Proactive behavior needs hard budgets and user-visible controls.

ThreadMesh's opportunity is not to prove that agents can send messages. The
community has done that many times. The opportunity is to make these seven
requirements a small, testable, vendor-neutral contract.
