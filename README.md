<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>Your agent conversations should talk to each other.<br>You shouldn't have to relay every message.</strong></p>

<p align="center">Connect separate sessions of the same agent—or different agents.<br>Let them discover relevant work, share changes, and continue with context.</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-%3E%3D22-3c873a.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Experimental alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#a-real-handoff-without-the-copy-paste">See the effect</a> ·
  <a href="#try-it">Try it</a> ·
  <a href="#supported-harnesses">Harnesses</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

One conversation changes the API. Another is still building against the old contract.
You shouldn't have to notice, switch chats, and explain the change again.
You don't need two different products: two sessions of the same agent can collaborate.

**You choose which sessions join. The models choose when a message is useful.**
ThreadMesh supplies discovery, advisory messages, a persistent inbox and portable
checkpoints—not a new model, shared chat history or a fixed sequence of handoffs.

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="Concept: Agent A sends advice from another task to Agent B while unrelated work stays quiet">
  <br><sub>Concept illustration of the handoff—not a shipped chat UI or a recording.</sub>
</p>

## A real handoff without the copy-paste

**Two Codex sessions. One remembers your earlier decision; the other changes the
product facts. You don't relay the change.**

In a real installed-package run, the website session first volunteered its
dependency. The brand session then chose to send the relevant update. After
that actual message, the runner continued the **same native website session**;
its model edited the landing copy itself.

| Website copy | Before | After |
|---|---|---|
| Product and spelling | Organise work with Team Hub | Organize work with Member Portal |
| Free allowance | Unlimited free projects | Free tier includes up to 5 projects |
| Earlier button decision | Create my workspace | **Unchanged** |
| Paid price | $12/month | **Unchanged** |

These compact descriptions summarize the checked artifact, not a screenshot.
Each model received an ordinary task with generic opt-in collaboration guidance,
not an instruction naming the recipient or requiring a send. The runner checks
the receiver's own edit, complete business meaning and retained constraints.

Two maintainer runs passed from installed packages: about **273 seconds** with
the default 300-second limit, and **184 seconds** in an earlier extended-budget
diagnostic. Neither changed the configured model or account. These are two
observations, not a reliability rate or a time-to-success promise.
[Exact prompts, artifacts and timing →](docs/09-reviews/2026-09-07-codex-first-use-release.md)

**The boundary:** these are two new disposable Codex sessions. The runner
triggers continuation after delivery; this is not native desktop background wake
or attachment to old chats. Earlier [Codex connection failures](docs/09-reviews/2026-09-07-codex-first-use-candidate.md)
and [cross-product business failures](docs/09-reviews/2026-09-05-workspace-awareness.md)
remain recorded. Delivered still does not mean done correctly.

## Try it

### Already use Codex? Keep your account

Requires **Node 22+** and a working, authenticated Codex installation.
Install the version-pinned **v0.1.0-alpha.3** package from GitHub Releases;
it is not on the npm registry:

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

The default is the **Codex → Codex copy example**. No Pi, second subscription,
API key change, custom harness, test project or two-terminal setup is required.
It uses your existing Codex configuration and normal quota. On macOS, ThreadMesh
can choose a newer desktop-bundled runtime over an older PATH installation;
you do not always need a separate CLI install.

Installation progress and runtime stages are visible. Native builds, network
conditions and model behavior affect timing. The live run has a **300-second
overall limit**; unfinished or wrong work fails instead of becoming a preview.
Omit `--live` to read instructions without a model call. Processes stop at the
end; private results remain for inspection.
[Permissions, results and failures →](docs/06-guides/first-workspace.md)

### Want to connect your existing desktop tasks?

There is an [experimental no-terminal workflow](docs/06-guides/codex-native-tasks.md)
using a skill and Codex's already-exposed native task tools—no Node, MCP or hook
setup for that route. **It has not passed native desktop adoption validation.**
The skill cannot create missing host tools or enforce privacy boundaries and
busy-user race protection. This remains separate from the verified new-session
example above.

### Already use Pi instead?

