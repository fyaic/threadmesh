# Real Codex attention seam: live evidence

Date: 2026-08-31  
Scope: M5.1 of [issue #91](https://github.com/fyaic/threadmesh/issues/91)  
Product: Codex App Server / CLI `0.145.0`  
Model: `gpt-5.6-sol` through provider `openai`  
Accepted repository head: `3d5caee4ea28176b9a935152d984c0aaa5b3cdd1`

## Verdict

M5.1 passes. In the accepted live run, a real persistent Codex session A
selected ThreadMesh relationship discovery and dependency publication through
model tool calls. A durable cursor event then caused ThreadMesh to resume an
already-created, distinct Codex session B exactly once. B accepted the handoff,
the adapter recorded the exact receiver turn, a locally simulated verifier
bound the result, the dependency became satisfied, and B recovered as `ready`
after a SQLite restart.

This is evidence of **turn-scoped model initiative plus a durable ThreadMesh
logical wake**. It is not a claim that Codex natively pushes into an idle
session: the adapter still reports `idleWake: false`. It is also not evidence
of independent external verification, because this run generated its Ed25519
verifier inside the isolated scenario and reports
`verificationMode=local-simulation`.

M5.2 and M5.3 remain open. One successful dependency handoff does not yet prove
the complete implementation → review → fix → independent-verify workflow or
its three-run reliability and negative-condition matrix.

## Execution history

All attempts used the repository's bounded live runner. It re-executed from a
detached worktree at the exact clean GitHub `main` SHA, projected only bounded
public evidence, and checked exact Codex-thread, SQLite, worktree, and repository
cleanup before accepting a result.

| Attempt | GitHub `main` | UTC interval | Result | Disposition |
|---|---|---|---|---|
| 1 | `adfc19149ed0f764a0493313370660cdbe5bb290` | 09:34:43–09:38:48 | `codex_app_server_operation_timeout` | Exposed an insufficient live-turn timeout; no pass claimed. |
| 2 | `e7db5d0fdcdbe10d781e8315b652e56bebc94f63` | 09:44:49–09:46:30 | `threadmesh_codex_attention_receiver_evidence_mismatch` at `b-receiver` | Proved that A's decision and B's turn were reached; exposed a raw-evidence projection mismatch. |
| 3 | `3d5caee4ea28176b9a935152d984c0aaa5b3cdd1` | 09:49:47–09:54:30 | `passed` | Accepted M5.1 evidence. |

The fixes are preserved in
[#96](https://github.com/fyaic/threadmesh/pull/96),
[#97](https://github.com/fyaic/threadmesh/pull/97), and
[#98](https://github.com/fyaic/threadmesh/pull/98). The failed attempts are
recorded because they demonstrate fail-closed behavior and explain the two
live-boundary corrections; they are not counted as passes.

## Accepted evidence

### Initiative and activation

| Field | Accepted value |
|---|---|
| `modelSelectedCommunication` | `true` |
| `scriptedSubmitCount` | `0` |
| `manualRelayActions` | `0` |
| `modelPollingTurns` | `0` |
| `relatedTaskCalls` | `1` |
| `publishCalls` | `1` |
| `nonThreadMeshToolCalls` | `0` |
| Agent A tool sequence | `threadmesh_related_tasks`, then `threadmesh_publish_dependency` |
| Lifecycle event | `dependency-satisfied` |
| `cursorEventObserved` | `true` |
| `wakeCursor` | `1` |
| `receiverResumeCount` | `1` |
| `receiverActivated` | `true` |
| Receiver decision | `accepted` |

A and B were distinct persistent Codex threads. B was created before A's
publication and the exact same B thread received the resulting turn; the runner
did not create a replacement receiver after observing the event.

### Routing, evidence, and durable effect

| Field | Accepted value |
|---|---|
| Route reason | `attention-offer-authorized` |
| Wake reason | `attention-wake-reconciled` |
| Delivery | `adapter-submitted` |
| Outcome | `externally-verified` |
| Verification mode | `local-simulation` |
| External reason | `dependency-satisfied-verified` |
| Dependency status | `satisfied` |
| Unlock | `true` |
| Restart recovered | `true` |
| Recovered task state | `ready` |
| Mailbox | `claimed-and-accepted` |

The state transition remained ordered: publication and acceptance alone did
not count as verification or silently grant execution authority. The local
verifier disposition was applied before the durable edge was satisfied and the
dependent task unlocked.

### Correlation digests

The public record keeps digests rather than raw transcripts or account data:

- adapter snapshot:
  `sha256:c002bc7f6c626261612c683458d14aa4e39cc98a18ce87aa274d42787bf40634`
- Agent A thread:
  `sha256:3a64b2f417bebdf5f72bb2b96e44176f4acf4d479cbf06ccf09198d81b0a3066`
- Agent B thread:
  `sha256:c1630bac0013945a779a4bd6f8c410a476c7f5da746131d745631471f10cefaf`
- receiver turn:
  `sha256:fbee2122dbfa21be40ef905fd3a0d4a1ae92bca4d7666fb73782e47ca7cddd50`
- lifecycle event:
  `sha256:f34c3d702aa51b4f254284110e5b393e371ba29d88a3b67014c74ad182d7e406`
- verification disposition:
  `sha256:20b6a765906c4587d57b41c7d4aad912efd9f5ffc80ea7f5c816c297406a78d0`
- dependency edge:
  `sha256:b50662673df82df2c0e25114d91182000b769011101b07f5708eb8e2653fa19e`

The bounded message identifier was
`msg_codex_attention_attention01`. All reported thread-binding, receiver-turn,
snapshot, receipt, disposition, dependency-edge, and restart-recovery checks
were `true`.

## Cleanup and repository boundary

- Both exact Codex threads were deleted.
- The scenario database and short-lived session state were removed.
- Detached-worktree cleanup completed.
- Original HEAD, remote GitHub `main`, and expected SHA all remained
  `3d5caee4ea28176b9a935152d984c0aaa5b3cdd1`.
- The original repository boundary was clean after the run.

## What this changes—and what it does not

The deterministic attention-router slice in
[#95](https://github.com/fyaic/threadmesh/pull/95) is no longer the only M5
evidence. M5.1 now demonstrates a real model-selected A action, a durable event,
and an exact persistent-B resume without user relay or polling turns.

The evidence does **not** close #91. The next gate is M5.2: real persistent
implementer, reviewer, and independent verifier roles must produce and bind
actual implementation, review-failure, fix, and verified-completion effects.
M5.3 must then pass three fresh relevant runs plus manual-baseline, irrelevant,
unverified, stale, restart/replay, and injected-cleanup conditions.
