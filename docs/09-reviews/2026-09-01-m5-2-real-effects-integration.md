# M5.2 real-effects integration checkpoint

Date: 2026-09-01

Integration branch: `feat/m52-event-pump-real-effects`

Status: implementation complete; real Codex end-to-end rerun blocked by local
DNS/TLS failure

## What changed

The existing autonomous event-pump path now reuses the repository's existing
bounded Git fixture and process-isolated child verifier. It does not add another
coordinator, scheduler, schema, or verifier protocol.

In real-effects mode, the same correlated run now requires:

```text
one user kickoff
  -> A commits and publishes a real implementation SHA
  -> R accepts, reads a detached reviewer checkout, and reports its own finding
  -> the same A task commits and publishes the direct-descendant fix
  -> V asks a process-isolated child verifier to test and sign the exact chain
  -> trusted finalization completes
  -> dependent activation starts
```

The parent process receives only the child verifier's public trust anchor. The
child owns the ephemeral private key. The verifier binds the validated base,
fixture seed, implementation and fix commits, exact finding, trusted test blob,
and routing subject. The existing SQLite finalizer remains the only dependency
unlock path.

The real action contract is 14 model-selected calls across the existing nine
native turns: two kickoff actions, four receiver decisions, and eight admitted
business actions. R uses two actions: read the exact detached checkout, then
report the resource path, counterexample, reason, and read-result digest. The
handler rejects a counterexample that is not present in that checkout. This
keeps the finding model-selected without requiring three serial tool calls for
one bounded review effect.

## Validation completed

- the focused coordinator, gate, and product-turn tests pass;
- an automated real-effects positive path binds the Git commits, detached
  review, process-isolated verifier, finalization, and exact cleanup;
- an automated negative path rejects a model-reported finding that is absent
  from the reviewer checkout and still proves exact cleanup;
- the full repository suite passes 383 unit tests, 55 schema cases, 7
  transition cases, and documentation lint with zero findings;
- live attempts created real implementation commits and reached the autonomous
  R route without runner phase prompts or direct activation;
- all failed attempts deleted and absence-confirmed five of five Codex tasks,
  stopped the child verifier, removed the bounded Git topology and coordinator,
  and left zero recovery journals.

No live attempt on this integration branch completed the full real-effects
chain, so this record does not claim `liveProductEvidence=true` or M5.2 closure.

## Live attempt result

Four integration attempts were retained after the earlier behavioral pass:

| Attempt | Observed stop | Durable progress |
|---|---|---|
| 7 | R admitted turn ended before a business selection | Real A implementation commit and publication; R route selected |
| 8 | R admitted turn ended after the detached-checkout read | Real A implementation and one completed reviewer read action |
| 9 | R receiver-decision turn was terminally reconciled | Real A implementation and autonomous R route selection |
| 10 | R admitted turn became ambiguous after its accepted decision | Real A implementation, R acceptance, and R admission start |

Attempt 10 coincided with a machine-observed transport failure. Codex logs
recorded that `wss://chatgpt.com/backend-api/codex/responses` resolved to a peer
whose certificate was valid only for `*.extern.facebook.com`. Independent
checks reproduced the condition: the system resolver returned a Meta address
for `chatgpt.com`, HTTPS certificate verification failed, and `codex doctor`
reported a failed Responses WebSocket while the HTTP endpoint remained
reachable. TLS verification was not disabled and the run was not retried after
the external condition became repeatable.

## Honest gate status

The code path can now project real bounded worktrees and a process-isolated,
child-signed verifier result only after a successful correlated run. The
public projector conservatively keeps every M5.2 closure gate open; a summary
boolean cannot close Git, verifier, baseline, restart, heartbeat, global-chain,
or live-product gates. A successful live real-effects run has not yet been
retained. The current claims are therefore:

- behavioral initiative: established by the earlier sixth real Codex run;
- real-effects wiring: implemented and locally regression-tested;
- successful real-effects Codex chain: not yet established;
- trusted Codex binary provenance: still not established;
- manual relay/polling baseline and minimum negative/restart closure: pending.

The next action is one fresh live rerun after the machine resolves
`chatgpt.com` to a valid OpenAI endpoint and `codex doctor` no longer reports
the WebSocket certificate failure. Do not change protocol logic or bypass TLS
to compensate for this network condition.
