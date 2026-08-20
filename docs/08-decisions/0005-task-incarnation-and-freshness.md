# ADR 0005: Bind coordination to task incarnation and freshness

- Status: Accepted
- Date: 2026-08-20
- Issue: [#4](https://github.com/fyaic/threadmesh/issues/4)

## Context

Durable task identifiers may be resumed, recreated, imported, or reused by a
harness. A request that was correct for one task incarnation can be harmful to
another. Run IDs alone are insufficient when an objective changes inside one
run. Hashing complete prompts is also unsuitable because it leaks a stable
fingerprint of private content and changes for editorial reasons.

## Decision

Every ThreadMesh task reference contains:

- a stable local or federated `taskId`;
- an opaque, randomly generated `incarnationId` that changes whenever identity
  continuity cannot be proven.

Every envelope binds both sender and target incarnations.

`steer` and `interrupt` additionally require at least one target freshness
constraint:

- `expectedRunId`; or
- `expectedObjectiveVersion`.

Adapters may require both. Objective versions are monotonic counters maintained
by the receiver; they are not hashes of prompt content. Checkpoint identifiers
are optional refinements and never replace task incarnation.

Receivers fail closed when incarnation or mandatory freshness cannot be
evaluated. Replaying an envelope against a new incarnation is stale even if the
human-readable task ID is unchanged.

## Consequences

- State-changing requests cannot silently target recreated work.
- Adapters must persist or reconstruct task incarnation identity.
- Import and resume operations need explicit continuity rules.
- Objective edits require a receiver-maintained revision counter.
- `notify` and `suggest` can omit run/objective freshness, but still bind target
  incarnation and remain subject to expiry.

## Rejected alternatives

### Task ID alone

It cannot distinguish deletion/recreation, imported sessions, or identity reuse.

### Prompt hash as objective version

It leaks correlation information, changes for non-semantic edits, and cannot be
computed consistently across harnesses.

### Creation timestamp as incarnation

Timestamps can collide, reveal unnecessary metadata, and are not an explicit
identity-continuity decision.
