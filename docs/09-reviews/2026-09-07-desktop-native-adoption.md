# Native desktop adoption attempt

Date: 2026-09-07. Probe baseline: `d70630a`, version `0.0.2`.
Scope: authorized local diagnostic installation and two disposable conversations.

## Result: installation exercised; existing-conversation adoption did not pass

Both conversations retained the earlier signup label, `Create my workspace`.
Neither produced a native `threadmesh_probe_identity` call or a verifiable
ThreadMesh hook marker on the tested follow-up. No session fingerprint was
obtained, so identity correlation is **unavailable**, not a mismatch.
This is not evidence of autonomous collaboration or a working desktop adapter.

| Observation | Codex desktop | ZCode desktop |
|---|---|---|
| Installed version | ChatGPT 26.901.31953; bundled Codex 0.153.1 | ZCode 3.11.2; existing GLM-5.3 account |
| Conversation creation | Before probe installation; baseline turn finished after installation | Baseline turn finished before installation |
| Installation | Official `codex plugin add` succeeded; versioned cache created | Native marketplace UI installed one MCP server and two hooks |
| Follow-up entry | Host-provided cross-task message tool | Native composer and Send button |
| Prior decision | Correct signup label retained | Correct signup label retained |
| Probe tool | Model reported unavailable; no diagnostic call in inspected turn | Model reported unavailable; no diagnostic tool card observed |
| Hook evidence | Marker unavailable; exact hook trust not completed | Marker unavailable; generic hook rows do not identify this probe |
| Restart / replacement conversation | Neither | Neither |
| Final installation state | Probe uninstalled using official CLI | Probe uninstalled using native UI |

These are two maintainer-controlled test conversations, not an independent
first-user trial. The ZCode version changed since the earlier 3.10.2 source
inspection; those earlier source offsets are not revalidated by this attempt.

## Procedure and evidence boundaries

Each baseline prohibited tools and retained only a test signup-button decision.
The next prompt explicitly requested exactly one no-argument diagnostic call
if available, the prior label, and comparison with any actually present marker.
It prohibited shell, file/transcript reads, other tools and other conversations.
Both responses preserved the label and reported the diagnostic unavailable.

The Codex test task's inspected native turn contains the incoming delegation
and final response, but no diagnostic invocation. Its follow-up was delivered
by the app's own task tool, **not a manually submitted user prompt**. Therefore
absence of a `UserPromptSubmit` marker in this turn alone cannot establish
the behavior of that hook for manual desktop input. This native task tool is
not a ThreadMesh implementation or a public third-party attachment API.

Codex hook trust remained incomplete. Computer-use access to the Codex app was
explicitly denied by the tool, so no alternative UI-control route, blanket
hook trust flag, private IPC or forced restart was attempted. Tool availability
and hook trust are separate unresolved questions; the observation does not
prove that all Codex versions or supported reload paths reject old sessions.

ZCode briefly retried its connection, then completed the diagnostic turn in
56 seconds. Its native hook popup showed three `UserPromptSubmit` rows and two
`Stop` rows, but exposed no probe-specific output in the inspected view. Existing
plugins also supply hooks. These rows are **not** credited as probe execution.
The model's report is not an independently enumerated tool registry; supported
session refresh and server activation remain to be diagnosed.

No client restart, business-conversation operation, private transcript-file
read, remote-control-token use or ThreadMesh peer message occurred. No unrelated
GUI content, raw native IDs, credentials or full app screenshots are published.

## Packaging friction actually encountered

The Codex personal marketplace uses a local source object with `source: local`.
Importing that same catalog into ZCode listed the card but failed to load its
components. A separate local ZCode catalog using its documented
`{"source":"directory","path":"<absolute probe directory>"}` resolved component
loading: the UI displayed one MCP server, `SessionStart`, `UserPromptSubmit`,
and version `0.0.2`, then allowed installation.

This is a catalog-format fix, **not** a fix for existing-session tool adoption.
Keep host-specific packaging at the boundary; do not ask ordinary users to
write catalogs or locate absolute directories. References:
[Codex plugins](https://developers.openai.com/plugins/build/plugins) and
[ZCode plugin sources](https://zcode.z.ai/en/docs/plugin).

## Cleanup and retained state

Both temporary installations were removed through their official management
interfaces. ZCode returned to an Install button; Codex returned the exact probe
selector as removed. Removal deleted installed cache/configuration for this
diagnostic only; the local source and catalogs remain available for reinstall.
The incompatible Codex-format marketplace import was removed from ZCode.
The correctly formatted local ZCode catalog and Codex personal catalog remain.
Both disposable conversations were retained; neither was deleted or restarted.

No hook was globally trusted. Configuration removal is verified, but absence of
all future hook execution in every already-running session was **not** tested;
no unrelated conversation was used as a cleanup test.

## Next mainline decision

Documentation lint passed for 130 repository Markdown files plus the experiment
guide; the 10 probe/identity tests passed, as did `git diff --check`. This increment
changes evidence and planning only, not the probe runtime. These checks do not
alter the negative native adoption result.

Keep [#156](https://github.com/fyaic/threadmesh/issues/156) open. First isolate
supported plugin activation and reload **on these same disposable conversations**.
Codex needs a user-operated exact-hook trust/settings checkpoint because the
automation surface is unavailable. ZCode needs an official session refresh or
activation check with observable tool registration and hook output. Do not
promise either route works before testing it, and coordinate any client restart.

Only after that receipt can the next slice bind one explicitly opted-in pair
and deliver attributed advice to the existing receiver. A new-session control
would be a separate experiment, not a substitute for old-conversation acceptance.
No new transport framework, marketing animation or README support badge is
justified by this attempt.
