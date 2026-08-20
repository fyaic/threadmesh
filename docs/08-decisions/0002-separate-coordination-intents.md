# ADR 0002: Separate coordination intents

- Status: Accepted
- Date: 2026-08-20

## Context

“Send a message” hides materially different effects. An informational update, advisory suggestion, active correction, and cancellation request require different permissions, freshness, delivery, and UI behavior.

## Decision

The core protocol defines four intents: `notify`, `suggest`, `steer`, and `interrupt`.

## Consequences

- Policies can grant least authority.
- Adapters can advertise partial support honestly.
- Receivers can handle advice without treating it as instruction.
- Callers must choose an intent and explain why it is proportionate.
- Future intent additions require a protocol change rather than free-form convention.

## Rejected alternative

One generic `message` operation with priority metadata. Priority does not describe authority or receiver obligations and invites incompatible implementations.
