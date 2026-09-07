# Desktop-first entry: keep the user's existing client

Date: 2026-09-07. Starting revision: `19a9b13`.

## Decision and desired experience

Audience correction: Codex is the primary client. Do not split the critical path
equally across Codex and ZCode, or require Codex users to install Pi. A Codex-only
sample can remove that immediate first-use barrier but does not close the existing
desktop-conversation gate below. The outstanding user-operated plugin trust and
reload checkpoint must not be hidden behind another CLI pass.

The primary job is **different conversations in the same agent product helping
each other without user relaying**. Cross-product collaboration is an extension,
not a first-use prerequisite. This is the user's priority, not a measured market
share claim. The CLI alpha is a developer integration, not plug-and-play for
ordinary GUI users.

The next desktop acceptance requires **two existing conversations in one client**,
not one Codex conversation plus one ZCode conversation. The installed clients
remain feasibility candidates, not shipped integrations. First establish a
supported activation/refresh path in one client, then validate its pair. The
previous one-conversation-per-client probes do not satisfy that acceptance.
Prove native session binding and delivery before building a companion dashboard.

Install through normal client extension UI. Explicitly opt in chosen existing
conversations with human-readable goals. No programming runtime installation,
JSON editing, session-ID lookup, shared-directory management or relaunch under
a ThreadMesh CLI should be required of the user.

Models decide when peer advice is useful. The same receiver keeps its earlier
decisions and sees the source. Unrelated sessions stay quiet, user work takes
priority, and mute/revoke prevents new delivery. Advertise idle wake only after
a native host API passes it; otherwise show **pending until next checkpoint**.

Today, processes must address the same local ThreadMesh database, not necessarily
the same code directory. The intended product hides storage without removing
explicit sharing boundaries. It does not broadcast all chats or provide a
cross-machine service today.

## Evidence checked

Latest: the [authorized native attempt](../09-reviews/2026-09-07-desktop-native-adoption.md)
installed the probe in both clients and tested two pre-installation conversations.
Both retained the prior decision but reported the diagnostic unavailable.
ZCode was now 3.11.2. Codex hook trust remained incomplete; the follow-up used a
native task message rather than manual input. Both probes were then uninstalled.
This supersedes the installation-pending status of the earlier inventory below,
not the unresolved identity, delivery and first-use gates.

Local read-only inventory: ChatGPT desktop `26.901.31953`, bundled Codex
`0.153.1`, and ZCode `3.10.2`. ZCode's settings expose Plugins, MCP Servers and
Hooks; its Plugins screen was inspected. No client was restarted, plugin
installed, hook trusted, private transcript opened or cross-session message
sent. Current website documentation may describe newer builds.

| Requirement | Codex desktop | ZCode desktop |
|---|---|---|
| Plugin distribution | Official packaging documented; local install untested | Official packaging documented; Plugins UI observed |
| Current identity and checkpoint context | Hook session ID and SessionStart/UserPromptSubmit documented; native probe pending | Same documented; native probe pending |
| Prior conversation loads new plugin | Unverified; CLI resume is not proof | Docs warn running sessions do not hot-reload; adoption test needed |
| MCP call bound to the same native session | Unverified; not a global member name | Unverified; hook ID alone does not bind MCP calls |
| Directed delivery and idle wake | Supported third-party desktop attachment route not established | Supported scoped plugin wake route not established |
| Busy receiver, queued user work, revoke | Not live-verified | Not live-verified |

