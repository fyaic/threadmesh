# M5.2 real Codex event-pump attempt audit

Date: 2026-09-01

Current reviewed `main`: `c17c83755c32647eae1a4ed70a075ff56bfc84a5`

Classification: three non-completing live attempts; no real autonomous pass

## Why this record exists

The deterministic event-pump fixture and the earlier runner-sequenced Codex
canary are useful but separate evidence classes. This record preserves what
the first three operator-supplied Codex-shaped event-pump attempts actually
established without combining those evidence classes or upgrading a failed or
paused run into product evidence.

## Attempt ledger

| Attempt | Stop condition | Evidence established | Autonomous chain | Cleanup claim |
|---|---|---|---|---|
| 1 | Product-probe validation rejected the observed adapter-owned product shape | Preflight rejection only; the mismatch was later addressed by [#126](https://github.com/fyaic/threadmesh/pull/126) | Not started | Not asserted by this record |
| 2 | `threadmesh_durable_turn_intent_evidence_invalid` rejected a numeric Codex `completedAt` value | A real adapter boundary mismatch; Unix-second normalization was later addressed by [#127](https://github.com/fyaic/threadmesh/pull/127) | Not established | Not asserted by this record |
| 3 | Operator paused the run after the five role sessions had bootstrapped | Five session bootstraps; coordinator counts remained task `0`, turn intent `0`, pump dispatch `0`, and audit event `0` | Not started | The signal path did not run normal cleanup; a one-off exact operator cleanup deleted and absence-confirmed five of five owned sessions and removed the temporary SQLite, WAL, journal, and run-root resources |

The fixes in #126 and #127 do not retroactively change the evidence class of
attempts 1 or 2. Attempt 3 is bootstrap and cleanup evidence only. None of the
three attempts produced a completed `state=blocked` event-pump gate result.

## What the combined work established

- the operator-supplied Codex-shaped probe is strict and bounded;
- the Codex App Server adapter now normalizes Unix-second completion evidence
  at its boundary and rejects invalid timestamp or duration shapes;
- live-gate failure output recomputes cleanup closure from bounded fields and
  does not expose raw thread identifiers, paths, prompts, or error text;
- zero-to-five partially created role sessions can be represented honestly in
  cleanup evidence;
- the interrupted attempt's exact ownership could be reconstructed for a
  one-off cleanup without deleting unrelated user tasks.

These are valuable fail-closed and cleanup results. They are not evidence that
real Codex sessions completed the proactive lifecycle chain.

## What is not established

- no real `A -> R -> same-A -> V -> dependent` event-pump chain completed;
- no reduction in user relay or polling was measured in these attempts;
- no model-selected real lifecycle handoff or dependent activation occurred;
- verifier custody and Git implementation/fix effects were not independently
  real in an event-pump run;
- OS-kill recovery, long-turn lease heartbeat, a global cross-dispatch chain,
  Kimi parity, and repetition remain untested on this live path.

## Sequencing correction

The technical direction remains supported by the deterministic event pump,
protected receiver turns, exact admission bindings, fail-closed evidence, and
cleanup behavior. The execution order was imbalanced: generalized durability,
verification, Git evidence, and recovery work advanced before one uninterrupted
real proactive chain was retained.

Non-mainline expansion is now frozen. The next checkpoint is one fresh run on
the existing `c17c837` surface with one user kickoff, zero runner phase or
business prompts, zero runner direct activation dispatches, exact real
session/turn/dispatch bindings, an irrelevant zero-turn control, and exact
cleanup. Only a blocker observed by that run may interrupt this checkpoint.
The missing bounded SIGINT/SIGTERM cleanup path is already observed and may be
fixed before the rerun; it must not expand into a general process-supervision
workstream.

A completed chain would still report `state=blocked` and
`liveProductEvidence=false` while verifier custody and Git effects remain
fixture-owned or simulated. That bounded result would demonstrate real session
initiative, not M5.2 closure.
