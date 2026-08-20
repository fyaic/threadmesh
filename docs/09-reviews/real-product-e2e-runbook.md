# Real agent-product validation runbook

## Purpose

This runbook validates that a real agent product can consume a suggestion only
after the ThreadMesh receiver has accepted it. It is stricter than the
product-specific smoke scripts: the runner must traverse the coordinator's
registry, effective grant, mailbox claim, receiver decision, durable context
admission claim, adapter boundary, exact evidence confirmation, and audit path.

Tracked by [issue #44](https://github.com/fyaic/threadmesh/issues/44). This is
an experimental validation procedure, not an M0 normative requirement.

## Mechanical gate

Real model execution is disabled by default. Before setting the acknowledgement,
a maintainer must verify all of the following:

1. [M0 issue #7](https://github.com/fyaic/threadmesh/issues/7) contains two
   qualifying independent verdicts, including one reviewer outside the
   maintainer organization.
2. Every review finding has a public disposition and required fixes are merged.
3. The M1 and adapter stack is merged and `npm test` passes on `main`.
4. The provider account, quota, and credential are explicitly authorized for
   the bounded validation turn.

The exact acknowledgement is:

```sh
export THREADMESH_LIVE_E2E_ACK=issue-7-approved-for-live-product-validation
```

This environment variable is an intentional operator acknowledgement, not
cryptographic proof of review. Repository maintainers remain responsible for
checking #7. Without the exact value, every live command exits with code 3 and
reports `not-run/external_review_gate_not_acknowledged` before starting an
adapter or model.

## Deterministic rehearsal

Run all three fake product endpoints through the same runner:

```sh
npm run validate:products:fake
```

A pass requires, per product:

- one authorized message visible in the receiver mailbox;
- one mailbox claim acknowledged as `accepted`;
- one single-use context-admission claim;
- an exact, untruncated product marker;
- kind-specific evidence accepted by the coordinator;
- a `context-admitted` audit event containing only the bounded evidence
  projection; and
- deletion of the exact temporary thread/session, or removal of Gemini's exact
  isolated home.

The rehearsal proves runner and adapter integration against deterministic fake
endpoints. It does not prove useful model behavior.

## Live commands

After the gate is satisfied, run one product at a time:

```sh
npm run validate:products:live:codex
npm run validate:products:live:kimi
GEMINI_API_KEY=... npm run validate:products:live:gemini
```

Codex creates a first bounded turn so the product thread is resumable, then
uses that registered receiver for the coordinator-mediated suggestion. Kimi
creates and later deletes one ACP session and verifies its absence. Gemini uses
the pinned official CLI package in an isolated home that is recursively removed;
the API key is passed only as an explicit child-process override and is never
included in the result.

## Result states

| State | Meaning | Exit code |
|---|---|---:|
| `passed` | Full coordinator path, exact marker, evidence, audit, and cleanup passed | 0 |
| `failed` | Protocol, marker, evidence, product, or cleanup invariant failed | 1 |
| `blocked` | Recognized provider authentication or quota condition prevented the turn | 2 |
| `not-run` | Gate was absent or command usage was invalid; no live product turn started | 3 |

A handshake, no-model preflight, fake-product pass, quota error, or missing
credential must never be relabelled as a live pass.

## Evidence recording

For every live attempt, record:

- exact repository commit and clean/dirty status;
- product version and sanitized capability snapshot digest;
- UTC start and finish time;
- result state and stable reason code;
- message ID, adapter kind, bounded evidence keys, and disposition;
- cleanup attempt and exact absence/deletion result; and
- links to CI and the relevant adapter issue.

Do not publish credentials, raw environment variables, provider account data,
full model transcripts, local home paths, or unbounded adapter evidence.
