# Message envelope

> Draft normative document.

## Required fields

| Field | Purpose |
|---|---|
| `specVersion` | Protocol compatibility |
| `messageId` | Global idempotency key |
| `messageType` | Semantic shape: observation, question, suggestion, result, state update, or action request |
| `intent` | `notify`, `suggest`, `steer`, or `interrupt` |
| `claimStatus` | Whether claims are unverified, sender-asserted, or evidence-referenced |
| `sender.taskId` and `sender.incarnationId` | Origin task incarnation |
| `sender.actorType` | User, agent, service, or policy |
| `target.taskId` and `target.incarnationId` | Destination task incarnation |
| `relationshipId` | Authorization and causal context |
| `content` | Human/model-readable coordination content |
| `reason` | Why the sender expects coordination to help |
| `delivery.requestedMode` | Requested storage, notification, admission, steer, or interrupt behavior |
| `createdAt` | Origin time |
| `expiresAt` | Delivery validity window |

Every task reference binds an opaque task incarnation. `steer` and `interrupt`
MUST additionally include `expectedRunId` or `expectedObjectiveVersion`.
Receivers MAY require both. Objective versions are receiver-maintained monotonic
counters, not hashes of prompt content.

Intent constrains delivery mode:

- `notify`: `store-only` or `side-channel`;
- `suggest`: `store-only`, `side-channel`, `checkpoint-offer`, or `wake-idle`;
- `steer`: `active-steer`;
- `interrupt`: `interrupt-request`.

## Example

```json
{
  "specVersion": "0.0-draft",
  "messageId": "msg_01J...",
  "messageType": "suggestion",
  "intent": "suggest",
  "claimStatus": "evidence-referenced",
  "sender": {
    "taskId": "task_release",
    "incarnationId": "inc_release_01J...",
    "actorType": "agent",
    "harness": "harness-a"
  },
  "target": {
    "taskId": "task_validation",
    "incarnationId": "inc_validation_01J...",
    "harness": "harness-b"
  },
  "relationshipId": "rel_release_validation",
  "content": "The capability count changed from 6 to 10. Re-check the assertion before interpreting the smoke test.",
  "reason": "The target appears to be validating an obsolete invariant that blocks the release goal.",
  "evidenceRefs": ["artifact://release/capability-list@sha256:..."],
  "causality": {
    "traceId": "trace_release_42",
    "hopCount": 0
  },
  "delivery": {
    "requestedMode": "checkpoint-offer",
    "requiresDisposition": true
  },
  "createdAt": "2026-08-20T09:00:00Z",
  "expiresAt": "2026-08-20T09:10:00Z"
}
```

## Content safety

The `content` field is untrusted input even when another authorized agent produced it. Adapters MUST preserve its provenance and MUST NOT relabel it as user-authored content.

Evidence references SHOULD identify immutable or versioned artifacts. A reference does not grant access to the artifact.

Plain message content MUST NOT answer a structured approval, permission,
elicitation, or user-input gate. The initial draft deliberately advertises
structured gate responses as unsupported.
