# Implement an adapter

This guide describes the intended implementation sequence. Concrete SDK code will follow in M1.

## 1. Identify local primitives

Document how the harness represents sessions, active runs, model messages, tool calls, cancellation, waiting, and approvals. Mark anything that is not observable or controllable.

## 2. Create stable mappings

Persist ThreadMesh task IDs separately from ephemeral process IDs. Record adapter-local references and verify them on every state-changing operation.

## 3. Publish capabilities

Start conservative. Advertise only semantics that can be enforced and observed. It is acceptable to support only `notify` and mailbox-based `suggest`.

## 4. Add checkpoints

Check the receiver mailbox before model calls and after tool results. Do not inject content merely because it was delivered.

## 5. Preserve provenance

Render cross-task content with a distinct source role or explicit wrapper. Never present it as direct user speech.

## 6. Enforce freshness

Bind `steer` and `interrupt` to a local run and objective version. Fail closed on mismatch.

## 7. Report dispositions

Return separate delivery, receiver-decision, context-admission,
adapter-submission, and outcome events. Report partial cancellation honestly.

## 8. Run conformance scenarios

At minimum test:

- duplicated message ID;
- expired suggestion;
- stale steering request;
- peer interruption attempt;
- objective change between queue and delivery;
- unavailable receiver;
- adapter restart;
- provenance preservation;
- unsupported intent;
- repeated interruption rate limit.
