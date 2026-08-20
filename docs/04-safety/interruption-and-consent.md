# Interruption and consent

Interruption is qualitatively different from communication. It can terminate tools, lose ephemeral state, invalidate artifacts, and break the user's flow.

## Rules

- `interrupt` requires explicit elevated authority.
- The sender provides a reason and expected target run.
- The receiver reports each target as `requested`, `cancelled`,
  `not-cancellable`, `not-running`, `failed`, `stale`, or `denied`.
- Model-turn, tool-call, and subprocess results are separate. Tool and process
  enumeration reports complete, partial, or unavailable coverage.
- There is no umbrella interrupt-success field. A cancelled model turn does not
  imply that tools or subprocesses stopped.
- A user-facing task should surface the event and preserve a resumable checkpoint when practical.
- Repeated interrupt attempts are rate-limited and escalated.

## Consent levels

- **Pre-authorized:** the user granted a supervisor bounded authority for a task class.
- **Just-in-time:** the user approves a specific request.
- **Receiver-mediated:** the target agent accepts at a checkpoint.
- **Emergency policy:** a narrow safety policy cancels an action without model discretion.

An agent's belief that interruption is useful is not itself consent.

## Result shape

```text
InterruptionResult
  modelTurn: TargetResult
  toolCalls: { enumeration, targets[] }
  subprocesses: { enumeration, targets[] }
```

The machine-readable type is
[`threadmesh-interruption-result.schema.json`](../../spec/schema/threadmesh-interruption-result.schema.json).
An implementation that cannot enumerate a target class reports
`enumeration: unavailable` with an empty target list; it does not omit the
class or infer success.
