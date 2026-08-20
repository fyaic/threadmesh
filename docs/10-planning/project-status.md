# Project status

> Snapshot: 2026-08-20, including authenticated operations, crash-safe adapter
> submission, typed interruption results, signed verification attestations,
> the stacked local event-stream/inspector candidate, and the two-profile M1
> conformance matrix, the retention-driven purge candidate, and the first real
> Codex App Server no-model preflight.

## Executive summary

ThreadMesh is a pre-alpha protocol and reference-runtime experiment. The
repository has progressed beyond documentation-only research: it contains
machine-readable schemas, deterministic conformance fixtures, an authenticated
local JSON-RPC binding, an experimental SQLite coordinator, and conservative
ACP and Codex App Server adapters. Kimi ACP has a real handshake; Codex App
Server has deterministic JSONL tests and a real CLI initialize/thread-start
preflight. Neither real model path counts as passed yet.

The implementation is not a production coordinator and does not establish
cross-product interoperability. The normative M0 blockers are resolved; M0
remains open only for two independent reviews, including one outside the
maintainer organization.

## Evidence ledger

| Area | Current evidence | Status |
|---|---|---|
| Research and problem framing | Codex deep dive, community signals, ecosystem comparison, ADRs | Established |
| Protocol draft | 14 JSON Schemas, 55 positive/negative cases, 7 transition cases, 81 unit tests | Executable draft |
| Local binding | Schema-validated JSON-RPC, transport-derived principals, typed errors | Executable local reference |
| Local persistence | SQLite registry, proposals, grants, summaries, mailbox, claims, receipts, reconciliation, replay, audit, retention tombstones | Experimental |
| Safety boundary | Authenticated authorship checks, effective-grant decisions, revocation, CAS | Executable local policy |
| ACP adapter | ACP v1 initialize, session create/load, prompt aggregation, permission denial, timeout cleanup | Experimental |
| Kimi Code | CLI 0.36.1 handshake plus exact create/list/delete/absence lifecycle | Real no-model preflight passed |
| Live Kimi model behavior | Earlier prompt reached provider but returned billing-cycle quota exhaustion | Blocked, not passed |
| Codex App Server | CLI 0.145.0, 273 generated-schema files, JSONL handshake, empty read-only thread start | Real no-model preflight passed |
| Codex live model behavior | Exact marker, persisted resume, and cleanup script prepared | Gated, not run |
| Independent review | Three internal lanes complete; external reviewer packet and public template published | Awaiting two external verdicts |
| Production authentication | Local static-token reference; no TLS/OAuth verifier supplied | Host integration required |
| OS isolation | No child-process sandbox supplied by ThreadMesh | Not implemented |
| Steer and interrupt | Not advertised by the ACP prototype | Intentionally unsupported |
| Interruption result | Per-target model/tool/process schema; no umbrella success | Normative, no live cancellation adapter yet |
| External verification | Signed attestation schema plus real Ed25519 conformance proof | Normative, conformance trust anchor only |
| Cross-harness conformance | Pull-mailbox and event-watching mock profiles over JSON-RPC | Local behavior demonstrated |
| Event stream and inspector | Restart checkpoint, strict local cursor order, provenance, authorization-aware redaction | Stacked M1 candidate |
| M1 behavior matrix | Two capability-valid mock profiles, related discovery, notify/suggest decisions, stale/unsupported state change, revocation, cleanup | Stacked conformance candidate |
| Retention purge | Schema v3 tombstones, policy-only bounded operation, unknown-effect exclusion, replay preservation, WAL checkpoint | Stacked M1 candidate |

## Milestone accounting

GitHub is authoritative for milestone closure.

### M0 — Foundation and protocol draft

