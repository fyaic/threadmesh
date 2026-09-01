# Real Codex autonomous event-pump behavior

Date: 2026-09-01

Tested `main`: `f98c56b83057b43f8b9618d6f69e1b2f481f77bd`

Result: behavioral checkpoint passed; integrated M5.2 gate remains blocked

## What happened

One explicit user kickoff started a real Codex session. After that kickoff,
ThreadMesh's durable event pump—not the user and not a sequence of runner phase
prompts—continued the workflow across four receiving roles:

```text
user kickoff
    -> A publishes an artifact
    -> R accepts, reads it, and publishes a review finding
    -> the same A session accepts, applies the fix, and publishes a dependency
    -> V accepts, reads the verification chain, and verifies it
    -> only after finalization, the dependent accepts and activates
```

An authorized irrelevant session existed in the same run. Its route was
durably skipped and it executed no native model turn.

This is the concrete behavior ThreadMesh is trying to make portable across
agent harnesses: a session can notice a related durable event and choose to act
without the user copying context, asking for status, or manually waking the
next session. Receiver admission and exact tool bindings keep that initiative
bounded.

## Machine-observed result

| Measure | Observed |
|---|---:|
| Explicit user kickoffs | 1 |
| Runner phase/business prompts after kickoff | 0 |
| Runner direct activation dispatches | 0 |
| Bound real Codex native turns | 9 |
| Protected receiver turns | 8 |
| Model-selected business tool calls | 8 |
| Published event-pump dispatches | 4 |
| Durable irrelevant-route skips | 1 |
| Irrelevant native turns | 0 |
| Temporary role sessions deleted and absence-confirmed | 5/5 |
| Remaining journals | 0 |

The native-turn manifest contained the kickoff plus a decision and admitted
business turn for R, same-A, V, and dependent. The session manifest confirmed
that the implementation and fix used the same A adapter reference and
workspace. Durable evidence confirmed that the dependent started after trusted
finalization.

The sanitized result bound the evidence with these digests:

- native-turn manifest:
  `sha256:58f0beb48d3c5c388fca72db68274afa32c53b4ac67b9afe3867eb380229f546`;
- durable-dispatch manifest:
  `sha256:c82739562ea57376aded812915d326a1fed6e082a2c731e20fd7264804c52b67`;
- runner trace:
  `sha256:510dca5c9741726e300717ad32c1f698e84b5cf1fc43ae5914644d7f4284d0f1`;
- five-session manifest:
  `sha256:da6db06bf98996d2b906b71c943d414de4a5f1aa3f2170f472b58a6073847b2c`.

## Why the process exited with `state=blocked`

The result code was
`threadmesh_m52_independent_verifier_service_pending`, with
`liveProductEvidence=false`. This is an evidence classification, not a failed
behavioral chain. Three stronger product claims remain deliberately unmade:

- the verifier signer was fixture-owned rather than held by an independent
  verifier service;
- implementation and fix effects used the bounded simulated scenario rather
  than real Git worktrees and commits;
- the executable was operator supplied, so trusted Codex binary provenance was
  not independently established.

Consequently this run proves real model/session initiative and exact cleanup.
It does not close M5.2, establish production safety, or prove cross-harness
parity.

## Reproduce

The live command is intentionally acknowledgement-gated and creates real Codex
tasks. Run it only from a clean checkout and a fresh, owned artifacts directory:

```sh
export THREADMESH_M52_EVENT_PUMP_LIVE_ACK=maintainer-approved-threadmesh-m52-event-pump-live
export THREADMESH_CODEX_COMMAND=/absolute/path/to/codex
node scripts/run-m5-2-event-pump-gate.mjs \
  --mode live \
  --model gpt-5.6-sol \
  --artifacts-dir /fresh/owned/directory
```

Expected behavioral fields are the counts above plus
`sameAPersistentRefAndWorkspace=true`,
`dependentStartedAfterFinalization=true`, and `cleanup.complete=true`. Until
the remaining product gates are integrated, the honest top-level result is
still `state=blocked`.

The complete attempt history, including five earlier fail-closed runs, is in
the [attempt audit](2026-09-01-m5-2-real-codex-event-pump-attempt-audit.md).
