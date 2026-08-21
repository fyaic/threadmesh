# Project status

> Snapshot: 2026-08-21, after PR #45 was squash-merged to `main` at
> `e761e98da83426a5ebae3b47a341f606186dfca6`. The merged tree includes the
> local coordinator, two-profile conformance matrix, retention purge, three
> product adapters, and the gated coordinator-mediated validation runner.

## Executive summary

ThreadMesh is a pre-alpha protocol and reference-runtime experiment. The
repository has progressed beyond documentation-only research: it contains
machine-readable schemas, deterministic conformance fixtures, an authenticated
local JSON-RPC binding, an experimental SQLite coordinator, and conservative
ACP, Codex App Server, and Gemini headless adapters. All three have real
no-model product evidence and share one deterministic coordinator-mediated
validation runner. The maintainer has authorized bounded real-product
experiments; no real model path counts as passed until its result is recorded.

The implementation is not a production coordinator and does not establish
cross-product interoperability. The normative M0 blockers are resolved; M0
remains open only for two independent reviews, including one outside the
maintainer organization.

## Evidence ledger

| Area | Current evidence | Status |
|---|---|---|
| Research and problem framing | Codex deep dive, community signals, ecosystem comparison, ADRs | Established |
| Protocol draft | 14 JSON Schemas, 55 positive/negative cases, 7 transition cases, 121 unit/subtests | Executable draft |
| Local binding | Schema-validated JSON-RPC, transport-derived principals, typed errors | Executable local reference |
| Local persistence | SQLite registry, proposals, grants, summaries, mailbox, claims, receipts, reconciliation, replay, audit, retention tombstones | Experimental |
| Safety boundary | Authenticated authorship checks, effective-grant decisions, revocation, CAS | Executable local policy |
| ACP adapter | ACP v1 initialize, session create/load, prompt aggregation, permission denial, timeout cleanup | Experimental |
| Kimi Code | CLI 0.36.1 handshake plus exact create/list/delete/absence lifecycle | Real no-model preflight passed |
| Live Kimi model behavior | Real ACP attempt completed session cleanup and absence verification | Failed: stable `acp_agent_error` |
| Codex App Server | CLI 0.145.0, 273 generated-schema files, JSONL handshake, empty read-only thread start | Real no-model preflight passed |
| Codex live model behavior | Real turn reached; exact thread cleanup completed | Failed: exact marker mismatch |
| Gemini CLI headless | Official package 0.56.0 integrity, required flags, isolated-home cleanup | Real no-model preflight passed |
| Gemini live model behavior | Exact marker script requires explicit provider key | Not authorized, not run |
| Multi-product admission | One mailbox/acceptance/claim/evidence path across ACP, Codex, and Gemini fakes | Merged experimental implementation |
| Product validation runner | Built-in bootstrap, isolated exact-main worktree, start/end SHA checks, bounded child evidence, acknowledgement, marker, audit, and cleanup | Merged in #45; fake-all passed; Codex and Kimi real attempts recorded |
| External-review gate | GitHub-authenticated canonical review/disposition blocks, merged-fix ancestry, reviewer diversity, and target ancestry | Mechanically awaiting 2 records |
| Independent review | Three internal lanes complete; external reviewer packet and public template published | Awaiting two external verdicts |
| Production authentication | Local static-token reference; no TLS/OAuth verifier supplied | Host integration required |
| OS isolation | No child-process sandbox supplied by ThreadMesh | Not implemented |
| Steer and interrupt | Not advertised by the ACP prototype | Intentionally unsupported |
| Interruption result | Per-target model/tool/process schema; no umbrella success | Normative, no live cancellation adapter yet |
| External verification | Signed attestation schema plus real Ed25519 conformance proof | Normative, conformance trust anchor only |
| Cross-harness conformance | Pull-mailbox and event-watching mock profiles over JSON-RPC | Local behavior demonstrated |
| Event stream and inspector | Restart checkpoint, strict local cursor order, provenance, authorization-aware redaction | Merged experimental implementation |
| M1 behavior matrix | Two capability-valid mock profiles, related discovery, notify/suggest decisions, stale/unsupported state change, revocation, cleanup | Merged conformance implementation |
| Retention purge | Schema v3 tombstones, policy-only bounded operation, unknown-effect exclusion, replay preservation, WAL checkpoint | Merged experimental implementation |

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

The implementation stack was squash-merged by PR #45 and revalidated on
`main`. Issues #9–#14 and #34 were closed by that integration PR. This merge is
a maintainer-approved experimental implementation decision; it does not turn
the still-open M0 external-review requirement into a satisfied review.

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
  invalidates queued state-changing work on revocation. Proposal approval and
  grant installation are now one reviewed immediate transaction at `61c15ae`,
  propagated through the remaining stack; it remains gated by #7.
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

