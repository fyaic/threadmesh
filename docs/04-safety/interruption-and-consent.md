# Interruption and consent

Interruption is qualitatively different from communication. It can terminate tools, lose ephemeral state, invalidate artifacts, and break the user's flow.

## Rules

- `interrupt` requires explicit elevated authority.
- The sender provides a reason and expected target run.
- The receiver reports `requested`, `cancelled`, `not-cancellable`, `stale`, or `denied`.
- Cancellation of the model turn and cancellation of external subprocesses are reported separately.
- A user-facing task should surface the event and preserve a resumable checkpoint when practical.
- Repeated interrupt attempts are rate-limited and escalated.

## Consent levels

- **Pre-authorized:** the user granted a supervisor bounded authority for a task class.
- **Just-in-time:** the user approves a specific request.
- **Receiver-mediated:** the target agent accepts at a checkpoint.
- **Emergency policy:** a narrow safety policy cancels an action without model discretion.

An agent's belief that interruption is useful is not itself consent.
