<h1 align="center">ThreadMesh</h1>

<p align="center"><strong>Share useful context between agent tasks.</strong><br>Keep related work in sync without relaying every change yourself.</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Experimental alpha" src="https://img.shields.io/badge/status-experimental_alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#try-it">Get started</a> ·
  <a href="#a-real-handoff-without-the-copy-paste">Evidence</a> ·
  <a href="docs/README.md">Documentation</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

You update an API in one task. Another task maintains its client and still uses
the old contract. ThreadMesh helps the selected tasks share that change, while
the receiver keeps the decisions already made in its own conversation.

**You choose the collaborators and allowed topics. The agents judge what is
relevant and how to use it.** Tasks may use the same agent product or different
supported products.

ThreadMesh offers two separate paths:

| Path | What it adds | Current status |
|---|---|---|
| **Codex desktop skill** | Guidance for scoped collaboration through Codex's native task tools | Experimental plugin candidate; marketplace discovery checked, installation and existing-task loading unverified |
| **Local workspace / CLI** | A persistent inbox, supported harness integrations and explicitly saved checkpoints | `v0.1.0-alpha.3` available from GitHub Releases; controlled live examples recorded |

The skill does not add a messaging service. If native Codex already covers your
workflow, you may not need it. Improvement over native-only use has not been
measured. [What ThreadMesh adds →](docs/00-overview/native-capabilities-and-value.md)

## Try it

### Want to connect your existing desktop tasks?

Start with the [Codex plugin and task activation guide](docs/06-guides/codex-native-tasks.md).
It covers the candidate installation, selecting a peer, choosing a shared topic
and enabling the permitted direction of communication. The skill route needs
no Node, MCP server or hook setup; it requires the host's native task tools.

**Installing the plugin and loading it in an existing task remain unverified.**
The guide separates those checks from marketplace discovery and the experimental
manual workflow. Controlled handoff results below used source-loaded guidance;
they do not demonstrate normal plugin installation.

After activation, ask “Check ThreadMesh status” to inspect pending advice and
observed results. Say “Stop ThreadMesh collaboration” in each participating task
to stop both directions. These are instructions followed by the agent, not an
instant control service or a way to retract messages already submitted.

### Already use Codex? Keep your account

For a self-contained example, install the released **CLI package**. It requires
**Node 22+**, an authenticated supported Codex runtime and available model quota.
The package is distributed through GitHub Releases, not the npm registry:

```sh
npm install --foreground-scripts --loglevel=info \
  https://github.com/fyaic/threadmesh/releases/download/v0.1.0-alpha.3/fyaic-threadmesh-0.1.0-alpha.3.tgz
npx threadmesh try --live
```

This starts **two new disposable Codex sessions** for a copy-editing example,
using your existing configuration. The runner continues its sample receiver
after delivery and checks the receiver's own edit. It does not attach existing
desktop tasks. On macOS it can also select a supported desktop-bundled runtime.

Progress is visible, the run has a **300-second total limit**, and failures are
reported as failures. Processes stop at the end; private results remain for
inspection. Omit `--live` to read instructions without calling a model.
[Setup, permissions and troubleshooting →](docs/06-guides/first-workspace.md)

### Already use Pi instead?

After installing the same CLI package, choose Pi explicitly:

```sh
npx threadmesh try preferences --agent pi --live
npx threadmesh try api --agent pi --live
```