The adapters and unified runner are merged. The immediate mainline is now real
product evidence: Codex first, Kimi second, and Gemini only when an explicit
credential is already available. Maintainer-experimental results are kept
distinct from normative M0 evidence.

- 5 issues open: Codex App Server [#36](https://github.com/fyaic/threadmesh/issues/36),
  Kimi ACP hardening [#37](https://github.com/fyaic/threadmesh/issues/37), and a
  materially different third harness [#38](https://github.com/fyaic/threadmesh/issues/38),
  shared multi-product admission [#42](https://github.com/fyaic/threadmesh/issues/42),
  and gated product validation [#44](https://github.com/fyaic/threadmesh/issues/44).
- Draft [#39](https://github.com/fyaic/threadmesh/pull/39) contains the Codex
  candidate and is stacked on retention Draft #35.
- Draft [#40](https://github.com/fyaic/threadmesh/pull/40) contains the Kimi
  lifecycle hardening candidate and is stacked on #39.
- Draft [#41](https://github.com/fyaic/threadmesh/pull/41) contains the Gemini
  headless candidate and is stacked on #40.
- Draft [#43](https://github.com/fyaic/threadmesh/pull/43) contains shared
  multi-product context admission and is stacked on #41.
- Draft [#45](https://github.com/fyaic/threadmesh/pull/45), tracked by #44, adds
  one mechanically gated runner over the exact mailbox, acceptance, admission,
  evidence, audit, and cleanup path. Its fake-all mode passes all three
  products; live mode requires GitHub-authenticated canonical review and
  disposition blocks, an exact operator acknowledgement, and execution from an
  isolated synchronized-main worktree, so it remains `not-run` before #7 and
  merge.
- The Codex candidate implements suggestion-only capability negotiation,
  receiver-acceptance enforcement, exact turn evidence, server-request denial,
  timeout cleanup, generated-schema digesting, and a real no-model product
  preflight.
- The Kimi hardening candidate now hashes the exact binary, timestamps each
  run, verifies one real session through create/list/delete/list, and separates
  the gated live marker from the default no-model preflight.
- Gemini CLI headless `stream-json` is selected for #38 after the repository's
  Copilot assignability checks returned unavailable. The official pinned package
  passes a no-model version/flag/integrity probe and its fake-product matrix;
  no Google account or API key was inferred or created.
- The next stacked candidate removes the coordinator's ACP-only admission
  assumption. ACP, Codex, and Gemini now consume the same claimed envelope and
  admission projection, then confirm with strict kind-specific evidence.
- Codex `0.145.0` does not persist an empty thread before its first turn. The
  live driver therefore keeps create plus a bounded local bootstrap turn on one
  connection, without presenting it as peer context, then separately validates
  the coordinator-accepted suggestion and exact-thread deletion.
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
26. probe the official pinned Gemini CLI package without a model turn, isolate
    its home, validate a non-ACP stream-json adapter, and refuse unaccepted or
    tool-using marker scenarios.
27. run the same receiver-accepted suggestion through one durable admission
    claim across ACP, Codex, and Gemini fake products, rejecting cross-kind or
    mismatched evidence and storing only bounded audit projections.
28. run one reusable validation entry point across all three fake products,
    requiring mailbox acknowledgement, exact markers, evidence confirmation,
    bounded audit, and exact product-resource cleanup while refusing live turns
    without the external-review acknowledgement;
29. reject self-authored or semantically reversed external-review records by
    resolving exact issue-#7 comments and comparing canonical reviewer and
    disposition blocks, including merged-fix ancestry;
30. prevent every repository-provided live alias from starting a model unless a
    built-in bootstrap re-executes from a detached worktree at verified GitHub
    `main` and the same SHA remains clean at completion;
31. atomically approve a relationship proposal and install its single grant,
    rolling both back if the proposal CAS fails;
32. reject Gemini terminal error results even when their stream contains the
    marker, and preserve caller-owned temporary roots during cleanup.
33. reject a child that prints a forged pass before timing out or receiving a
    signal, and bind every accepted live result to its exit code, product,
    repository SHA, review gate, admission, exact marker, and cleanup evidence.

It does not prove autonomous task discovery, useful model behavior, native
provider-role isolation, exactly-once external effects, production remote
credential verification, safe interruption, managed backup expiry, or forensic
erasure. The mailbox lease also remains task-scoped rather than worker-scoped,
and crash recovery for a lost in-flight admission token still requires manual
reconciliation. Strict public-result projection and adapter-kind-specific
cleanup/evidence validation are implemented and internally reviewed for the
trusted exact-checkout child; a hostile-worker boundary is not claimed.

## Progress rule

An implementation demonstration may inform a normative issue, but it does not
close that issue until its public schema, operation semantics, negative cases,
and review evidence satisfy the issue acceptance criteria.

The [milestone acceptance audit](acceptance-audit.md) maps every open M1/M2
criterion to current evidence and explicitly separates candidate, merge-pending,
blocked, and not-run states.
