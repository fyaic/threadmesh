# End-to-end A-to-B demonstration

This demonstration is the shortest executable explanation of ThreadMesh. It
runs the same release-dependency story under three conditions and verifies both
useful communication and non-interference.

## Scenario

Agent A has produced an artifact checksum. Agent B owns a downstream release
manifest.

| Condition | What A can discover | Expected behavior |
|---|---|---|
| `control` | No cross-task contact is requested | A uses no ThreadMesh tool; B remains unchanged |
| `relevant` | B is waiting for the artifact checksum | A discovers B, sends one suggestion, and B completes after accepting it |
| `irrelevant` | The related task only owns release-note typography | A reads the summary but does not send the checksum or activate B |

The important comparison is not “message delivered.” It is “the relevant
message improved B's outcome while the control and irrelevant cases stayed
quiet.”

## Run it

Requirements: Node.js 22 or newer and npm.

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
npm run validate:behavior:fake
```

The command returns a JSON result with one entry per condition. A passing run
has these invariants:

| Field | Control | Relevant | Irrelevant |
|---|---:|---:|---:|
| `relatedTaskCalls` | 0 | 1 | 1 |
| `sendCalls` | 0 | 1 | 0 |
| `receiverActivated` | false | true | false |
| `outcomeScore` | 0 | 1 | null |
| `cleanup.complete` | true | true | true |

The deterministic run uses a fake Codex App Server process. It proves adapter,
policy, mailbox, evidence, and cleanup behavior. It does not count as evidence
that a real model made an intelligent decision.

## Cross-harness demonstration

The next command keeps Agent A on the Codex App Server contract but moves Agent
B to a persistent ACP session. It is deterministic and does not call a model:

```sh
npm run validate:cross-harness:fake
```

The test proves this exact sequence:

```text
Codex Agent A               ThreadMesh                  ACP Agent B
      │                         │                            │
      │ related-task lookup     │                            │
      ├────────────────────────>│                            │
      │ bounded objective hint  │                            │
      │<────────────────────────┤                            │
      │ one suggestion          │                            │
      ├────────────────────────>│ mailbox → accept → admit   │
      │                         ├───────────────────────────>│
      │                         │       outcome evidence     │
      │                         │<───────────────────────────┤
      │ exact task deletion     │   session delete + absence│
```

This is the portable seam: A's initiative is expressed through bounded tools;
ThreadMesh owns relationship policy and the mailbox; B's harness owns context
admission and lifecycle cleanup.

## What happens internally

```text
Owner/control plane
  ├─ registers exact A and B task incarnations
  ├─ authorizes A --suggest--> B
  └─ exposes only B's relationship-scoped objective hint

Agent A
  ├─ calls threadmesh_related_tasks
  ├─ decides whether B materially needs the checksum
  └─ relevant only: calls threadmesh_send_suggestion once

ThreadMesh
  ├─ rechecks task, relationship, grant, expiry, and sender identity
  ├─ persists the envelope in B's mailbox
  └─ records claim, acknowledgement, admission, and disposition

Agent B harness
  ├─ polls at a checkpoint
  ├─ accepts the suggestion
  ├─ renders provenance plus content into B's context
  └─ confirms product evidence and deletes the validation task
```

No test script calls `submit` on behalf of Agent A in the relevant condition.
A receives two schema-bounded dynamic tools and must choose the exact
`related tasks → send suggestion` sequence itself.

## Minimal harness integration

The public SDK deliberately exposes a small surface:

```js
const related = await sender.discoverRelated({ task: target, relationshipId });

if (related.coordination.intents.includes("suggest")) {
  await sender.sendSuggestion({
    messageId,
    from: source,
    to: target,
    relationshipId,
    content: "Verified artifact checksum: sha256:…",
    reason: "The receiver declared this artifact as a dependency.",
    ttlMs: 5 * 60 * 1000,
  });
}

const page = await receiver.pollMailbox({ receiver: target });
for (const message of page.messages) {
  await receiver.decide({ message, decision: "accepted" });
}
```

See [`examples/minimal-harness.mjs`](../../examples/minimal-harness.mjs) for the
complete transport example,
[`examples/proactive-tool-bridge.mjs`](../../examples/proactive-tool-bridge.mjs)
for native tool wiring, and [implement an adapter](implement-an-adapter.md) for
the integration contract.

## Real-product evidence

The repository keeps deterministic demonstration results separate from real
model evidence:

- Codex App Server has produced a successful relevant A-to-B run in which A
  selected both ThreadMesh tools, B accepted the context, and the outcome score
  changed from 0 to 1.
- Repetitions were not reliable enough for default enablement. The current
  outcome-based gate scores A by the exact ThreadMesh tool sequence and actual
  coordinator send rather than its final prose. A two-stage policy on `a134b39`
  then passed three relevant runs in a row in 85, 88, and 132 seconds. A current
  control made no tool call, while a current irrelevant run made one read-only
  lookup and no send. Every run deleted both tasks.
- Kimi Code `0.38.0` completed a real receiver-accepted suggestion through the
  same coordinator and verified session absence after deletion.
- On `e0adb0e`, Codex CLI `0.145.0` and `gpt-5.6-sol` acted as A while Kimi Code
  `0.38.0` acted as persistent B. In 118 seconds A selected exactly
  `related tasks → send suggestion`, Kimi consumed the admitted checksum and
  returned the expected outcome, and both resources passed exact cleanup.

Read the [Codex behavior repetitions](../09-reviews/2026-08-25-codex-behavior-repetitions.md),
[Kimi live pass](../09-reviews/2026-08-25-kimi-code-live-pass.md),
[Codex-to-Kimi case study](../09-reviews/2026-08-25-codex-to-kimi-proactive.md), and
[real-product runbook](../09-reviews/real-product-e2e-runbook.md) for the exact
claims and limitations.

The public-package portability case uses Pi as a materially different sender
harness. A fresh consumer imports only `@fyaic/threadmesh`, Pi performs the same
relevant/irrelevant/control decision matrix, and the relevant path reaches a
persistent Kimi ACP receiver. Read and reproduce the
[Pi-to-Kimi demo](pi-to-kimi-demo.md).

## What to try next

- Replace the fake App Server with an adapter for your harness.
- Keep relationship discovery read-only and bounded.
- Admit suggestions only at an explicit receiver checkpoint.
- Compare a relevant condition with both no-contact and irrelevant controls.
- Treat cleanup, provenance, and unwanted sends as acceptance criteria, not
  implementation details.
