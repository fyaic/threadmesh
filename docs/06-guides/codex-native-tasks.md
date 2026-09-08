# Codex desktop: selected existing tasks

[简体中文](../zh-CN/codex-native-tasks.md)

**Experimental workflow with controlled native passes.** This entry uses
Codex's own task tools when they are already available. The bundled skill adds
opt-in scope and collaboration guidance; it does not add a private desktop API,
a new model, an MCP server or a polling daemon.

## No-terminal workflow

**Work in the original Codex tasks. No website needs to stay open.** The setup
below is an instruction to each task, not registration with a hosted service.
If editing the template is inconvenient, the optional
[setup-text helper](https://fyaic.github.io/threadmesh/) prepares the two strings
locally in your browser. It cannot observe or control collaboration and is not
a live demo. [What the helper was actually tested for](../09-reviews/2026-09-08-pairing-helper-acceptance.md).

Choose two disposable existing Codex tasks with useful prior context. For
example, a brand task maintains approved product facts; a website task already
has the instruction to keep the signup label **Create my workspace**. Keep
unrelated business tasks outside the test and don't type into the receiver
while the test is running. Normal Codex quota is required.

### 1. Paste this into each chosen task

Open the other task and use **Copy chat deep link**: **⌘⌥L** on macOS or
**Ctrl+Alt+L** on Windows. If your shortcuts differ, find the command in
**Settings → Keyboard Shortcuts**. These are
[official app commands](https://learn.chatgpt.com/docs/reference/commands).

Paste that link in place of **OTHER TASK LINK** below, then fill in **SHARED
TOPIC**—for example, approved product names, spelling and free-plan limits.
Repeat in the other direction. The link has the form `codex://threads/<thread-id>`
and identifies an existing **local** task. You copy the whole link; you do not
need to find or type an internal ID, share a conversation snapshot, clone a
repository or open a terminal.

```text
Use the ThreadMesh workflow at this pinned public URL. Read the complete file:
https://raw.githubusercontent.com/fyaic/threadmesh/c0a0a913439732229a2bb811d23cc790c2dd0408/plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md

Pair only this task with OTHER TASK LINK. Each keeps its own current job and
earlier decisions. Allowed shared topic: SHARED TOPIC.
Use the supplied local chat link to identify the peer and verify only that
task with native read/status tools. Do not list all tasks or read unrelated
conversations. If the link or target cannot be verified, leave collaboration off.

I authorize automatic, relevant peer advice after both tasks complete setup. I understand an idle
check cannot guarantee that sending never races with new user input.
This setup turn must not send any peer messages or change any business files.
Do not install software, change permissions or create tasks.
Confirm the selected peer by title, allowed topic, available native tools and
whether this task is ready. Do not claim both are connected from this setup alone.
If anything is unavailable, leave collaboration off.
```

Want to check first without enabling? Replace the automatic-advice
authorization paragraph with:
“Only check readiness. Keep collaboration off, including any previous stop;
do not send messages, edit files or restore pending advice.” Readiness is not
activation and does not verify the peer's quota.

### 2. Wait for both setup confirmations, then work normally

Each task must confirm its own setup. Linking the other task does not activate
it. A missing workflow, missing tools or unverified target is a stopped setup,
not a successful connection. You can say **Stop ThreadMesh collaboration** in
each task to cancel it; no separate control panel is required.

No readable confirmation means no verified setup, even if the app says
“completed.” Keep collaboration off; see the
[retained failed entry checks](../09-reviews/2026-09-07-native-public-entry.md#read-only-diagnosis-and-correction)
instead of treating a delivery or empty result as success.

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

### 3. Check the result and stop, in the same conversations

Ask **“Check ThreadMesh status”** when unclear. This read-only request must not
enable collaboration or resend anything. Expect a concise account of the local
scope/mode, selected peer, last observed result and what remains unknown:

| Task says | What it establishes |
|---|---|
| This task is ready | Only this end completed setup; the peer's agreement still needs confirmation |
| Not sent: receiver busy / setup unknown | Advice stays in this conversation; no automatic retry or durable queue is implied |
| Sent, result unverified | A message was submitted, not proof of a useful edit |
| Receiver reports done | A completion report exists; check the artifact before treating it as verified |
| Verified + artifact/test | The stated business result was actually checked |
| This task stopped | Local pending advice is cancelled; it does not prove the other side stopped |

These are plain-language reports from the agent, not a persistent status service
or guaranteed host-enforced state machine. Empty reads remain unknown. Say
**“Stop ThreadMesh collaboration”** in both tasks to stop both directions;
checking status afterward must not resume cancelled advice. Previously submitted
messages cannot be recalled by this skill.
One original-task read-only check preserved the stop and reported unknown peer
state correctly. It took about 142 seconds, not an instant lookup; incomplete
early observations are retained. [Validation boundary](../09-reviews/2026-09-08-pairing-helper-acceptance.md#later-correction-local-tasks-first-not-a-website-demo).

### Optional: use a task name instead

An already attached native task reference also works. If you prefer an exact
task title, explicitly allow one native task-list lookup, understanding that it
also exposes other task titles/summaries. The current host accepts `limit: 50`
at most. Its pinned and unpinned results are not a complete search. If the title
is missing or ambiguous, use **Copy chat deep link** rather than expanding the
scan or guessing. No particular desktop `@` picker is assumed.

## Limits that matter

- Requires native read/status/send tools to be exposed by this Codex host.
  A skill alone cannot create that capability or provide another harness with it.
- Native send lacks an atomic idle-only condition. The skill skips busy,
  unknown or unloaded targets, but cannot guarantee non-interruption. If that
  guarantee is required, retain a suggestion for review instead of auto-sending.
- A local chat link avoids listing every task; it does not grant permission or
  establish cross-host support. Name lookup needs permission
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

The [September 8 deep-link run](../09-reviews/2026-09-08-native-deep-link-acceptance.md)
passed public workflow retrieval, scoped setup and the useful handoff using the
same two existing test tasks. Setup took about 137 and 141 seconds respectively,
with no global task listing, peer messages or business edits. After both
confirmations, the manager asked only A to change the approved product to
**Member Studio**, limit the free plan to **three projects**, use US spelling
and retain paid pricing. A checked B's current idle status and chose one native
send. Original B made its own correct copy edit while preserving the signup
button and price. The business request to B's completed result took about
**61 seconds, excluding setup**; this is one observed run, not a timing promise.

The manager constructed official-format deep links from already known native
IDs and sent setup through native tools. This verifies the **public workflow
and link-input path**, not someone pressing the copy shortcut or a novice's
manual GUI onboarding. The pair was retained from an earlier dedicated test,
not newly recreated or adopted from ordinary long-running user work. Native
source attribution was read from turn data, not a screenshot.

The [September 7 run](../09-reviews/2026-09-07-native-desktop-acceptance.md)
retains the earlier busy/stop controls and local-source case. The failed
[title-based entry checks](../09-reviews/2026-09-07-native-public-entry.md)
remain available; the deep-link pass does not establish complete title search.

Packaging validation and a behavioral tabletop review alone are not live proof.
The earlier [hook/MCP adoption attempt](../09-reviews/2026-09-07-desktop-native-adoption.md)
did not pass. A passing new App Server sample would still be a different path.
