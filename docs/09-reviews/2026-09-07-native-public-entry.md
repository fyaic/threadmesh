# Native desktop public entry: retrieval and readiness boundary

Date: 2026-09-07. Status: **public retrieval checked; name-based desktop pairing
and activation not yet accepted**. This record does not replace the earlier
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
| Existing native task name matching | Not run in this checkpoint | A title-only pairing pass |
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

## Next bounded check

The earlier two dedicated native tasks remain stopped. A request was made for
permission to give each a readiness-only check and one task inventory, without
reactivating collaboration, sending peer advice or changing sample artifacts.
No such check has been dispatched at this checkpoint.

If authorized, record actual public retrieval, uniquely resolved target title,
available native tools, no outgoing peer message and unchanged business files.
Do not count already known IDs or a local workflow read as evidence for the
new entry. This is still a maintainer check, not an independent GUI-user result.

Official [skill documentation](https://learn.chatgpt.com/docs/build-skills)
describes reusable instructions and host loading. It does not itself prove this
repository's public-link workflow, native task tools or desktop picker behavior.
