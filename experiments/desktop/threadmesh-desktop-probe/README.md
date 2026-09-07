# Desktop hook probe — developers only

**Not a ThreadMesh desktop integration.** Sends no peer messages, joins no workspace,
and cannot wake another session. Not installed in any client or included in the
package file list. Still requires Node on the host PATH; this does not satisfy
no-terminal onboarding. Initial target: local macOS desktop clients.

The two manifests target Codex desktop and ZCode. Hooks use the documented
`CLAUDE_PLUGIN_ROOT` compatibility variable. For MCP, Codex uses plugin-relative
`cwd` and arguments; ZCode's manifest overrides the server with its supported
plugin-root substitution. Do not assume MCP and hook variable handling match.
Native loading is **unverified**.
Manifest validation and fixture execution are not native-host evidence.

## Measurement and privacy

At SessionStart and UserPromptSubmit, emit a `TM_DESKTOP_PROBE` marker into the
same session. Compare its session fingerprint across turns and against a second
disposable session. This is correlation, **not an authenticated identity,
sharing grant or routing address**.

The single MCP tool `threadmesh_probe_identity` takes no arguments. It projects
known host metadata into fingerprints and field-consistency status. Missing,
invalid, conflicting or mixed-host identities stay `unknown`. Raw metadata is
never returned or logged. A foreign MCP client can forge these fields: this
diagnostic establishes correlation, not authentication. Hook scope follows the
host installation scope; this probe has no per-conversation opt-in filter.

Codex runtime SessionId and persistent ThreadId are distinct. Compare the hook
marker to the MCP **sessionFingerprint**. Across runtime resume, compare the
**threadFingerprint** for conversation continuity; a new SessionId need not
mean a different conversation. ZCode supplies its own session metadata.
These are source-observed vendor seams, not a portable MCP session standard.
See the [Codex](../../../docs/09-reviews/2026-09-07-codex-desktop-lane.md) and
[ZCode](../../../docs/09-reviews/2026-09-07-zcode-desktop-lane.md) evidence.

The host may pass private prompt text in stdin. The script ignores all fields
except event type and session ID. It never opens transcript paths, persists
input, reads other chats, accesses credentials or uses the network. The marker
may enter the host's normal model context and chat retention. Do not enable
this experiment in unrelated or sensitive conversations to collect evidence.

## Developer check

From the repository root:

```sh
node --test test/desktop-probe.test.mjs test/desktop-identity-probe.test.mjs
```

## Native procedure — not yet executed

1. Review the hooks and script. Install via the host's official local plugin
   mechanism. No marketplace entry or global settings change is shipped here.
2. In Codex, separately review and trust the exact hook definitions. Plugin
   installation alone does not imply trust. Checkpoint active work before any
   required restart; do not kill running tasks to complete this test.
3. In ZCode, check Settings → Plugins and Hooks after installation. Its docs
   warn that running sessions do not hot-reload hook configuration.
4. Ask a disposable session: “Report the ThreadMesh desktop probe marker if
   one is present; do not invent it. Call threadmesh_probe_identity and compare
   its session fingerprint to the hook marker.” Retain native execution evidence,
   not just the response. Alternate A → B → A calls and verify neither borrows
   the other's identity. This is a prescribed diagnostic, not model initiative.
   Never forward either session's private text.
5. Test a pre-installation conversation separately. New-session success does
   not establish adoption of an old conversation.
6. Disable the probe and follow the host's reload requirements. Verify no new
   hook execution occurs; old context can still contain a previous marker.

Record versions, hook executions, identity comparisons, installation/restart
steps and cleanup. Passing proves only native identity correlation and context
injection, not authorization, delivery, idle wake or user-input priority.

[Current decision and gates](../../../docs/10-planning/desktop-entry-2026-09-07.md)
