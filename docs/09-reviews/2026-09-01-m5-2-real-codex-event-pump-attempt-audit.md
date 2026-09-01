# M5.2 real Codex event-pump attempt audit

Date: 2026-09-01

Latest completed behavioral `main`: `f98c56b83057b43f8b9618d6f69e1b2f481f77bd`

Latest real-effects integration attempt: `1845d86`

Subsequent merged integration: [#133](https://github.com/fyaic/threadmesh/pull/133)
at `5ec7b19`; no later live attempt is claimed

Classification: ten live attempts; attempt 6 completed the real autonomous
behavioral chain, while attempts 7–10 exercised the real Git/child-verifier
integration without completing its end-to-end product gate

## Why this record exists

The deterministic event-pump fixture and the earlier runner-sequenced Codex
canary are useful but separate evidence classes. This record preserves what
the operator-supplied Codex-shaped event-pump attempts actually
established without combining those evidence classes or upgrading a failed or
paused run into product evidence.

This is a bounded operator audit record, not a canonical machine-verifiable
attempt bundle. The live failure CLI retained exact cleanup projection but did
not yet emit SQLite-derived partial-stage manifests for attempts 7–10. Their
partial-progress rows therefore remain descriptive and cannot close a gate.

## Attempt ledger

| Attempt | Stop condition | Evidence established | Autonomous chain | Cleanup claim |
|---|---|---|---|---|
| 1 | Product-probe validation rejected the observed adapter-owned product shape | Preflight rejection only; the mismatch was later addressed by [#126](https://github.com/fyaic/threadmesh/pull/126) | Not started | Not asserted by this record |
| 2 | `threadmesh_durable_turn_intent_evidence_invalid` rejected a numeric Codex `completedAt` value | A real adapter boundary mismatch; Unix-second normalization was later addressed by [#127](https://github.com/fyaic/threadmesh/pull/127) | Not established | Not asserted by this record |
| 3 | Operator paused the run after the five role sessions had bootstrapped | Five session bootstraps; coordinator counts remained task `0`, turn intent `0`, pump dispatch `0`, and audit event `0` | Not started | The signal path did not run normal cleanup; a one-off exact operator cleanup deleted and absence-confirmed five of five owned sessions and removed the temporary SQLite, WAL, journal, and run-root resources |
| 4 | The first user-kickoff turn reached lifecycle publication, then failed `threadmesh_lifecycle_publication_action_mismatch` | Five registered tasks; one durable kickoff turn intent; no event-pump dispatch; the live model's selected tool arguments did not reproduce the coordinator-bound lifecycle material | Not started | Normal scenario cleanup deleted and absence-confirmed five of five sessions and removed the coordinator database, journals, and run root |
| 5 | The chain reached the same-A admitted fix turn, then failed `threadmesh_codex_live_context_reconciliation_ambiguous` | Real kickoff publication; reviewer offer, acceptance, admission, and two-tool review; durable `review-failed`; irrelevant skip; same-A offer and acceptance; the admitted fix turn started but had no safely confirmable terminal result inside the existing product-operation window | Partial through `A -> R -> same-A acceptance`; verifier and dependent did not start | Normal scenario cleanup again deleted and absence-confirmed five of five sessions and removed the coordinator database, journals, and run root |
| 6 | Completed the bounded event-pump scenario and returned the expected `state=blocked`, `code=threadmesh_m52_independent_verifier_service_pending` result | One kickoff; nine bound real Codex native turns; eight protected receiver turns; eight business tool calls; four published event-pump dispatches; one durable irrelevant skip; same-A identity/worktree reuse; verifier-finalization-before-dependent ordering | Complete `A -> R -> same-A -> V -> dependent`; zero runner phase prompts, direct activation dispatches, manual relay, polling, or irrelevant native turns | Normal scenario cleanup deleted and absence-confirmed five of five sessions, removed the coordinator, and left zero journals; the exact empty operator artifacts directory was then removed |
| 7 | Real-effects R admitted turn ended before a business tool selection | A created and published a real bounded implementation commit; the event pump selected R | Partial through `A -> R admission start` | Normal cleanup deleted and absence-confirmed 5/5 sessions, stopped the child verifier, removed Git and coordinator resources, and left zero journals |
| 8 | Real-effects R admitted turn ended after one completed detached-checkout read | Real A commit/publication and one R read action | Partial through `A -> R detached checkout read` | Same complete 5/5, verifier, Git, coordinator, and journal cleanup |
| 9 | R receiver-decision turn was terminally reconciled | Real A commit/publication and autonomous R route selection | Partial through `A -> R decision start` | Same complete 5/5, verifier, Git, coordinator, and journal cleanup |
| 10 | R accepted, then its admitted turn became ambiguous during a machine-observed DNS/TLS failure | Real A commit/publication, R acceptance, and R admission start | Partial through `A -> R admission start` | Same complete 5/5, verifier, Git, coordinator, and journal cleanup |

The fixes in #126 and #127 do not retroactively change the evidence class of
attempts 1 or 2. Attempt 3 is bootstrap and cleanup evidence only. Attempt 4
is the first retained real kickoff/action-binding failure after all five tasks
registered. Attempt 5 is the first retained real autonomous partial chain and
stopped conservatively at an ambiguous same-A admitted turn. None of the five
attempts produced a completed `state=blocked` event-pump gate result. Attempt 6
did. It is the first retained real behavioral pass of the autonomous chain, not
an M5.2 completion claim.

Attempts 7–10 run the branch that replaces simulated Git and fixture-owned
signing with the existing bounded Git topology and child-owned verifier key.
They establish partial real-effect execution and cleanup, not a completed
real-effects chain. Attempt 10's Codex log recorded a certificate for
`*.extern.facebook.com` while connecting to the ChatGPT Responses WebSocket;
the system resolver and `curl` independently reproduced the wrong endpoint,
and `codex doctor` reported the WebSocket failure. No TLS check was bypassed.

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
- merged [#131](https://github.com/fyaic/threadmesh/pull/131) extended only the
  protected admitted business-turn operation window from 180 to 300 seconds;
  ambiguous outcomes remain reconcile-only and are never resent;
- attempt 6 completed all nine model/tool-bound native turns after one kickoff:
  R reviewed, the original A session accepted and fixed the finding, V verified
  the exact chain, and the dependent session activated only after finalization;
- the runner supplied zero later phase or business prompts and made zero direct
  activation dispatches; the irrelevant session ran zero native turns;
- the completed public result retained exact native-turn, durable-dispatch,
  runner-trace, and five-session manifests and passed exact cleanup.

The sixth result is real Codex session-initiative evidence. It is still bounded
experimental evidence, not proof of an independently verified Git workflow or
production reliability.

## What is not established

- verifier custody and real Git effects are wired into the event-pump branch,
  but no successful live Codex run has yet traversed the complete integrated
  chain;
- the completed run demonstrates zero relay and polling by construction, but it
  does not yet include a timed manual-workflow baseline;
- OS-kill recovery, long-turn lease heartbeat, a global cross-dispatch chain,
  Kimi parity, and repetition remain untested on this live path.
- interrupted live runs do not yet expose a bounded SQLite-derived partial
  stage/turn/dispatch manifest through the public failure projection.

## Sequencing correction

The technical direction remains supported by the deterministic event pump,
protected receiver turns, exact admission bindings, fail-closed evidence, and
cleanup behavior. The execution order was imbalanced: generalized durability,
verification, Git evidence, and recovery work advanced before one uninterrupted
real proactive chain was retained.

Non-mainline expansion remains frozen. The bounded signal cleanup, exact
phase-tool contracts, and admitted-turn window corrections are merged. Attempt
6 has now passed the previously missing behavioral checkpoint with one kickoff,
zero runner phase/business prompts or direct activations, exact real
session/turn/dispatch bindings, an irrelevant zero-turn control, and exact
cleanup.

Attempt 4 then exposed the next direct blocker: the live model was asked to
select `threadmesh_publish_artifact`, but the registered dynamic-tool schema
did not tell it the exact coordinator-owned event and material required by the
durable lifecycle binding. The bounded correction is to expose those already
authorized arguments through phase-specific JSON Schemas. It does not relax
the exact binding, add a new protocol field, or let final prose authorize an
effect. Attempt 5 closed this blocker and exposed a narrower operational
boundary: the same-A admitted tool turn reached the existing
timeout/reconciliation path without a safely confirmable terminal observation.
The bounded window correction in #131 closed that blocker without changing the
reconciliation policy.

The existing bounded Git worktree and child verifier are now wired into the
same correlated event-pump path. The next checkpoint is one successful live
rerun after the local DNS/TLS condition clears, followed by the manual
relay/polling baseline and minimum critical negative/restart case. Attempt 6
remains the behavioral checkpoint; attempts 7–10 do not upgrade it into an
integrated product pass. Issue #91 and M5.2 remain open.
