<h1 align="center">ThreadMesh</h1>

<p align="center">
  <strong>Selective initiative between independent agent sessions.</strong>
</p>

<p align="center">
  Let Agent A notice when Agent B needs its work—and reach out before you become the message bus.
</p>

<p align="center">
  <a href="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/fyaic/threadmesh/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="Apache 2.0 license" src="https://img.shields.io/badge/license-Apache--2.0-4c7bd9.svg"></a>
  <a href="package.json"><img alt="Node 22 or newer" src="https://img.shields.io/badge/node-%3E%3D22-3c873a.svg"></a>
  <a href="docs/10-planning/project-status.md"><img alt="Pre-alpha status" src="https://img.shields.io/badge/status-pre--alpha-f59e0b.svg"></a>
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> ·
  <a href="docs/06-guides/real-world-cases.md">Real agent cases</a> ·
  <a href="docs/00-overview/harness-support.md">Harness support</a> ·
  <a href="docs/README.md">Docs</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="docs/06-guides/real-world-cases.md">
    <img src="docs/assets/threadmesh-session-initiative.jpg" width="100%" alt="Agent A autonomously sends a bounded suggestion from another task to Agent B; Agent B may accept, defer, or reject it while an unrelated session stays quiet">
  </a>
</p>

<p align="center">
  <sub><strong>A decides to reach out.</strong> B decides whether to admit it. Unrelated work stays quiet.</sub>
</p>

ThreadMesh is a portable coordination layer for agent harnesses. It gives one
session a bounded way to discover relevant work and suggest context to another,
while the receiving session keeps control over whether and when that context is
admitted.

It is not shared memory, a workflow engine, or permission for one agent to take
over another task.

> [!WARNING]
> ThreadMesh is pre-alpha and disabled by default. Use it only for local,
> trusted-process experiments. It is not a production authorization or
> multi-tenant security boundary.

## Why ThreadMesh

Parallel agents still make the user coordinate every handoff.

| Without ThreadMesh | With ThreadMesh |
|---|---|
| You notice that A produced something B needs | A discovers B's declared dependency |
| You copy, find B, and explain the context | A sends one typed, expiring suggestion |
| You decide whether to interrupt B | B accepts, defers, or rejects at a checkpoint |
| Unrelated sessions are easy to disturb | Irrelevant sessions remain quiet |

The intelligence is the decision to speak when the work becomes relevant—and
to remain silent when it does not. ThreadMesh supplies the policy, provenance,
mailbox, consent, and audit boundary around that decision.

## Quickstart

Run the deterministic closed-loop demo without model quota or access to your
existing agent sessions:

```sh
npx --yes --package=github:fyaic/threadmesh threadmesh demo
```

Or run from source:

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
npm run demo
```

The demo exercises implementation → review → fix → verification → dependent
work, including receiver checkpoints, irrelevant-route suppression, verified
dependency unlock, restart-safe state, and exact cleanup.

[Demo guide](docs/06-guides/attention-router-demo.md) ·
[manual comparison](docs/06-guides/manual-relay-baseline.md) ·
[real agent cases](docs/06-guides/real-world-cases.md)

## Add it to a harness

The SDK is pre-alpha and currently installed from GitHub:

```sh
npm install github:fyaic/threadmesh
```

Give each model turn a bounded discovery-and-suggestion bridge:

```js
import {
  createProactiveToolBridge,
  createThreadMeshClient,
} from "@fyaic/threadmesh";

const client = createThreadMeshClient({
  authorization: `Bearer ${process.env.THREADMESH_TOKEN}`,
  send: authenticatedJsonRpc,
});

const bridge = createProactiveToolBridge({
  client,
  source: currentTask,
  relationships: [{ relationshipId, target: relatedTask }],
});

