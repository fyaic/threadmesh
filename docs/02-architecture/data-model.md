# Data model

> The structures below describe the target model. The current SQLite prototype
> implements a deliberately smaller subset in
> [`src/coordinator/sqlite-coordinator.mjs`](../../src/coordinator/sqlite-coordinator.mjs).

## Task

```text
Task
  id
  incarnation_id
  adapter
  local_ref
  owner
  objective_summary
  objective_version
  state
  active_run_id?
  capabilities
  sensitivity
  created_at
  updated_at
```

`objective_summary` is intentionally not the complete prompt. Adapters should expose the least information needed for coordination.

`incarnation_id` is opaque and changes whenever identity continuity cannot be
proven. `objective_version` is a receiver-maintained monotonic counter rather
than a prompt hash.

## Relationship

```text
Relationship
  id
  grant_id
  grant_version
  source_task_ref
  target_task_ref
  type
  allowed_intents
  allowed_delivery_modes
  summary_visibility
  granted_by
  expires_at?
```

The canonical `relationshipType` vocabulary is directional from source to
target: `supervisor`, `parent`, `child`, `peer`, `dependency`, or `observer`.
Ownership is stored separately. Bidirectional peer authority requires one grant
in each direction.

Agents may create a separate expiring `RelationshipProposal`. It contains the
requested relationship and a reason but no authority. An effective relationship
grant adds an authenticated owner/policy decision and canonical integrity
digest.

## Task summary projection

```text
TaskSummaryProjection
  relationship_id
  grant_id
  grant_version
  summary_visibility { state-only | coordination | objective-hint }
```

The projection is part of the authenticated JSON-RPC read context. A consumer
reauthorizes it against the current effective grant before returning
relationship-scoped fields.

## Operation replay and mailbox claims

```text
OperationReplay
  authentication_id
  method
  idempotency_key
  request_digest
  result

MailboxClaim
  message_identity
  receiver_task_incarnation
  expected_disposition_revision
  random_claim_token
  state { claimed | acknowledged }
  expires_at
```

Operation replay makes database mutations durable across binding restarts.
Mailbox claims coordinate receiver workers and remain distinct from irreversible
adapter-effect admission claims.

## Coordination envelope

```text
CoordinationEnvelope
  spec_version
  message_id
  message_type
  intent
  claim_status
  sender
  target
  relationship_id
  content
  reason
  evidence_refs[]
  freshness
  causality
  delivery
  created_at
  expires_at
```

The machine-readable draft is in [`spec/schema/threadmesh-envelope.schema.json`](../../spec/schema/threadmesh-envelope.schema.json).

## Disposition

```text
Disposition
  disposition_id
  message_id
  receiver_task_ref
  revision
  delivery { state, observed_at, failure_reason? }
  decision { state, decided_at?, decided_by?, reason_code?, detail? }
  outcome {
    state,
    observed_at?,
    evidence_refs[],
    verification_attestations[]?,
    detail?
  }
  updated_at
```

Delivery, receiver decision, and observed outcome are orthogonal state
machines. The receiver uses stable reason codes for automation and optional
detail for people. `adapter-submitted` and `context-admitted` deliberately do
not claim that a model followed the content.

## Admission claim

```text
AdmissionClaim
  sender_incarnation_id
  message_id
  nonce
  admission_token
  expected_revision
  grant_id
  grant_version
  adapter_ref
  adapter_ref_digest
  state { in-flight | completed | outcome-unknown? }
  claimed_at
  completed_at?
```

The experimental coordinator persists one claim per message before an external
ACP dispatch. The claim is the revocation linearization boundary and prevents a
second worker or restart from automatically redelivering the same prompt. A
crash can leave a claim `in-flight`. Native state-changing calls use the
separate durable adapter-submission record and `outcome-unknown`
reconciliation state machine defined by ADR 0008.

## Interruption result

```text
InterruptionResult
  interruption_id
  message_id
  receiver_task_ref
  freshness?
  requested_at
  results {
    model_turn: TargetResult
    tool_calls: { enumeration, targets[] }
    subprocesses: { enumeration, targets[] }
  }
  updated_at
```

There is deliberately no overall success field. Each target reports requested,
cancelled, not-cancellable, not-running, failed, stale, or denied.

## Verification attestation

```text
VerificationAttestation
  attestation_id
  verifier { actor, authentication_id, trust_domain }
  subject { message, receiver, claim_type, claim_digest }
  method
  evidence_digest
  verified_at
  trust_policy { policy_id, decision_id, decision, decided_at }
  signed_payload_digest
  proof { algorithm, key_id, signature }
```

The key ID resolves through a separately configured trust anchor. The
attestation does not carry authority to trust its own key.

## Audit event

Every state transition emits an event containing its subject, event type,
actor, revision, timestamp, and optional previous-event hash or equivalent
integrity reference. The initial implementation need not use a blockchain or
distributed ledger.

## Prototype-to-target gaps

The prototype now persists objective versions and bounded terminal reasons, and
the stacked storage work covers append-only migration plus retention
tombstones. It still does not persist typed interruption results or verification
attestations, supply production credential verification, provide hash-linked
audit integrity, manage backup expiry, or promise forensic erasure. The storage
contract is tracked by [#9](https://github.com/fyaic/threadmesh/issues/9) and
retention execution by
[#34](https://github.com/fyaic/threadmesh/issues/34).
