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

In a retained **Pi → Pi** run—two sessions, one agent product:

1. **The client session checks the API** and volunteers its dependency.
   Its initial task finishes; the session stays open.
2. **You ask the backend session to change pagination.** It updates the contract
   and chooses to send the relevant change to the client session.
3. **That same client session continues on its own.** Its own tool updates the
   client; an independent check confirms both cursor pages are fetched correctly.

One ordinary kickoff per session. No later user relay or prescribed recipient.
Generic collaboration guidance was enabled; the backend received the client's
earlier dependency message. This is reciprocal model-selected cooperation, not blind
discovery of arbitrary chats.

[Read the prompts, timeline and final client →](docs/09-reviews/2026-09-05-first-use-validation.md#the-actual-initiative-case)

A [fresh Pi-pair product-copy run](docs/09-reviews/2026-09-07-same-agent-first-use.md)
also handed off automatically and retained the earlier signup label, but dropped
the free-plan qualifier. **That business check failed.**
The [bounded repair follow-up](docs/09-reviews/2026-09-07-handoff-meaning.md)
passed once with complete copy and the prior label, plus a no-contact control.
This is not a general reliability claim; the earlier failure remains recorded.

**Across products, too:** separate Codex → Pi experiments retain both useful
results and a content-quality failure:

| Real Codex → Pi scenario | Observed result |
|---|---|
| API pagination changes | **Pass:** same receiver resumes, edits its client and passes the business check. |
| Unrelated internal note | **Pass:** Codex reads peers/inbox but makes no send attempt; Pi has no follow-up. |
| Approved brand/free-tier changes | **Quality failure:** delivery and continuation work, but copy drops the “free plan” qualifier. |

Each ran once. These are maintainer experiments, not a reliability score or
independent adoption. **Delivered does not mean done correctly.**
[All results, including the failure →](docs/09-reviews/2026-09-05-workspace-awareness.md)

## Try it

**Desktop-app user?** The current alpha below is a developer/CLI path. It does
not attach existing Codex desktop or other GUI conversations.
[Desktop adoption](docs/10-planning/desktop-entry-2026-09-07.md) remains experimental,
not a released integration. A shared workspace means shared ThreadMesh storage,
not a requirement that both agents edit the same code folder.

### Codex is the priority—not an extra Pi prerequisite

The self-contained **Codex → Codex** copy example is an **unreleased candidate**.
Its latest full run did not finish within 300 seconds after repeated model-connection
timeouts, so we are not presenting it as ready. It targets two new sessions with
your existing Codex configuration—not attachment to existing desktop conversations.
[Partial initiative and the retained failure →](docs/09-reviews/2026-09-07-codex-first-use-candidate.md)
[Candidate setup and exact limits →](docs/06-guides/first-workspace.md#codex-candidate-unreleased)

### Already use Pi? Try the published alpha

This optional path is available now; **Codex users are not expected to install Pi**
to get around the unfinished Codex entry. Requires Node 22+ and your existing,
authenticated Pi configuration with quota:

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.2/fyaic-threadmesh-0.1.0-alpha.2.tgz
npx threadmesh try preferences --agent pi --live
```

The packed release avoids preparing a Git checkout; installation progress is
visible, though native dependencies can still take time to build. It is not
published on the npm registry. The command prepares sample files and runs two
new Pi sessions in one terminal, using your normal model quota. The source
chooses whether to message; the same receiver must make its own correct edit
while retaining an earlier decision. Silence, errors and wrong work are failures,
not simulated successes. Existing private chats are not attached.

Try `try api --agent pi --live` for API pagination. Omit `--live` for instructions
without a model call. Processes stop at the end; private result files remain.
[Results, permissions and failure handling →](docs/06-guides/first-workspace.md#published-alpha-optional-pi-example)

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
| **Codex** | Invocation-scoped MCP + task-time hooks on macOS/Linux | No; context refreshes during model work |
| **Pi** | Native extension; four tools and turn-start context | Opt-in `--wake-idle`; busy-turn guard, not universal typing-race proof |
| **Kimi Code** | Project MCP configuration; other servers retained | No |
| **DeepSeek Harness** | Official `dsh` MCP plugin via a Cordis patch | Not claimed |
| **Other harnesses** | Standard MCP configuration or JavaScript SDK | Requires host integration |

Versions checked: Codex `0.145.0`, Pi `0.84.2`, Kimi `0.39.1`, DeepSeek
`0.1.2-rc.1`. DeepSeek passed **no-model** native tool/delivery checks; live
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
