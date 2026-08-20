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
delivery: control-plane-accepted → durably-received → offered/admitted/submitted
decision: pending → accepted | rejected | deferred | stale | expired | unsupported
outcome:  not-observed → effect-observed | externally-verified | failed
```

The three lines are orthogonal. Durable receipt does not mean the target agent
accepted a message. Context admission does not mean the model followed it.
Native adapter submission does not prove an external outcome.

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
