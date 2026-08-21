# M0 external reviewer packet

> Review target: `main@265e461f1b8714c56f7fe817795b81d895f732c6`
> (`spec: type interruption and signed verification (#25)`).

## Purpose

ThreadMesh needs two independent reviews before closing M0. At least one
reviewer must be outside the `fyaic` maintainer organization. This packet is the
shortest evidence-backed path through the draft; reviewers are welcome to read
more broadly.

The requested verdict is one of:

- **approve** — no unresolved M0-blocking finding;
- **request changes** — one or more blocking findings are identified;
- **abstain** — the reviewer cannot assess the boundary or independence.

Approval concerns the implementability and safety of the draft boundary. It is
not approval for production deployment.

## Reproduce the evidence

Requirements: Node.js 22 or newer, npm, and a C/C++ toolchain supported by
`better-sqlite3`.

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
git checkout 265e461f1b8714c56f7fe817795b81d895f732c6
npm ci
npm test
npm audit --audit-level=high
```

Expected result at the review target:

- 14 JSON Schemas compile;
- 55 positive and negative schema cases pass;
- 7 legal/illegal transition cases pass;
- 34 unit and integration tests pass;
- documentation lint and dependency audit pass.

## Read this first

| Concern | Primary artifact |
|---|---|
| Product boundary and non-goals | [`scope.md`](../00-overview/scope.md) |
| Context ownership | [`context-sovereignty.md`](../01-concepts/context-sovereignty.md) |
| Authority | [`permission-model.md`](../04-safety/permission-model.md) |
| Threats and invariants | [`threat-model.md`](../04-safety/threat-model.md) |
| Delivery, decision, outcome | [`delivery-semantics.md`](../03-protocol/delivery-semantics.md) |
| Authenticated operation binding | [`jsonrpc-binding.md`](../03-protocol/jsonrpc-binding.md) |
| Harness requirements | [`adapter-contract.md`](../05-adapters/adapter-contract.md) |
| Machine-readable schemas | [`spec/schema`](../../spec/schema) |
| Executable negative cases | [`manifest.json`](../../spec/conformance/manifest.json) |
| Durable unknown-outcome decision | [ADR 0008](../08-decisions/0008-outcome-unknown-before-external-dispatch.md) |
| Interruption and verification decision | [ADR 0009](../08-decisions/0009-per-target-interruption-and-signed-verification.md) |
| Current evidence and gaps | [`project-status.md`](../10-planning/project-status.md) |

## Review lane A: distributed-systems correctness

Please try to falsify these claims:

1. Logical message identity is the authenticated sender incarnation plus
   message ID; a different canonical envelope digest conflicts.
2. Operation replay and resource identity are separate idempotency scopes.
3. Disposition mutations use expected-revision CAS and cannot silently combine
   contradictory delivery, decision, or outcome states.
4. The pre-call `outcome-unknown` record prevents blind retry across the
   external-effect crash window.
5. Only evidence-backed confirmed-not-submitted reconciliation permits a fresh
   adapter attempt.
6. Incarnation rotation, grant versioning, expiry, and revocation prevent stale
   queued authority from reviving.
7. Cursor and mailbox claims tolerate restart without claiming global ordering
   or exactly-once external effects.

Pay particular attention to crash-before-call, crash-after-effect, receipt
conflict, concurrent CAS, replay after expiry, and grant supersession.

## Review lane B: agent and harness safety

Please try to falsify these claims:

1. Semantic relevance never creates authority; agent proposals do not create
   effective grants.
2. Request payloads cannot choose their authenticated principal or claim user
   authorship without a transport identity match.
3. Revoked or superseded peer content is quarantined before mailbox disclosure
   or context admission.
4. Model-visible peer content remains explicitly untrusted and cannot escape
   the canonical provenance wrapper.
5. `suggest`, `steer`, and `interrupt` cannot silently degrade into one another.
6. Interrupt has no umbrella success; model turns, tool calls, and subprocesses
   have separate target results and coverage.
7. Arbitrary evidence, adapter identity, self-selected keys, tampered digests,
   and invalid signatures cannot produce `externally-verified`.
8. Restricted summaries and relationship projections cannot disclose fields
   beyond the current grant.

Pay particular attention to user-owned sessions, prompt injection, stale
steering, partial cancellation, verifier trust, revocation timing, and audit
leakage.

## Known limitations that are not hidden claims

- The checked-in static-token authenticator is local-only. No production
  TLS/OAuth verifier is supplied.
- The local coordinator is trusted-process and single-user; it is not a hosted
  multi-tenant security boundary.
- ThreadMesh does not supply an OS sandbox. ACP agents inherit native process
  privileges subject only to a small environment allowlist.
- ACP v1 carries the Kimi peer wrapper over an ordinary prompt surface; it does
  not prove provider-role precedence.
- The conformance trust anchor is test-only. Production key distribution,
  rotation, revocation, and remote verification are not implemented.
- The ACP profile advertises neither steer nor interrupt and has no stable
  native prompt receipt query.
- M1 retention, migration/rollback, hosted event streaming, inspector, and full
  policy/dispatcher behavior are incomplete.
- The live Kimi model marker is blocked by account quota. Handshake success is
  not counted as real model behavior success.
- No claim is made for autonomous discovery quality, useful model behavior,
  exactly-once external effects, or production cross-product interoperability.

## Submit a review

Use the [external review template](external-review-template.md) and post it as a
comment on [GitHub issue #7](https://github.com/fyaic/threadmesh/issues/7), or
open a pull request adding the completed review under `docs/09-reviews/`.

Disclose affiliation or relevant perspective and any material relationship to
the maintainers. Findings should cite exact paths and, where practical, include
a reproducer or invalid fixture. The maintainers will disposition every finding
as accepted, resolved, deferred with rationale, or rejected with rationale.

Reviewers may submit Markdown only. After public disposition, maintainers will
transcribe the review into an integrity-bound machine record using the
[external record format](external/README.md). The gate verifier never replaces
the public source; it checks that two distinct, complete records point back to
that source and to this exact review target.
