<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>Your agents should talk to each other. You shouldn't have to relay every message.</strong></p>

<p align="center">Shared workspaces for independent agent sessions: useful peer messages, explicit context, and portable checkpoints.</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="package.json"><img alt="Node 22+" src="https://img.shields.io/badge/node-%3E%3D22-3c873a.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Experimental alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#try-it">Try it</a> ·
  <a href="docs/06-guides/first-workspace.md">Connect your agents</a> ·
  <a href="docs/06-guides/portable-checkpoints.md">Out of quota?</a> ·
  <a href="docs/06-guides/real-world-cases.md">Evidence</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="Concept illustration: one session reaches out to another while unrelated work stays quiet">
  <br><sub>Concept illustration, not a screenshot of a shipped ThreadMesh chat UI.</sub>
</p>

You're changing an API in one agent and building its client in another.
The backend switches to cursor pagination. The client agent doesn't know.
Usually, **you** notice, copy the change, switch sessions, and explain it again.

ThreadMesh gives connected agents a way to notice related work and share useful
context themselves. You choose which sessions share a workspace. The model
chooses whether to reach out; the receiving agent decides what to do with the
advice. ThreadMesh supplies the connection—not a new foundation model.

```text
Backend session                 Client session                 Unrelated work
Changes pagination              Maintains the orders client    Translates policy
        │                                 │                          │
        └── “next_cursor replaces page” ──►│                          │
              model-selected advice       └─ reviews / updates       └─ stays quiet
```

## Try it

Requires Node 22+. Install from GitHub; the package is **not on npm yet**.

```sh
npm install github:fyaic/threadmesh
npx threadmesh preview api
```

The preview uses simulated agents and the real local coordinator. No API key,
no model quota, no access to your existing chats. Try `preview preferences` or
`preview quota` for different situations. This is an onboarding walkthrough,
not evidence of model initiative.

### Connect real agents

From your project folder, create a room once:

```sh
npx threadmesh init --workspace .threadmesh
```

Start the receiving agent in terminal B:

```sh
npx threadmesh run pi --name client --goal "Maintain the /orders client" --wake-idle \
  -- --provider zai --model glm-5.3
```

Start another agent in terminal A, in the same project:

```sh
npx threadmesh run pi --name backend --goal "Maintain the /orders API" \
  -- --provider zai --model glm-5.3
```

Give each its ordinary task. They now have peer discovery, messaging, inbox and
checkpoint tools. Different project folders can share one **absolute**
`--workspace` path. Harness installation, login and model quota are separate.
This first example pins the tested Pi model; other model choices need their
own validation. Codex, Kimi and DeepSeek launch paths are documented below.

[Full walkthrough, DeepSeek setup and troubleshooting →](docs/06-guides/first-workspace.md)

The [latest real run](docs/09-reviews/2026-09-05-first-use-validation.md)
used two Pi sessions with ordinary file tasks: peer-selected contact → idle
receiver follow-up → updated client → passing two-page assertion. Unrelated
messages: **0**. One controlled pass, not a general reliability claim.

## Where it helps

| Your day-to-day problem | What ThreadMesh makes possible |
|---|---|
| “I already told the other agent which API changed.” | A publishes relevant changes to the session maintaining the client. |
| “Why do I have to explain our naming/tone decisions again?” | Deliberately share agreed constraints, instead of copying whole conversations. |
| “The research agent found the answer, but the coding agent is still stuck.” | Send the finding and why it matters to that workstream. |
| “I hit my quota halfway through a large task.” | Start another harness with the last saved goal, decisions, constraints and next step. |

These are use-case recipes, not a claim that every scenario has been independently
validated. [Real case records](docs/06-guides/real-world-cases.md) distinguish
model runs from scripts and disclose unsuccessful attempts.

### Out of quota? Continue from a checkpoint

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

The source must have saved a checkpoint first. The destination needs its own
working account. This carries **explicit context**, not hidden model state or
every token in the original conversation. No quota bypass or account rotation.

[Checkpoint guide and realistic limits →](docs/06-guides/portable-checkpoints.md)

## Harnesses and what actually happens

| Harness | New workspace integration | Automatic idle wake? |
|---|---|---|
| **Pi** | Native extension; four tools and inbox at turn start | Opt-in `--wake-idle`; does not steer a busy turn |
| **Codex** | Invocation-scoped stdio MCP configuration | No; inbox is consulted during model work |
| **Kimi Code** | Project MCP entry; preserves other servers | No; inbox is consulted during model work |
| **DeepSeek Harness** | Official `dsh` MCP plugin through a Cordis patch | Not claimed |
| **Other harnesses** | Standard MCP configuration or JavaScript SDK | Host integration required |

DeepSeek's official preview `0.1.2-rc.1` passed native MCP discovery, bidirectional
delivery, receiver decisions and checkpoint persistence. **Its live model
initiative test remains pending credentials.** Earlier bounded real-model
records include Codex→Kimi and Pi→Kimi; they used more constrained prompts than
normal daily work and are not a general autonomy guarantee.

[Versioned support and evidence matrix →](docs/00-overview/harness-support.md)

## What this does not promise

- Installing tools does not guarantee a model notices every dependency.
- MCP messaging does not magically wake any arbitrary agent product.
- Joined sessions see published goals and messages, not all your private chats.
- Reading mail does not consume it. Accepting advice does not prove work is done.
- A checkpoint is a recoverable summary, not lossless memory migration.

This is an **experimental, same-owner local workspace**. Do not use it as a
multi-tenant security boundary. Agent tool permissions remain those of the
host. You can mute a workstream, and messages have expiry and send budgets.

[Safety model](docs/04-safety/threat-model.md) ·
[SDK integration](docs/06-guides/implement-an-adapter.md) ·
[Security policy](SECURITY.md)

## Help shape the useful version

The next milestone is not another protocol feature. It is independent users
getting a useful collaboration without troubleshooting the maintainer's setup.
Tell us **where you got stuck**, including failed installs and silent agents.

[Report a first run](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[Discuss a workflow](https://github.com/fyaic/threadmesh/discussions) ·
[Roadmap](ROADMAP.md) · [Docs](docs/README.md) · [Contribute](CONTRIBUTING.md)

If this solves a real problem for you, a star helps others find it.
Released under [Apache 2.0](LICENSE).
