# Codex desktop: selected existing tasks

[简体中文](../zh-CN/codex-native-tasks.md)

**Experimental workflow with one controlled native pair pass.** This entry uses
Codex's own task tools when they are already available. The bundled skill adds
opt-in scope and collaboration guidance; it does not add a private desktop API,
a new model, an MCP server or a polling daemon.

## No-terminal workflow

Choose two disposable existing Codex tasks with useful prior context. For
example, a brand task maintains approved product facts; a website task already
has the instruction to keep the signup label **Create my workspace**. Keep
unrelated business tasks outside the test and don't type into the receiver
while the test is running. Normal Codex quota is required.

### 1. Paste this into each chosen task

Replace **OTHER TASK TITLE** with the other task's exact sidebar title and
**SHARED TOPIC** with the limited subject they may exchange, such as approved
product names, spelling and free-plan limits. No internal ID, local path, clone
or terminal command is needed in this prompt.

```text
Use the ThreadMesh workflow at this pinned public URL. Read the complete file:
https://raw.githubusercontent.com/fyaic/threadmesh/592014782d10a8c4b88f46ea23b7cf588ff78355/plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md

Pair only this task with "OTHER TASK TITLE". Each keeps its own current job and
earlier decisions. Allowed shared topic: SHARED TOPIC.
I allow one task-list lookup to resolve that title, understanding that the list
also exposes other task titles/summaries. Do not read unrelated conversations.
If the title is missing or ambiguous, ask me; do not guess or scan more history.

I authorize automatic, relevant peer advice after setup. I understand an idle
check cannot guarantee that sending never races with new user input.
This setup turn must not send any peer messages or change any business files.
Do not install software, change permissions or create tasks.
Confirm the selected peer by title, allowed topic, available native tools and
whether this task is enabled. If anything is unavailable, leave collaboration off.
```

If your app has already attached a native task reference, use that instead of
the title and remove the task-list permission paragraph. Do not hunt for IDs
in local files. A native reference picker is host-dependent; this guide does
not assume a particular desktop `@` menu.

Want to check first without enabling? Replace the two automatic-advice
authorization sentences with:
“Only check readiness. Keep collaboration off, including any previous stop;
do not send messages, edit files or restore pending advice.” Readiness is not
activation and does not verify the peer's quota.

### 2. Wait for both setup confirmations, then work normally

Each task must confirm its own setup. Naming the other task does not activate
it. A missing workflow, missing tools or unresolved title is a stopped setup,
not a successful connection. You can say **Stop ThreadMesh collaboration** in
each task to cancel it; no separate control panel is required.

If the app shows “completed” but supplies no readable setup confirmation, keep
collaboration off. Do not assume pairing worked or repeatedly rerun it. This
occurred in our [readiness attempt](../09-reviews/2026-09-07-native-public-entry.md#authorized-live-readiness-attempt);
its cause is unresolved, and a completed indicator alone is not acceptance.

This is an explicit workflow request in the existing conversation, **not proof
that installing a plugin hot-loads old tasks**. The model must actually retrieve
the workflow, inspect available native tools and confirm the selected scope.
If retrieval or native tools are unavailable, stop there; don't use a fresh CLI
thread or a private endpoint as a substitute. The skill is also packaged under
`plugins/threadmesh-codex` for normal plugin distribution testing; no global
plugin installation or marketplace registration is performed by this guide.

In the brand task, for example:

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

The [September 7 controlled run](../09-reviews/2026-09-07-native-desktop-acceptance.md)
passed this source-read workflow with two disposable tasks that had completed
prior context, original B's own correct edit, and busy/stop checks. The manager
supplied task references and a local skill path through native task messages;
it did not validate the title-based prompt above. The public source is pinned
so readers can inspect the same workflow rather than a maintainer-local file.
See the [public-entry check](../09-reviews/2026-09-07-native-public-entry.md) for
the exact tested boundary. A novice's manual GUI onboarding remains unverified.
Native source attribution was read from turn data, not a screenshot.

Packaging validation and a behavioral tabletop review alone are not live proof.
The earlier [hook/MCP adoption attempt](../09-reviews/2026-09-07-desktop-native-adoption.md)
did not pass. A passing new App Server sample would still be a different path.
