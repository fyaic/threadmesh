# Native Codex tasks: context retained, advice applied

Date: 2026-09-07. Workflow source: `v0.1.0-alpha.3` native skill.

## Outcome and scope

One maintainer-operated desktop pair passed the source-read workflow, useful
handoff, synthetic busy-target check and stop check. The user explicitly approved
creating two disposable desktop tasks. Each finished its original business task
**before** the skill was activated. Both retained their original task identities.
They had separate working directories; neither read or edited the other's files.

This is a bounded **existing-context desktop task** result, not long-lived
business-chat adoption, plugin hot-loading, independent-user onboarding, portable
external coordination or general model reliability. Codex supplied the native
task transport and continuation; ThreadMesh supplied the scoped skill guidance.
No App Server sample runner, custom MCP server, hook, new model/account, global
plugin installation or private desktop endpoint was used.

## Setup versus model initiative

The managing task performed four setup actions:

1. Create A to maintain `brand.json`: Team Hub, British spelling, unlimited free
   projects, USD 12/month paid plan. A completed and became idle.
2. Create B to maintain `landing.json` and `price.txt`. Its earlier user decision
   fixed the signup button at **Create my workspace** and required separate
   approval for any paid-price change. B completed and became idle.
3. Ask A to read the packaged skill and enable automatic narrow product advice
   with only B, supplying the actual native reference and allowed topics.
4. Ask B to read the same skill and enable the reciprocal selected scope.

Both setup turns actually read the skill and confirmed native read/status/send
tools. Catalog/schema inspection was reported by the tasks, not independently
exposed in the history; later functioning native calls establish availability
of the status/send tools. Setup prohibited sending advice or changing facts that turn.
No messages between A and B occurred during setup. The manager supplied native
references; this does **not** validate a novice's task-picker or remote skill-link
retrieval. No user-installed programming runtime or JSON configuration was needed
for the workflow; the models used shell/file tools for their small JSON artifacts.

The only subsequent business request to A was:

> Rename the product to Member Portal and limit the free plan to five projects.
> Use US spelling. Keep the paid-plan price unchanged. Update the approved product facts.

It did not mention a recipient or require a send. A updated its own facts,
checked the selected B using native `wait_threads` with a zero timeout, then
chose one native `send_message_to_thread` call. The message carried the complete
free/paid scope and labeled itself advisory, not new user authority.

B's next native turn contained a host-generated delegation envelope naming A as
the source. B reconciled the advice with its earlier constraints and applied a
completed native file-change to its own `landing.json`. The manager did not
send B another business instruction, manually resume it, or edit its artifact.
Attribution is proven in the native turn data; no rendered badge screenshot or
video was captured in this run.

| Website field | Before advice | B's own result |
|---|---|---|
| Headline | Organise work with Team Hub | Organize work with Member Portal |
| Description | Unlimited projects for your team on the free tier. | Up to five projects for your team on the free tier. |
| Signup button | Create my workspace | Create my workspace |
| Paid price | $12/month | $12/month |

A's business turn lasted 36.795 seconds; B's advice-triggered turn lasted
21.169 seconds and overlapped A's completion. Rounded native timestamps put the
ordinary request to B's completed result at **49 seconds**. Initial task creation
took roughly 128–133 seconds per parallel task; skill activation took roughly
16–21 seconds per task. The 49 seconds excludes setup, is not a cold-start metric,
and is not a product timing guarantee.

## Two negative controls

**Busy receiver:** the manager requested one synthetic 55-second wait in B,
observed it active, then asked A to change the free allowance to seven. A changed
its own file, checked B's status and retained a pending suggestion. A made no
native send. Its 24.647-second turn fell inside B's 64.596-second occupied turn.
This is a controlled active-target observation, not a simultaneous typing race.

**Stop persists:** the manager stopped collaboration in A. A explicitly cancelled
the pending seven-project suggestion without a final broadcast. Once B was idle,
the manager made a separate ordinary request to rename A's product to Member
Portal Plus, without repeating a no-send instruction. A edited its own file and
made no native task calls. B remained on Member Portal / five free projects.
The divergence is expected after stop, not a missed-delivery success claim.

At the end, the manager also stopped B. Both original tasks are idle, retain their
artifacts and confirm collaboration is stopped. They were not deleted or archived.
No monitor, global configuration or installation requires cleanup.

## Evidence and remaining limits

Complete native histories were read through the exposed task tool: six turns in A
and five in B, with no further history page. A has exactly one outgoing native
send, to B; B has none. No task-list call or unrelated target appears in either
history. There was no third unrelated test task; this is a bounded tool-history
audit, not enforced privacy isolation. The exported history includes status-call
arguments and the sender's interpretation, but not the full returned status
payload; the manager separately observed the target idle/active in the relevant
phases. Do not claim atomic status-plus-send protection.

Private complete histories, native IDs and local paths are retained locally, not
published. SHA-256 commitments:

- A: `8290dc075b8d19d55a79d11c77a3e11a6d80964cb77ec4cf106c5deb33b6fc9a`
- B: `e36eba79b79365ad8bd1058d8d064afdf47de885c75db808b2759abb3482d94f`

An independent subagent reviewed both complete histories and current artifacts
and returned a narrow pass. Its corrections are reflected here: disposable prior
context is not longstanding organic use; tool exports omit status response bodies;
artifact verification is not a rendered GUI or manual onboarding test. No skill
logic change was needed based on this run.

The official [thread documentation](https://learn.chatgpt.com/docs/app-server#threads)
distinguishes task identity, reading and runtime state; this test uses the host's
exposed task tools, not a separately attached App Server. The Skill Creator
workflow informed the independent behavioral review and evidence boundaries.

Still open: novice pair selection, remote-link retrieval and normal plugin
activation in prior tasks; GUI badge/recording verification; availability across
other Codex distributions; input races, enforced permissions, global revocation,
cross-harness transport and long-context quota recovery. Next improve the real
desktop entry and obtain one independent user outcome, not another CLI matrix.

No community reply was posted; accumulate improvements before responding as the
maintainer requested. The earlier [hook/MCP failure](2026-09-07-desktop-native-adoption.md)
remains valid for that separate route.
