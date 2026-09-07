# Your first useful collaboration

[简体中文](../zh-CN/first-workspace.md) · [Back to the README](../../README.md)

Start with **two Codex sessions using your existing account**. ThreadMesh creates
the sample, exposes relevant peer goals and advice, and checks a useful result.
It does not search your private chats or merge their transcripts.

## Install and run the Codex example

Requires Node 22+ and an authenticated Codex runtime with available quota.
On macOS, ThreadMesh compares PATH and desktop-bundled runtimes and can select
the newer version-verified executable. A separate CLI install is not always needed.
The selected runtime is reported; your account and model configuration are not
silently replaced.

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

This installs the fixed **v0.1.0-alpha.3** packed artifact, not an npm-registry
release. Progress flags expose installation output; native dependencies may
still compile, so setup time varies. You do not need a repository checkout,
custom harness, application fixture, workspace path, Pi or two terminals.

The default is `preferences` with `codex`; the explicit equivalent is:

```sh
npx threadmesh try preferences --agent codex --live
```

Omit `--live` to read the instructions without starting a model. Optional
`--model YOUR_CODEX_MODEL` selects a model already available in your configuration.
Codex currently supports the copy case only; the API example remains an explicit
Pi path. There is no extra subscription requirement or silent agent switch.

### What you should see

1. A new website session B works on signup copy with the earlier button-label
   decision `Create my workspace`. It may volunteer its dependency.
2. A separate brand session A receives an ordinary task to rename the product
   Member Portal, use US spelling and limit the free tier to five projects.
   Generic collaboration guidance is enabled; the task does not prescribe a
   recipient or demand a message.
3. Only after an actual message, the runner starts a follow-up turn in the
   **same native B session**. B decides how to use the advice and edits its own
   landing copy. The check requires the new brand, spelling and free-plan
   meaning while retaining the button and $12/month paid price.

A passing report needs the receiver's own native file change and correct
business result. Login, delivery or acceptance alone cannot pass. Silence,
provider errors, wrong results and unfinished work are failures; a preview never
replaces a failed live run.

[Two retained installed-package runs](../09-reviews/2026-09-07-codex-first-use-release.md)
passed: approximately 273 seconds under the unchanged default 300-second limit,
and 184 seconds in an earlier extended-budget diagnostic. Both kept the configured
model and account. These are maintainer observations, not independent adoption,
a reliability rate or a promise of completion time. Network and model behavior
vary; [earlier connection failures](../09-reviews/2026-09-07-codex-first-use-candidate.md)
remain available.

### Existing desktop conversations are a separate path

The example creates **two new disposable sessions** and supplies the follow-up
trigger after a real message. It is not native desktop background wake or
attachment to old tasks.

The [experimental existing-task workflow](codex-native-tasks.md) instead uses a
skill and task tools already exposed by the Codex host. That route needs no Node,
MCP or hook setup. [One controlled pair passed](../09-reviews/2026-09-07-native-desktop-acceptance.md)
after both tasks had completed prior work, including useful receiver edits and
busy/stop checks. This is not plugin hot-loading or independent GUI onboarding.
The skill cannot create absent tools or enforce privacy and busy-user race protection.

### Permissions, results and failures

The example requests Codex's native sandbox for each session's own sample working
directory. Its business verifier reads structured JSON rather than executing
model-edited application code. This is not a claim that every ThreadMesh process
is OS-sandboxed; use trusted local processes and review the permission notice.

Model turns consume your normal Codex account quota. Finding a binary or login
does not establish remaining quota. Progress distinguishes setup, model work and
verification; retrying connections remain inside the **300-second total budget**.
There is no automatic restart of the whole run, account switch or simulated
fallback after failure.

The command prints a private result directory with sample files, reports and raw
model records. Keep these private and redact shared summaries. Processes stop
when the run ends or you press Ctrl-C; result files remain for inspection.
Existing private chats are not read, attached or modified by this example.

Resolve missing login, depleted quota or an outdated runtime through your normal
Codex configuration or update path. Do not repeatedly retry exhausted quota.
ThreadMesh supplies neither credentials nor quota. For other failures, retain
the first failing stage and share a reviewed summary, not private transcripts.

## Optional Pi example

Already use Pi? Keep its own authenticated configuration and choose it explicitly:

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

Pi does not require Codex, and Codex does not require Pi. Both prepare their own
samples without custom code or two-terminal setup. Alpha.2's historical `try`
was Pi-only; alpha.3 defaults to Codex, so explicit `--agent pi` matters.

