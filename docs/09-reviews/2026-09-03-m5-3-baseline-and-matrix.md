# M5.3 measured baseline and closure-matrix checkpoint

Date: 2026-09-03

Evidence commit: `da9dda1`

Product: Codex CLI 0.145.0 through the logged-in App Server path

## What was measured

The same real-effects implementation → review → same-implementer fix →
independent verification → dependent activation scenario was run with one
controlled variable:

- the operator-triggered arm required one explicit status/relay trigger for
  each of four relevant durable handoffs;
- the ThreadMesh arm used one kickoff and the bounded event pump to advance
  those handoffs.

Both arms used the same repository commit, product command, model
configuration, host, network path, role boundaries, dynamic tools, real
bounded Git worktrees, process-isolated verifier, and exact cleanup logic. The
operator-triggered arm reused the guarded delivery seam; it is a reproducible
control, not a claim that a human physically copied text into a UI.

## Live result

The operator-triggered control arm completed:

| Measurement | Result |
|---|---:|
| Initial kickoff | 1 |
| Explicit status checks | 4 |
| Explicit relay triggers | 4 |
| Total operator actions | 9 |
| Bound native turns | 9 |
| Business tool calls | 8 |
| Elapsed time | 1,744,551 ms |
| Duplicate deliveries | 0 |
| Active-receiver interruptions | 0 |
| Incorrect unlocks | 0 |
| Cleanup | complete |

The arm record digest is
`sha256:0cfbde9e2cbecf2acea0dac5cc6ddf2caa3acb1471a925f4e91e8dbe8d198437`.

The ThreadMesh arm did not complete. After 979,280 ms it failed closed in the
reviewer admitted turn:

- stage: `reviewer-admitted-turn-partial`;
- 5 tasks, 1 dispatch, and 3 turn intents;
- 3 selected and 3 completed tool actions: the two kickoff actions and the
  reviewer decision action; no reviewer business-tool callback was bound;
- reconciliation reason:
  `codex-native-turn-completed-observation-only`;
- zero dependency finalizations, satisfactions, or cursor commits;
- 5/5 roles deleted and absence-confirmed, coordinator removed, and zero
  journals retained.

The product persistence surface showed a completed turn after the live
operation failed, but it did not provide enough correlation evidence to prove
that exact admitted operation. Retrying could duplicate an unobserved effect,
so the runner correctly refused to resend. This result does not satisfy the
same-condition baseline and cannot support an elapsed-time speed claim.

Codex App Server did not report input, cached-input, or output token counts.
They remain unavailable and were not estimated.

An earlier run on `70de18b` ended with the same public reconciliation code, but
the first version of the baseline runner did not retain the failed arm and
bounded cleanup projection. It is kept as a runner-observability defect, not
promoted as M5.3 evidence. `da9dda1` corrected that defect before the retained
run above.

## Deterministic closure matrix

`npm run validate:m5-3:matrix` then passed all deterministic conditions:

| Condition | Result |
|---|---|
| Fresh relevant loop | 3/3; zero relay/polling, irrelevant turns, or incorrect unlocks |
| Irrelevant route | zero receiver native turns |
| Stale and unverified | fail closed; no unlock |
| Restart and replay | exact durable recovery; no duplicate effect |
| Injected failure cleanup | complete cleanup and no dependent business turn |

The matrix record digest was
`sha256:0645b0f2f64725871d3cae2d576565989c9f46cefa55039a0a5f786d09153fa3`.
It is explicitly deterministic evidence, not real-product evidence.

## Decision

The negative/restart/cleanup matrix is closed for the current deterministic
implementation. The two remaining #91 product gates are:

1. a complete same-condition real Codex baseline in which both arms finish;
2. three fresh successful real Codex relevant loops.

Do not rerun the entire two-arm sequence blindly. First retain the fixed origin
boundary (`native-turn-timeout`, `admitted-tools-missing`, `tool-correlation`,
or `turn-result`) on the next ambiguous turn. A successful operator control is
already established; the reliability bottleneck is now the real reviewer
admitted-turn boundary, not protocol or documentation expansion.
