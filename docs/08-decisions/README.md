# Architecture Decision Records

ADRs capture durable decisions that constrain the protocol or implementation.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-mailbox-before-injection.md) | Use receiver mailboxes before model-context injection | Accepted |
| [0002](0002-separate-coordination-intents.md) | Separate notify, suggest, steer, and interrupt | Accepted |
| [0003](0003-coordination-layer-not-orchestrator.md) | Keep ThreadMesh a coordination layer, not a full orchestrator | Accepted |
| [0004](0004-separate-coordination-transitions.md) | Separate delivery, decision, context admission, adapter submission, and verified outcome | Accepted |
| [0005](0005-task-incarnation-and-freshness.md) | Bind messages to task incarnation and state-changing requests to freshness | Accepted |
| [0006](0006-provider-neutral-provenance.md) | Keep the core envelope provider-neutral and structured gates isolated | Accepted |
| [0007](0007-minimal-task-summary.md) | Publish minimal relationship-scoped task summaries | Accepted |
| [0008](0008-outcome-unknown-before-external-dispatch.md) | Persist outcome unknown before external dispatch and reconcile before retry | Accepted |

New ADRs should include context, decision, consequences, rejected alternatives, and status.
