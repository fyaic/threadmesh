# Terminology

| Term | Meaning |
|---|---|
| **Agent** | A model-driven process that can reason, select tools, and advance a task. |
| **Harness** | The runtime around an agent: context, tools, state, sandbox, approvals, and execution loop. |
| **Task** | An addressable unit of work with an objective, lifecycle, owner, and optional active run. |
| **Run** | One active execution instance of a task. Similar to a turn in some harnesses. |
| **Task owner** | The principal with final authority over the task, usually a user or parent task. |
| **User-owned task** | A task whose active objective is directly controlled by a user. |
| **Delegated task** | A task created by another task to achieve a bounded objective. |
| **Peer task** | A related task without parent or supervisory authority over the other. |
| **Supervisor** | A principal explicitly authorized to steer or interrupt a task. |
| **Mailbox** | Receiver-controlled storage for coordination messages that have not necessarily entered model context. |
| **Checkpoint** | A safe boundary where the harness may inspect mailbox content and revise execution. |
| **Intent** | The requested coordination effect: `notify`, `suggest`, `steer`, or `interrupt`. |
| **Disposition** | Receiver outcome: accepted, rejected, deferred, expired, stale, or unsupported. |
| **Freshness token** | A value binding a request to observed task state, such as a run ID or objective version. |
| **Provenance** | Origin, authorship, causal chain, and routing metadata for a coordination action. |
| **Context sovereignty** | The receiver's authority over what enters its active model context and changes its objective. |
| **Adapter** | A harness-specific implementation of the ThreadMesh contract. |
| **Control plane** | Registry, policy, routing, mailbox, and audit components outside individual agent loops. |
| **Interference budget** | A configured limit on the cost or frequency of proactive coordination. |
