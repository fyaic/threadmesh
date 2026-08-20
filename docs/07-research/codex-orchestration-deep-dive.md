# Codex proactive and cross-task orchestration deep dive

> Research snapshot: 2026-08-20. Source observations are pinned to
> `openai/codex` commit
> [`3b45c29062ff0e76e71c91b6753290400e7fa8da`](https://github.com/openai/codex/tree/3b45c29062ff0e76e71c91b6753290400e7fa8da).

## Executive conclusion

The apparently spontaneous behavior is real at the agent-policy level, but it
is not unexplained model-to-model awareness.

Codex combines four layers:

1. **A policy made visible to the model** tells it whether multi-agent work is
   explicit-request-only or proactive.
2. **Tool affordances** let the model discover, inspect, message, wake, wait for,
   and interrupt other work.
3. **The model chooses** whether another task is relevant and whether calling a
   coordination tool is worth the cost.
4. **A deterministic runtime** resolves identities, queues messages, wakes idle
   turns, injects accepted input at defined boundaries, and records provenance.

This is best described as **tool-conditioned agency**. The initiative comes
from the model's planning decision; the reliability and boundaries come from
the harness.

There are also two distinct Codex capabilities that must not be conflated:

- **Open-source multi-agent V2:** communication among root and child agents in
  one root thread tree. Most of this runtime is visible in `openai/codex`.
- **Codex Desktop durable peer-task orchestration:** one existing user task can
  list, read, or message another existing task. The user-facing tools and UI
  exist, but their product-specific implementation is not present under the
  same names in the open-source repository.

The screenshot that motivated ThreadMesh belongs to the second category. The
first category proves the underlying mailbox and turn-boundary design patterns,
but it is not complete proof of how Desktop implements peer-task relays.

## Evidence levels used here

| Label | Meaning |
|---|---|
| Official documentation | OpenAI describes the behavior or interface publicly. |
| Open-source observation | The behavior is directly visible in pinned source code. |
| Product evidence | The shipped UI/tool behavior is visible in Codex Desktop or confirmed by an OpenAI contributor. |
| Inference | A plausible connection between known primitives; not a claim about private implementation. |
| Community report | A user report or proposal; useful evidence, but not an official contract. |

## 1. Where the initiative comes from

### 1.1 Proactive mode is an explicit runtime policy

In multi-agent V2, Codex computes an effective coordination mode. At the pinned
source revision, `ultra` reasoning maps to `Proactive` unless a configured or
model-catalog hint overrides it; other cases fall back to an explicit-only
policy. See
[`session/multi_agents.rs#L145-L185`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/multi_agents.rs#L145-L185).

That mode is rendered into a developer message. The proactive text authorizes
the model to use subagents when doing so materially improves speed or quality;
the explicit-only text tells it not to spawn unless the user or project
instructions asked for delegation. See
[`multi_agent_mode_instructions.rs#L6-L47`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/context/multi_agent_mode_instructions.rs#L6-L47).

This explains an important part of the perceived emergence:

```text
runtime selects policy
        ↓
policy becomes model-visible context
        ↓
model recognizes a coordination opportunity
        ↓
model voluntarily calls a coordination tool
```

No static workflow needs to say "contact B now." The model makes that local
choice. But the harness deliberately made that choice available and, in
proactive mode, legitimate.

### 1.2 Tool descriptions are part of the agent-computer interface

Codex does not expose a generic `send` primitive and hope the model infers the
semantics. The V2 surface distinguishes:

- `send_message`: queue a message; do not start a new target turn;
- `followup_task`: deliver a follow-up and wake an idle non-root target;
- `wait_agent`: wait for mailbox or final-status updates;
- `interrupt_agent`: stop an active turn while keeping the agent addressable.

The exact queue-versus-wake language is encoded in the tool descriptions at
[`multi_agents_spec.rs#L185-L244`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/tools/handlers/multi_agents_spec.rs#L185-L244).

OpenAI's Agents SDK documentation describes the same general mechanism:
LLM-led orchestration allows the model to plan and select agent tools or
handoffs, while code-led orchestration provides more deterministic routing.
ThreadMesh should preserve this split rather than placing all initiative in
either prompts or a workflow engine. Reference:
[OpenAI Agents SDK orchestration](https://openai.github.io/openai-agents-python/multi_agent/).

## 2. The open-source multi-agent communication path

### 2.1 One root-scoped control plane

Each root agent tree shares one `AgentControl`. The source explicitly says the
control plane is scoped to the root thread/session tree, not the whole global
`ThreadManager`. See
[`agent/control.rs#L99-L120`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/agent/control.rs#L99-L120).

The shared `AgentRegistry` tracks:

- canonical agent paths;
- the thread ID behind each path;
- live agent metadata;
- total spawn count and limits;
- nickname and lifecycle bookkeeping.

See
[`agent/registry.rs#L17-L43`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/agent/registry.rs#L17-L43).

Canonical paths such as `/root/reviewer` are therefore more than display
labels. They are addresses within a bounded authority domain.

### 2.2 Targets are resolved before delivery

The V2 message handler resolves a target, verifies that the agent is known,
loads it if necessary, constructs a communication envelope, and submits it via
the shared control plane. See
[`message_tool.rs#L51-L137`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/tools/handlers/multi_agents_v2/message_tool.rs#L51-L137).

Relative names resolve against the current agent path. Unknown paths fail
instead of broadcasting or scanning all sessions. See
[`agent/control.rs#L384-L403`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/agent/control.rs#L384-L403).

This is a safety-relevant boundary: open-source subagent messaging is not a
global peer-session bus.

### 2.3 Messages carry provenance and delivery intent

`InterAgentCommunication` contains:

- author and primary recipient paths;
- optional additional recipients;
- content or encrypted content;
- optional internal metadata passthrough;
- `trigger_turn`, the queue-versus-wake decision.

See
[`protocol.rs#L737-L790`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/protocol/src/protocol.rs#L737-L790).

This is a useful primitive, but it is not yet a full ThreadMesh envelope. It
does not by itself express evidence status, sender authority, expiration,
receiver disposition, or a portable cross-harness task identity.

### 2.4 Queue-only and wake-up are different operations

Both message tools use the same handler. Their essential difference is
`MessageDeliveryMode::QueueOnly` versus `TriggerTurn`. See
[`message_tool.rs#L1-L23`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/tools/handlers/multi_agents_v2/message_tool.rs#L1-L23).

On receipt, the session always places the communication in its mailbox. It asks
the pending-work scheduler to start work only when `trigger_turn` is true (or a
separate durable-sleep condition applies). See
[`session/handlers.rs#L80-L102`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/handlers.rs#L80-L102).

This is the strongest implementation precedent for ThreadMesh's rule that
**delivery, prompt injection, and wake-up must be separate state transitions**.

### 2.5 The mailbox is durable session input, not a direct model call

The session owns a FIFO mailbox plus turn-local pending input. Mail is drained
into `TurnInput::InterAgentCommunication` only when the current lifecycle phase
accepts mailbox delivery. See
[`session/input_queue.rs#L70-L181`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/input_queue.rs#L70-L181).

The implementation also distinguishes queue-only child mail from input that
requires same-turn work, deferring the former to the next turn when appropriate.
See
[`session/input_queue.rs#L206-L227`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/input_queue.rs#L206-L227).

Once accepted, the communication becomes model-visible history and is persisted
with metadata recording whether it triggered a turn. See
[`session/mod.rs#L3238-L3265`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/mod.rs#L3238-L3265).

### 2.6 Causal turn lineage is carried separately

Triggering follow-ups can carry parent and root turn IDs. The mailbox preserves
these only for wake-up communications and marks ambiguous lineage when several
incompatible roots are mixed. See
[`session/input_queue.rs#L151-L181`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/session/input_queue.rs#L151-L181)
and
[`tasks/mod.rs#L320-L337`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/core/src/tasks/mod.rs#L320-L337).

This is a practical example of causal provenance surviving beyond plain text.

## 3. The App Server primitives beneath durable tasks

OpenAI documents App Server as the interface used by rich Codex clients. It is a
bidirectional JSON-RPC-like protocol over stdio JSONL, experimental WebSocket,
or Unix-socket transports. It exposes persistent thread lifecycle, turns,
streaming items, approvals, and interruptions. Reference:
[Codex App Server](https://learn.chatgpt.com/docs/app-server).

Relevant primitives include:

| Primitive | Relevant behavior |
|---|---|
| `thread/list`, `thread/read` | Discover and inspect durable tasks. |
| `thread/start`, `thread/resume`, `thread/fork` | Create or recover durable task identity. |
| `turn/start` | Begin new model work. |
| `turn/steer` | Add input to the active regular turn. |
| `turn/interrupt` | Interrupt active work. |
| `thread/inject_items` | Persist raw model-visible history without starting a turn. |
| dynamic tools | Let a rich client add product-specific model-callable operations. |

Two lower-level details are especially relevant.

First, `turn/steer` requires `expectedTurnId`. A stale or mismatched caller is
rejected, providing an optimistic-concurrency guard against steering the wrong
turn. The public example and failure rules are in
[`app-server/README.md#L1206-L1223`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/app-server/README.md#L1206-L1223).

Second, `thread/inject_items` appends model-visible items without starting a
turn. The open implementation validates and persists Responses API items at
[`turn_processor.rs#L878-L903`](https://github.com/openai/codex/blob/3b45c29062ff0e76e71c91b6753290400e7fa8da/codex-rs/app-server/src/request_processors/turn_processor.rs#L878-L903).

Together, these primitives are sufficient building blocks for several
cross-task delivery modes. They do not prove which exact sequence Desktop uses.

## 4. What is known about Desktop peer-task orchestration

The strongest public product evidence is
[`openai/codex#14923`](https://github.com/openai/codex/issues/14923). The issue
requested explicit list/read/create/fork/archive/send operations between
durable peer tasks, and an OpenAI contributor closed it on 2026-08-04 stating
that persistent list/read/send/fork/archive primitives and cross-thread
messaging had shipped.

Other public issue reports name the model-callable Desktop surface, including
`list_threads`, `read_thread`, `create_thread`, `send_message_to_thread`, and
`handoff_thread`. They also describe the UI provenance label that says a
message was sent by Codex from another task.

However, a search of the pinned open-source tree does not find the
product-facing `send_message_to_thread` or `wait_threads` implementations. The
most defensible boundary is therefore:

- **Confirmed:** Desktop exposes persistent cross-task operations and visible
  relay attribution.
- **Confirmed:** App Server exposes the lifecycle primitives on which such an
  implementation can be built.
- **Confirmed:** the open-source subagent layer implements a sophisticated
  mailbox, wake, turn-boundary, and provenance path.
- **Not publicly confirmed:** Desktop's exact internal routing, permission
  checks, queue policy, wake policy, and storage schema for peer-task relays.

## 5. Why the behavior feels more intelligent than a workflow

Three characteristics create the effect:

### Situated relevance judgment

The model can recognize a dependency that was not declared in a DAG. It can
decide that B's result changes A's plan, or that A has evidence B needs.

### Durable alterity

B is not merely another function call. It has its own history, workspace,
active objective, tools, and accumulated decisions. Contacting B therefore
resembles consulting another situated reasoner.

### Closed-loop coordination

A can send, observe state, wait, interpret B's reply, and revise its own plan.
The intelligence lies in this adaptive loop, not in transport alone.

The same properties produce the negative effect: a model-selected action can
alter another user's active cognitive and execution trajectory. Context is a
side-effect surface even when no file has changed.

## 6. Replication guidance for ThreadMesh

### What can be replicated directly

- Model-visible coordination policy with explicit and proactive modes.
- A typed tool surface with distinct notify, queue, wake, steer, and interrupt
  affordances.
- Stable task/agent addressing.
- A durable recipient-owned mailbox.
- Safe-boundary delivery and explicit wake-up.
- Expected-run freshness checks.
- Causal lineage and visible provenance.
- An adapter that translates these concepts to each harness's native thread and
  turn APIs.

### What should not be copied as-is

- A root-tree-only registry is insufficient for durable peer sessions across
  harnesses.
- Plain text plus `trigger_turn` is too weak for cross-authority communication.
- Treating a delivered message as accepted state would collapse transport,
  verification, and authority.
- Raw model-visible injection is too powerful to be the default peer operation.
- OpenAI-specific `agent_message` representations are not portable to all
  Responses-compatible providers, as reported in
  [`openai/codex#33551`](https://github.com/openai/codex/issues/33551).

### Minimum portable architecture

```text
model policy + coordination tools
              │
              ▼
       harness-local adapter
              │
              ▼
 capability broker ── task directory
              │
              ▼
 durable recipient mailbox
              │
      policy + freshness gate
              │
        ┌─────┴─────────┐
        ▼               ▼
 side-channel event   safe-boundary prompt input
        │               │
        └──── audit + disposition ────► sender
```

The model remains free to notice and propose coordination. The receiver and
runtime remain authoritative about whether that proposal becomes context or
action.

## Primary sources

- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
- [Codex subagents documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [Codex as a platform](https://learn.chatgpt.com/blog/codex-as-a-platform)
- [OpenAI Agents SDK: agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [`openai/codex` pinned source snapshot](https://github.com/openai/codex/tree/3b45c29062ff0e76e71c91b6753290400e7fa8da)
- [Cross-thread orchestration request and ship confirmation](https://github.com/openai/codex/issues/14923)
