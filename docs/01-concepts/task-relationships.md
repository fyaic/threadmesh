# Task relationships

ThreadMesh authorization begins with explicit relationships rather than semantic similarity alone.

## Canonical relationship types

Relationship grants are directional from `source` to `target`. Ownership is a
control-plane property, not a task-to-task relationship type. Absence of a
grant means unrelated and provides no discovery or delivery authority.

| `relationshipType` | Directional meaning | Maximum safe default |
|---|---|---|
| `supervisor` | Source supervises target under an explicit grant | Policy-scoped steer/interrupt |
| `parent` | Source delegated the target task | Notify, suggest, and policy-scoped steer |
| `child` | Source was delegated by target | Notify and suggest only |
| `peer` | Source and target are declared peers | Notify and suggest only |
| `dependency` | Source depends on target | Notify and suggest only |
| `observer` | Source observes target | Store-only or side-channel notify |

`peer` describes symmetric authority expectations, but grants remain
directional. Bidirectional peer communication requires one effective grant in
each direction.

## Dependency edges

Relationship grants express authority. Dependency records express work
causality; a `dependency` grant is only the bounded communication authority from
the dependent source toward the target. A task may be:

- blocked by another task;
- supplying an artifact to another task;
- invalidating another task's assumptions;
- sharing a mutable resource;
- duplicating another task's objective.

Dependency discovery may propose a new edge, but policy must approve the resulting visibility and communication rights.

## Semantic relevance is not authorization

Embeddings, titles, shared files, or model judgment can suggest that two tasks are related. They cannot grant permission. This separation prevents a plausible similarity score from becoming an invisible cross-session capability escalation.