await harness.runModelTurn({
  tools: bridge.tools,
  onToolCall: bridge.handleToolCall,
});
```

The host—not the model—defines the relationship set. The model must discover
before sending, budgets are reserved before transport calls, and the receiver
retains context-admission control.

[30-minute adapter guide](docs/06-guides/implement-an-adapter.md) ·
[complete sender/receiver example](examples/proactive-tool-bridge.mjs)

## Verified behavior

The public evidence separates relevant, irrelevant, and control conditions.

| Case | Sender decision | Receiver outcome |
|---|---|---|
| Relevant dependency | discover once → suggest once | B accepts and completes |
| Unrelated task | discover once → stay silent | B is not activated |
| No related task | no ThreadMesh call | zero interference |

Real model cases currently include:

- **Pi `0.84.2` → Kimi Code `0.38.0`:** relevant contact, irrelevant silence,
  context admission, and exact cleanup;
- **Codex CLI `0.145.0` → Kimi Code `0.38.0`:** autonomous
  `discover → suggest` across products;
- **Codex lifecycle chain:** one kickoff advanced bounded implementation,
  review, fix, verification, and dependent roles while the irrelevant session
  ran zero turns. The complete production evidence gate remains open.

[Case portfolio](docs/06-guides/real-world-cases.md) ·
[Pi validation](docs/09-reviews/2026-08-25-pi-integration-kit-validation.md) ·
[Codex-to-Kimi record](docs/09-reviews/2026-08-25-codex-to-kimi-proactive.md)

## Capabilities

| Capability | Current implementation |
|---|---|
| Relationship-scoped discovery | Minimal summaries from host-authorized relationships |
| Bounded proactive suggestion | Two model tools with per-turn discovery and send budgets |
| Receiver sovereignty | Mailbox checkpoint with accept, defer, or reject |
| Freshness and replay defense | Exact task incarnation, expiry, revision, idempotency, and claim checks |
| Provenance and audit | Sender, relationship, reason, disposition, admission, and cleanup records |
| Harness portability | Transport-neutral SDK plus App Server, ACP, and subprocess adapters |
| Fail-closed behavior | Unsupported control operations never masquerade as success |

Only bounded `suggest` is enabled in real product experiments. `steer` and
`interrupt` remain protocol-level capabilities with stricter authority gates.

## Harness support

| Harness / integration | Exercised role | Evidence |
|---|---|---|
| Pi `0.84.2` extension | Proactive sender through the public SDK | Real model pass |
| Codex CLI `0.145.0` App Server | Proactive sender and receiver | Real model pass |
| Kimi Code `0.38.0` ACP | Persistent receiving session | Real model pass |
| Gemini CLI `0.56.0` headless | Subprocess receiver adapter | Deterministic preflight; live model pending |
| Custom JavaScript harness | Cooperative loop and native tool bridge | Consumer and conformance pass |
| Generic ACP agent | Persistent receiver | Conformance pass; Kimi is the real ACP proof |

Other harnesses are adapter candidates, not claimed integrations, until they
publish a version range, capability document, conformance result, and known
gaps.

[Compatibility matrix](docs/00-overview/harness-support.md) ·
[adapter contract](docs/05-adapters/adapter-contract.md)

## Safety model

A task owns its objective and model-visible history.

- no global session search or shared transcript;
- exact, directional, least-authority relationships;
- peer content enters a mailbox before model-context admission;
- expiry and objective freshness for consequential requests;
- visible peer provenance instead of relabeling content as user intent;
- fail-closed capability negotiation and causal audit.

Current adapters do not provide an OS sandbox. Do not use them with arbitrary
hostile peer content or as a production security boundary.

[Context sovereignty](docs/01-concepts/context-sovereignty.md) ·
[permission model](docs/04-safety/permission-model.md) ·
[threat model](docs/04-safety/threat-model.md) ·
[security policy](SECURITY.md)

## Project status

- **Protocol:** executable `0.0-draft`;
- **Package:** `@fyaic/threadmesh@0.1.0-alpha.0`, installable from GitHub;
- **Runtime:** authenticated JSON-RPC and SQLite coordinator for local trusted
  processes;
- **Validation:** 388 tests, 55 schema cases, 7 transition cases, and
  documentation lint;
- **Default:** proactive coordination remains explicit opt-in;
- **Mainline:** close the measured real-product baseline and external operator
  setup gates before expanding protocol or harness scope.

[Current status](docs/10-planning/project-status.md) ·
[roadmap](ROADMAP.md) ·
[validation index](docs/09-reviews/README.md)

## Documentation

| Goal | Start here |
|---|---|
| Understand the product | [Product guide](docs/00-overview/product-guide.md) |
| Inspect real proactive behavior | [Real agent cases](docs/06-guides/real-world-cases.md) |
| Run the local proof | [Attention-router demo](docs/06-guides/attention-router-demo.md) |
| Compare with manual relay | [Manual baseline](docs/06-guides/manual-relay-baseline.md) |
| Add a harness | [Adapter guide](docs/06-guides/implement-an-adapter.md) |
| Evaluate safety | [Threat model](docs/04-safety/threat-model.md) |
| Contribute | [Contributing guide](CONTRIBUTING.md) |

## Non-goals

ThreadMesh is not a human chat system, model gateway, workflow DAG engine,
global agent directory, or license for one agent to control unrelated tasks. It
does not replace MCP or A2A.

## Community

[Discussions](https://github.com/fyaic/threadmesh/discussions) ·
[Issues](https://github.com/fyaic/threadmesh/issues) ·
[Contributing](CONTRIBUTING.md) ·
[Governance](GOVERNANCE.md) ·
[Support](SUPPORT.md) ·
[Code of Conduct](CODE_OF_CONDUCT.md)

## License

ThreadMesh is available under the [Apache License 2.0](LICENSE).
