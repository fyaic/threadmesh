# What ThreadMesh is

ThreadMesh connects independent agent sessions to an explicitly shared local
workspace. The aim is simple: **you should not have to relay every useful change
between agents yourself**.

A session is one agent conversation with its own task and context. A harness
is the application running it, such as Codex or Pi. ThreadMesh connects opted-in
workstreams; it does not merge their conversations or become their model.

## The concrete problem

You have Codex changing an API and Pi maintaining its client. When pagination
changes, the client needs that information. Normally you notice the dependency,
copy the change and explain it in the other session.

With the workspace integration:

1. You publish each session's work goal once.
2. The agents receive collaboration tools and generic task-time guidance.
3. A model decides whether a discovered peer needs useful information.
4. Advice enters a persistent inbox. The recipient judges it against its task.
5. An opted-in idle Pi can continue in its same session and act on the advice.

The [real Codex → Pi API case](../09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass)
completed that path and passed a client behavior check. Pi had first volunteered
its dependency; Codex replied after its ordinary API task. No human relayed it.

## What exists today

- A local CLI to initialize a room, launch named workstreams, inspect and mute.
- Four model tools: discover peers, send advice, read/decide inbox messages,
  and save a portable checkpoint.
- Pi native integration and Codex/Kimi/official DeepSeek launch paths, with
  different evidence levels and wake capabilities.
- An explicit checkpoint command for starting a new harness with saved context.
- A reusable core coordinator, MCP entry point and lower-level JavaScript SDK.

See the [versioned support matrix](harness-support.md), not just a product logo.
The current package has runtime dependencies and is GitHub-distributed alpha;
it is not a production service or an npm-published release.

## What the “intelligence” means

Models choose relevance and message content under configured collaboration
guidance. ThreadMesh supplies discovery, persistence, provenance and lifecycle
integration. It does not hard-code every handoff or guarantee useful choices.

A real unrelated-change control stayed quiet despite available peer/inbox tools.
A second copy case delivered and resumed correctly but lost a free-plan qualifier.
**A successful message is not a verified business result.**
[Successes and failures](../09-reviews/2026-09-05-workspace-awareness.md).

## Who it helps—and who it does not

Try it if you already run parallel agent tasks and repeatedly copy API decisions,
approved constraints or research findings between them. Harness developers can
use the [MCP surface](../06-guides/first-workspace.md#kimi-and-custom-harnesses)
or [SDK adapter contract](../06-guides/implement-an-adapter.md).

For a single conversation or a fully predetermined workflow, the extra
coordination may be unnecessary. This alpha is a same-owner local setup, not an
open agent network, multi-tenant security boundary or arbitrary-tab connector.

## Context and control

Published goals and peer advice are shared; private histories are not scanned.
Inbox reads do not consume messages. Acceptance is a separate disposition, not
proof that work passed tests; workspace advice may be shown to the model so it
can decide what to do. Pi idle follow-up requires explicit opt-in.

Portable checkpoints carry selected working context, not hidden state, tool
permissions or a lossless transcript. Actual quota-blocked long-session recovery
and native prior-session adoption remain open checks.

## Start here

[First workspace](../06-guides/first-workspace.md) ·
[Real cases](../06-guides/real-world-cases.md) ·
[Checkpoint guide](../06-guides/portable-checkpoints.md) ·
[Safety model](../04-safety/threat-model.md) ·
[Roadmap](../../ROADMAP.md)

For implementation details, read the [reference architecture](../02-architecture/reference-architecture.md)
and [protocol](../03-protocol/README.md). Historical benchmark records remain
available, but are not prerequisites for trying the current workspace.
