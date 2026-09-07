# Desktop hook probe — developers only

**Not a ThreadMesh desktop integration.** Sends no messages, joins no workspace,
and cannot wake another session. Not installed in any client or included in the
package file list. Still requires Node on the host PATH; this does not satisfy
no-terminal onboarding. Initial target: local macOS desktop clients.

The two manifests target Codex desktop and ZCode, using their documented
`CLAUDE_PLUGIN_ROOT` compatibility variable. Native loading is **unverified**.
Manifest validation and fixture execution are not native-host evidence.

## Measurement and privacy

At SessionStart and UserPromptSubmit, emit a `TM_DESKTOP_PROBE` marker into the
same session. Compare its session fingerprint across turns and against a second
disposable session. This is correlation, **not an authenticated identity,
sharing grant or routing address**.

The host may pass private prompt text in stdin. The script ignores all fields
except event type and session ID. It never opens transcript paths, persists
input, reads other chats, accesses credentials or uses the network. The marker
may enter the host's normal model context and chat retention. Do not enable
this experiment in unrelated or sensitive conversations to collect evidence.

## Developer check

From the repository root:

```sh
node --test test/desktop-probe.test.mjs
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
   one is present; do not invent it.” Retain native hook execution evidence,
   not just the model's response. The marker must stay equal on another turn
   of that session, and differ in a second disposable session.
5. Test a pre-installation conversation separately. New-session success does
   not establish adoption of an old conversation.
6. Disable the probe and follow the host's reload requirements. Verify no new
   hook execution occurs; old context can still contain a previous marker.

Record versions, hook executions, identity comparisons, installation/restart
steps and cleanup. Passing proves only identification and context injection,
not MCP identity binding, directed delivery, idle wake or user-input priority.

[Current decision and gates](../../../docs/10-planning/desktop-entry-2026-09-07.md)
