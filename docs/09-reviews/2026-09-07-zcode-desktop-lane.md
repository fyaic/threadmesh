# ZCode desktop lane: native metadata, not desktop support

Date: 2026-09-07. Starting main: `550e64c`. Native application version:
**ZCode 3.10.2**, read from the installed application manifest.

## Result and stop line

The installed runtime already separates native session metadata from model tool
arguments. That is the preferred binding seam to test through the shared
desktop probe. Hook-based argument rewriting was evaluated but **not retained**:
shipping an unwired fallback would add code without advancing desktop delivery.
This lane retains source/configuration evidence only. It does not establish an
authenticated caller, opt in a conversation, install a plugin, deliver a
message, or wake an idle desktop session.

Keep the next native test focused on one existing conversation: prove that the
installed hook executes there, then compare its identity with the same
conversation's MCP request metadata. Do not replace it with a CLI-created task.
Checkpoint pickup is a useful first slice; idle wake is not a prerequisite for
testing it and must remain unadvertised.

## Public entry and version caveat

[ZCode's plugin reference](https://zcode.z.ai/en/docs/plugin) provides a local
marketplace install path and plugin hooks/MCP declarations. It also contains two
different adoption statements: enabling a plugin refreshes affected sessions,
but plugin hooks join newly started sessions. The
[hooks reference](https://zcode.z.ai/en/docs/hooks) describes startup snapshots
and warns that running sessions do not hot-reload. Neither statement proves
that an already-open conversation adopts this plugin without losing context.

The hook protocol supplies `session_id`, tool name and tool input. Its
`PreToolUse` response may replace the complete input, followed by schema
validation. `UserPromptSubmit` can add context at the next ordinary user turn.
Hooks do not receive an object that can independently invoke the model.
[MCP configuration support](https://zcode.z.ai/en/docs/mcp-services) therefore
does not establish existing-session binding or idle wake.

[Remote Control](https://zcode.z.ai/en/docs/remote-control) operates already-open
conversations, but its bearer link controls the window. It is not the scoped
plugin delivery contract needed here. No remote-control token was obtained or
used.

## Installed-bundle evidence

Read-only inspection of the shipped static runtime, not user data:

```text
/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs
SHA-256: 3597160465b67da248fa3fb919920ca30d4e093003a4d70cde2a2e33903cbabc
```

The following byte offsets identify this build only, not stable public symbols:

| Offset / identifier | Observed implementation |
| --- | --- |
| `10437700`, `s0t` | Serializes runtime `sessionId` into `session_id`; includes both camelCase and snake_case tool fields. |
| `7814028`, `cTr` | Constructs `PreToolUse` using the runtime session dependency, not a model argument. |
| `9832411` | Re-parses and validates a hook's replacement input before executing the tool. |
| `10446742`, `InMemoryHookRunner` | Copies registrations into the runner at construction; this is not proof of desktop hot-reload. |
| `7617297`, `TBo` | Projects runtime trace/session fields into MCP request metadata. |
| `7628109` | Sends tool arguments and metadata as separate fields to the MCP client. |
| `6998469`, `normalizeMcpServersShape` | Accepts both a direct server map and a wrapped `mcpServers` object in `.mcp.json`. |
| `7002353`, plugin variable resolver | Accepts either plugin-root variable spelling, but rejects session-ID substitution in MCP configuration. |

The observed MCP `tools/call` shape has `params.arguments` separately from
`params._meta.session_id` and
`params._meta["com.zcode/request-context"].session_id`. Additional metadata can
include trace, span, parent-span, turn and runtime-scope fields. At that call
site, model tool arguments cannot overwrite the top-level metadata. Metadata
is conditional on available runtime trace/scope, however, and another MCP
client can fabricate it. This is an **observed vendor extension**, not a
documented stable API or authentication proof. A native diagnostic should
return only a session fingerprint, never raw IDs or trace contents.

The bundle also contains workspace-hook admission implementation. This differs
from the current documentation's categorical project-hook warning, but code
presence does not prove that this desktop exposes or enables that path. No
project hook configuration was written to try to bypass plugin installation.

## Integration decision: one binding route

The evaluated `PreToolUse` alternative could overwrite a model-provided caller
argument with the hook session ID. It would still need caller binding and
schema changes, and would provide no assurance if the hook were absent or
bypassed. Its isolated helper and tests were removed before integration; no
production fallback or new authorization framework is retained.

Instead, the shared [desktop probe](../../experiments/desktop/threadmesh-desktop-probe/README.md)
tests the intended native MCP metadata route directly. The eventual local-alpha
boundary is host-owned stdio metadata plus explicit session opt-in, not an
arbitrary ID accepted from tool arguments or a global last-active session.
Absence, disagreement or an unestablished host connection must not silently
select a caller. Static implementation evidence and probe fixture tests remain
separate from a native existing-conversation acceptance pass.

Final package check: ZCode's loader merges the file map and then the manifest
map, replacing a same-named server entry. Its standard `cwd: "."` path only
undergoes variable substitution; plugin-relative resolution is not established.
The ZCode manifest therefore overrides the Codex-oriented shared config with
explicit `ZCODE_PLUGIN_ROOT` in both cwd and script argument. Codex uses its
own verified plugin-relative cwd mechanism. Do not assume these match hooks.

## Next native action requiring coordination

The main agent owns UI and consent: install the audited probe through the
normal plugin UI in an isolated test workspace. Observe adoption in a
conversation that existed before installation separately from a newly started
conversation. Then compare hook and MCP identity fingerprints in that same
conversation. Failure to adopt or bind must remain a specific unsupported-host
gap, not trigger private IPC, application database writes, bearer-token reuse,
automated UI typing or a replacement session. Once bound, test attributed inbox
pickup on the receiver's next natural checkpoint before attempting idle wake.

No global configuration, plugin enablement, restart, private transcript,
credential, remote-control connection or GUI action was used in this lane.
