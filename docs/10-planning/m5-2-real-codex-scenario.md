# M5.2 real Codex scenario plan

> Status: implementation plan, not pass evidence. This plan refines the
> [M5.2 implementation contract](m5-2-implementation-contract.md) into a
> runnable sequence without relaxing any of its go/no-go gates.

## Outcome

Prove that three pre-created persistent Codex sessions can complete a useful
implementation, review, same-session fix, and independent verification loop
without user relay or model polling. ThreadMesh may provide bounded tools and
mechanically promote observed actions; it must not choose the handoff,
acceptance decision, review finding, fix, or verification request for a model.

## Topology

| Participant | Persistent responsibility | Trust boundary |
| --- | --- | --- |
| Implementer A | Create the implementation and later fix it in the same thread and worktree | Cannot verify its own completion |
| Reviewer R | Accept or defer the offer, inspect the exact implementation, and report a finding it discovered | Never receives the sealed expected finding |
| Verifier V | Accept or defer the fixed candidate and choose whether to request exact-chain verification | Model prose is not trusted verification |
| Verifier service | Directly check the isolated repository and sign the bound result | Starts before the scenario; private key remains in the child process |

The service public anchor is pinned before the coordinator creates the evidence
requirement. The implementer, reviewer, and verifier task incarnations and
adapter references are frozen into that requirement.

## Bounded dynamic tools

All repository writes go through bounded tool callbacks; unrestricted shell
execution is not part of the test surface.

| Turn | Tools | Required effect |
| --- | --- | --- |
| A implementation | `threadmesh_fixture_write`, `threadmesh_commit_implementation`, `threadmesh_publish_artifact` | One allowlisted descendant commit and a model-selected publication |
| Every receiver | `threadmesh_decide_offer` | Receiver selects `accepted` or `deferred` with a bounded reason |
| R review | `threadmesh_review_read_artifact`, `threadmesh_report_review_finding` | Model reports a finding that the sealed evaluator can reproduce |
| A fix | `threadmesh_fixture_write`, `threadmesh_commit_fix`, `threadmesh_publish_dependency` | Same thread/worktree creates a direct descendant fix |
| V verification | `threadmesh_verify_exact_chain` | Model requests the already-pinned independent service response |

Callbacks may validate arguments, execute a bounded write or Git operation,
evaluate a model-proposed finding, call the pre-started verifier service, and
stage an intent. A callback must not directly submit a lifecycle event, accept
an offer, admit peer context, append trusted evidence, or unlock a dependency.

## Durable promotion rule

Every tool callback first records a private intent:

`observed -> completed-turn-bound -> promoted`

The intent key binds the adapter thread, tool ordinal, canonical argument
digest, expected evidence-chain head, and scenario identifier. Only after the
adapter returns a completed turn may the runner match the observed tool call,
attach the turn evidence, and promote the intent. A failed or unmatched turn is
`abandoned`; final prose cannot reconstruct the missing action.

## Execution sequence

1. Start the verifier service and pin its public trust anchor. Create the
   isolated repository, coordinator, three task incarnations, grants, durable
   cursors, dependency edge, evidence requirement, and three persistent Codex
   sessions before the first handoff.
2. A performs the bounded implementation turn. After its staged publish intent
   is bound to the completed turn, append the implementation evidence, submit
   `artifact-ready`, and evaluate routing.
3. R's durable cursor claims the offer. A separate R turn chooses accept or
   defer using metadata only. On acceptance, perform context admission exactly
   once and bind its receipt before starting the review turn. Append the
   validated model-proposed finding and submit `review-failed` only after that
   turn completes.
4. A's durable cursor resumes the original adapter reference. A chooses accept
   or defer, admits the finding once, then performs a bounded fix turn in its
   original worktree. Append fix evidence and publish the candidate for V only
   after the turn-bound intent is promoted.
5. V chooses accept or defer and admits the candidate once. V then chooses to
   call `threadmesh_verify_exact_chain`. Bind the completed V turn to the exact
   response from the pre-started service and append the final evidence only
   through the signed-response bridge.
6. Replay the persisted chain under the pinned anchor. Only a trusted complete
   replay may authorize the existing verified dependency-effect path and
   satisfy the edge.
7. Restart the coordinator and cursor consumer. Confirm the same sessions,
   cursor positions, evidence chain, satisfied edge, and ready dependent task,
   with no duplicate event, offer, turn, commit, record, or effect.
8. Remove and confirm absence of the exact sessions, service, worktrees,
   repository, database sidecars, and other scenario resources.

`artifact-ready`, `review-failed`, and `dependency-satisfied` are sufficient;
the scenario must not add a special fixed-artifact event merely to encode local
runner state.

## Recovery boundaries

- A completed tool call with an unpromoted intent is recoverable idempotently;
  it must not cause a replacement model turn.
- An accept/defer turn failure never defaults to acceptance.
- Unknown context-admission outcome is reconciled against adapter evidence
  before any retry.
- A non-reproducible reviewer finding publishes no `review-failed` event.
- A wrong implementer thread, worktree, parent, tree, or test blob publishes no
  fixed candidate.
- A service timeout or bad anchor, signature, subject, commit, finding, test,
  or evidence head leaves the dependency locked.
- Any cleanup absence-check failure makes the scenario fail even if the
  business loop completed.

## Delivery slices

1. **Durable evidence:** SQLite v5 requirement and record persistence, actor and
   adapter binding, CAS append, signed final bridge, restart replay, and an
   explicit regression that a complete chain does not unlock anything by
   itself.
