<p align="center">
  <img src="docs/assets/threadmesh-hero.svg" width="100%" alt="ThreadMesh — selective initiative between agent sessions">
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
  <a href="docs/README.md">Documentation</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

# ThreadMesh

**Stop babysitting parallel coding agents.**

ThreadMesh routes completion, blockers, review findings, and verified
dependency state to the right agent session at a safe checkpoint—without making
you copy results, spend model turns polling status, or let one session silently
take over another.

**The agent supplies the initiative. ThreadMesh supplies the boundary.**

> [!IMPORTANT]
> ThreadMesh is pre-alpha and disabled-by-default infrastructure. The current
> release is suitable for local, trusted-process experiments—not production
> authorization, hostile prompts, or multi-tenant deployment.

## 76-second proof walkthrough

<p align="center">
  <a href="docs/assets/demo/threadmesh-proof-walkthrough.mp4">
    <img src="docs/assets/demo/threadmesh-proof-walkthrough.gif" width="100%" alt="ThreadMesh evidence walkthrough: one kickoff, zero manual relay or polling, active receiver checkpoint, selective attention, and verified dependency unlock">
  </a>
</p>

The walkthrough is generated from a fresh executable demo and retained real
Codex evidence. It is not presented as a live screen recording. The local demo
models the same four-handoff workflow two ways: the manual path requires at
least one kickoff, four status checks, and four relay actions; the ThreadMesh
path requires one kickoff and zero later relay or polling actions. Elapsed time
and model tokens are deliberately marked **not measured** until a network-valid
live baseline is retained.

It also exercises the safety failure people worry about: when B is already
running, the completion stays `pending` in a `checkpoint-offer`; B remains
`running`, and the demo starts zero steer, interrupt, or native-turn operations.

[Watch the MP4](docs/assets/demo/threadmesh-proof-walkthrough.mp4) ·
[inspect asset provenance](docs/assets/demo/README.md) ·
[run the proof yourself](docs/06-guides/attention-router-demo.md)

## Why this matters

Running several agents in parallel often gives the user three extra jobs:

- **clipboard:** notice A has the result B needs, then copy and explain it;
- **poller:** repeatedly ask whether review, verification, or a dependency is
  finished, consuming time and model quota even when nothing changed;
- **traffic controller:** decide whether to queue, wake, steer, or interrupt B
  without enough visibility into B's current work.

ThreadMesh makes that handoff an explicit, portable capability:

1. the host authorizes a relationship between exact task incarnations;
2. B publishes a minimal relationship-scoped summary—not its private history;
3. A may inspect that summary and **autonomously decide** whether to act;
4. A can send one typed, expiring suggestion with provenance;
5. B's harness accepts, rejects, or defers it before model-context admission;
6. the decision and delivery chain stays auditable.

The intelligence is not “agents can send messages.” Transport is increasingly
available from harness-native APIs, ACP, and A2A. ThreadMesh focuses on
**selective initiative**: speak when a dependency is real, remain quiet when it
is not, verify before unlocking downstream work, and preserve the receiver's
agency.

## What proactive behavior looks like

Our real Pi evaluation gave Agent A only two bounded ThreadMesh tools and tested
three conditions:

| Condition | What Agent A chose | Receiver effect |
|---|---|---|
| Relevant dependency | discover once → suggest once | B accepted and completed |
| Unrelated task | discover once → stay silent | B was not activated |
| No related task (control) | use no ThreadMesh tool | zero interference |

The same relevant path then crossed products: **Pi `0.84.2` → ThreadMesh →
Kimi Code `0.38.0`**. Pi chose to contact B; Kimi retained its own persistent
session and admission boundary; the coordinator recorded `context-admitted`;
and every temporary resource was deleted. A separate real **Codex CLI `0.145.0`
→ Kimi Code `0.38.0`** case produced the same autonomous `discover → suggest`
sequence.

[Read the case portfolio](docs/06-guides/real-world-cases.md) ·
[Reproduce the Pi-to-Kimi path](docs/06-guides/pi-to-kimi-demo.md) ·
[Inspect the bounded evidence](docs/09-reviews/2026-08-25-pi-integration-kit-validation.md)

