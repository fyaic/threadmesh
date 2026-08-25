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
