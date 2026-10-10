# What ThreadMesh is

ThreadMesh helps independent agent tasks share relevant changes while keeping
their own context and decisions, reducing the information you carry between chats.

For example, one agent changes an API while another maintains its client.
The client needs the new pagination rules, but must keep its existing timeout
and retry behavior. Useful collaboration means the receiving agent makes the
right change in its own task—not merely that a message arrives.

## Two ways to use it

| Path | What it provides | Entry and status |
|---|---|---|
| Codex native-task skill | Sharing scope and handoff guidance using Codex's own task tools | [Candidate plugin](../06-guides/codex-native-tasks.md); installed use and old-task loading unverified |
| Local workspace | Peer discovery, persistent advice inboxes and portable checkpoints for supported agent applications | [CLI v0.1.0-alpha.3](../06-guides/first-workspace.md); distributed as a GitHub package |

The skill is optional when Codex already meets your needs. It does not supply
native messaging or the workspace's storage. Its added value over using Codex
directly has not been measured. See [native capabilities and current value](native-capabilities-and-value.md).

The CLI sample starts new sessions, not existing desktop chats. Codex, Pi, Kimi
and DeepSeek have different [capabilities and evidence](harness-support.md).
A “session” is a conversation; a “harness” is the application running it.

## How workspace collaboration works

1. You publish a work goal for each participating session.
2. Agents receive peer tools and task-time collaboration guidance.
3. A model decides whether another task needs a relevant change or question.
4. Advice enters a persistent inbox. The recipient checks it against its own task.
5. Where supported and explicitly enabled, an idle recipient continues in the
   same session and works on the advice.

The [Codex → Pi API case](../09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass)
completed this path and passed a client behavior check. Pi first volunteered
its dependency; Codex replied after its ordinary API task. No human relayed it.
Automatic continuation is integration-specific, not a property of every inbox.

## What is available

The CLI creates a local room, launches named tasks and lets you inspect or mute
them. Four model tools cover discovery, advice, inbox decisions and checkpoints.
Checkpoints supply saved context to a new session in a supported application.

Developers can use [MCP](../06-guides/first-workspace.md#kimi-and-custom-harnesses)
or the [SDK](../06-guides/implement-an-adapter.md). The CLI requires Node and
runtime dependencies; it is not an npm-registry release.

## Evidence and limitations

Models choose relevance and message content under collaboration guidance.
ThreadMesh does not guarantee those choices. An unrelated-change control stayed
quiet, while a copy case delivered and resumed but omitted a free-plan qualifier.
**Successful delivery is not a verified business result.**
[Read the successes and failures](../09-reviews/2026-09-05-workspace-awareness.md).

Controlled native-task and CLI samples produced useful edits. Desktop-plugin
adoption, old-task loading, independent first use and gains over native Codex
remain unverified. Preview agents are simulated; DeepSeek lacks live initiative
evidence. See the [case portfolio](../06-guides/real-world-cases.md).

## Context and control

Each route uses explicit participation and sharing scope, without merging chats
or globally scanning or broadcasting their histories. Native task reads stay
within the selected, authorized scope. The workspace shares published goals and
advice. Reading an inbox does not consume a message;
acceptance is a separate decision and is not proof that the resulting work passed.
Pi idle follow-up requires explicit opt-in.

The native skill relies on the host's tools and permissions. Its guidance does
not enforce isolation or eliminate races with new user input. The workspace
alpha is a same-owner local setup, not a multi-tenant security boundary.
[Permissions and threats](../04-safety/threat-model.md).

Checkpoints carry explicitly saved context, not hidden state, tool permissions
or a lossless transcript. Recovery of a real quota-blocked long conversation
remains unverified. [Checkpoint guide](../06-guides/portable-checkpoints.md).

For a single conversation, or when native tools already cover coordination,
extra setup may not help. Implementation and history are linked from the
[documentation index](../README.md#explore-the-implementation).
