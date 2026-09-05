# Your first useful collaboration

ThreadMesh connects **sessions you deliberately join to one local workspace**.
It does not search private chats or connect every agent on your machine.
Use Node 22+, an installed/authenticated harness, and trusted local processes.
Model calls use that harness's normal account and quota.

## See the idea before spending quota

```sh
npm install github:fyaic/threadmesh
npx threadmesh preview api
npx threadmesh preview preferences
npx threadmesh preview quota
```

These are clearly labelled **simulated-agent previews** through the actual
coordinator. They demonstrate the experience, not model intelligence. The
package is distributed through GitHub, not the public npm registry.

## Connect two real sessions

Create a room once. Run these commands from your project folder:

```sh
npx threadmesh init --workspace .threadmesh
npx threadmesh doctor
```

In terminal B, start the client agent first:

```sh
npx threadmesh run pi --workspace .threadmesh --name client \
  --goal "Maintain the /orders JavaScript client" --wake-idle \
  -- --provider zai --model glm-5.3
```

Give it its ordinary task: “Check that the client follows our current API
contract. Keep it ready as the backend evolves.” Leave this session open.

In terminal A:

```sh
npx threadmesh run pi --workspace .threadmesh --name backend \
  --goal "Maintain the /orders backend API contract" \
  -- --provider zai --model glm-5.3
```

This example pins the tested Pi model (`zai/glm-5.3`), requiring your own
configured ZAI account. The local default vision-model attempt stayed silent.
You can choose other tool-capable models, but their behavior is not guaranteed.
For the Codex launcher, use `threadmesh run codex` with the same name/goal
options; its new workspace initiative attempt did not pass yet.

The Codex launcher preapproves only the four local ThreadMesh tools for that
invocation: joining the room opts into goal discovery, advisory mail, inbox
decisions and explicit checkpoints. Shell/file permissions and other MCP
servers are unchanged. This avoids a headless MCP approval being reported as a
user cancellation. Preapproval does not force the model to use the tools.

Give A a real upstream task, such as changing pagination from `next_page` to
`next_cursor`. ThreadMesh exposes the published peer goals; A decides whether
the change matters to B and whether to send an advisory message. An opted-in,
idle Pi receiver can begin a follow-up turn. A busy receiver is not steered.

This is model-selected collaboration, not a guaranteed send rule. A may stay
silent or B may reject the advice. Check the result in the files/tests, not
just the receipt. Use a disposable project for your first experiment.

The agents may use different project directories: pass the **same absolute
workspace path** to both. Give every concurrently connected session a unique
name. A name represents an ongoing workstream, not an automatically detected
native tab. Do not reuse it for unrelated work.

## DeepSeek Harness

This integration targets the official
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), not an
unrelated third-party DeepSeek CLI. The tested npm preview is pinned:

```sh
npm install -g @deepseek-ai/dsh@0.1.2-rc.1
npx threadmesh run deepseek --workspace .threadmesh --name research \
  --goal "Research compatibility changes in the orders API"
```

Configure/authenticate the provider using DeepSeek's own setup first.
ThreadMesh generates a local Cordis patch loading the official MCP client;
it does not read or move provider credentials. The default profile is `web`.
For one headless task:

```sh
npx threadmesh run deepseek --workspace .threadmesh --name research \
  --goal "Research orders compatibility" --profile headless -- \
  "Review the current API contract and summarize compatibility risks."
```

The four native MCP tools and bidirectional delivery have been tested inside
DeepSeek's official runtime. A **DeepSeek model-driven proactive case is still
pending provider credentials**. Web/ACP configuration is supplied but not a
claim of native idle wake. Use one named ThreadMesh workstream per configured
DSH process/profile; automatic identity for multiple web tabs is not supplied.

## Kimi and custom harnesses

```sh
npx threadmesh run kimi --workspace .threadmesh --name docs \
  --goal "Maintain the public API examples"
```

Kimi receives a project `.kimi-code/mcp.json` entry. Existing servers are
retained and an existing file is backed up before adding the entry. A different
existing `threadmesh` entry is not overwritten: use another project directory
or explicitly edit that entry. Do not commit private local configuration.

For other MCP-capable harnesses, inspect the configuration:

```sh
npx threadmesh setup codex --workspace .threadmesh --name helper \
  --goal "Maintain integration tests"
```

This prints standard stdio MCP configuration. Tool availability does not prove
that every host consumes MCP server instructions or supports idle wake. Hosts
should explain the shared-workspace tools in their own normal agent guidance.
The [SDK adapter guide](implement-an-adapter.md) remains available for deeper
integration; the core two-tool bridge is distinct from this four-tool room.

## What is automatic, exactly?

| Surface | Available behavior | Limit |
|---|---|---|
| Published goals | MCP startup guidance and discovery metadata; Pi turn-start hints; fresh lookup on request | MCP startup hints can become stale; not global chat search |
| Sending | Model chooses useful recipient and content after discovery | No promise that every useful opportunity is noticed |
| Pi extension | Inbox at turn start; optional follow-up while idle | `--wake-idle` required; no steering a running turn |
| Codex / Kimi / DeepSeek MCP | Model reads inbox and decides what to do | No background native wake claimed |
| Checkpoints | Model can save explicit working context | Not an automatic full-session backup |

The four tools are `threadmesh_peers`, `threadmesh_send`, `threadmesh_inbox`,
and `threadmesh_checkpoint`. Inbox reads do not consume mail. Accept, defer
and reject are separate actions. Acceptance does **not** mean the files were
updated or tests passed.

## Inspect, pause, and stop

```sh
npx threadmesh status --workspace .threadmesh
npx threadmesh mute client --workspace .threadmesh
npx threadmesh unmute client --workspace .threadmesh
```

Close the harness to stop its connection. Goals, inboxes and checkpoints persist
in the private workspace so reopening does not silently lose work. Messages
expire after 30 minutes; each source has a persistent limit of 10 sends per
10 minutes, and a room admits at most 20 workstreams. These are basic local
interference controls, not a production abuse boundary.

## If nothing happens

1. Run `doctor`; confirm the harness is installed and separately authenticated.
2. Use the same absolute room path, different names, and precise published goals.
3. Run `status`; distinguish “no message” from “pending receiver message”.
4. Confirm the harness lists the four tools. Restart after changing MCP config.
5. For non-Pi receivers, check the inbox during a normal task turn. Background
   delivery alone cannot wake an arbitrary host.
6. Share the first failed step in an [operator report](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml).
   A failed installation is useful feedback; no successful-demo requirement.

For a nonstandard executable path, set an absolute
`THREADMESH_CODEX_COMMAND`, `THREADMESH_KIMI_COMMAND`, `THREADMESH_PI_COMMAND`
or `THREADMESH_DSH_COMMAND`. SQLite may need a native build toolchain if your
Node/OS combination lacks a prebuilt binary. Windows support is not yet
validated; current real-product records are from macOS.
