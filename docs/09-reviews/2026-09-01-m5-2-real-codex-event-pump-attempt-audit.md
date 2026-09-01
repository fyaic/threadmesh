# M5.2 real Codex event-pump attempt audit

Date: 2026-09-01

Latest attempted `main`: `cbdccfb548074890d9c8fca712cade4cdbdfd3fe`

Classification: five non-completing live attempts; no real autonomous pass

## Why this record exists

The deterministic event-pump fixture and the earlier runner-sequenced Codex
canary are useful but separate evidence classes. This record preserves what
the operator-supplied Codex-shaped event-pump attempts actually
established without combining those evidence classes or upgrading a failed or
paused run into product evidence.

## Attempt ledger

| Attempt | Stop condition | Evidence established | Autonomous chain | Cleanup claim |
|---|---|---|---|---|
| 1 | Product-probe validation rejected the observed adapter-owned product shape | Preflight rejection only; the mismatch was later addressed by [#126](https://github.com/fyaic/threadmesh/pull/126) | Not started | Not asserted by this record |
| 2 | `threadmesh_durable_turn_intent_evidence_invalid` rejected a numeric Codex `completedAt` value | A real adapter boundary mismatch; Unix-second normalization was later addressed by [#127](https://github.com/fyaic/threadmesh/pull/127) | Not established | Not asserted by this record |
| 3 | Operator paused the run after the five role sessions had bootstrapped | Five session bootstraps; coordinator counts remained task `0`, turn intent `0`, pump dispatch `0`, and audit event `0` | Not started | The signal path did not run normal cleanup; a one-off exact operator cleanup deleted and absence-confirmed five of five owned sessions and removed the temporary SQLite, WAL, journal, and run-root resources |
| 4 | The first user-kickoff turn reached lifecycle publication, then failed `threadmesh_lifecycle_publication_action_mismatch` | Five registered tasks; one durable kickoff turn intent; no event-pump dispatch; the live model's selected tool arguments did not reproduce the coordinator-bound lifecycle material | Not started | Normal scenario cleanup deleted and absence-confirmed five of five sessions and removed the coordinator database, journals, and run root |
| 5 | The chain reached the same-A admitted fix turn, then failed `threadmesh_codex_live_context_reconciliation_ambiguous` | Real kickoff publication; reviewer offer, acceptance, admission, and two-tool review; durable `review-failed`; irrelevant skip; same-A offer and acceptance; the admitted fix turn started but had no safely confirmable terminal result inside the existing product-operation window | Partial through `A -> R -> same-A acceptance`; verifier and dependent did not start | Normal scenario cleanup again deleted and absence-confirmed five of five sessions and removed the coordinator database, journals, and run root |

The fixes in #126 and #127 do not retroactively change the evidence class of
attempts 1 or 2. Attempt 3 is bootstrap and cleanup evidence only. Attempt 4
is the first retained real kickoff/action-binding failure after all five tasks
registered. Attempt 5 is the first retained real autonomous partial chain and
stopped conservatively at an ambiguous same-A admitted turn. None of the five
attempts produced a completed `state=blocked` event-pump gate result.

## What the combined work established

- the operator-supplied Codex-shaped probe is strict and bounded;
- the Codex App Server adapter now normalizes Unix-second completion evidence
  at its boundary and rejects invalid timestamp or duration shapes;
- live-gate failure output recomputes cleanup closure from bounded fields and
  does not expose raw thread identifiers, paths, prompts, or error text;
- zero-to-five partially created role sessions can be represented honestly in
  cleanup evidence;
- the interrupted attempt's exact ownership could be reconstructed for a
  one-off cleanup without deleting unrelated user tasks;
- merged [#129](https://github.com/fyaic/threadmesh/pull/129) converts
  `SIGINT`/`SIGTERM` into a cooperative shutdown checked after each role
  bootstrap, after kickoff, and between event-pump dispatches;
- attempt 4 exercised the normal five-role cleanup path successfully after a
  post-bootstrap live failure, without one-off operator cleanup;
- the phase-specific exact-argument correction from #130 was validated by
  attempt 5: the kickoff publication and first reviewer dispatch succeeded;
- attempt 5 proved a real receiver-owned accept/admit boundary, a two-tool
  review publication, an irrelevant durable skip, and a same-A acceptance
  without runner phase prompts or user relay.

These are valuable fail-closed and cleanup results. They are not evidence that
real Codex sessions completed the proactive lifecycle chain.

## What is not established

- no real `A -> R -> same-A -> V -> dependent` event-pump chain completed;
- no reduction in user relay or polling was measured in these attempts;
- no complete model-selected lifecycle chain or dependent activation occurred;
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

Non-mainline expansion is now frozen. The bounded signal cleanup fix is merged,
and attempt 4 proved the normal post-bootstrap cleanup path. The next checkpoint
is one fresh run after the exact tool-contract correction, with one user
kickoff, zero runner phase or business prompts, zero runner direct activation
dispatches, exact real session/turn/dispatch bindings, an irrelevant zero-turn
control, and exact cleanup. Only a blocker observed by that run may interrupt
this checkpoint.

Attempt 4 then exposed the next direct blocker: the live model was asked to
select `threadmesh_publish_artifact`, but the registered dynamic-tool schema
did not tell it the exact coordinator-owned event and material required by the
durable lifecycle binding. The bounded correction is to expose those already
authorized arguments through phase-specific JSON Schemas. It does not relax
the exact binding, add a new protocol field, or let final prose authorize an
effect. Attempt 5 closed this blocker and exposed a narrower operational
boundary: the same-A admitted tool turn reached the existing
timeout/reconciliation path without a safely confirmable terminal observation.
The next bounded change is only to extend the admitted business-turn operation
window from 180 to 300 seconds; ambiguous outcomes remain reconcile-only and
are never resent.

A completed chain would still report `state=blocked` and
`liveProductEvidence=false` while verifier custody and Git effects remain
fixture-owned or simulated. That bounded result would demonstrate real session
initiative, not M5.2 closure.
