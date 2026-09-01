# Non-interrupting active-session handoff

The highest-risk happy path is not an idle receiver. It is this one:

> A finishes while B is actively editing. Can the result remain available
> without changing B's current direction?

## Run the deterministic safety case

```sh
npm run demo -- --json
```

Inspect `safety.activeCheckpoint`. A passing result requires:

```json
{
  "requestedDeliveryMode": "checkpoint-offer",
  "receiverDecision": "pending",
  "receiverStateBefore": "running",
  "receiverStateAfter": "running",
  "steerRequests": 0,
  "interruptRequests": 0,
  "nativeTurnStarts": 0
}
```

The event is durably retained in the receiver mailbox. The demo deliberately
does not claim it, admit it, invoke the native harness, or reinterpret it as a
user instruction. An additional subscription control returns
`attention-event-type-not-subscribed` and produces zero offers.

## Why this matters

These states must remain separate:

```text
durably retained
!= admitted to model context
!= active work redirected
!= receiver accepted
!= claim verified
!= downstream action authorized
```

ThreadMesh's real product experiments enable only bounded `suggest` through
`checkpoint-offer`. Unsupported `steer` and `interrupt` behavior fails closed.

## Evidence boundary

This deterministic case proves coordinator and policy behavior. It does not
prove that every native agent product implements a non-interrupting queue.
Native delivery semantics vary, and Codex cross-task delivery still needs a
fresh real active-target observation before that product behavior is promoted
to evidence. Until then, adapters must keep the mailbox as truth and avoid
injecting pending peer content into an active turn.
