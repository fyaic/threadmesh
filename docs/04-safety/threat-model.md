# Threat model

## Assets

- User intent and task objective integrity.
- Private prompts, histories, files, and task metadata.
- Harness tool and sandbox boundaries.
- Availability of active tasks and subprocesses.
- Authenticity of sender, target, relationship, and disposition.
- Audit-trail integrity.

## Trust boundaries

1. Model output to harness tool call.
2. Harness adapter to ThreadMesh control plane.
3. Control plane to target adapter.
4. Target mailbox to model-visible context.
5. One user, tenant, project, or machine to another.

The JSON-RPC transport authenticator is a distinct trust boundary. Its request
body is untrusted and cannot assert a principal. The checked-in static-token
authenticator is suitable only for a trusted local host; production token
verification, TLS, credential rotation, and revocation are host
responsibilities.

## Threats and mitigations

### Unauthorized task discovery

**Threat:** an agent searches unrelated task titles or summaries and infers private work.

**Mitigation:** relationship-scoped discovery, minimal summaries, sensitivity labels, explicit grants, and audit events.

### Cross-task prompt injection

**Threat:** content from A enters B as if authored by the user or system.

**Mitigation:** preserve source role, default peer messages to mailbox delivery, label provenance, and treat content as untrusted.

### Stale steering

**Threat:** A sends a correction for an old objective after the user has repurposed B.

**Mitigation:** expected run and objective versions, short expiry, fail-closed mismatches, and explicit `stale` dispositions.

### Authority escalation

**Threat:** a peer labels a message `interrupt`, or an adapter implements `suggest` as direct steering.

**Mitigation:** relationship-based authorization, capability negotiation, adapter conformance tests, and no silent semantic upgrades.

### Message storms and livelock

**Threat:** agents repeatedly correct or reply to one another without advancing work.

**Mitigation:** rate limits, hop limits, causal deduplication, cooldowns, interruption budgets, and escalation after repeated rejection.

### Provenance forgery

**Threat:** a sender claims that a user or supervisor originated an instruction.

**Mitigation:** transport-authenticated control-plane identity, exact comparison
between claimed author and authenticated principal, immutable origin fields,
signed envelopes across trust boundaries, and UI rendering from verified
metadata.

### Shared-resource races

**Threat:** coordinated agents still edit the same file, deployment, or record concurrently.

**Mitigation:** resource claims, adapter-specific write isolation, optimistic concurrency, and explicit ownership transfer. ThreadMesh messages alone do not serialize external writes.

### Audit leakage

**Threat:** useful provenance becomes a second copy of sensitive prompts.

**Mitigation:** separate content from integrity metadata, redact by policy, store hashes for evidence, and apply retention limits.

## Security invariants

- Semantic relevance never creates authorization.
- Delivery never implies model visibility.
- Queue acknowledgement never implies receiver acceptance, context admission,
  or adapter submission.
- A weaker relationship cannot request a stronger intent.
- Stale state-changing messages do not apply to a new run.
- Adapters do not silently claim capabilities they cannot enforce.