Optional Pi-only overrides are `--provider zai --model glm-5.3`; they require
your own configured provider account. Historical Pi passes used `zai/glm-5.3`.
Other models may behave differently; a prior pass does not guarantee yours.

Pi keeps its normal local tool permissions; its temporary directory is not an
OS sandbox. Processes stop at completion or Ctrl-C; private results remain.
Fix authentication or quota errors in Pi's normal configuration rather than
repeatedly retrying exhausted quota.

## See the idea without spending quota

```sh
npx threadmesh preview preferences
npx threadmesh preview api
npx threadmesh preview quota
```

These are clearly labelled **simulated-agent previews** through the actual
coordinator. They demonstrate the experience, not model intelligence, and
are separate commands from the real `try --live` example.

## Advanced: connect your own project sessions

The following **Pi-specific** workflow demonstrates opt-in native idle follow-up
in your own project. It is not required for the Codex first-use example above.
Codex's ordinary launcher currently supplies task-time context, not native idle wake.

Create a room once. Run these commands from your project folder:

Use a disposable project with an existing API contract and client. The launcher
does not generate those application files. If you want the exact test fixture
instead of adapting your own project, see [reproduce the retained case](#reproduce-the-retained-case).

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

Both sessions pin the tested Pi model (`zai/glm-5.3`) and use your configured
ZAI account; no second product subscription or Codex installation is needed.
Both consume that account's normal quota. The local default vision-model
attempt stayed silent. Other tool-capable models need their own validation.
The [retained Pi → Pi case](../09-reviews/2026-09-05-first-use-validation.md#the-actual-initiative-case)
shows model-selected messages and the idle receiver continuing its earlier
work, not attachment to an arbitrary old chat.

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

## Reproduce the retained case

Maintainers reproducing a historical validation can use a repository checkout.
First-time Pi users should use `threadmesh try api --agent pi --live` instead. This script
creates the API/client files and room in a temporary directory, gives each
real session one ordinary kickoff, and checks native sends, same-session
continuation, receiver edits and the final business result. It spends normal
model quota and does not attach to existing private chats.

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
node scripts/validate-workspace-live.mjs pi api
```

Install Pi and configure your account for `zai/glm-5.3` first. Both sessions use
that same account with independent contexts. The script prints its artifact
directory and `report.json`; the historical pass is not a guarantee your run
will pass. In that run, the client first volunteered its dependency, so the
case demonstrates two-way initiative rather than blind discovery.
[Results and exact prompts](../09-reviews/2026-09-05-first-use-validation.md#the-actual-initiative-case).

Raw events may contain native identifiers and model output. Keep them private;
review the output of `node scripts/project-first-use-evidence.mjs PATH` before
sharing a reduced projection. Test scripts are repo-only; the installed
package's `try` command does not require them.

## Optional next step: Codex → Pi

To try a different source harness after the Pi pair, install/authenticate Codex
separately. End the Pi source in terminal A, mute its old workstream, then use
a new name: `backend` remains bound to Pi and cannot be reused for Codex.

```sh
npx threadmesh mute backend --workspace .threadmesh
npx threadmesh run codex --workspace .threadmesh --name backend-codex \
  --goal "Maintain the /orders backend API contract"
```

For the repository fixture, use `node scripts/validate-workspace-live.mjs codex api`.
This path has [one real passing API case](../09-reviews/2026-09-05-workspace-awareness.md#ordinary-codex--pi-api-case-pass).
The separate `codex preferences` case **failed business correctness**;
`codex api-no-contact` passed. These are optional follow-up checks, not
requirements for the first Pi pair or a claim that every combination works.

The Codex launcher preapproves only the four local ThreadMesh tools for that
invocation: joining the room opts into goal discovery, advisory mail, inbox
decisions and explicit checkpoints. Shell/file permissions and other MCP
servers are unchanged. This avoids a headless MCP approval being reported as a
user cancellation. Preapproval does not force the model to use the tools.

On macOS/Linux, the launcher also adds invocation-scoped Codex `SessionStart`
and `UserPromptSubmit` hooks. They provide current published goals and a bounded,
non-consuming inbox preview before model work. They do not select a recipient,
send messages, read native transcripts or replace your existing instructions.
Only these two exact hook definitions are trusted for this invocation; other
user/project hooks retain their own trust. No global configuration is written.
Native execution was checked against Codex `0.145.0`; a later version needs
revalidation. Disabled hooks are not re-enabled. Windows currently gets MCP
only. This adds task-time awareness, **not background Codex idle wake**.

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
