# Task relationships

ThreadMesh authorization begins with explicit relationships rather than semantic similarity alone.

## Relationship types

| Relationship | Description | Safe default |
|---|---|---|
| `owns` | A user or principal owns the target task | Full control subject to platform policy |
| `supervises` | Sender was explicitly granted oversight | Configured steer/interrupt authority |
| `parent-of` | Sender created the delegated target | Notify, suggest, and scoped steer |
| `child-of` | Sender is delegated by the target | Notify and suggest upward |
| `peer-of` | Tasks share a declared goal or dependency | Notify and suggest only |
| `observes` | Sender can read minimal task status | No write authority |
| `unrelated` | No declared relationship | No discovery or delivery |

## Dependency edges

Relationships express authority; dependency edges express work causality. A task may be:

- blocked by another task;
- supplying an artifact to another task;
- invalidating another task's assumptions;
- sharing a mutable resource;
- duplicating another task's objective.

Dependency discovery may propose a new edge, but policy must approve the resulting visibility and communication rights.

## Semantic relevance is not authorization

Embeddings, titles, shared files, or model judgment can suggest that two tasks are related. They cannot grant permission. This separation prevents a plausible similarity score from becoming an invisible cross-session capability escalation.
