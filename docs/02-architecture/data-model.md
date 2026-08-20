# Data model

## Task

```text
Task
  id
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

## Relationship

```text
Relationship
  id
  source_task_id
  target_task_id
  type
  allowed_intents
  granted_by
  version
  expires_at?
```

## Coordination envelope

```text
CoordinationEnvelope
  spec_version
  message_id
  intent
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
  message_id
  state
  receiver_task_id
  applied_at?
  reason_code?
  detail?
```

The receiver should use stable reason codes for automation and optional detail for people.

## Audit event

Every state transition emits an event containing the message ID, event type, actor, timestamp, and previous event hash or equivalent integrity reference. The initial implementation need not use a blockchain or distributed ledger.
