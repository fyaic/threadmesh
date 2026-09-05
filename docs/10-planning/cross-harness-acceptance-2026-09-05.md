# Cross-harness product acceptance

Date: 2026-09-05. Baseline: `98bba82`. This increment is explicitly delegated
to implementation, validation and internal product-review lanes. The main
agent owns integration, debugging and final acceptance. Internal reviewers are
not independent community adopters.

## User outcome

Two different native harnesses work on a shared project. A normal task in A
causes A's model to contact the relevant B workstream without user relay. B
continues in its already-started native session, keeps a prior user constraint
and produces a useful, independently checked file change. Unrelated work stays
quiet. Neither a tool inventory nor a successful send alone meets this goal.

## Ownership and sequence

| Lane | Owned work | Handoff |
|---|---|---|
| Codex context | Invocation-scoped native task-start awareness; focused tests | Main agent reviews trust, additive context and actual native readiness |
| Cross-harness validation | Successful delivery, same receiver identity, prior context and business assertions | Run real models only after launcher readiness; preserve failures |
| Product review | Critique goal drift, scripted sends, existing-session limits and first-use claims | Review implementation and observed evidence independently of authors |
| Main agent | Integration/debug, final documentation, regression tests and GitHub merge | Accept only the observed outcome, not the number of completed subtasks |

The shared working branch is `feat/cross-harness-mainline`. Lanes edit separate
files; only the main agent commits and publishes.

## Acceptance, not proxies

- Ordinary business prompts do not prescribe a recipient, message or send.
  Generic opt-in collaboration guidance and declared peer goals are retained
  as part of the experiment, not concealed as zero scaffolding.
- A successful native send result and persisted message establish delivery.
  A reserved database send row is insufficient.
- B's native session identity is unchanged, and its automatic continuation
  begins after successful delivery. Native IDs remain private.
- B acts on the real artifact and preserves a receiver-only prior constraint.
  Receiving, accepting, editing and passing checks are separate observations.
- A no-contact control checks silence when collaboration is not useful.
- Existing user/global instructions, other hook trust and shell/file approval
  policies are not replaced or broadly bypassed.

## Bounds and non-goals

Start with the installed, authenticated Codex → Pi path. Inspect the native
context seam before using model quota. A failed run requires a concrete new
diagnosis before another attempt; do not repeatedly reword tool descriptions.
DeepSeek remains a first-wave target but needs a configured provider for live
model evidence. Do not repeatedly retry exhausted Kimi quota.

This increment must not quietly claim arbitrary existing-tab attachment,
lossless long-chat migration, broad reliability or live busy-receiver safety
from a fresh/idle fixture. Record these gaps explicitly. Native resume and
first-user setup remain product work, not permission to inspect private chats.

No new coordination framework, five-role audit, hero animation or broad
competitor research is needed for this acceptance. Checkpoint quota recovery
is a separate real-task acceptance, not counted as cross-harness initiative.

## Completion record

Pending implementation and live verification. Update this section with actual
outcomes and links before merging; do not mark a failed main goal as complete
because the implementation and unit tests pass.
