# Proactive coordination

## What makes the behavior proactive

The protocol is not proactive by itself. Proactivity occurs when an agent, without a step-by-step routing instruction, decides that coordination is a useful action toward its current goal.

The system supplies affordances:

- a bounded view of related tasks;
- relationship and capability metadata;
- operations to notify, suggest, steer, wait, or interrupt;
- policies describing when those operations are allowed.

The model supplies situated judgment:

- whether another task is actually relevant;
- whether the dependency is blocking or merely informative;
- which intent is proportionate;
- what evidence and explanation to send;
- whether to wait for a response or continue independently.

This is tool-conditioned agency: deterministic infrastructure enables a model-selected coordination action.

## Coordination maturity levels

1. **Transport:** a program can send a message between known task IDs.
2. **Scripted routing:** a workflow sends predetermined updates.
3. **Model-selected communication:** an agent decides whether and when to contact a known related task.
4. **Dependency discovery:** an agent identifies a previously undeclared relationship.
5. **Negotiated replanning:** tasks exchange evidence, reject assumptions, and revise boundaries.

ThreadMesh must support levels 3–5 without making level 5 mandatory.

## Decision model

An implementation may prompt or train an agent to compare expected coordination value against interference cost:

```text
send when:

expected reduction in failure or duplicated work
  > interruption cost
  + context contamination risk
  + authority uncertainty
  + communication cost
```

This is a behavioral model, not a required numeric formula. The agent should be able to state the evidence behind its decision in a compact `reason` field.

## Anti-patterns

- Treating every shared file or project as permission to communicate.
- Scanning complete task histories to discover relevance.
- Sending `steer` because a harness lacks a proper `suggest` mailbox.
- Assuming silence means acceptance.
- Retrying an interruption indefinitely.
- Optimizing global completion while ignoring user disruption.
