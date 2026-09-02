# M5.2 fresh real-effects live attempt

Date: 2026-09-02

Validated base: `53df4061bf5d0528489dd4748effd8b6b5bec7ec`

Product: Codex CLI 0.145.0 through the logged-in App Server path

Result: `failed`

Code: `threadmesh_codex_live_context_reconciliation_ambiguous`

## Connectivity boundary

The initial direct path failed certificate-verifying connectivity after system
DNS returned unexpected non-provider addresses. macOS already had a local HTTP
and HTTPS proxy configured, but the Codex process had no proxy environment.

The live command supplied that existing proxy only to the validation process.
`codex doctor --summary` then reported a successful Responses WebSocket `101`
and provider HTTP reachability. TLS verification remained enabled. No system
DNS, proxy, Tailscale, certificate, Codex version, or repository setting was
changed.

## Progress established

The run crossed product probe and five-role bootstrap, registered all five
tasks, and entered the autonomous real-effects chain. Before terminal cleanup,
read-only operator observations of the active SQLite state showed:

| State | Count |
|---|---:|
| tasks | 5 |
| event-pump dispatches | 1 |
| turn intents | 3 |
| tool actions | 4 |
| lifecycle publications | 1 |
| Git evidence records | 1 |
| dependency finalizations | 0 |
| dependency satisfactions | 0 |
| attention cursor commits | 0 |

These aggregates establish real A implementation publication and partial R
processing. They are an operator audit, not a machine-verifiable partial-stage
bundle; they do not prove a completed reviewer effect. The terminal projection
identified ambiguous context reconciliation during the reviewer admitted turn.
No verifier or dependent completion is claimed.

## Cleanup

The bounded terminal cleanup projection reported:

- 5/5 created roles deleted;
- 5/5 role absence checks passed;
- coordinator removed;
- zero remaining journals.

The verifier and Git fixture cleanup were part of the scenario cleanup path.
The caller-created artifacts directory was empty after the run and was removed
with an exact non-recursive directory removal. No live role or scenario process
remained.

## Decision

This is attempt 11 in the bounded audit. It proves that the earlier DNS/TLS
failure can be avoided without bypassing verification, but it does not close
M5.2 or issue #91. The immediate blocker is now reviewer admitted-turn
reconciliation and insufficient bounded partial-stage projection.

Do not repeat the run blindly. First retain a public, SQLite-derived partial
manifest that exposes the exact phase, durable dispatch/action counts, bounded
reconciliation reason, and cleanup without raw prompts, receipts, paths, or
session identifiers. Then correct the observed boundary and run once.

## Follow-up implementation

The requested failure manifest is now implemented for the next run. It is
captured from the live coordinator database before cleanup and then passed
through an exact public projector. The output is restricted to a schema
version, source marker, derived stage, ten bounded counts, and—only for an
ambiguous recovery—one fixed-enum reason code. Any extra key, unknown reason,
string, impossible count, or stage/count mismatch suppresses the projection.

The historical aggregates above remain operator observations from attempt 11;
they are not retroactively upgraded into machine evidence. The next live run is
the first one that can produce the new machine-verifiable partial projection.

## Attempt 12 result

The first run with the merged projection used commit `688c226`, the same
process-scoped proxy, Codex CLI 0.145.0, certificate verification, real Git
worktrees, and child verifier. It again reached the reviewer admitted turn and
failed closed, but now emitted machine-derived evidence:

- stage: `reviewer-admitted-turn-partial`;
- tasks 5, dispatches 1, turn intents 3, tool actions 5;
- lifecycle publications 1 and Git evidence records 1;
- zero finalizations, satisfactions, and cursor commits;
- reason: `codex-native-turn-completed-observation-only`;
- cleanup: 5/5 roles deleted and absence-confirmed, coordinator removed, zero
  journals, and the empty caller artifacts directory removed.

The fifth action proves that the reviewer selected both admitted tools, while
the completed-only persisted turn cannot by itself prove whether the second
callback result was durably completed. The next diagnostic adds only one
aggregate—completed tool actions—to distinguish callback rejection from an
adapter-finalization failure. It does not expose tool arguments or outputs.
