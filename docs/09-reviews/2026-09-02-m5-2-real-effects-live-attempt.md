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