Keep its existing configuration and select it explicitly:

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

The API example currently requires Pi; Codex first use supports copy only.
Neither path requires the other product. [Pi options and limits](docs/06-guides/first-workspace.md#optional-pi-example).

### Preview without a model

```sh
npx threadmesh preview preferences
```

Simulated agents, real local coordinator. No API key, model quota or chat access.
Also try `preview api` and `preview quota`. These explain the workflow;
they are not evidence of model initiative. For your own projects, use the
[advanced two-terminal workflow](docs/06-guides/first-workspace.md#advanced-connect-your-own-project-sessions).

## Supported harnesses

| Harness | How it connects | Automatic idle follow-up |
|---|---|---|
| **Codex** | `try`: native App Server pair; project launcher: scoped MCP + hooks | `try` runner continues its own idle receiver after delivery; no general native idle wake |
| **Pi** | Native extension; four tools and turn-start context | Opt-in `--wake-idle`; busy-turn guard, not universal typing-race proof |
| **Kimi Code** | Project MCP configuration; other servers retained | No |
| **DeepSeek Harness** | Official `dsh` MCP plugin via a Cordis patch | Not claimed |
| **Other harnesses** | Standard MCP configuration or JavaScript SDK | Requires host integration |

Versions checked: Codex `0.153.1` for the new-pair example, `0.145.0` for the
earlier project launcher; Pi `0.84.2`, Kimi `0.39.1`, DeepSeek `0.1.2-rc.1`.
DeepSeek passed **no-model** native tool/delivery checks; live
initiative is pending credentials. Kimi's latest attempt hit weekly quota.
Earlier Codex→Kimi and Pi→Kimi passes used a more constrained adapter path.

[Versioned evidence and compatibility limits →](docs/00-overview/harness-support.md)

## Where it can help

- **“I already told the other agent.”** Share an API change, approved term or
  research finding with the workstream that needs it, without relaying it yourself.
- **“Don't lose our decisions.”** Publish selected constraints and save a
  checkpoint instead of broadcasting entire private conversations.
- **“My quota ran out halfway through.”** Start another harness with the last
  saved goal, decisions, constraints and next step.

These are practical uses, not a promise that every scenario succeeds.

### Continue from a saved checkpoint

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

**A checkpoint must already exist**, and the destination needs available quota.
Saving is model-selected, not guaranteed automatic backup. This starts a
**new native session** with explicit context—not full chat history, hidden state,
permissions or cross-machine file transfer. Actual quota-blocked long-session
recovery is still unverified.

[Checkpoint guide: what survives, what doesn't →](docs/06-guides/portable-checkpoints.md)

## Your sessions stay yours

Joining shares published goals and advice, not all private chats. Inbox reads
do not consume messages; acceptance does not prove completion. Pi idle wake is
opt-in. Use `npx threadmesh status` to inspect or `npx threadmesh mute client` to mute.

This is an **experimental, same-owner local workspace**, not a multi-tenant
security boundary. It does not automatically attach arbitrary old tabs, wake
every agent product or guarantee correct work. Host tool permissions still apply.

[Safety model](docs/04-safety/threat-model.md) · [Security policy](SECURITY.md)

## Build with us

Next: make same-product session collaboration easy to adopt, preserve full
business constraints, and verify prior-session continuity and independent first use.
[Focused follow-up](https://github.com/fyaic/threadmesh/issues/156) · [Roadmap](ROADMAP.md)

Report the **first failed step**, a silent agent, an irrelevant message or a
useful collaboration. Building a harness? Start with the
[workspace/MCP guide](docs/06-guides/first-workspace.md#kimi-and-custom-harnesses)
or [SDK adapter guide](docs/06-guides/implement-an-adapter.md).

[Report a first run](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[Discuss a workflow](https://github.com/fyaic/threadmesh/discussions) ·
[Contribute](CONTRIBUTING.md) · [Documentation](docs/README.md)

If it saves you a handoff, a star helps others find it. [Apache 2.0](LICENSE).
