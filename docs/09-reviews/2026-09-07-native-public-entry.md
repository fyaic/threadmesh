# Native desktop public entry: retrieval and readiness boundary

Date: 2026-09-07. Status: **public retrieval checked; live name-based readiness
attempt not accepted because current-turn evidence is empty**. This record does not replace the earlier
[controlled native business case](2026-09-07-native-desktop-acceptance.md).

## What changed for a user

The [English](../06-guides/codex-native-tasks.md) and
[Chinese](../zh-CN/codex-native-tasks.md) entry now has a copyable prompt with two
inputs: the other task's sidebar title and the allowed shared topic. It points
to a fixed public workflow, not a maintainer's local path. Users paste it into
each selected task; each confirms its own scope before ordinary work resumes.
Setup must not send messages or edit business files. An optional readiness-only
request keeps collaboration off, including an existing stop.

Title lookup explicitly asks for one inventory's visibility: the native tool
also returns other task titles and summaries. It does not authorize reading
unrelated conversation bodies. A missing or ambiguous result needs clarification,
not another scan or guessed identity. An already attached native reference
avoids the inventory; no specific desktop reference-picker UI is asserted.

## Observations retained

| Check | Observed result | What it does not establish |
|---|---|---|
| Anonymous public workflow fetch | HTTP 200; 6,569 bytes; byte-for-byte match with source | Another host's network/retrieval ability |
| One measured fetch | 910 ms using Node fetch on the maintainer host | Cold-user timing or an onboarding speed guarantee |
| Skill format validation | Passed the Skill Creator validator in an isolated `uv` dependency environment | Correct model decisions or plugin activation |
| Repository regression | 459 passed, one optional native test skipped; 55 schema cases and seven transitions passed; 146 Markdown files linted cleanly | Live name resolution or autonomous model behavior |
| Existing native task name matching | Attempted in both tasks; completed-turn reads returned no items | Successful workflow retrieval, name matching or absence of peer sends |
| Public-source activation and business edit | Not run in this checkpoint | End-to-end desktop onboarding |

Public workflow revision: `592014782d10a8c4b88f46ea23b7cf588ff78355`.
SHA-256: `4cbccb083bab61e3433696073d544e39d9d13f7d9d7828d5165d183afcb40470`.
The [pinned source](https://raw.githubusercontent.com/fyaic/threadmesh/592014782d10a8c4b88f46ea23b7cf588ff78355/plugins/threadmesh-codex/skills/threadmesh-codex/SKILL.md)
was fetched without repository credentials and compared in memory with the local
file. No private transcript, task inventory or identifier was published.

The system and bundled Python interpreters initially lacked PyYAML; validation
then passed using `uv run --with pyyaml python` and the existing validator.
No user-global skill or plugin was installed. The published alpha.3 archive is
unchanged; this revised workflow is reached through the pinned source URL.

## Authorized live readiness attempt

The user subsequently authorized one readiness-only message to each original
dedicated task and one task inventory per task. Both were `notLoaded` before
dispatch. The manager explicitly invoked these checks; this was not an automatic
peer wake or a race-free idle-send test. The messages provided the pinned public
URL and the other task's exact title, **not its internal ID**, and required a new
name lookup rather than reusing IDs remembered from the earlier run.

The narrow prompt required complete public retrieval, at most one authorized
inventory, actual native tool inspection, and a concise result. It explicitly
kept collaboration off: no peer messages, business edits, installation, permission
changes, new tasks or restoration of cancelled advice. The manager made exactly
two check dispatches and did not retry either model turn.

| Observation | Task A | Task B |
|---|---|---|
| Host-reported terminal status | Completed, idle | Completed, idle |
| Host-reported duration | 142.592 s | 137.989 s |
| Current-turn items returned by native read | 0 | 0 |
| Current-turn result/tool evidence | Unavailable | Unavailable |
| Preceding turn still readable | Yes, six items | Yes, two items |

A bounded reread including the preceding turn reproduced the empty-current-turn
result. No failure cause is established: a host-reported completion does not
prove the model ran the requested checks. Do not infer a quota failure, successful
name resolution, zero peer sends or a confirmed collaboration state from the
empty history. No enable command was issued; the last readable agreements remain
stopped. No private host storage or UI automation was used as a workaround.

The three known sample artifacts were unchanged before/after by SHA-256:

| Artifact | SHA-256, identical before and after |
|---|---|
| A's `brand.json` | `330315d837dd80782c73fb07ad641458a0259002f4fe0f98e191ccb67c9ed35e` |
| B's `landing.json` | `267643aca34e3da28f5807f6a49813545c7f849097bc1cf300cf3fee1870a3c7` |
| B's `price.txt` | `5f9ef93d379ed019937fefa3bada8830ad124e63342acc0aca6da0c0b6ffa38e` |

Native read responses for the current and preceding turn are retained outside
the repository in owner-only local storage. Their file commitments are:
A `f8be6a2bc0ba08a8b15ff26190afa40ba39356f89856c3d3c4dbed950e197092`;
B `81443659b81d849e3cb2f998ec1e7411d5028681a760f04047bd06469715493f`.
No raw task IDs, histories or inventory contents were published. No screenshot
or recording exists for this attempt. The read responses are not full execution
traces and cannot fill the missing tool evidence.

## Disposition

The bounded readiness gate **did not pass**. The bilingual guide now explicitly
says that a completed indicator without a readable confirmation is not ready.
Resolve current-turn result visibility before another acceptance run; do not
paper over it with a new CLI pair, repeated quota-consuming dispatches or a
claim based on the earlier successful native case. Independent GUI onboarding
and public-source activation remain open.

Official [skill documentation](https://learn.chatgpt.com/docs/build-skills)
describes reusable instructions and host loading. It does not itself prove this
repository's public-link workflow, native task tools or desktop picker behavior.
