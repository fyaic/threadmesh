# M5 real Codex loop plan

This plan turns the deterministic attention-router slice into the real Codex
evidence required by [issue #91](https://github.com/fyaic/threadmesh/issues/91).
The issue remains open until the complete evidence matrix in M5.3 passes. A
scripted participant, a fixed output marker, or one successful suggestion is
not a substitute for the implementation → review → fix → verify loop.

## Non-negotiable semantics

- The implementer and reviewer are separate, persistent Codex sessions reached
  through the supported Codex App Server adapter.
- After scenario start, user copy/paste, manual relay, scripted coordinator
  submission, and model-driven status polling are all zero.
- A model action counts only when an observed Codex tool call causes the
  corresponding durable ThreadMesh event. Final prose is not evidence.
- Delivery, receiver acceptance, context admission, verification, dependency
  satisfaction, and task unlock remain separately observable states.
- The Codex adapter declares `idleWake: false`. ThreadMesh must not imply that
  Codex supplies a native idle-session wake. The product's logical wake is a
  bounded trigger derived from `waitTask` durable-cursor reconciliation; that
  trigger starts or resumes a receiver turn only after a relevant persisted
  event is found.
- A locally generated verifier key is acceptable for deterministic plumbing
  tests only. It must be labelled a local verifier simulation and must never be
  presented as an independent external verification service.

## M5.1 — Real Codex dependency wake and unlock seam

Goal: replace one scripted participant boundary with a real persistent Codex
receiver while retaining the already-tested durable dependency state machine.

Implementation sequence:

1. Start a persistent Codex dependent session and bind its exact thread and
   snapshot identity to a registered ThreadMesh task.
2. Persist a current dependency edge and an authorized
   `dependency-satisfied` event addressed to that task.
3. Reconcile `waitTask` from the receiver-owned cursor with no wake hint. Only a
   relevant durable event may cause the harness to resume the Codex thread.
4. Record the route reason, mailbox claim, receiver-owned decision, admission,
   adapter receipt, and resulting Codex turn identity.
5. Verify that receipt or acceptance alone leaves the dependency waiting. Apply
   trusted verification, satisfy the edge, and observe the persisted dependent
   task become ready only when every current inbound dependency is satisfied.
6. Restart the coordinator and read the task, edge, satisfaction, disposition,
   and cursor from persisted state. Exact replay must not create another turn
   or unlock.
7. Delete the exact Codex thread and all temporary runtime state on success,
   failure, and timeout, then confirm absence.

M5.1 passes only if the real receiver turn is causally bound to the durable
event and the result reports zero manual relay, zero model polling turns, zero
irrelevant activations, and zero incorrect unlocks. This seam is integration
evidence, not yet proof of session initiative or an independent verifier.

## M5.2 — Complete implementation, review, fix, and verify loop

Goal: prove useful session initiative across three or four persistent sessions.
The exact implementation and no-go boundaries are frozen in the
[M5.2 implementation contract](m5-2-implementation-contract.md); partial
scenario output must not be projected as a pass.

Required roles and effects:

1. An implementer changes a bounded fixture, creates an implementation commit,
   runs its checks, and model-selects `artifact-ready` with evidence bound to
   that commit.
2. A reviewer wakes from the durable event, accepts the handoff, reviews the
   exact implementation commit, and model-selects `review-failed` with a real,
   bounded finding.
3. The same implementer session receives the admitted finding, produces a fix
   commit, reruns the checks, and publishes new evidence.
4. An independent verifier session or service evaluates the exact fix commit
   and publishes trusted verified completion. If a fourth participant is not
   used, the evidence source must still be independent of the implementer's
   assertion.
5. The coordinator records `dependency-satisfied` and advances the next
   approved task. No peer message silently becomes execution authority.

The runner may create identities, grants, isolated worktrees, and bounded tool
surfaces. It may not choose lifecycle actions for the models, manufacture the
review finding, submit events on a model's behalf, or prompt the exact target
and payload needed to pass. Evidence must bind the clean base SHA,
implementation SHA, reviewed SHA, fix SHA, verifier claim, message IDs, turn
IDs, and UTC transition times.

M5.2 passes when the complete business effect is observable from repository,
Codex, coordinator, and inspector records. A mailbox entry, accepted message,
fixed output marker, or one A-to-B suggestion is insufficient.

## M5.3 — Closure evidence matrix

Goal: demonstrate that the useful path is repeatable, quieter than the native
workflow, and fail-closed outside the relevant case.

Run the following from fresh isolated state:

| Condition | Minimum evidence | Pass condition |
|---|---|---|
| Relevant | Three complete runs | 3/3 full loops; zero relay, polling, irrelevant wakes, or incorrect unlocks |
| Manual/native baseline | Same fixture and role boundaries | Count user relay, copy/paste, polling turns, and elapsed time; ThreadMesh removes at least one meaningful relay |
| Irrelevant | One unrelated authorized Codex session | Read-only discovery is allowed; send, wake, and receiver turn are all zero |
| Unverified | Accepted event without trusted verification | Dependency and dependent task remain locked |
| Stale | Old run, objective, checkpoint, or edge version | No receiver effect or unlock; reason is persisted |
| Restart/replay | Restart at a coordination boundary | Same sessions and state recover; no duplicate send, turn, acceptance, or unlock |
| Failure cleanup | Inject failure after each created resource class | Every exact thread, worktree, database, WAL/SHM file, isolated home, and temporary credential is removed |

Each run must preserve a private exact-correlation record and a redacted public
record. The record includes Codex and model versions, clean base SHA, all
business commits, bounded evidence digests, thread/turn correlation, routing
reasons, receiver dispositions, verification and unlock state, cursor
checkpoints, UTC timing, and cleanup confirmation. Public evidence must not
contain raw transcripts, account data, secrets, or absolute local paths.

Current checkpoint (2026-09-03): the deterministic relevant 3/3, irrelevant,
stale/unverified, restart/replay, and failure-cleanup matrix passes. A real
operator-triggered control also completed with nine actions and exact cleanup.
Its same-condition ThreadMesh arm failed closed at reviewer admitted-turn
reconciliation, so `manualBaselineCompared` and real-product
`relevantLoopPasses=3/3` remain false. See the
[M5.3 record](../09-reviews/2026-09-03-m5-3-baseline-and-matrix.md).

## Reviewer closure checklist

Issue #91 may close only when every item below is true:

- `realCodexSessions=true`
- `modelSelectedLifecycleActions=true`
- `scriptedSubmitCount=0`
- `manualRelayActions=0`
- `modelPollingTurns=0`
- `relevantLoopPasses=3/3`
- `irrelevantReceiverActivations=0`
- `receiverAcceptedAndAdmitted=true`
- `verifiedFixCommitBound=true`
- `incorrectUnlocks=0`
- `restartRecovered=true`
- `manualBaselineCompared=true`
- `cleanup.complete=true` for successful and failed runs

Keep the issue open if any result relies on scripted participants, a harness
submit on behalf of a model, an unconditional receiver acceptance, a temporary
new receiver instead of the bound persistent session, sender assertion as
verification, a fixed marker without the repository effect, user intervention
after scenario start, or incomplete exact cleanup.
