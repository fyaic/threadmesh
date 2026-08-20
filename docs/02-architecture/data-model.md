# Data model

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
  outcome { state, observed_at?, evidence_refs[], detail? }
  updated_at
```

Delivery, receiver decision, and observed outcome are orthogonal state
machines. The receiver uses stable reason codes for automation and optional
detail for people. `adapter-submitted` and `context-admitted` deliberately do
not claim that a model followed the content.

## Audit event

Every state transition emits an event containing its subject, event type,
actor, revision, timestamp, and optional previous-event hash or equivalent
integrity reference. The initial implementation need not use a blockchain or
distributed ledger.
