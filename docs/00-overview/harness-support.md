# Harness support and evidence matrix

ThreadMesh is harness-neutral at the protocol boundary, but compatibility is an
evidence claim—not a marketing label. This page separates real model runs,
deterministic conformance, no-model product probes, and future adapter targets.

## Evidence levels

| Level | Meaning |
|---|---|
| Real model pass | A pinned product and model completed the bounded scenario through the shared coordinator path |
| Deterministic conformance | A fake or scripted product exercised the same adapter, mailbox, admission, evidence, and cleanup contract |
| No-model preflight | The real binary, version, protocol surface, and lifecycle were checked without starting a model turn |
| Adapter target | The integration shape is plausible, but the repository makes no compatibility claim yet |

A real pass proves only the recorded scenario and version. It does not imply
production support, provider-role isolation, hostile-prompt safety, or every
protocol intent.

## Current matrix

| Harness | Version tested | Integration surface | Sender | Receiver | Evidence | Current boundary |
|---|---:|---|:---:|:---:|---|---|
| Pi | `0.84.2` | Extension using packaged public SDK and native tools | Yes | SDK loop only | Real proactive sender; real Pi→Kimi pass | No built-in tools, no persistent Pi session, bounded two-tool allowlist |
| Codex CLI | `0.145.0` | App Server JSON-RPC, dynamic tools, persisted thread | Yes | Yes | Real model sender/receiver; real Codex→Kimi pass | `suggest` only; ordinary input provenance; explicit experimental opt-in |
| Kimi Code | `0.38.0` | ACP v1 persistent session | No | Yes | Real accepted receiver; real Codex→Kimi and Pi→Kimi passes | `suggest` only; ACP prompt surface; session deletion and absence verified |
| Gemini CLI | `0.56.0` | Headless `stream-json` subprocess | No | Experimental | Deterministic conformance + real no-model preflight | Live provider model not authorized; no compatibility pass claimed |
| Generic ACP agent | ACP v1 shape | ACP stdio adapter | No | Yes | Deterministic conformance | Product-specific session lifecycle and permissions still require validation |
| Custom JavaScript harness | Node.js `>=22` | Cooperative loop or native tool API through `@fyaic/threadmesh` | Yes | Yes | Fresh packed consumer and negative-path suite | Caller supplies authenticated transport and receiver checkpoint policy |

## What a sender integration needs

A proactive sender needs only a small native-tool seam:

1. create an authenticated `ThreadMeshClient`;
2. let the host provide a bounded list of already-authorized relationships;
3. create one `createProactiveToolBridge` per model turn;
4. expose the two returned tool descriptors to the model;
5. route calls to `bridge.handleToolCall`;
6. discard the bridge after the turn so budgets cannot leak across turns.

The two tools are:

- `threadmesh_related_tasks`: read-only discovery of bounded summaries;
- `threadmesh_send_suggestion`: at most one advisory send after discovery.

The [proactive bridge example](../../examples/proactive-tool-bridge.mjs) and
[adapter implementation guide](../06-guides/implement-an-adapter.md) show the
complete shape.

## What a receiver integration needs

A receiver may be a cooperative loop, persistent session API, or supervised
subprocess. It must reliably provide:

- exact task/session incarnation binding;
- a mailbox checkpoint outside the model prompt;
- explicit accept, reject, or defer disposition;
- provenance-preserving rendering of accepted content;
- bounded outcome evidence appropriate to the harness;
- exact resource cleanup or an honest cleanup limitation.

An adapter must not claim a provider-native lower-priority role when accepted
peer context is actually ordinary prompt text.

## Candidate harnesses

The following projects are reasonable targets for community adapters, but are
not validated by this repository:

| Candidate | Likely integration depth | Work required before a claim |
|---|---|---|
| Claude Code | Native tools or subprocess/session adapter | Pin public lifecycle surface, map receiver admission, run conformance and real case |
| OpenAI Agents SDK | Cooperative loop / tool bridge | Define task identity, checkpoint policy, and durable evidence mapping |
| LangGraph | Graph-node checkpoint integration | Bind graph run identity, receiver state update, and replay semantics |
| CrewAI | Cooperative loop / event hook | Bind crew task identity and distinguish advice from task delegation |
| Other ACP clients/agents | ACP stdio receiver | Verify session persistence, permission denial, provenance, and deletion |
| MCP-enabled harness | Tool adapter | Host the ThreadMesh tools and keep identity/authorization outside model arguments |

## Claim checklist

Before adding a harness to the supported matrix, publish:

- exact product and protocol version range;
- capability document and unsupported intent list;
- positive, irrelevant, control, stale, and duplicate behavior;
- receiver acceptance and context-admission evidence;
- timeout, ambiguous-outcome, and cleanup behavior;
- prompt-role, process-privilege, authentication, and isolation limitations;
- a reproducible validation record with private data removed.

Open an [adapter proposal](https://github.com/fyaic/threadmesh/issues/new?template=feature.yml)
or start a [discussion](https://github.com/fyaic/threadmesh/discussions) before
building a new product-specific adapter.
