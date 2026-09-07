# Codex desktop: native identity and public endpoint preflight

Date: 2026-09-07. Base: `550e64c`. Runtime checked: the installed desktop's
bundled `codex-cli 0.153.1`. This is a bounded feasibility increment, **not a
desktop collaboration pass**.

## Outcome

There are two distinct usable seams; neither should be confused with an
external plugin having ownership of every desktop conversation.

1. Current Codex stamps native thread identity onto MCP **request metadata**.
   This can correlate an opted-in tool call without asking the model or user
   to type a session ID. The installed desktop's actual metadata receipt still
   needs to be observed by the native plugin probe.
2. Codex publishes a Unix app-server control transport and a passive daemon
   version command. The documented default endpoint was **absent locally**.
   Starting another server would not prove attachment to this running desktop.

An installed skill can also guide the current Codex model to use native task
tools already supplied by its host. This is a legitimate **model-driven host
route**, not an external RPC endpoint or a portable MCP-to-desktop bridge.
It must check actual tool availability and limit targets to explicitly joined
conversations; it must not discover or broadcast across all private chats.

## Fresh source findings

The earlier `0.145.0` examination is insufficient for current task tools.
[PR #40308](https://github.com/openai/codex/pull/40308) adds the `codex_tui`
namespace and an approval-gated local MCP bridge. Its bridge owns an
`AppServerRequestHandle`; ThreadMesh must not extract its private bearer token.
[PR #40315](https://github.com/openai/codex/pull/40315) adds task mentions and
preserves their native references through start/resume/fork.

The fixed-version
[task-tools implementation](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/tui/src/dynamic_tools.rs)
reads/resumes a specific target and sends through `turn/start.toolOutput`.
The delegated text is a tool output with source attribution, not a synthesized
high-authority user message. This shows how the native TUI performs delegation;
it does not establish that a third-party desktop plugin owns that request
handle or may bypass configured approvals.

### Native MCP identity

The fixed-version
[MCP call path](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/core/src/mcp_tool_call.rs)
adds these fields after preparing model arguments:

```text
params._meta.threadId                         persisted native ThreadId
params._meta.callId                           current tool call
params._meta.itemId                           optional originating item
params._meta["x-codex-turn-metadata"]           object, not JSON text
    .thread_id                               native ThreadId
    .session_id                              runtime SessionId
    .turn_id                                 native turn
```

`threadId` and nested `thread_id` should agree. Do **not** assume `session_id`
equals either: the
[turn-context constructor](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/core/src/session/turn_context.rs)
passes `SessionId` and `ThreadId` separately. Native
[hooks](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/core/src/hook_runtime.rs)
use `sess.session_id()`. Compare a hook's `session_id` to the nested MCP
`session_id` when proving they refer to the same runtime session.

The new identity helper ignores model-supplied arguments and strips unrelated
metadata. It fails on conflicting native IDs and does not invent a fallback
from cwd, MCP connection ID, or a global “last active session.” Metadata is
**correlation, not authentication or consent**: a different MCP client could
forge it. Trusted host transport and explicit sharing opt-in remain necessary.

### Public endpoint, not private IPC

Packaging integration check: the pinned
[plugin parser](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/codex-mcp/src/plugin_config.rs#L44)
uses `rename_all = "camelCase"` for its wrapped `mcp_servers` Rust field.
The accepted JSON wrapper is therefore **`mcpServers`**, alongside a direct
server map. This differs from the fetched documentation's snake_case example.
The shared probe uses camelCase, accepted by both inspected runtimes and the
Plugin Creator validator. Native desktop loading remains a separate check.

The standard parser explicitly resolves relative `cwd` against the plugin root;
MCP argument expansion of `CLAUDE_PLUGIN_ROOT` was not established in that path.
The shared file therefore uses `cwd: "."` and `args: ["scripts/mcp.mjs"]`.
ZCode's own manifest supplies its separately verified root-variable form.
Hook root-variable support must not be assumed to apply to MCP arguments.

The official [App Server documentation](https://learn.chatgpt.com/docs/app-server)
documents `--listen unix://`, explicit Unix endpoints and the
`initialize` / `initialized` handshake. The bundled executable's help also
exposes `app-server proxy --sock <path>` and `app-server daemon version`.

The fixed-version
[daemon documentation](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/app-server-daemon/README.md)
describes an experimental Unix daemon primarily intended for SSH-managed
standalone installations. Its
[version probe](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/app-server-daemon/src/client.rs)
only performs the initialization handshake and extracts the version.

The passive preflight ran against the installed desktop binary and returned:

```json
{
  "runtimeVersion": "0.153.1",
  "discovery": "official-default-daemon",
  "endpointReachable": false,
  "desktopOwnerVerified": false,
  "readyForDirectedDelivery": false,
  "reason": "public_control_socket_missing",
  "modelCalls": 0,
  "chatOperations": 0
}
```

Even a successful version response would mean only “a public server is
reachable.” It would not prove ownership of the conversation currently open
in the desktop. No alternative private sockets or tokens were searched.

## Implementation and verification

- [Passive endpoint preflight](../../src/integrations/codex-desktop-capabilities.mjs):
  fixed read-only commands, bounded timeout/output, sanitized results; no
  automatic install/start/restart and no thread operations.
- [Native caller projection](../../src/integrations/codex-desktop-identity.mjs):
  request metadata extraction and explicit runtime-hook correlation; no
  registration, authority grant, or delivery.
- [Five tests](../../test/codex-desktop-capabilities.test.mjs): all passed.
  These cover fixtures plus fail-closed behavior. The separate actual native
  endpoint preflight above is the only live runtime result in this lane.

```sh
node --test test/codex-desktop-capabilities.test.mjs
```

No desktop restart, plugin installation, hook trust change, private chat read,
sidebar task creation, real cross-task message, or model call occurred here.

## Next native proof and stop line

Use the ordinary plugin flow in a user-approved test conversation. Observe the
current hook runtime ID and MCP metadata together, including a pre-installation
conversation. Only then bind explicit join/leave state to the native thread.
Checkpoint inbox delivery is a useful first slice; arbitrary idle wake is not
required to prove that slice. Current model use of available native task tools
can be explored with the same explicit pair and normal host approvals.

Until that native probe and opted-in pair pass, keep desktop support
experimental. Do not ship an external directed-send wrapper against a server
whose ownership has not been established.
