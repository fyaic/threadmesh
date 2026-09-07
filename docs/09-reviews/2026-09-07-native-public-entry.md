# Native desktop public entry: retrieval and readiness boundary

Date: 2026-09-07. Status: **readiness failure recovered through official App Server
read: both inventory calls used an invalid limit; pairing still not accepted**.
The earlier empty desktop-read observations are retained below, not erased.
This record does not replace the earlier
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

The bounded readiness gate **did not pass**. The subsequent diagnosis below
recovered the results, not a passing pair. Independent GUI onboarding and
public-source activation remain open. Do not substitute a new CLI pair or the
earlier successful native case for this missing acceptance.

## Read-only diagnosis and correction

A later native `read_thread` recheck still returned zero items for both current
turns and readable preceding turns. The official
[App Server `thread/read` interface](https://learn.chatgpt.com/docs/app-server)
supports reading a stored task without resuming it. Using the installed desktop
runtime, Codex CLI 0.153.1, over a new **stdio diagnostic connection**, the manager
read the same task IDs with `includeTurns: true` and selected the exact same
readiness turn IDs. **Both contained five items and a final “not ready” result.**
No new task, `thread/resume`, `turn/start`, messaging, private socket or direct
transcript/database access was used. Diagnostic processes exited after reads;
no model was invoked. This identifies a discrepancy between the two read
surfaces, not its internal implementation cause or a repair of the desktop tool.

| Recovered evidence | A | B |
|---|---|---|
| Public retrieval operation | Web open of the pinned raw URL | Successful curl of the same URL |
| Inventory call | `list_threads`, `limit: 100` | `list_threads`, `limit: 100` |
| Actual tool result | Invalid arguments: limit must be at most 50 | Same |
| Model's final disposition | Not ready; matching unverified; collaboration OFF | Same |
| Outgoing peer send / native file-change items in this turn | 0 / 0 | 0 / 0 |

The inbound `send_message_to_thread` function output is the manager's check
message, not an outgoing peer send. A's web-open item and final response support
retrieval being attempted/reported; they do not expose the full web response.
B's completed curl item retains the workflow text. Neither model retried its
rejected inventory call. There is now evidence for their reported stopped
behavior in these turns; the initial empty-export observation could not provide it.

Private App Server turn records have SHA-256 commitments:
A `bd0b7733d39b380400b28b834c650fa8757f70d209313320bb011e3ac8d955d5`;
B `f3c60f7680c5c683042a71038fffebb486e485c85967e768ea63db0ba499aeb6`.
They are retained separately from the original empty native-tool responses.

The manager then made one native `list_threads` call with `limit: 50`. It was
accepted and returned 50 entries with no unavailable-host/source warnings, but
**neither selected task was present**. Exact-title App Server `thread/list`
diagnostics also returned no matches; a separately checked `appServer` source
filter likewise returned none, while each task's own metadata reports `vscode`.
A scoped exact-title archived-`vscode` query also returned no matches for either
task; it did not unarchive or alter anything.
Do not infer deletion, rename, global absence or a proven source-filter cause.
This diagnostic does not establish successful title resolution.

Two bounded fixes follow from the evidence:

- The skill and both copyable prompts cap native inventory at 50, include
  pinned/unpinned results and explicitly treat a bounded list as incomplete.
  The revised public workflow is pinned to
  `7ea4d407b719f0241f1eccbe2e5d95c15a72c72c`; the failed run used the earlier revision.
- The structural evidence auditor now rejects any empty completed turn. An
  earlier valid handoff must not hide a later unknown turn and produce misleading
  total-send counts. A regression exercises empty turns on either side and empty
  prior context; the retained original nonempty native proof still passes.

Post-fix regression: 460 tests passed, one optional native test skipped; all
55 schema cases and seven transition cases passed, and 146 Markdown files linted
cleanly. These are deterministic checks, not a rerun of the repaired model workflow.
The new pinned public workflow returned HTTP 200, matched the source exactly
(7,031 bytes), and has SHA-256
`2d3822d5c609f091ff29e49aaef33f8ea432a13661b67b5112b7144379865c18`.

The original limited call approval was not reused to restart either model or
enable collaboration. Next resolve supported selected-task lookup and validate
the repaired public entry end to end. Keep that separate from this no-model
diagnostic and from a claim that the desktop read tool itself has been fixed.

Official [skill documentation](https://learn.chatgpt.com/docs/build-skills)
describes reusable instructions and host loading. It does not itself prove this
repository's public-link workflow, native task tools or desktop picker behavior.