These use Pi's existing configuration and quota. The packaged API example
currently requires Pi; the Codex example supports copy only.
[Pi setup →](docs/06-guides/first-workspace.md#optional-pi-example)

### Preview without a model

After installing the CLI package:

```sh
npx threadmesh preview preferences
```

This uses simulated agents and the real local coordinator, with no model login
or quota required. `preview api` and `preview quota` are also available.
A preview explains the workflow; it does not prove autonomous agent behavior.

To connect your own project sessions with a persistent inbox, follow the
[workspace guide](docs/06-guides/first-workspace.md#advanced-connect-your-own-project-sessions).

## A real handoff without the copy-paste

In a controlled Codex desktop case, A maintained product facts and B maintained
website copy. Both already had task context. After pairing, the ordinary request
went only to A: rename the product, limit the free plan to five projects and use
US spelling. A chose to send the relevant change. **Original B then edited its
own copy**, keeping its earlier button text and the paid price unchanged.

[Read the actual messages, receiver diff and audit →](docs/evidence/codex-native-2026-09-07/README.md)

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| [Native desktop copy case](docs/09-reviews/2026-09-07-native-desktop-acceptance.md) | One original-task handoff, retained prior decisions, controlled busy/stop checks | Plugin installation, independent onboarding or simultaneous-input safety |
| [Native API/client case](docs/09-reviews/2026-09-08-pairing-helper-acceptance.md) | Original receiver changed its client and tests while retaining timeout/encoding decisions | A production deployment or benefit over native-only Codex |
| [Installed Codex CLI example](docs/09-reviews/2026-09-07-codex-first-use-release.md) | One released-package run passed within the default limit; earlier failures retained | Existing desktop-task adoption or a general success rate |

These are maintainer-operated examples. Delivery alone is not success: the
receiver's actual work must preserve both the new requirement and its earlier
constraints. The [evidence index](docs/evidence/README.md) and
[compatibility record](docs/00-overview/harness-support.md) include narrower
checks, failures and unverified paths.

## Supported harnesses

| Integration | Entry and boundary |
|---|---|
| **Codex desktop** | Optional skill over native task tools; availability depends on the host |
| **Codex CLI / projects** | App Server sample pair; scoped MCP and hooks for project sessions |
| **Pi** | Native extension; optional idle wake with a busy-turn guard |
| **Kimi Code** | Project MCP integration; no automatic idle follow-up |
| **DeepSeek Harness** | Native MCP integration checked without a model; live initiative unverified |
| **Other harnesses** | MCP or JavaScript SDK integration requires host-specific setup |

Support is versioned and evidence varies by path. Consult the
[full support matrix](docs/00-overview/harness-support.md) before choosing an integration.

## Continue from a saved checkpoint

In an already configured workspace, a checkpoint can preserve selected goals,
decisions, constraints and next steps for a new session:

```sh
npx threadmesh status
npx threadmesh continue backend --agent kimi --name recovery
```

Run from the workspace directory, with an existing checkpoint and available
quota in the destination harness. This is explicit context transfer, not a full
conversation backup or file migration. Recovery from an actual quota-blocked
long session remains unverified. [Checkpoint guide →](docs/06-guides/portable-checkpoints.md)

## Your sessions stay yours

The native skill follows the user's selected task, topic and send permissions.
Incoming advice does not authorize a reply. It cannot enforce privacy or make
an idle check and subsequent send atomic; host permissions still apply.

The workspace route shares published goals and advice, not entire private
conversations. Inbox reads do not consume messages, and acceptance does not
prove completion. Its inbox and mute controls are separate from the native
skill. This is an **experimental, same-owner local system**, not a multi-tenant
security boundary.

[Safety model](docs/04-safety/threat-model.md) · [Security policy](SECURITY.md)

## Build with us

Reports of a confusing setup step, a missed constraint or an unwanted message
are useful. Include the integration path and the first failed step; remove
credentials and private conversation content. Adapter authors can start with
the [SDK guide](docs/06-guides/implement-an-adapter.md).

Current maintenance focuses on clear installation guidance and honest capability
descriptions. Real-project validation is paused; installation, independent first
use and native-only value comparison remain open, not passed.
[Current status](docs/10-planning/project-status.md) · [Roadmap](ROADMAP.md)

[Report an experience](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml) ·
[Discuss a workflow](https://github.com/fyaic/threadmesh/discussions) ·
[Contribute](CONTRIBUTING.md) · [Documentation](docs/README.md)

[Apache 2.0](LICENSE).