2. **Turn intent journal:** durable staged-intent promotion plus reusable
   `receiveOfferWithModelDecision` and `completeBoundIntent` helpers.
3. **Real role loop:** wire A, R, and V to the isolated Git fixture and evidence
   chain; retain a private exact trace and a bounded public projection.
4. **M5.2 gate run:** execute negative variants, restart/replay, cleanup checks,
   and the successful live Codex run. Close M5.2 only from correlated evidence.
5. **M5.3 repetitions:** relevant 3/3, manual baseline, irrelevant, unverified,
   stale, restart, and injected-cleanup cases.

Slices 1 and 2 and the authority-bearing dependency-unlock seam are implemented
as deterministic foundations. The live A/R/A/V role runner and correlated gate
evidence remain separate; record count, final-stage presence, or a cached
`trusted` flag can never authorize unlock.

## Delivered slice-2 seams and remaining closure

SQLite v6 and the Codex adapter now provide these internal seams (names remain
implementation details, not protocol commitments):

- A proposed turn execution is persisted and frozen to the task revision,
  adapter thread/snapshot, idempotency key, prompt digest, and tool allowlist
  before native `turn/start`.
- `beforeToolCall` persists the exact model-selected turn/call/ordinal/tool and
  canonical arguments before the bounded callback may create a side effect;
  `afterToolCall` persists its result separately.
- Unknown turn outcomes are reconciliation-only. A receipt may complete only
  an already-persisted selection and can never invent a tool call.
- `promoteTurnExecutionWithGitEvidenceRecord` atomically binds the exact action
  to the implementation, review-failed, or fix record; each stage accepts only
  its designated model publication tool.
- Attention cursor claims are exclusive, cannot skip an earlier receiver
  event, and advance only after a completed durable handler effect. Retrying a
  completed-bound handler preserves the original turn.

SQLite v7 now supplies the authority-bearing seam:

- `bindGitEvidenceDependency` freezes a one-to-one chain-to-edge/version binding
  before finalization. A bound edge rejects the generic satisfaction API, so a
  policy or dependent task cannot bypass the verifier path.
- `finalizeGitEvidenceDependency` is callable only as the frozen verifier task.
  It requires the first three records to reference completed, promoted,
  stage-specific model actions and the final action to be a completed-turn-bound
  `threadmesh_verify_exact_chain` selection with an exact result digest.
- One immediate transaction replays the signed chain, appends the final record,
  promotes the verifier intent, verifies the accepted lifecycle disposition,
  satisfies the bound edge, and persists a unified record/action/event/
  disposition/effect binding. Exact replay is idempotent; alteration fails
  closed, including after restart.

The deterministic happy path is now integrated end-to-end: pre-created A/R/V,
dependent, and irrelevant tasks traverse grants, durable lifecycle events,
next-only cursor claims, receiver-owned decision tools, exact-reference context
admission, completed-turn binding, evidence promotion, v7 finalization, and
cursor commits. The same A adapter reference is used for implementation and
fix; the dependent is waiting before finalization and satisfied afterward; the
authorized irrelevant control records zero turns and a zero cursor. A generic
unbound lifecycle-submit bypass is also covered. The plan remains explicitly
scripted and cannot be reported as product initiative.

Lifecycle publication is frozen to the completed model action: tool name,
source event, complete bounded outgoing event body (including content, reason,
evidence references, freshness, and causality), and material commit, finding,
or chain coordinates must match exactly, and one fixture action is consumed at
most once. Every decision callback first persists the acknowledgement and then
returns only a stable projection of message, exact receiver, decision state,
reason code, and decision revision; the completed action digest is therefore
reconstructable without hashing a later-mutated final disposition. The final
dependent no longer receives a harness-authored acceptance. It claims its next
event, records a bounded `threadmesh_decide_offer`, admits the context into its
exact adapter reference, and binds the completed decision before v7
finalization. After finalization,
`commitFinalizedDependencyAttentionHandler` reconstructs the ack-time decision
projection from durable audit state, requires a completed admission with the
same exact adapter-reference digest as the decision execution, verifies the
persisted disposition, satisfaction, edge, effect, and attestation, and commits
the cursor atomically. This specialized seam deliberately leaves the dependent
decision execution `completed-turn-bound`; it does not invent a generic
promotion or grant evidence authority. Exact replay remains stable after edge
expiry, while decision-result, admission, adapter-reference, or
satisfaction-time alteration fails closed.

This closes the deterministic integrated happy path, not M5.2. Restart closure
has two hard gaps: there is no adapter query/reconcile surface after native
start but before operation binding, and a restarted runner cannot reconstruct
the signed final verifier response from the digest stored in SQLite. The next
mainline slice is therefore adapter reconciliation plus a private durable
verifier-result journal, followed by the restart fault matrix. Only then should
the real persistent Codex A implementation, R review, same-A fix, and V
verification run be enabled. Kimi remains a capability-only compatibility
preflight until it exposes bounded dynamic-tool and receipt evidence.

The [persistent-agent scenario runner](../06-guides/m5-2-live-agent-scenario.md)
provides a one-command deterministic integrated rehearsal, hash-linked private
trace, bounded public projection, cleanup manifest, retained SQLite evidence,
and real Codex/Kimi capability preflights. Product modes remain fail-closed
`blocked`: the scripted fixture is not live evidence, and real turns stay
disabled until the two recovery gaps and restart gates are closed.
