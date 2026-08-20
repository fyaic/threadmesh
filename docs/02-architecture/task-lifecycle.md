# Task and message lifecycle

## Task lifecycle

```text
registered → idle → running → waiting → completed
                       │          │
                       ├──────────┴→ interrupted
                       └────────────→ failed
```

Adapters may expose more detailed local states, but they must map them to a portable ThreadMesh state.

## Coordination lifecycle

```text
created
  └→ authorized
       ├→ denied
       └→ queued
            ├→ expired
            └→ delivered
                 ├→ deferred
                 ├→ rejected
                 ├→ stale
                 ├→ unsupported
                 └→ accepted
                      └→ applied
```

`delivered` means the target adapter or mailbox received the envelope. It does not mean the target agent read, accepted, or applied it.

## Checkpoints

A checkpoint is a harness-defined safe boundary, such as:

- before the next model request;
- after a tool result;
- after a major plan phase;
- while waiting for a dependency;
- before a consequential write.

Adapters should expose checkpoint events when possible. A `suggest` is normally evaluated at a checkpoint. `interrupt` may request immediate cancellation, but the adapter must report whether a running tool or subprocess was actually stopped.

## Terminal tasks

Completed, failed, or interrupted runs do not accept `steer`. Senders may create a follow-up suggestion for a new run, but the receiving harness decides whether to start one.
