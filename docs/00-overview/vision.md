# Vision

## The capability

An agent is working on task A. During execution it realizes that task B is relevant: B may supply a dependency, be invalidated by new evidence, duplicate work, or create a conflict. The agent decides to coordinate with B without waiting for the user to manually connect the sessions.

This behavior can feel intelligent because the agent is not merely following a predetermined edge in a workflow. It forms a local model of a multi-task world, recognizes a causal relationship, chooses a communication act, and adapts based on the response.

ThreadMesh exists to make that capability portable and governable.

## The problem

Transport alone is easy. A task ID and a message queue are enough to move text. Safe proactive coordination requires answers to harder questions:

- What may an agent know about other tasks?
- How does it discover relevance without scanning private histories?
- Who authorized the relationship?
- Is the receiver still pursuing the objective the sender observed?
- Does the message enter model-visible context or remain a side-channel?
- Can the receiver reject it?
- Who can interrupt user-owned work?
- Can a user reconstruct the complete causal chain?

Harness-specific implementations answer these questions differently or leave them implicit. That prevents portable adapters and makes behavior difficult to reason about.

## Desired future

ThreadMesh should let a harness declare its coordination capabilities and safely participate in a shared task graph. An agent should be able to:

1. discover a minimal summary of related tasks;
2. inspect the relationship and allowed actions;
3. explain why coordination is expected to help;
4. choose the least disruptive intent;
5. send a version-bound request;
6. receive an explicit disposition;
7. update its plan without assuming compliance;
8. leave an auditable trail.

Users should be able to see which content they authored, which content an agent produced, which task sent it, why it was allowed, and whether it changed the receiver's execution.

## Product promise

**Give agents the initiative to coordinate across tasks without giving them invisible authority over one another.**

## Success criteria

ThreadMesh succeeds when:

- an adapter can be implemented without changing a harness's model provider;
- two different harnesses can exchange coordination with consistent semantics;
- peer messages do not silently enter active prompt context;
- stale or unauthorized state changes fail closed;
- provenance survives retries, restarts, and forwarding;
- proactive coordination measurably improves outcomes under an explicit interference budget.
