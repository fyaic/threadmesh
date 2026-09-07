# If Codex already does this, why ThreadMesh?

**You may not need ThreadMesh.** On the tested Codex desktop host, native tools
already read task status, send messages to another task, attribute their source
and continue the receiver. The model can choose those tools without ThreadMesh
inventing the communication capability. The original “sent from another task”
moment belongs to Codex, not to this project.

The official [App Server lifecycle](https://learn.chatgpt.com/docs/app-server#lifecycle-overview)
also documents threads, continuation, active-turn steering and events. It does
not establish that every desktop distribution exposes the same cross-task tools.
Our [native task record](../evidence/codex-native-2026-09-07/README.md) establishes
the narrower observed host behavior. App Server primitives are not an API for
silently attaching an external service to arbitrary existing desktop tasks.

## Two routes, different responsibilities

| Capability | Native Codex + ThreadMesh skill | ThreadMesh workspace / adapters |
|---|---|---|
| Model reasoning and deciding relevance | Codex model, guided by the skill | Host model, guided by tools/context |
| Cross-task transport, source badge, native continuation | **Codex supplies these** | ThreadMesh protocol/coordinator and supported adapter supply routing; wake is host-specific |
| Selected goals, advisory scope, busy/stop behavior | Model-followed skill instructions; not enforced isolation | Explicit room membership, mute, bounded sends and receiver dispositions; same-owner local boundary |
| Durable mailbox and message disposition | Codex native history; no ThreadMesh mailbox in this route | SQLite mailbox and separate delivery/decision/outcome fields |
| Portable work checkpoint | Not supplied by the native skill | Explicit saved checkpoint, not full transcript or permission migration |
| Evidence so far | One controlled prior-context pair, own receiver edit and busy/stop checks | Versioned maintainer runs and one independent first-use report; gaps vary by adapter |

Implementation: [native skill](../../plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md),
[workspace](../../src/workspace/local-workspace.mjs),
[compatibility and failures](harness-support.md).

Do not transfer workspace persistence, admission or mute enforcement into a claim
about the skill-only desktop path. Conversely, a native desktop success does not
prove an external cross-harness adapter can do the same thing.

## What is valuable today—and what is still a hypothesis

The native skill is a reusable, reviewed opt-in workflow: selected peers/topics,
narrow advisory messages, fresh status checks, retained constraints, stop behavior
and an explicit distinction between delivery and useful completion. Its incremental
value is **modest today**. A user can express similar rules directly to Codex.
The successful demonstration proves that this workflow can work, not that it is
necessary, unique, more reliable or faster than native Codex alone. There is no
matched native-only versus skill comparison yet.

The workspace route additionally implements shared coordination primitives for
supported integrations and explicit portable checkpoints. That is real code,
but generic desktop plug-and-play, meaningful quota-blocked recovery and broad
cross-product correctness remain unproven. Architecture alone is not user value.

**Use native Codex directly** if its existing task tools already solve your
same-client need with acceptable setup and control. Try the skill for repeatable
scoped collaboration guidance. Consider the workspace when you actually need a
persistent cross-session inbox or supported cross-harness integration and accept
its current setup cost. For one conversation, add neither layer.

## The product must earn its place

The immediate promise to work toward is: **tell related tasks once, stop being
their messenger, and see whether the receiving task actually acted correctly.**

1. Make pairing usable in Codex without copying IDs, editing JSON or installing
   a developer runtime. Preserve explicit selection and user control.
2. Retain user decisions across useful handoffs and expose pending versus applied
   state. A delivery badge alone is not sufficient.
3. Save reviewed proof from actual user work. Then compare native-only use with
   the smallest ThreadMesh addition: setup burden, manual relays, useful edits,
   unwanted contacts and failure recovery—not messages sent or internal test counts.

If that comparison shows no useful gain, keep the Codex integration a small
optional recipe instead of inflating it into a platform. Portable coordination
must independently earn its own use case. Community growth follows repeatable
first-user success and honest evidence, not a promised star count.
