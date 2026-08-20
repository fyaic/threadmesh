# Message envelope

> Draft normative document.

## Required fields

| Field | Purpose |
|---|---|
| `specVersion` | Protocol compatibility |
| `messageId` | Global idempotency key |
| `intent` | `notify`, `suggest`, `steer`, or `interrupt` |
| `sender.taskId` | Origin task |
| `sender.actorType` | User, agent, service, or policy |
| `target.taskId` | Destination task |
| `relationshipId` | Authorization and causal context |
| `content` | Human/model-readable coordination content |
| `reason` | Why the sender expects coordination to help |
| `createdAt` | Origin time |
| `expiresAt` | Delivery validity window |

`steer` and `interrupt` MUST include at least one freshness constraint, normally `expectedRunId` or `expectedObjectiveVersion`.

## Example

```json
{
  "specVersion": "0.0-draft",
  "messageId": "msg_01J...",
  "intent": "suggest",
  "sender": {
    "taskId": "task_release",
    "actorType": "agent",
    "harness": "harness-a"
  },
  "target": {
    "taskId": "task_validation"
  },
  "relationshipId": "rel_release_validation",
  "content": "The capability count changed from 6 to 10. Re-check the assertion before interpreting the smoke test.",
  "reason": "The target appears to be validating an obsolete invariant that blocks the release goal.",
  "evidenceRefs": ["artifact://release/capability-list@sha256:..."],
  "freshness": {
    "expectedRunId": "run_validation_7",
    "expectedObjectiveVersion": 3
  },
  "causality": {
    "traceId": "trace_release_42"
  },
  "delivery": {
    "modelVisibility": "checkpoint",
    "requiresDisposition": true
  },
  "createdAt": "2026-08-20T09:00:00Z",
  "expiresAt": "2026-08-20T09:10:00Z"
}
```

## Content safety

The `content` field is untrusted input even when another authorized agent produced it. Adapters MUST preserve its provenance and MUST NOT relabel it as user-authored content.

Evidence references SHOULD identify immutable or versioned artifacts. A reference does not grant access to the artifact.
