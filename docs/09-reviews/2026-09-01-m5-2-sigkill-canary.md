# M5.2 supervised SIGKILL canary

Date: 2026-09-01

## Scope

This deterministic canary exercises a real operating-system process death at
the narrow recovery boundary where a native turn is externally observable but
the SQLite turn execution has not bound its native turn ID.

The child process persists the existing private live-turn journal, one fake
product turn, and a fixed checkpoint. The supervisor independently verifies
those files and the SQLite row before sending `SIGKILL` to the child process
group. A fresh child then opens the same database and journal, observes the
same persisted fake product turn, and reconciles it to `abandoned` without
submitting another turn.

Run it with:

```console
npm run validate:m5-2:sigkill-canary
```

## What it proves

- the original process exit signal is `SIGKILL`;
- exactly one native start is present and no retry is submitted;
- recovery uses the same digest-bound database, journal, thread, turn, and
  adapter idempotency identity;
- no tool effect, audit event, adapter receipt, or turn action is synthesized;
- SQLite sidecars, temporary files, and the exact private canary directory are
  absent after successful cleanup; and
- the public result contains identity digests rather than raw private IDs or
  paths.

## Evidence boundary

This is a supervised, persistent fake-product process canary. It is not a real
Codex product pass and does not show that `SIGKILL` caused the product turn to
become interrupted. The fake product's `interrupted` status is deliberately
persisted before the kill, modeling a lost response before coordinator bind.
Real Codex process-death recovery remains a separate product validation gate.