Codex's [plugin packaging](https://developers.openai.com/plugins/build/plugins)
documents desktop distribution, local MCP and hooks. Its
[hooks reference](https://learn.chatgpt.com/docs/hooks) documents session identity
and exact-definition trust. These entry points do not authorize access to every
conversation. The [App Server API](https://learn.chatgpt.com/docs/app-server)
has thread/turn operations, but starting another server does not establish
attachment to the already-running desktop owner. App-provided cross-task tools
are also not, by themselves, a public external RPC endpoint.

ZCode documents [plugins](https://zcode.z.ai/en/docs/plugin),
[MCP](https://zcode.z.ai/en/docs/mcp-services), and
[hooks](https://zcode.z.ai/en/docs/hooks). Hooks expose session IDs and context
injection, not a callable model object. Its
[Remote Control](https://zcode.z.ai/en/docs/remote-control) can operate existing
conversations, but a bearer link grants window-wide control. No supported scoped
plugin API through that feature was established here. Do not repurpose those
tokens, private IPC or desktop database writes as a ThreadMesh adapter.

## Ordered implementation and acceptance

Delegated follow-up: the [Codex lane](../09-reviews/2026-09-07-codex-desktop-lane.md)
and [ZCode lane](../09-reviews/2026-09-07-zcode-desktop-lane.md) found native MCP
metadata outside model arguments. The probe now compares that metadata with
hook identity, distinguishing Codex runtime SessionId from persistent ThreadId.
This is source-backed and fixture-tested; actual desktop receipt remains pending.
The documented default Codex daemon endpoint is absent locally, so no external
directed-send wrapper is enabled. A current model may instead use native task
tools already exposed by its host, within the explicit opted-in pair.

The [independent internal review](../09-reviews/2026-09-07-desktop-independent-review.md)
accepts checkpoint delivery as the first useful slice, not a replacement for
the original automatic-wake goal. No crypto framework or global conversation
scan is needed: the local alpha requires trusted host-owned transport, observed
native correlation and explicit opt-in. Native installation/trust awaited the
operator's specific confirmation at that review. The subsequent authorized
attempt is linked above; business conversations remain out of scope.

1. **Native entry probe in one client:** establish supported plugin activation
   on an existing disposable conversation. Then test two distinct native
   identities in that same client; do not equate two product installations
   with two working sessions. Coordinate any restart; no business chats.
2. **One same-client opted-in pair:** bind MCP calls to native identity, join/leave without
   paths, deliver attributed advice to the same receiver. If the public host
   interface is insufficient, record the precise gap and seek supported host
   integration; do not substitute a new session or automated UI typing.
3. **Useful initiative:** one ordinary kickoff per task, generic collaboration
   guidance, no prescribed recipient. Verify useful work, complete prior
   constraints, an unrelated no-contact control and queued user-input priority.
4. **Actual first use:** package away developer prerequisites; observe an
   independent GUI user without maintainer terminal assistance. Record every
   manual step and the first failure before promoting a desktop demo.
5. **Extend, do not gate:** reuse the proven session workflow across products.
   A second harness/account must not be required to experience the first value.

Everyday acceptance scenario within a single client: the existing product conversation approves “the
free plan allows five projects”; the existing website conversation is updating
copy. The first agent volunteers the change; the second retains both the
free-plan qualifier and its earlier signup-button decision. An unrelated notes
task stays untouched. The model chooses whether and whom to contact; neither
ordinary task says "send to the other session". Preserve the receiver's native
identity and earlier decisions, show source provenance, and do not take over
queued user work. **This desktop scenario has not passed yet.**

Quota recovery follows with explicitly saved decisions and unfinished work,
using the other agent's own authorized account. Do not promise lossless history
or recovery of unsaved context after the source can no longer run.

## This increment and stop line

A dependency-free [developer probe](../../experiments/desktop/threadmesh-desktop-probe/README.md)
has two manifests and five fixture tests. It emits only event type and a session
fingerprint, performs no file/network I/O and grants no sharing. It still needs
Node: **not an installer, native live pass or desktop collaboration feature**.
The initial preparation changed no marketplace or global configuration. The
subsequent native attempt created local catalogs, installed and then removed the
probe; exact Codex hook trust remains pending. Do not disrupt active user tasks.
[Preflight results](../09-reviews/2026-09-07-desktop-entry-preflight.md) separate
the passing fixtures from native acceptance; the attempt above records the
subsequent negative adoption result.

This order supersedes [first use](first-use-2026-09-05.md) and
[cross-harness acceptance](cross-harness-acceptance-2026-09-05.md). Existing
copy-quality failure, DeepSeek live, quota recovery and native input-race gaps
remain open, not new prerequisites for trying desktop entry. Track under
[#156](https://github.com/fyaic/threadmesh/issues/156).

No parallel protocol expansion, additional CLI task families or promotional
animation while desktop delivery is unresolved. Keep the current CLI working.