## Autonomous lifecycle fixture

The current deterministic fixture demonstrates a deeper form of session
initiative than a one-message handoff. The user starts A once; after that,
durable lifecycle attention drives the bounded chain
`A → R → same-A → V → dependent`. The fixture runner dispatches no phase,
submits no phase prompt, relays no message manually, and polls no session.
ThreadMesh routes only exact next events, while each receiving session selects
its registered decision and business tools. After the one kickoff, the pump
starts eight protected native turns: a decision and admitted business turn for
each of R, same-A, V, and dependent. An authorized but irrelevant session
receives no claim and runs no turn.

This matters because useful work can continue across session boundaries without
the user noticing and copying every intermediate dependency. It is evidence of
bounded, policy-mediated session initiative—not a claim of emergent intelligence.
The dependent turn starts only after the accepted event and fixture-trusted
finalization are durable; an injected finalization failure starts zero dependent
turns. Every created role, journal, SQLite file, and private run directory is
then checked and removed exactly.

The evidence boundary is intentionally narrow. The result reports
`liveProductEvidence=false`, `deterministicPolicyOracle=true`,
`externalIndependentVerifier=false`, and a fixture-owned ephemeral signer.
As of [#122](https://github.com/fyaic/threadmesh/pull/122), selection and
publication recovery are durable per dispatch, with leased and fenced
publication. There is still no global cross-dispatch selection chain:
`selectionChainValid=null`.

The sixth real Codex event-pump attempt completed that same autonomous chain.
After one kickoff, nine real bound native turns carried the work through R,
the original A session, V, and the dependent. The runner supplied zero later
phase prompts or direct activations; the irrelevant session ran zero turns;
five of five temporary sessions and all coordinator artifacts were removed.

The completed result is deliberately classified `state=blocked` and
`liveProductEvidence=false`: that retained run used fixture-owned or simulated
Git and verification effects. [#133](https://github.com/fyaic/threadmesh/pull/133)
now binds the existing bounded Git worktrees and process-isolated child
verifier into that correlated path on `main`. A process-scoped, certificate-
verified local proxy restored normal Codex connectivity on 2026-09-02. The
fresh rerun reached real A publication and the reviewer admitted turn, then
failed closed on ambiguous context reconciliation with complete cleanup; it was
not upgraded into product evidence. The deterministic manual-accounting baseline,
active-receiver checkpoint negative, and 76-second evidence walkthrough are now
the public product proof. New harness, transport, and generalized protocol work
remains frozen until a successful live rerun, measured manual/live baseline, and three
external setup attempts close.

[Read the exact fixture evidence](docs/09-reviews/2026-09-01-m5-2-autonomous-fixture.md) ·
[Read the real Codex behavior](docs/09-reviews/2026-09-01-m5-2-real-codex-event-pump-behavior.md) ·
[Read the real-effects checkpoint](docs/09-reviews/2026-09-01-m5-2-real-effects-integration.md) ·
[Read the M5.2 scenario guide](docs/06-guides/m5-2-live-agent-scenario.md)

## Quickstart

### 1. Run the closed-loop attention-router demo

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

This deterministic demo creates four workflow sessions plus one isolated
active-receiver safety task. It runs an implementation → review → fix → review
→ dependent-task sequence and exposes the event, routing reason, receiver
decision, fixture-signed verified disposition, dependency effect, and cleanup
state without spending model quota or touching your agent sessions.

[Read the attention-router demo guide](docs/06-guides/attention-router-demo.md)

Run the earlier model-selection control/relevant/irrelevant comparison next:

```sh
npm run validate:behavior:fake
```

Run the smallest cross-harness proof next:

```sh
npm run validate:cross-harness:fake
```

### 2. Add proactive tools to a harness

The package is not on npm yet. Install the pre-alpha SDK directly from GitHub:

```sh
npm install github:fyaic/threadmesh
```

Connect it to an authenticated ThreadMesh JSON-RPC transport, then create one
bridge per native model turn:

```js
import {
  createProactiveToolBridge,
  createThreadMeshClient,
} from "@fyaic/threadmesh";

const client = createThreadMeshClient({
  authorization: `Bearer ${process.env.THREADMESH_TOKEN}`,
  send: async (request, { authorization }) => {
    const response = await fetch(process.env.THREADMESH_URL, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    return response.json();
  },
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

The host—not the model—selects the bounded relationship set. Discovery is
required before sending; the default budget allows one lookup and one
suggestion; the receiving harness still controls context admission.

[30-minute integration guide](docs/06-guides/implement-an-adapter.md) ·
[complete sender/receiver example](examples/proactive-tool-bridge.mjs) ·
[SDK reference by example](examples/minimal-harness.mjs)

## Capabilities

| Capability | What ThreadMesh provides today |
|---|---|
| Relationship-scoped discovery | Minimal summaries for exact host-authorized task relationships |
| Bounded proactive suggestion | Two model tools with per-turn discovery and send budgets |
| Receiver sovereignty | Mailbox checkpoint with explicit accept, reject, or defer |
| Freshness and replay defense | Exact task incarnation, expiry, revision, idempotency, and claim checks |
| Provenance and audit | Sender, relationship, reason, disposition, admission, and cleanup evidence |
| Harness portability | Transport-neutral SDK plus ACP, App Server, and subprocess adapter experiments |
| Fail-closed negotiation | Unsupported `steer` or `interrupt` behavior is not silently approximated |

The draft protocol distinguishes four coordination intents:

| Intent | Default behavior | Typical use |
|---|---|---|
| `notify` | Side-channel information; not active prompt context | Progress or dependency update |
| `suggest` | Receiver mailbox; explicit checkpoint decision | Peer advice or a missing input |
| `steer` | May change active direction; requires stronger authority | Parent-to-child correction |
| `interrupt` | Requests typed cancellation; highest privilege | Safety stop or invalidated work |

Only bounded `suggest` is enabled in the real product experiments.

## Harnesses and agents

ThreadMesh coordinates **tasks**, so the model provider and harness can differ
on each side.

| Harness / integration | Role exercised | Evidence level |
|---|---|---|
| Pi `0.84.2` extension | Real proactive sender through the packaged public SDK | Real model pass |
| Codex CLI `0.145.0` App Server | Real proactive sender and receiver | Real model pass |
| Kimi Code `0.38.0` ACP | Persistent receiving session | Real model pass |
| Gemini CLI `0.56.0` headless | Subprocess receiver adapter | Deterministic + no-model preflight; live model not run |
| Custom JavaScript harness | Cooperative loop or native tool bridge | Packed consumer + conformance pass |
| Generic ACP agent | Persistent session receiver | Deterministic conformance; Kimi is the real ACP proof |

Claude Code, LangGraph, CrewAI, OpenAI Agents SDK, and other harnesses are
plausible adapter targets, but they are **not claimed as validated** until an
adapter publishes a version range, capability document, conformance result,
and known gaps.

[Full compatibility matrix](docs/00-overview/harness-support.md) ·
[Implement an adapter](docs/06-guides/implement-an-adapter.md)

## How ThreadMesh fits

ThreadMesh complements rather than replaces adjacent agent infrastructure:

| Layer | Primary job |
|---|---|
| MCP and native tools | Connect one agent to tools and context |
| A2A-style transport | Exchange messages between agent endpoints |
| Workflow / graph runtimes | Schedule known steps and own the execution loop |
| **ThreadMesh** | Govern proactive contact between separate task contexts |

The reference shape is deliberately small:

```text
Agent A                    ThreadMesh                     Agent B
   │ discover authorized task │                              │
   ├─────────────────────────>│ relationship-scoped summary  │
   │<─────────────────────────┤                              │
   │ suggest once             │ policy → mailbox → consent   │
   ├─────────────────────────>├─────────────────────────────>│
   │                          │ accepted / rejected / deferred│
   │<─────────────────────────┴──────────────────────────────┤
```

## Safety model

ThreadMesh is designed around a simple rule: **a task owns its objective and
model-visible history**.

- no global session search or shared transcript;
- least-authority intent and exact directional grants;
- mailbox before peer content becomes model-visible;
- expiry and objective/run freshness for consequential requests;
- visible source and reason instead of relabeling peer text as user intent;
- fail-closed capability negotiation and complete causal audit.

Current adapters still deliver accepted peer context through ordinary prompt
surfaces and do not supply an OS sandbox. Do not use them with arbitrary hostile
peer content or as a production security boundary.

[Context sovereignty](docs/01-concepts/context-sovereignty.md) ·
[permission model](docs/04-safety/permission-model.md) ·
[threat model](docs/04-safety/threat-model.md) ·
[security policy](SECURITY.md)

## Project status

- **Protocol:** executable `0.0-draft`; changes are still expected.
- **Package:** `@fyaic/threadmesh@0.1.0-alpha.0`, installable from GitHub. The
  root export is the small harness SDK; explicit runtime subpaths and the CLI
  install Ajv and native `better-sqlite3`.
- **Reference runtime:** authenticated JSON-RPC + SQLite coordinator for local,
  trusted-process experiments.
- **Validation:** 384 tests, plus 55 schema cases and 7 transition cases;
  documentation lint passes. These are separate counts, not one combined total.
- **Default:** proactive coordination remains off unless a maintainer explicitly
  opts into the bounded experimental profile.
- **Next mainline:** retain one network-valid real Codex traversal of the merged
  real-effects path, run the measured manual baseline, and observe three
  independent 15-minute setup attempts. Kimi parity and broader hardening
  follow only after those product-proof gates.

[Current status](docs/10-planning/project-status.md) ·
[roadmap](ROADMAP.md) ·
[protocol draft](spec/README.md) ·
[validation evidence](docs/09-reviews/README.md)

## Documentation

| If you want to… | Start here |
|---|---|
| Understand the product | [What ThreadMesh is](docs/00-overview/product-guide.md) |
| Watch the 76-second proof | [MP4 walkthrough](docs/assets/demo/threadmesh-proof-walkthrough.mp4) |
| See real proactive behavior | [Real agent case portfolio](docs/06-guides/real-world-cases.md) |
| Run the closed-loop local demo | [Attention-router demo](docs/06-guides/attention-router-demo.md) |
| Audit the user-value baseline | [Manual relay/polling baseline](docs/06-guides/manual-relay-baseline.md) |
| Audit non-interruption | [Active-session checkpoint case](docs/06-guides/non-interrupting-handoff.md) |
| Try it as a new operator | [15-minute challenge](docs/06-guides/15-minute-operator-challenge.md) |
| Compare selective model initiative | [End-to-end demo](docs/06-guides/end-to-end-demo.md) |
| Add ThreadMesh to a harness | [Adapter implementation guide](docs/06-guides/implement-an-adapter.md) |
| Evaluate a harness | [Harness support matrix](docs/00-overview/harness-support.md) |
| Review safety and semantics | [Protocol](docs/03-protocol/README.md) → [safety](docs/04-safety/threat-model.md) |
| Inspect exact test evidence | [Review and validation index](docs/09-reviews/README.md) |
| Contribute | [Contributing guide](CONTRIBUTING.md) |

## Non-goals

ThreadMesh is not a human chat system, model gateway, workflow DAG engine,
global agent directory, or license for one agent to control unrelated user
sessions. It does not replace MCP or A2A.

## Community

- Ask design and integration questions in
  [GitHub Discussions](https://github.com/fyaic/threadmesh/discussions).
- Report reproducible defects or propose adapters through
  [GitHub Issues](https://github.com/fyaic/threadmesh/issues).
- Read [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md),
  [SUPPORT.md](SUPPORT.md), and the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report security issues privately as described in [SECURITY.md](SECURITY.md).

## License

ThreadMesh is available under the [Apache License 2.0](LICENSE).
