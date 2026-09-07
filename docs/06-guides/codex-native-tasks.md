# Codex desktop: selected existing tasks

[简体中文](../zh-CN/codex-native-tasks.md)

**Experimental workflow, not a verified desktop integration.** This entry uses
Codex's own task tools when they are already available. The bundled skill adds
opt-in scope and collaboration guidance; it does not add a private desktop API,
a new model, an MCP server or a polling daemon.

## No-terminal workflow to validate

Choose two disposable existing Codex tasks with useful prior context. For
example, a brand task maintains approved product facts; a website task already
has the instruction to keep the signup label **Create my workspace**. Keep
unrelated business tasks outside the test and don't type into the receiver
while the test is running. Normal Codex quota is required.

In each chosen task, provide a native reference to the other task and ask:

> Read and follow the ThreadMesh for Codex workflow at
> [ThreadMesh workflow](../../plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md).
> I authorize only this task and the task I selected to share relevant product
> facts automatically. This task handles [its responsibility]; the other handles
> [its responsibility]. Do not read other conversations. Explain the sending
> limits before enabling it; I understand that an idle check cannot eliminate
> concurrent user-input races. Don't change tool permissions or install anything.

This is an explicit workflow request in the existing conversation, **not proof
that installing a plugin hot-loads old tasks**. The model must actually retrieve
the workflow, inspect available native tools and confirm the selected scope.
If retrieval or native tools are unavailable, stop there; don't use a fresh CLI
thread or a private endpoint as a substitute. The skill is also packaged under
`plugins/threadmesh-codex` for normal plugin distribution testing; no global
plugin installation or marketplace registration is performed by this guide.

Then work normally. In the brand task, for example:

> Rename the product to Member Portal and limit the free plan to five projects.
> Use US spelling and keep the paid-plan price unchanged.

This business request does not demand a send or prescribe a recipient. The
model decides whether the selected website task needs the change. A useful
result is an attributed native message, followed by that **same** website task
updating its own copy while keeping its earlier button decision and price.
Read the receiver's actual result; a delivery notification alone is insufficient.

## Limits that matter

- Requires native read/status/send tools to be exposed by this Codex host.
  A skill alone cannot create that capability or provide another harness with it.
- Native send lacks an atomic idle-only condition. The skill skips busy,
  unknown or unloaded targets, but cannot guarantee non-interruption. If that
  guarantee is required, retain a suggestion for review instead of auto-sending.
- A task reference avoids listing every task. Name lookup needs permission
  because the native list also returns other task titles/summaries. Ambiguous
  titles need clarification, not a guessed destination.
- Stop in **both** tasks to stop both directions. Stopping one task doesn't
  recall submitted messages or atomically revoke the other task's permission.
- These are model instructions, not enforced privacy or permission controls.
  Only use trusted, deliberately selected tasks; no broad chat-history sharing.

## Evidence required before promotion

Retain the pre-existing receiver ID privately, its earlier decision, actual
native send and source attribution, the receiver's own artifact change and
business check. Record human setup actions, a busy-target no-send check and a
stop/no-further-send check. Do not publish private IDs or transcripts.

Packaging validation and a behavioral tabletop review are not this live proof.
The earlier [hook/MCP adoption attempt](../09-reviews/2026-09-07-desktop-native-adoption.md)
did not pass. A passing new App Server sample would still be a different path.