- 10 issues closed, including all normative review blockers
  [#15](https://github.com/fyaic/threadmesh/issues/15),
  [#17](https://github.com/fyaic/threadmesh/issues/17),
  [#18](https://github.com/fyaic/threadmesh/issues/18),
  [#19](https://github.com/fyaic/threadmesh/issues/19), and
  [#16](https://github.com/fyaic/threadmesh/issues/16).
- 1 issue open: [#7](https://github.com/fyaic/threadmesh/issues/7).
- Exit is blocked only by two independent reviews, including at least one
  outside the maintainer organization.

### M1 — Local reference coordinator

- 7 issues open: [#9](https://github.com/fyaic/threadmesh/issues/9)–
  [#14](https://github.com/fyaic/threadmesh/issues/14), plus retention follow-up
  [#34](https://github.com/fyaic/threadmesh/issues/34).
- Pull request #20 and the authenticated binding supply partial implementation
  evidence for #9–#14.
- A versioned baseline, transactional migration rollback tests, and the
  retention/deletion contract are prepared under #9 but remain gated by #7.
- A stacked #10 candidate adds durable audited expiry and an explicit negative
  test for unrestricted task enumeration; it also remains gated by #7.
- A stacked #11 candidate extracts a fail-closed policy engine, uses a
  non-disclosing public denial, reauthorizes adapter submission, and atomically
  invalidates queued state-changing work on revocation; it remains gated by #7.
- A stacked #12 candidate adds schema version 2, runtime freshness CAS, one
  shared transition table, explicit terminal reasons, and a dispatcher that
  persists unknown outcome before one native call and suppresses restart retry;
  it remains gated by #7.
- A stacked #13 candidate adds a restart-safe local cursor wrapper plus a
  provenance snapshot that distinguishes user/peer authorship, redacts content
  after expiry or revocation, and exposes delivery/decision/outcome separately;
  it remains gated by #7.
- A stacked #14 candidate runs two capability-valid profiles through the public
  JSON-RPC path, including relationship-scoped discovery, side-channel notify,
  suggestion decisions, stale/unsupported state changes, replay, revocation,
  audit assertions, and deterministic test-database cleanup; it remains gated
  by #7.
- A stacked #34 candidate adds schema version 3 and executes policy-only,
  bounded content tombstoning while preserving original digests and excluding
  unresolved context/native effects; it remains gated by #7.
- Hosted event streaming remains unfinished and is not required by an existing
  M1 acceptance issue.

### M2 — First real adapters

- 3 issues open: Codex App Server [#36](https://github.com/fyaic/threadmesh/issues/36),
  Kimi ACP hardening [#37](https://github.com/fyaic/threadmesh/issues/37), and a
  materially different third harness [#38](https://github.com/fyaic/threadmesh/issues/38).
- Draft [#39](https://github.com/fyaic/threadmesh/pull/39) contains the Codex
  candidate and is stacked on retention Draft #35.
- The Codex candidate implements suggestion-only capability negotiation,
  receiver-acceptance enforcement, exact turn evidence, server-request denial,
  timeout cleanup, generated-schema digesting, and a real no-model product
  preflight.
- The Kimi hardening candidate now hashes the exact binary, timestamps each
  run, verifies one real session through create/list/delete/list, and separates
  the gated live marker from the default no-model preflight.
- Codex `0.145.0` does not persist an empty thread before its first turn. The
  live script therefore keeps create plus first accepted turn on one connection,
  then separately verifies resume and exact-thread deletion.
- M2 does not close until real model behavior runs through the merged
  coordinator and at least two materially different harness families pass the
  same scenario.

## What the prototype proves

The current tests support the narrower claim that a local authenticated binding
can:

1. register, attach, and CAS-rotate task incarnations;
2. separate agent proposals from owner/policy effective grant decisions;
3. recompute grant integrity and reject authorship or principal forgery;
4. persist and replay-protect operations and coordination envelopes;
5. quarantine revoked content, then claim and acknowledge authorized mailbox work;
6. publish and reauthorize grant-projected summaries;
7. recover two public-path mock harness profiles after SQLite restart;
8. persist a native submission's pre-call `outcome-unknown` boundary and stable
   adapter idempotency key;
9. recover unknown attempts after restart without automatic redelivery;
10. store an exact adapter receipt atomically with disposition CAS, reject a
    conflicting receipt, and permit retry only after evidence-backed
    confirmed-not-submitted reconciliation;
11. create one durable adapter admission claim bound to grant and evidence;
12. load the registered ACP session without mixing historical replay into the
   new turn;
13. confirm context admission only after matching adapter evidence;
14. preserve an audit trail across restart;
15. reject umbrella interrupt success and require explicit model-turn,
    tool-call, and subprocess coverage;
16. reject arbitrary evidence, adapter-forged attestations, tampered digests,
    invalid signatures, and untrusted verifier keys.
17. default-deny missing, revoked, expired, stale-incarnation, superseded, and
    insufficient-authority policy cases without disclosing hidden grant state;
18. atomically invalidate queued state-changing work when its grant is revoked,
    while preserving unknown external attempts for reconciliation.
19. dispatch one idempotency-bound native call, persist the exact receipt, and
    suppress retry after ambiguous error or restart;
20. reject stale run/objective/checkpoint snapshots at admission and immediately
    before dispatch, and persist explicit decision/failure reasons.
21. resume a strictly ordered local event cursor after SQLite restart and render
    authorized provenance without leaking revoked content or raw audit detail.
22. run the complete M1 scenario matrix across an event watcher and pull-mailbox
    receiver with explicit capability degradation and per-transition audit.
23. tombstone expired sensitive content without losing replay defense, scrub
    retired adapter references, and preserve unresolved-effect evidence.
24. negotiate the real Codex App Server protocol, start an empty read-only
    thread, and reproduce generated-schema and initialize snapshot digests.
25. reject unaccepted Codex suggestions, delimiter attacks, malformed JSONL,
    server-initiated gate requests, and unresponsive child processes in a
    deterministic fake-product matrix.

It does not prove autonomous task discovery, useful model behavior, native
provider-role isolation, exactly-once external effects, production remote
credential verification, safe interruption, managed backup expiry, or forensic
erasure.

## Progress rule

An implementation demonstration may inform a normative issue, but it does not
close that issue until its public schema, operation semantics, negative cases,
and review evidence satisfy the issue acceptance criteria.
