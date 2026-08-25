# What ThreadMesh is

ThreadMesh is a permissioned coordination layer for agent tasks that run in
separate sessions or harnesses.

Its job is narrow: let one task discover a pre-authorized relationship, offer a
bounded piece of information to another task, and let the receiving harness
decide whether that information enters its agent context.

ThreadMesh does **not** merge chat histories, give agents global session access,
or let one agent silently rewrite another agent's objective.

## The concrete problem

Imagine two coding-agent tasks running at the same time:

- Agent A builds an artifact and computes its verified checksum.
- Agent B prepares a release manifest and cannot finish without that checksum.

Without a coordination layer, the user must notice the dependency, copy the
checksum from A, find B, and paste it into the right session. A naïve automation
can remove the manual step, but it may also inject stale or malicious text into
B, contact the wrong incarnation of B, or interrupt work the user has since
repurposed.

With ThreadMesh:

1. the owner authorizes a directional relationship between the exact A and B
   task incarnations;
2. B publishes a minimal relationship-scoped summary, not its private history;
3. A may discover that summary and choose whether the result is useful;
4. A sends one typed, expiring `suggest` envelope with provenance;
5. B's harness receives it in a mailbox and accepts, rejects, or defers it at a
   checkpoint;
6. only an accepted message is rendered into B's context, with its peer-agent
   origin preserved;
7. the complete decision and delivery chain remains auditable.

The agent supplies the initiative. ThreadMesh supplies the boundary.

## Where it sits

```text
Models and agent loops
  Codex · Kimi Code · Gemini CLI · custom harnesses
                      │
Harness adapters      │ translate task lifecycle and context admission
                      ▼
ThreadMesh            relationships · mailbox · policy · provenance · audit
                      │
Transport/storage     JSON-RPC · SQLite reference · host-defined deployment
```

MCP gives an agent tools. A2A can transport interactions between agent
endpoints. Workflow engines schedule known steps. ThreadMesh focuses on a
different gap: the authorization and receiver-consent semantics for a task that
proactively decides another task matters.

## Who should use it

ThreadMesh is intended for harness and platform developers who:

- run multiple agent tasks or sessions concurrently;
- need coordination across different harness implementations;
- want agents to notice dependencies without exposing global chat history;
- require receiver consent, expiry, replay protection, and provenance;
- are willing to integrate a small task registry and mailbox at harness
  checkpoints.

It is probably unnecessary for a single conversation, a fixed workflow whose
edges are already known, or an application that only needs ordinary tool calls.

## What exists today

The repository is pre-alpha but executable:

| Capability | Current evidence |
|---|---|
| Portable harness API | Zero-runtime-dependency `@fyaic/threadmesh` SDK with register, discover, suggest, poll, decide, and a per-turn proactive tool bridge |
| Reference control plane | Authenticated JSON-RPC binding and SQLite coordinator with grants, mailbox, claims, receipts, replay defense, and audit |
| Deterministic demo | Control, relevant, and irrelevant A-to-B conditions run through the complete coordinator path |
| Codex App Server | The bounded two-stage proactive policy passed relevant 3/3 plus quiet control and irrelevant checks; it remains explicit opt-in |
| Kimi Code ACP | A real accepted suggestion completed through the shared coordinator path with session cleanup verified |
| Cross-harness proactive case | Real Codex A discovered and sent once; persistent Kimi Code B accepted and completed, with both resources cleaned |
| Gemini CLI | Adapter and no-model preflight exist; live provider execution has not been authorized |

This proves an integration shape and a bounded experimental capability. It does
not prove production multi-tenant security, reliable autonomous discovery, or
safe handling of arbitrary untrusted peer prompts.

## Fastest way to understand the project

1. Run the [end-to-end demonstration](../06-guides/end-to-end-demo.md).
2. Read [context sovereignty](../01-concepts/context-sovereignty.md).
3. Follow the [30-minute adapter guide](../06-guides/implement-an-adapter.md).
4. Check [current project status](../10-planning/project-status.md) before using
   experimental adapters.
