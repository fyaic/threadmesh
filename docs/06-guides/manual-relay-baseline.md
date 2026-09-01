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

## Current status

- Workflow accounting: complete and executable.
- Live ThreadMesh behavior: one retained real Codex chain completed after one
  kickoff, with nine native turns and zero later runner prompts or direct
  activations; its Git/verifier effects were simulated.
- Real-effects code path: merged on `main` in
  [#133](https://github.com/fyaic/threadmesh/pull/133).
- Measured manual/live comparison: pending a host that resolves and reaches the
  valid Codex endpoint. The current host's reproducible DNS/TLS failure makes a
  fresh comparison invalid rather than negative product evidence.

No elapsed-time or token reduction should be advertised until the measured
protocol passes.
