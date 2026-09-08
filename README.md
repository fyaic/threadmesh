<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>Your agent conversations should talk to each other.<br>You shouldn't have to relay every message.</strong></p>

<p align="center">Connect separate sessions of the same agent—or different agents.<br>Let them discover relevant work, share changes, and continue with context.</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Experimental alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#a-real-handoff-without-the-copy-paste">See the effect</a> ·
  <a href="#try-it">Try it</a> ·
  <a href="#supported-harnesses">Harnesses</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

You approved a decision in one chat. Another chat is still working from the old
version. ThreadMesh helps related agent sessions share useful changes without
making you explain them again—even when both sessions use the same product.

**You choose the collaborators. The models decide what is worth sharing.**

| The repeated chore | What ThreadMesh offers |
|---|---|
| “Tell the other session what changed.” | Selected peer goals and advisory handoffs; a model chooses whether to contact a peer. |
| “Remember what we already agreed.” | Each receiver keeps its own task context and checks advice against earlier decisions. |
| “Was it received—or actually done?” | Workspace inbox/disposition records plus examples that verify the receiver's own artifact, not just delivery. |

Two ways to use it: an optional **Codex desktop skill** over native task tools,
or a **local workspace** with a persistent inbox, supported harness adapters
and explicit portable checkpoints. These are different integration paths, not
one universal desktop connector. Codex supplies the skill route's transport.
[What we add—and when native Codex is enough →](docs/00-overview/native-capabilities-and-value.md)

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="Concept: Agent A sends advice from another task to Agent B while unrelated work stays quiet">
  <br><sub>Concept illustration of the handoff—not a shipped chat UI or a recording.</sub>
</p>

## A real handoff without the copy-paste

**A knows the new product facts. B remembers your earlier website decision.**

In one controlled Codex desktop run, both tasks completed their initial work
before adopting the skill. B already knew to keep the signup button unchanged.
After explicit pairing, the only business request went to A:

> Rename the product to Member Portal and limit the free plan to five projects.
> Use US spelling. Keep the paid-plan price unchanged. Update the approved product facts.

No “send this to B.” A chose to check B's status and send the relevant facts.
**Original B then continued and edited its own website copy.** The manager did
not relay the change, resume B manually or write B's file.

| Website copy | Before | After |
|---|---|---|
| Product and spelling | Organise work with Team Hub | Organize work with Member Portal |
| Free allowance | Unlimited free projects | Up to five projects on the free tier |
| Earlier button decision | Create my workspace | **Unchanged** |
| Paid price | $12/month | **Unchanged** |

The ordinary request to B's completed result took about **49 seconds, excluding
setup**. In separate controls, A held its advice while B was busy and made no
further send after collaboration was stopped.
[Actual messages, B's diff and audit →](docs/evidence/codex-native-2026-09-07/README.md)

This is one maintainer-operated pair with prior context, not a speed guarantee
or independent-user onboarding result. Codex provided native messaging and
continuation; the skill provided guidance. The table summarizes checked files,
not a screenshot. Simultaneous typing races and plugin hot-loading remain unverified.

## Try it

| Your starting point | Choose this path |
|---|---|
| I use existing Codex desktop tasks | [Native-task workflow](#want-to-connect-your-existing-desktop-tasks): no Node/MCP/hook setup, but explicit pairing and available host tools are required. |
| I want a self-contained real example | [Codex package example](#already-use-codex-keep-your-account): one terminal, two new disposable sessions, existing account and quota. |
| I want to connect my project sessions | [Workspace guide](docs/06-guides/first-workspace.md#advanced-connect-your-own-project-sessions): more setup; persistent inbox and supported harness integration. |

### Want to connect your existing desktop tasks?

[**Start in your existing Codex tasks →**](docs/06-guides/codex-native-tasks.md)

Set the selected peer and shared topic in each original task, wait for both
setup confirmations, then give one task your ordinary business request. The
effect to look for is **the other original task acting correctly**, not a
generated prompt or a sent badge. Ask **“Check ThreadMesh status”** in the task
to distinguish setup, pending advice and observed results; stop in both tasks
to stop both directions. These are natural-language requests, not slash commands
or a separate control service.

No browser is required for collaboration. The optional
[setup-text helper](https://fyaic.github.io/threadmesh/) saves manual template
editing only: it does not run agents, connect tasks, show live status or stop
them. You still paste/send both setups in Codex. It is neither a demo nor a
hosted version of ThreadMesh.

Another real case: A changed an API contract; original B updated its own client
and tests, retaining the earlier timeout and cursor-encoding decisions.
[Browser checks and the actual API handoff →](docs/09-reviews/2026-09-08-pairing-helper-acceptance.md)

**Tested, still experimental:** the [public-workflow + chat-link run](docs/09-reviews/2026-09-08-native-deep-link-acceptance.md)
resolved the original two tasks without a global task list. A chose to send;
original B updated its own copy and preserved its button and price. The manager
supplied the documented link format through native tools; manual GUI onboarding
and normal plugin installation remain unverified. The skill cannot add absent host tools or enforce
privacy and race-free sending. If native Codex already meets your needs, use it
directly; no measured advantage over native-only use is claimed.

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

Separate from the desktop case above, this installed-package Codex example
passed in about **273 seconds** under its default limit. An earlier diagnostic
passed in 184 seconds with an extended budget. The runner continues its own
receiver after actual delivery; it does not attach existing desktop chats.
[Packaged-run evidence and retained failures →](docs/09-reviews/2026-09-07-codex-first-use-release.md)

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
| **Codex desktop** | Optional skill over host-provided native task tools | One controlled pair passed; Codex supplies continuation; availability varies by host |
| **Codex package / projects** | `try`: native App Server pair; project launcher: scoped MCP + hooks | `try` runner continues its own receiver; not arbitrary old-chat attachment |
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

For an already configured workspace—not the disposable `try` sample—run from
its directory, or supply `--workspace /path/to/your/room`:

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

In the workspace route, joining shares published goals and advice, not all private chats. Inbox reads
do not consume messages; acceptance does not prove completion. Pi idle wake is
opt-in. Use `npx threadmesh status` to inspect or `npx threadmesh mute client` to mute.

This is an **experimental, same-owner local workspace**, not a multi-tenant
security boundary. It does not automatically attach arbitrary old tabs, wake
every agent product or guarantee correct work. Host tool permissions still apply.
The desktop skill uses Codex's native history and model-followed rules instead;
workspace inbox and mute commands do not control that separate route.

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
