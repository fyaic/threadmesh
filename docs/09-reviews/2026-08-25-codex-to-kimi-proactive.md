# Codex A to Kimi Code B proactive case — 2026-08-25

## Why this case matters

This is the first real ThreadMesh run in which the proactive sender and the
receiving task used materially different agent products:

- Agent A: Codex CLI through the App Server adapter;
- Agent B: Kimi Code CLI through a persistent ACP session;
- coordination: the existing ThreadMesh relationship, summary, mailbox,
  acceptance, admission, evidence, and cleanup path.

The harness did not submit a message on A's behalf. Codex received two bounded
dynamic tools and selected the exact `discover related tasks → send one
suggestion` sequence after reading B's relationship-scoped objective hint.

## Scenario

Agent A has verified an artifact checksum. Agent B owns a downstream release
manifest and cannot complete without that checksum.

Before coordination, Kimi B persisted the expected missing-dependency result.
After Codex A discovered B's bounded summary and sent the checksum, B's harness
accepted the mailbox item at a checkpoint, admitted it into the existing ACP
session, and Kimi produced the expected completed-with-dependency marker.

```text
Codex A                     ThreadMesh                    Kimi Code B
   │                            │                              │
   │ discover related tasks     │                              │
   ├───────────────────────────>│                              │
   │ B needs artifact checksum  │                              │
   │<───────────────────────────┤                              │
   │ send suggestion once       │                              │
   ├───────────────────────────>│ queue → claim → accept       │
   │                            ├─────────────────────────────>│
   │                            │       ACP turn evidence      │
   │                            │<─────────────────────────────┤
   │ delete exact task          │ delete + verify B absent     │
```

## Recorded result

| Field | Evidence |
|---|---|
| Repository | clean `main` at `e0adb0e8552ddf2c406c01172c97d390c3e05d61` |
| Sender | Codex CLI `0.145.0`, model `gpt-5.6-sol` |
| Receiver | Kimi Code CLI `0.38.0`, ACP v1 |
| Elapsed | 118 seconds |
| A tool sequence | `threadmesh_related_tasks`, `threadmesh_send_suggestion` |
| ThreadMesh sends | 1 |
| Non-ThreadMesh tools | 0 |
| Mailbox | `claimed-and-accepted` |
| Delivery | `context-admitted` |
| Receiver activated | yes |
| Application outcome score | 1 |
| Cleanup | Codex task deleted; Kimi session deleted and absence verified |

The bounded public projection was:

```json
{
  "state": "passed",
  "condition": "relevant",
  "products": {
    "sender": "codex-cli 0.145.0",
    "receiver": "kimi-code 0.38.0"
  },
  "relatedTaskCalls": 1,
  "sendCalls": 1,
  "nonThreadMeshToolCalls": 0,
  "receiverActivated": true,
  "bMarkerMatched": true,
  "outcomeScore": 1,
  "cleanup": {
    "complete": true,
    "aThreadDeleted": true,
    "bSessionDeleted": true,
    "bAbsenceVerified": true
  }
}
```

No raw prompt, transcript, task ID, session ID, local home path, credential, or
unbounded provider error is retained in this record.

The coordinator disposition reports protocol outcome `not-observed` because
this prototype confirms context admission, not an externally attested business
effect. The separate exact Kimi marker is the application-level outcome used by
this bounded benchmark; the two claims are intentionally not conflated.

## Reproduce the integration path

The safe default command uses deterministic fake Codex and ACP processes but
traverses the same cross-harness coordinator path:

```sh
npm ci
npm run validate:cross-harness:fake
```

It verifies Codex-side tool selection, one real coordinator submission,
receiver mailbox acceptance, ACP admission evidence, exact outcome, Codex task
deletion, Kimi-style session deletion, and post-delete absence.

There is intentionally no default-on real-product alias yet. The recorded live
run was an explicit maintainer experiment from the exact merged checkout. A
public live command should first reuse the repository's isolated exact-main
bootstrap and bounded result projection rather than add an easier bypass.

## What this proves

- the proactive sender and receiver do not need to share a harness;
- a Codex model can decide to use ThreadMesh while Kimi retains its own session
  lifecycle and context-admission boundary;
- the portable seam is small: task identity and summary, one bounded envelope,
  mailbox disposition, adapter evidence, and cleanup;
- the existing protocol and adapters were sufficient; no new intent or storage
  primitive was added for this case.

## What this does not prove

- production-grade authentication, multi-tenancy, or operating-system
  isolation;
- safe execution of arbitrary untrusted peer prompt content;
- general Codex-to-Kimi reliability from one run;
- autonomous accept/reject reasoning by B, because receiver acceptance was a
  deterministic harness checkpoint policy;
- concurrent user edits, stale task reuse, replica lease takeover, or crash
  recovery after loss of an in-flight admission token;
- default-on proactive coordination.

This result supports the project's central portability claim at experimental
scope. It does not widen the production or normative claims.
