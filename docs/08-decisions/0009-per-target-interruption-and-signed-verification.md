# ADR 0009: Require per-target interruption and signed verification

- Status: Accepted
- Date: 2026-08-20
- Issue: [#16](https://github.com/fyaic/threadmesh/issues/16)

## Context

An interrupt request may stop a model turn while a tool call or child process
continues. A single `success` boolean hides this partial state and can cause a
caller to assume a deployment, file write, or other effect was stopped when it
was not.

Likewise, an evidence URL proves only that a string was supplied. It does not
identify a verifier, bind the claimed subject, prove evidence integrity, or
show that a configured trust policy accepted the verifier.

## Decision

Interruption results contain no umbrella success field. They report the model
turn directly and enumerate tool-call and subprocess targets separately. Every
target uses one of: `requested`, `cancelled`, `not-cancellable`, `not-running`,
`failed`, `stale`, or `denied`. Tool and process enumeration also reports
whether coverage is complete, partial, or unavailable.

An adapter may advertise `interrupt` only when it provides typed interruption
results, a real cancellation primitive, task incarnation binding, and durable
submission idempotency.

`externally-verified` requires one or more verification attestations. Each
attestation binds an authenticated non-agent verifier, claim subject and
digest, verification method, evidence digest, time, explicit trust-policy
decision, canonical signed-payload digest, key ID, algorithm, and signature.
Consumers verify the signature against a separately configured trust anchor;
an attestation cannot introduce its own trusted key.

Ordinary task and adapter observations remain `effect-observed` or
evidence-referenced. They cannot produce `externally-verified` merely by adding
a URI or self-selected signature.

## Consequences

- Callers must inspect every target and coverage field before claiming work
  stopped.
- Product adapters may honestly support model-turn cancellation while reporting
  tools or processes as unavailable or not-cancellable.
- Verification requires key distribution, rotation, trust-policy evaluation,
  and signature verification outside ordinary adapter authority.
- The reference conformance kit pins an Ed25519 public key and verifies a real
  signature; the local coordinator does not operate a production trust store.

## Rejected alternatives

### One interrupt status

It cannot represent a stopped model turn with a still-running subprocess.

### Infer subprocess cancellation from session cancellation

Session or turn APIs do not necessarily control external processes or remote
tools.

### Evidence references imply verification

An attacker can mint arbitrary URLs and labels. A reference without verifier
identity, integrity, and trust evaluation is not independent verification.

### Embed and trust the attestation's public key

That lets an attacker create a new key and declare itself trusted. Key IDs must
resolve through operator-configured trust anchors.
