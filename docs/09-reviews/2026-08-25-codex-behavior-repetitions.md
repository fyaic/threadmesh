# Codex behavioral repetitions and default-off decision — 2026-08-25

## Decision

Proactive ThreadMesh coordination remains disabled by default. Three real runs
per condition preserved the original value signal, but the relevant path passed
only once in three attempts. This reliability is insufficient for default
enablement even though control behavior remained quiet.

The experiment is maintainer-authorized and non-normative. It used Codex App
Server with `gpt-5.6-sol`; raw transcripts, thread IDs, account data, and local
paths are not retained in public evidence.

## Results

| Condition | Run 1 | Run 2 | Run 3 | Product conclusion |
|---|---|---|---|---|
| No-contact control | Passed, 200 s | Passed, 250 s | Passed, 239 s | 3/3 quiet; zero tools, sends, or B activation |
| Relevant dependency | Passed, score 1, 277 s | Operation timeout, 260 s | B bootstrap marker mismatch, 73 s | 1/3 passed; value exists but is unreliable |
| Irrelevant task | Passed, 223 s | Passed, 285 s | A marker mismatch, 183 s | 2/3 passed; failed run is inconclusive rather than a false-positive estimate |

Every passing relevant run required the exact `related tasks → send suggestion`
sequence, one send, zero non-ThreadMesh tools, B context admission, and outcome
score 1. Every passing control run had score 0. Every passing irrelevant run
performed one read-only lookup, made zero sends, and did not activate B.

## Cleanup incident and fix

Run 3 relevant created B before returning a bootstrap marker mismatch. The
scenario had validated the marker before retaining the returned `adapterRef`,
so it initially reported cleanup incomplete. The exact candidate was resolved
through App Server `thread/list` using its creation window, project cwd, and
bootstrap preview. That single thread was deleted by exact ID and a second list
confirmed absence.

PR #64 then changed the scenario to retain a returned or error-carried B
adapter reference before validation and to treat never-created tasks as needing
no deletion. Two regression cases cover returned-marker mismatch and a thrown
post-creation operation failure. The merged fix passed 132 unit/subtests plus
all schema, transition, documentation, and CI checks.

No real validation thread from this repetition batch remains unmanaged.

## Interpretation

The experiment answers the immediate product question without expanding the
protocol:

- the useful behavior is real, because one relevant run improved the outcome;
- silence is achievable, because all three control runs avoided contact;
- the current end-to-end proactive path is too variable for default use;
- marker and operation reliability must improve before spending more model
  budget on stale, duplicate, concurrent-user, or autonomous B-decision cases.

Issue #53 remains open, but its next work is no longer “add more scenarios.” A
future run should first define a shorter outcome-bearing task and a reliability
threshold, then demonstrate that threshold before expanding the interference
matrix.

## Compressed-flow follow-up

PR #66 implemented that shorter task without expanding the protocol. Agent A
now creates its persistent task and performs the autonomous decision in the
same turn. Agent B's first turn records the outcome-bearing
`missing dependency` baseline instead of a readiness-only marker. This reduces
control and irrelevant from three model turns to two, and relevant from four to
three.

The first real compressed matrix at `4968d51` produced:

| Condition | Result | Time | Communication and cleanup |
|---|---|---:|---|
| Control | Passed | 229 s | 0 tool calls, 0 sends, B inactive, A/B deleted |
| Relevant | Operation timeout | 239 s | No success recorded; returned references cleaned |
| Irrelevant | Passed | 238 s | 1 read-only lookup, 0 sends, B inactive, A/B deleted |

An isolated relevant retry also timed out. PR #67 increased the outcome-bearing
A window and retained its created thread reference when an outer timeout wins.
A later retry exposed the equivalent B-bootstrap case: App Server had created B
but its reference had not reached the scenario before timeout. The single
candidate was identified by exact creation window, repository cwd, and unique
bootstrap preview; it was deleted by exact ID and verified absent. PR #68 added
the same outer-timeout reference guarantee for B and a deletion regression.

The next real relevant run on `edcc18f` completed in 156 seconds without an
operation timeout. It failed the strict Agent A marker check and therefore did
not count as a proactive success. Both A and B were deleted successfully.

The compressed benchmark improves cost and cleanup determinism, but it has not
changed the product decision. Real-model useful-path reliability remains the
active blocker, while control and irrelevant behavior remain quiet. Proactive
coordination stays default-off.

## Outcome-based Agent A gate

The `edcc18f` result showed that Agent A's exact final text was redundant: the
adapter already records whether the turn completed, which ThreadMesh tools the
model selected, whether the coordinator accepted a real send, and whether any
non-ThreadMesh tool appeared. PR #70 therefore removed the A text-marker gate
without weakening the B outcome, mailbox, admission, audit, or cleanup gates.

The deterministic fixture deliberately returns ordinary non-marker prose and
still passes only when the expected tool effects occur. Three fresh real
relevant runs on `9a6381a` produced:

| Run | Result | Time | Exact result |
|---|---|---:|---|
| 1 | Passed | 181 s | related-task lookup, one send, B score 1, A/B deleted |
| 2 | Failed | 142 s | model tool decision missing, no success recorded, A/B deleted |
| 3 | Passed | 268 s | related-task lookup, one send, B score 1, A/B deleted |

This 2/3 sample separates two failure classes that the earlier marker-heavy
benchmark mixed together. Text phrasing is no longer a blocker; autonomous
tool selection still varies. The evidence supports continued opt-in
experimentation, not default enablement.
