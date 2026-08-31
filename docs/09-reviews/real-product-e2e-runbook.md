# Real agent-product validation runbook

## Purpose

This runbook validates that a real agent product can consume a suggestion only
after the ThreadMesh receiver has accepted it. It is stricter than the
product-specific no-model smoke scripts: the runner must traverse the coordinator's
registry, effective grant, mailbox claim, receiver decision, durable context
admission claim, adapter boundary, exact evidence confirmation, and audit path.

Tracked by [issue #44](https://github.com/fyaic/threadmesh/issues/44). This is
an experimental validation procedure, not an M0 normative requirement.

## Authorization modes

Real model execution is disabled by default. The preferred
`external-review` mode requires a maintainer to verify all of the following:

1. [M0 issue #7](https://github.com/fyaic/threadmesh/issues/7) contains two
   qualifying independent verdicts, including one reviewer outside the
   maintainer organization.
2. Every review finding has a public disposition and required fixes are merged.
3. The M1 and adapter stack is merged and `npm test` passes on `main`.
4. The provider account, quota, and credential are explicitly authorized for
   the bounded validation turn.

The repository first verifies
[`m0-review-gate.json`](m0-review-gate.json). It requires two integrity-bound
public review records, two distinct reviewers, both review perspectives, at
least one outside reviewer, the exact review-target commit, approving verdicts,
and terminal public dispositions for every finding. Each record is resolved
back to its numeric issue-#7 comment through authenticated GitHub API access;
the verifier checks the real author login and association, exact body digest and
timestamp, and one canonical reviewer-authored machine block. Every finding has
a separate authenticated maintainer disposition block. A resolved fix must be a
merged PR or commit already contained in the candidate. Natural-language
substring matching, locally invented records, unrelated evidence, and
self-asserted environment variables cannot satisfy the gate.

The live command is a minimal built-in-only bootstrap: before any project module
is imported, it requires a clean `main` whose `HEAD` exactly matches GitHub
`main`. It creates a detached worktree at that SHA, installs the exact lockfile,
and starts a new child from that checkout. The child and bootstrap both verify
the detached SHA and clean state. After product cleanup, both the isolated
worktree and original `main` are checked again; any code or remote-main change
downgrades the attempt to `failed` before evidence can count as a pass.

After the review-record verifier passes, the exact operator acknowledgement is:

```sh
export THREADMESH_LIVE_E2E_ACK=issue-7-approved-for-live-product-validation
```

This environment variable is an intentional second acknowledgement, not
cryptographic proof of review. Without the exact value, every live command
exits with code 3 and reports `not-run/external_review_gate_not_acknowledged`.
With the variable but without valid records, it reports
`not-run/external_review_records_incomplete`. Both outcomes occur before an
adapter or model starts.

### Maintainer-authorized experiment

The maintainer may explicitly authorize a bounded, non-normative experiment
before M0 review closes. This is a fast path for learning from real products;
it is not an external review, does not satisfy or close issue #7, and cannot be
reported as normative acceptance evidence. It requires both acknowledgements:

```sh
export THREADMESH_LIVE_E2E_ACK=issue-7-approved-for-live-product-validation
export THREADMESH_MAINTAINER_EXPERIMENTAL_ACK=maintainer-approved-for-experimental-live-validation
```

All other execution controls remain mandatory: clean synchronized `main`, an
isolated exact-SHA worktree, the shared coordinator path, strict result
projection, and verified cleanup. Results carry
`authorization.mode=maintainer-experimental` and
`authorization.normativeReviewSatisfied=false`; the embedded review gate also
remains unsatisfied. A missing or misspelled second acknowledgement fails
closed before a model starts.

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

After either authorization mode is active, run one product at a time. The legacy
`smoke:*:live` aliases resolve to these same commands; there is no second live
implementation:

```sh
npm run validate:products:live:codex
npm run validate:proactive:live:codex
npm run validate:attention:live:codex
npm run validate:products:live:kimi
GEMINI_API_KEY=... npm run validate:products:live:gemini
```

Codex creates a local bounded bootstrap turn so the product thread is resumable,
without representing that bootstrap as peer context, then
uses that registered receiver for the coordinator-mediated suggestion. Kimi
creates and later deletes one ACP session and verifies its absence. Gemini uses
the pinned official CLI package in an isolated home that is recursively removed;
the API key is passed only as an explicit child-process override and is never
included in the result.

The proactive Codex command creates persisted A and B tasks. A must itself call
the relationship-summary and bounded-send dynamic tools; the runner rejects a
scripted submit, a second send, a non-ThreadMesh tool event, either marker
mismatch, or incomplete cleanup of either task. B acceptance remains a
deterministic receiver checkpoint policy in this first behavioral slice. See
the [proactive validation guide](../06-guides/proactive-codex-validation.md).

The Codex attention command adds the durable lifecycle-event, cursor-reconcile,
adapter-receipt, dependency-satisfaction, and coordinator-restart path. Its
relevant live result requires zero scripted submits, manual relays, and model
polling turns. The embedded signing key is deliberately labelled
`local-simulation`; this case validates the M5.1 integration seam and does not
claim an independent external verifier or completion of issue #91. See the
[Codex attention validation guide](../06-guides/codex-attention-validation.md).

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
- start and end snapshots for both original `main` and the detached execution
  worktree;
- product version, sanitized product metadata, and capability snapshot digest;
- UTC start and finish time;
- result state and stable reason code;
- authorization mode and whether normative review was satisfied;
- message ID, adapter kind, bounded evidence keys, and disposition;
- cleanup attempt and exact absence/deletion result; and
- links to CI and the relevant adapter issue.

Do not publish credentials, raw environment variables, provider account data,
full model transcripts, exception text, local home paths, or unbounded adapter
evidence. Public failures contain stable codes rather than provider text.
