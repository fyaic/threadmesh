# Reference architecture

```text
┌──────────────────────────── User / Product UI ────────────────────────────┐
│ task graph · inbox · provenance · approvals · interrupt controls          │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   │
┌────────────────────── ThreadMesh control plane ───────────────────────────┐
│ Registry │ Relationship graph │ Policy │ Router │ Mailbox │ Audit log      │
└──────────┬───────────────────────────────────────────────────┬──────────────┘
           │ adapter contract                                  │
┌──────────▼───────────┐                              ┌─────────▼────────────┐
│ Harness A adapter    │                              │ Harness B adapter     │
│ map task/run/events  │                              │ map task/run/events  │
└──────────┬───────────┘                              └─────────┬────────────┘
           │                                                    │
┌──────────▼───────────┐                              ┌─────────▼────────────┐
│ Harness A agent loop │                              │ Harness B agent loop  │
│ model · tools · state│                              │ model · tools · state│
└──────────────────────┘                              └──────────────────────┘
```

## Components

### Task registry

Stores stable ThreadMesh task identities and adapter-local references. It exposes minimal status and capability metadata, not full conversation history.

### Relationship and dependency graph

Records authority relationships separately from work dependencies. Edges are versioned and attributable.

### Policy engine

Evaluates sender, target, relationship, intent, freshness, ownership, and deployment policy. It returns an allow, deny, require-approval, or downgrade decision.

### Router

Validates envelopes, applies idempotency and expiry, resolves the target adapter, and records delivery transitions.

### Mailbox

Provides durable receiver-controlled storage. Mailbox acceptance is distinct from model-context injection.

### Audit log

Stores append-only coordination events and causal links. Sensitive content may be redacted or stored separately; integrity metadata must remain.

### Harness adapter

Maps ThreadMesh task, run, checkpoint, and intent semantics onto the harness. It advertises unsupported behaviors instead of approximating them silently.

## Deployment shapes

The initial implementation may run as a local daemon with adapters in separate processes. Future deployments may embed the coordinator in one harness or place it behind a service boundary. Protocol semantics should not depend on the deployment shape.

## Current implementation slice

The repository currently implements only a trusted in-process slice of this
architecture:

- [`SqliteCoordinator`](../../src/coordinator/sqlite-coordinator.mjs) combines a
  minimal registry, owner-scoped grants, mailbox, dispositions, admission
  claims, and audit events in one process;
- [`AcpStdioAdapter`](../../src/adapters/acp-stdio.mjs) binds a registered ACP
  session, denies permission requests, and returns prompt evidence;
- the caller manually composes prepare, adapter dispatch, and confirmation;
- no user/product UI, event-stream inspector, authenticated service boundary,
  or OS sandbox is included.

This slice validates failure semantics and informs the target architecture. It
is not yet the independently deployable control plane shown above.
