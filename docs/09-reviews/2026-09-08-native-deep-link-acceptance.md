# Public workflow + chat link: original-task handoff passed

Date: 2026-09-08. **PASS for one maintainer-operated native link-input workflow:**
public source → selected original tasks → both setup confirmations → ordinary
business request → A's chosen send → original B's own correct edit → both stopped.
This completes the controlled public-entry gate, not independent GUI onboarding.

## What the user gets

The [English setup](../06-guides/codex-native-tasks.md) and
[中文入口](../zh-CN/codex-native-tasks.md) now ask for the other task's **chat link
and shared topic**, not an internal ID, local skill path or global task inventory.
Codex documents **Copy chat deep link** as ⌘⌥L on macOS and Ctrl+Alt+L on Windows;
the link identifies a local task, not a shared transcript snapshot.
[Official command reference](https://learn.chatgpt.com/docs/reference/commands).

The former title-only attempt is retained as a failure. Its agent-created tasks
had empty previews and were excluded by Codex's normal list filter; increasing
the limit or sending more manager messages would not fix that sample.
[Same-version diagnosis](2026-09-08-native-task-discovery.md).

## Actual setup, not hidden preparation

- Reused the **same two dedicated validation tasks from September 7**, in separate
  working directories, with completed prior context. No replacement tasks,
  shared ThreadMesh database, plugin installation or second harness was needed.
- The manager constructed official `codex://threads/<thread-id>` links from
  already authorized identities and supplied them through native task messages.
  Nobody used or recorded the keyboard-copy gesture in this run. The test proves
  the documented link-input route, not novice/manual GUI onboarding.
- Both received the complete public workflow URL pinned to
  [`93da0c6`](https://github.com/fyaic/threadmesh/blob/93da0c6fc9814c1a28e95eaf34d287e11a4331f7/plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md),
  their selected peer link, narrow shared topic and new scoped enable permission.
  Earlier stopped/cancelled suggestions were not restored.
- A made an actual web-open of that URL and reported full reading; its export
  retains a result summary, not the entire web response. B's successful curl
  record retains the full workflow text. Neither substituted a local skill.
- Both used exactly one native read of the selected peer and confirmed its title,
  allowed topic and enabled local agreement. **No global list, peer send or
  business file change occurred during setup.** Existing sample hashes matched.

Setup turns took **141.256 seconds for A** and **137.330 seconds for B**, run in
parallel. These model/setup costs are not hidden inside the shorter business
handoff time below. The manager read both confirmations before the business turn.

## One ordinary change; no instruction to send

The next input went only to A. Its first sentence acknowledged completed setup;
the rest was the business request, with no recipient or message instruction:

> 双方设置已确认完成。将产品名改为 Member Studio，免费套餐限制为三个项目，
> 使用美式拼写，付费价格保持不变。更新获批的产品事实。

A chose to update its own `brand.json`, check the selected website task's status,
and send advice. The retained native status response explicitly returned B idle.
There was **one completed A → B send**, no model/thinking override and no B → A
reply loop. Its message carried the new name, US spelling and **free-plan**
three-project limit, preserved price/button constraints, and identified itself
as advice rather than a new user instruction or permission grant.

Original B's new native turn identified **A** as the message source, not the
manager. B read its own files, made this completed file change and read them back:

```diff
-  "headline": "Organize work with Member Portal",
-  "description": "Up to five projects for your team on the free tier.",
+  "headline": "Organize work with Member Studio",
+  "description": "Up to three projects for your team on the free tier.",
   "signupButton": "Create my workspace"
```

`price.txt` remained exactly `Paid plan: $12/month` plus its final newline.
Independent file assertions checked every field, not just message delivery.
The manager did not forward the changed business facts to B, manually continue
B or write B's result. B's own native completed patch establishes edit ownership.

| Stage | UTC interval | Observation |
|---|---|---|
| Both setup turns | 02:32:43–02:35:05 | Public retrieval, selected reads, separate confirmations |
| A ordinary business turn | 02:35:53–02:36:33 | Own facts updated; fresh idle check; one send |
| Original B receiving turn | 02:36:25–02:36:54 | Own website copy correctly changed |
| Both stop turns | 02:37:34–02:37:38 | Confirmed stopped; no tools, edits or outgoing messages |

Ordinary request to original B's completed result: **about 61 seconds, excluding
setup**. Setup start to final stop: about 4 minutes 55 seconds including manager
inspection gaps. These are observations, not speed/reliability promises.

## Stop and evidence retention

Both stop turns contain only the manager's stop input and the task's confirmation:
collaboration off, no pending suggestions. Both native statuses are idle. No
stop broadcast or artifact cleanup occurred. The September 7 busy/no-send and
post-stop ordinary-change checks remain separate historical controls; they were
not rerun or relabeled as new checks here. No atomic race-free claim is made.

Private originals are retained outside the repository in an owner-only directory.
The final capture contains all **three selected turns per task for this run**,
not their complete lifetime histories. It is a reduced official `thread/read`
App Server projection with original item payloads, not a fabricated native UI
export. Fresh stdio processes made read-only calls and exited; they did not
resume tasks or supply the send/continuation transport. The desktop read/wait
surface still omitted assistant content, so its completion status alone was not
used as proof. No private database/socket access was used.

| Retained object | SHA-256 |
|---|---|
| Setup turn capture | `2c1259718ead89ca2eddf2d61c3a0601df173238aaf69e00f544ffac30ea9454` |
| Setup + completed business capture | `2cc14c0a9f578201e7194db9fdfe0f491f2ceaef27985b0464882f828d65c271` |
| Final setup/business/stop capture | `43594c3cc38b557020d9a4ae5e59a4cf013c5c4db3b5d37263e256f87d3f832d` |
| Final A facts | `9e3a5e833ca1ecc30ede96e01533dcf0b86150b8875a948302a802983221c009` |
| Final B copy | `5b628839e9aee540ca0ed82702a19f19e48da55da89cf9067264d122c1fd7389` |
| Unchanged price | `5f9ef93d379ed019937fefa3bada8830ad124e63342acc0aca6da0c0b6ffa38e` |

Hashes commit to retained files; they are not cryptographic host attestations.
No private task IDs, absolute paths, account data or full transcripts are public.
An independent subagent reviewed the original run records and business files.

## What this does not prove

This is not a human-operated keyboard/UI recording, an independent external-user
pass, organic long-lived project usage, normal plugin hot-loading, cross-host
support, cross-harness support or quota recovery. No screenshot/video was captured.
Codex supplied native transport, source attribution and continuation. ThreadMesh
supplied reusable opt-in guidance; improvement over native-only Codex remains
unmeasured. Native send still cannot atomically guarantee non-interruption.

The source workflow and bilingual guide are public; the existing immutable
alpha.3 CLI release asset was not silently replaced by this source-only change.
