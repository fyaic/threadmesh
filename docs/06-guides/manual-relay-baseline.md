# Manual relay and polling baseline

This baseline answers a product question, not a protocol question:

> How much operator work disappears when four dependent handoffs advance from
> one kickoff?

## Executable workflow accounting

Run:

```sh
npm run demo -- --json
```

The `comparison` object reports this lower bound:

| Path | Initial kickoffs | Status checks | Copy/relay actions | Total |
|---|---:|---:|---:|---:|
| Manual workflow | 1 | 4 | 4 | at least 9 |
| ThreadMesh demo | 1 | 0 | 0 | 1 |

The four handoffs are `artifact-ready`, `review-failed`, the fixed
`artifact-ready`, and `dependency-satisfied`. A manual operator must notice each
state transition and carry it to the next session. The table assumes only one
status check per transition, so it is deliberately a lower bound.

This is **modeled workflow accounting**, not observed human performance. The
demo reports `elapsed-time` and `model-tokens` under `notMeasured` rather than
inventing a speedup or cost claim.

## Measured live protocol

Run the same implementation/review/fix/verification objective twice on the same
host, checkout, model configuration, and network:

1. Manual arm: disable cross-session delivery. The operator checks status and
   relays each bounded result by hand.
2. ThreadMesh arm: send one kickoff and allow only the bounded
   `checkpoint-offer` event pump to advance the chain.
3. Retain exact start/end timestamps and public aggregate counts. Keep prompts,
   transcripts, local paths, credentials, and session IDs private.
4. Abort both arms if model, checkout, endpoint, or task objective differs.

Record:

| Field | Definition |
|---|---|
| `initialKickoffs` | User messages that begin the objective |
| `manualRelayActions` | User messages that carry output between sessions |
| `manualStatusChecks` | User-initiated status or wait requests |
| `modelPollingTurns` | Model turns whose primary job is checking unchanged state |
| `elapsedMs` | First kickoff to verified dependent-ready state |
| `inputTokens` | Uncached input tokens reported by the product |
| `cachedInputTokens` | Cached input tokens reported by the product |
| `outputTokens` | Output tokens reported by the product |
| `activeReceiverInterruptions` | Active work redirected before a checkpoint |
| `duplicateDeliveries` | Same logical handoff admitted more than once |

Success requires exact cleanup, zero incorrect unlocks, zero active-receiver
interruptions, and comparable final artifacts in both arms. Report raw product
usage only when the product exposes it; do not infer token counts from text
length.

The repository runner is:

```sh
THREADMESH_M53_BASELINE_LIVE_ACK=maintainer-approved-threadmesh-m53-baseline-live \
THREADMESH_CODEX_COMMAND=/absolute/path/to/codex \
npm run validate:m5-3:baseline:live:codex
```

It emits a bounded checkpoint after each completed arm and a SQLite-derived
stage plus cleanup projection on failure. The deterministic negative/restart
matrix is available separately as `npm run validate:m5-3:matrix`.

## Current status

- Workflow accounting: complete and executable.
- Live ThreadMesh behavior: attempt 16 completed the merged real-effects Codex
  chain after one kickoff, with nine native turns, real Git/verifier effects,
  an irrelevant zero-turn control, and exact cleanup.
- Measured operator control: complete on 2026-09-03 with nine actions, nine
  bound native turns, eight business tool calls, 1,744,551 ms elapsed, zero
  duplicate delivery/interruption/incorrect unlock, and exact cleanup.
- Same-condition ThreadMesh arm: failed closed after 979,280 ms at an ambiguous
  reviewer admitted turn. It cleaned 5/5 roles and all coordinator state but
  did not complete the comparison.
- Full record: [M5.3 baseline checkpoint](../09-reviews/2026-09-03-m5-3-baseline-and-matrix.md).

No elapsed-time or token reduction should be advertised until the measured
protocol passes.
