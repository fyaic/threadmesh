# Ecosystem landscape

> Research snapshot: 2026-08-20. This landscape compares architectural fit,
> not project quality. Features and licenses can change; verify upstream before
> adoption or code reuse.

## The market is layered, not singular

Projects called "agent communication" often solve different layers:

1. **In-harness orchestration:** agents-as-tools, handoffs, supervisors, group
   chat, or worker trees inside one runtime.
2. **Agent interoperability semantics:** how independent agents discover each
   other and exchange tasks, messages, state, and artifacts.
3. **Messaging transport:** durable delivery, routing, encryption, multicast,
   and acknowledgements.
4. **Local coding-agent coordination:** inboxes, session wake-up, file leases,
   worktree ownership, and CLI bridges.
5. **Context governance:** whether a peer message may enter another task's
   model-visible context or change its active objective.

ThreadMesh is primarily layer 5 plus the thin contract needed to bridge layers
2–4. It should not become a new general transport or multi-agent framework.

## Comparison matrix

Legend: **Yes** means the capability is central and documented; **Partial**
means it exists with important scope limits; **No** means it is outside the
project's main abstraction; **Unknown** means the public material inspected did
not establish it.

| Project / standard | Durable existing peers | Model-selected initiation | Queue vs wake semantics | Cross-harness | Typed authority / context-entry policy | Primary contribution |
|---|---:|---:|---:|---:|---:|---|
| Codex Desktop | Yes | Yes | Partial | No | Partial | Native durable task list/read/send/fork/archive with visible relay provenance. |
| Codex Multi-Agent V2 | Tree-scoped | Yes | Yes | No | Partial | Root-scoped registry, mailbox, wake, turn lineage, and model-visible proactive policy. |
| OpenAI Agents SDK | Session/run scoped | Yes | Framework-defined | Partial providers, same SDK | Guardrails, not peer context sovereignty | Agents-as-tools and handoffs with LLM- or code-led orchestration. |
| AutoGen AgentChat/Core | Team/runtime scoped | Yes | Framework-defined | Same framework | Partial | Group chat, model-selected speakers, swarms, graph flows. |
| A2A | Yes, remote tasks | Agent implementation decides | Task lifecycle and streaming; not harness wake policy | Yes | Extensions/auth, but no standard receiver context sovereignty | Interoperable opaque agents, tasks, messages, artifacts, discovery. |
| ACP (BeeAI) | Yes | Agent implementation decides | Protocol-dependent | Yes | Partial | Earlier open agent communication protocol; repository is archived. |
| ANP | Yes | Agent implementation decides | Messaging profiles | Yes | Identity/auth focused | DID-based identity, discovery, encrypted and federated messaging. |
| AGNTCY SLIM | Addresses services/sessions | No model policy | Transport sessions and delivery | Yes | Transport security, not prompt authority | Secure low-latency P2P/group transport for A2A, MCP, RPC, or custom protocols. |
| AAMP | Yes, mailbox threads | Bridge/agent decides | Async mailbox + task intents | Yes through bridges | Sender policy and pairing; partial context policy | Task dispatch/ack/progress/help/result semantics over SMTP/JMAP mailboxes. |
| MCP Agent Mail | Yes, registered coding agents | Prompt/agent decides | Inbox, ack; external automation can steer | Yes via MCP | Contacts, leases, audit; partial prompt authority | Git/SQLite-backed mail plus searchable threads and advisory file reservations. |
| Repowire | Yes, live sessions and durable jobs | Yes through MCP | Ask/ack/notify/schedule | Yes | Partial | Local daemon and bridges for Codex, Claude Code, Gemini, OpenCode, Pi, and human surfaces. |
| Aerial | Yes | Agent/supervisor decides | Explicit durable mailbox + separate wake | Yes via CLI/MCP | Minimal | Small local-first Rust mailbox and worker supervisor. |
| agent-inbox | Yes | Prompt/agent decides | Durable mailbox + optional harness wake hooks | Yes | Minimal | Local SQLite mailbox with issued identity and explicit read/handle semantics. |
| MAGI | Session-scoped peers | Agent decides | Redis Streams + Pub/Sub wake | Codex and planned/partial Claude bridge | Minimal | Durable cross-agent messages with live App Server injection. |
| AIPass | Persistent local agents | Yes | Send versus dispatch/wake | Primarily Claude ecosystem | Role/access tiers; project specific | Persistent identity, memory, mailbox, dispatch, and workspace isolation. |

## Deep comparisons

### Codex: closest behavioral reference

Codex is the closest reference for the experience ThreadMesh wants to make
portable: the model can proactively choose coordination, and Desktop can relay
between durable tasks. Its limitations for ThreadMesh are vendor scope,
incomplete public product internals, and a message representation that has
shown provider compatibility issues.

See [the Codex deep dive](codex-orchestration-deep-dive.md).

### A2A: best semantic interoperability base

[A2A](https://a2a-protocol.org/latest/specification/) is an open standard for
communication between independent, potentially opaque agent systems. Its core
objects—Agent Card, Task, Message, Part, Artifact, and extensions—cover remote
agent discovery and task interaction better than ThreadMesh should attempt to.

A2A does not standardize whether an incoming peer message may alter a local
harness's active prompt, wake an in-flight coding task, or supersede user intent.
ThreadMesh can map its envelope to A2A messages/extensions while retaining a
receiver-local context policy.

### OpenAI Agents SDK and AutoGen: orchestration frameworks, not peer buses

[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/multi_agent/)
supports LLM-selected or code-selected orchestration through agents-as-tools and
handoffs. [AutoGen](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html)
supports round-robin teams, model-selected speakers, swarms, and graph flows.

These frameworks are strong implementation substrates when ThreadMesh controls
both peers inside one application. They do not by themselves address two
already-running, separately owned Codex and Claude Code sessions.

### SLIM and ANP: transport and internet-scale identity

[AGNTCY SLIM](https://slim.agntcy.org/latest/slim/slim-overview/) provides a
secure, low-latency data plane with P2P, group, RPC, end-to-end encryption, and
network-topology independence. It can carry A2A, MCP, or custom protocols.

[ANP](https://agentnetworkprotocol.com/en/specs/) addresses DID-based agent
identity, description, discovery, encrypted communication, and federation.

Both operate below or beyond ThreadMesh's first milestone. ThreadMesh should be
transport-pluggable so it can use them later, not reproduce them now.

### AAMP: strongest open mailbox task-semantics reference

[AAMP](https://github.com/larksuite/aamp) treats an ordinary mailbox thread as
a task control plane. It distinguishes dispatch, acknowledgement, progress,
help-needed, result, and pairing/sender policy. It also provides bridges for
multiple CLI agents.

The reusable insight is the separation of reachability, task semantics, and
runtime integration. The gap for ThreadMesh is active-context governance:
mailbox receipt alone does not define when a live harness should wake, steer, or
inject content.

### Aerial: cleanest durable-mailbox / lossy-wake split

[Aerial](https://github.com/dcdeniz/aerial) states that the mailbox remains the
source of truth and a wake event is only a notification that pending mail
exists. Dropped or duplicated wake-ups therefore do not lose a message.

This is a direct distributed-systems pattern ThreadMesh should adopt.

### Repowire: closest cross-harness product adjacency

[Repowire](https://github.com/prassanna-ravishankar/repowire) is a local control
plane for already-running agent sessions. It offers ask/ack/notify/broadcast,
schedules, jobs, a daemon, human control surfaces, and bridges including Codex
App Server.

This overlaps heavily with ThreadMesh's adapter and session-addressing goals.
Its public README frames the product as a live session mesh rather than an
orchestrator or worktree scheduler. ThreadMesh must differentiate through a
small open protocol, formal context-entry/authority semantics, conformance
tests, and transport-independent adapters.

No license was detected through GitHub repository metadata at the research
snapshot. Treat the project as design prior art unless the maintainer publishes
clear reuse terms.

### MCP Agent Mail: mature coding-agent mailbox and audit ideas

[MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail) provides
temporary-but-persistent identities, inbox/outbox, searchable threads, message
acknowledgements, Git-backed human audit artifacts, SQLite indexing, project
linking, and advisory file reservations.

Its strongest ideas for ThreadMesh are human-auditable canonical messages,
recipient mailboxes, acknowledgement, and separating task state from mail.

License caution: the repository's file is titled "MIT License (with
OpenAI/Anthropic Rider)" and adds restrictions excluding named parties and
uses. It is not standard OSI MIT. Do not copy implementation code into the
Apache-2.0 ThreadMesh repository without a separate license review.

### agent-inbox, MAGI, and AIPass: useful implementation experiments

- [agent-inbox](https://github.com/salimfadhley/agent-inbox) distinguishes
  peek from read/handle, issues identity rather than deriving it from mutable
  agent attributes, and uses optional hooks to wake supported harnesses.
- [MAGI](https://github.com/kent8192/magi-system) uses Redis Streams as durable
  history and Pub/Sub as the low-latency wake path; its Codex bridge injects
  into App Server and advances inbox state only after successful delivery.
- [AIPass](https://github.com/AIOSAI/AIPass) explores persistent agents with
  local identity, memory, mailboxes, access tiers, wake dispatch, and isolated
  working directories.

These projects are valuable test cases for adapters and conformance fixtures,
even when ThreadMesh does not adopt their full operating model.

## License and adoption notes

| Project | License signal at snapshot | ThreadMesh posture |
|---|---|---|
| A2A | Apache-2.0 | Safe candidate for protocol mapping and implementation reuse under normal notice terms. |
| OpenAI Codex | Apache-2.0 | Source-level implementation precedent; preserve attribution. |
| OpenAI Agents SDK | MIT | Candidate adapter substrate. |
| AAMP | MIT | Candidate protocol mapping and bridge study. |
| Aerial | MIT | Candidate implementation reference. |
| agent-inbox | GPL-3.0 | Interoperate or clean-room reimplement concepts; avoid copying into Apache core. |
| MCP Agent Mail | Custom MIT plus restrictive rider | Design study only pending explicit legal review. |
| Repowire | No detected license | Design study only; no code reuse. |
| SLIM | Apache-2.0 | Candidate future transport. |

This table is not legal advice.

## White-space assessment

No inspected project clearly combines all of the following as one small,
vendor-neutral contract:

- durable already-running task identity across unrelated harnesses;
- model-selected proactive outreach;
- separate notify, mailbox, wake, steer, and interrupt semantics;
- recipient-owned context-entry policy;
- freshness binding to the target's active run/objective;
- typed evidence, verification, authority, and disposition;
- hard budgets and consent controls;
- adapter conformance tests across Codex and another live harness.

That combination is ThreadMesh's defensible scope. The components individually
have extensive prior art; the integration and safety contract remain open.

## Primary sources

- [A2A specification](https://a2a-protocol.org/latest/specification/)
- [ACP repository](https://github.com/i-am-bee/acp)
- [ANP specifications](https://agentnetworkprotocol.com/en/specs/)
- [AGNTCY SLIM](https://slim.agntcy.org/latest/slim/slim-overview/)
- [AAMP repository](https://github.com/larksuite/aamp)
- [MCP Agent Mail repository](https://github.com/Dicklesworthstone/mcp_agent_mail)
- [Repowire repository](https://github.com/prassanna-ravishankar/repowire)
- [Aerial repository](https://github.com/dcdeniz/aerial)
- [agent-inbox repository](https://github.com/salimfadhley/agent-inbox)
- [MAGI repository](https://github.com/kent8192/magi-system)
- [AIPass repository](https://github.com/AIOSAI/AIPass)
- [OpenAI Agents SDK orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [AutoGen teams](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/teams.html)
