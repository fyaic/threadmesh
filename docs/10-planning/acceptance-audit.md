# Milestone acceptance audit

> Snapshot: 2026-08-20. Candidate implementation commit:
> `cf67b98bcb786a348a0bcad331fbd0810209f40d`. Public `main` at the time of this
> audit: `73c7234790bec286e637201fb87442116ea6a33a`.

## Status vocabulary

- **candidate-satisfied** — code, tests, and documentation exist in a green
  stacked Draft PR, but the issue must remain open until merge and `main`
  revalidation;
- **partial** — some evidence exists, but at least one explicit acceptance
  criterion is not proved;
- **blocked** — the exact required experiment was attempted but an external
  condition prevented a pass;
- **not-run** — the required real experiment has intentionally not executed;
- **satisfied** — merged `main` evidence proves the criterion.

No M1 or M2 issue is `satisfied` yet. M1 is merge-gated by #7. Real M2 model
turns are additionally execution-gated by the merged coordinator and valid
external-review records.

## M0 gate

| Requirement | Evidence | Audit status |
|---|---|---|
| All normative blockers resolved | #15–#19 closed; 14 schemas, 55 schema cases, 7 transition cases | Satisfied |
| Exact reproducible review target | `265e461f1b8714c56f7fe817795b81d895f732c6`; corrected by #46 | Satisfied |
| Two independent reviews | #7 and Discussion #27 contain no qualifying external verdict | Missing: 0 of 2 |
| At least one outside reviewer | Integrity-bound gate manifest has no records | Missing: 0 of 1 |
| Every finding dispositioned | Cannot begin until reviews arrive | Pending |

`npm run validate:review-gate` truthfully exits 3 while these records are
missing. The live-product runner also requires a separate exact operator
acknowledgement; neither mechanism can substitute for the other.

## M1 — Local reference coordinator

| Issue | Acceptance evidence in the stacked candidate | Audit status |
|---|---|---|
| #9 storage and migration | #28; `sqlite-storage-contract.md`; migration manifest, adoption, upgrade, rollback, drift, WAL, retention tests | Candidate-satisfied |
| #10 registry, mailbox, audit | #29; atomic submit/audit, replay, expiry, restart, scoped enumeration tests through JSON-RPC | Candidate-satisfied |
| #11 relationship policy | #30; fail-closed policy module, stable public denial, immediate reauthorization, revocation invalidation tests | Candidate-satisfied |
| #12 dispatcher and disposition | #31; shared legal transition table, freshness/expiry CAS, durable idempotency key, outcome-unknown and reconciliation tests | Candidate-satisfied |
| #13 stream and inspector | #32; restart-safe local cursor, complete provenance projection, authorization-aware redaction, deterministic snapshots | Candidate-satisfied |
| #14 two harness profiles | #33; pull-mailbox and event-watching profiles, audit per transition, explicit degradation, deterministic database cleanup | Candidate-satisfied |
| #34 retention purge | #35; append-only schema v3, bounded policy-only purge, unknown-effect exclusion, replay preservation, redaction, restart/WAL tests | Candidate-satisfied |

### M1 closure procedure

After #7 is accepted:

1. merge #28, then rebase or retarget each direct successor in order through
   #35;
2. after every merge, require both repository checks on the new base;
3. run `npm ci`, `npm test`, and `npm audit --audit-level=high` on final `main`;
4. map the resulting `main` commit and CI URL back to every issue criterion;
5. close #9–#14 and #34 only after the issue-specific evidence comment exists.

The stacked green state is strong candidate evidence, but it is not equivalent
to this sequential merged-state proof.

## M2 — Real adapters

### #36 Codex App Server

| Criterion group | Current evidence | Audit status |
|---|---|---|
| Version/protocol evidence | Real CLI 0.145.0, 273 generated files, stable schema and initialize digests | Candidate-satisfied |
| Initialize and empty thread start | Real no-model preflight passes | Candidate-satisfied |
| Resume without a new turn | Fake resume passes; real product does not persist an empty thread; post-first-turn real resume is not run | Partial |
| Acceptance, provenance, denial, bounded evidence, timeout/malformed behavior | Deterministic App Server tests and common admission matrix | Candidate-satisfied |
| Conservative capability advertisement | Suggest-only; no steer/interrupt | Candidate-satisfied |
| Real marker, durable resume, exact cleanup | Gated runner prepared; no real model turn executed | Not-run |

### #37 Kimi Code ACP

| Criterion group | Current evidence | Audit status |
|---|---|---|
| Exact product/capability probe | Real 0.36.1 binary digest and ACP snapshot recorded | Candidate-satisfied |
| Session lifecycle and cleanup | Real create/list/delete/absence passes | Candidate-satisfied |
| Reload without historical output contamination | Deterministic ACP test passes; a real accepted turn is needed for product proof | Partial |
| Permission requests default-cancelled | Real adapter behavior covered by SDK fake agent | Candidate-satisfied |
| Unique accepted marker | Earlier real request reached provider and returned billing-cycle HTTP 403 | Blocked, not passed |
| Reproducible timestamped report | Kimi evidence document and classified smoke output | Candidate-satisfied |

### #38 Gemini CLI headless

| Criterion group | Current evidence | Audit status |
|---|---|---|
| Selection and materially different boundary | Official 0.56.0 headless stream-json selected after documented alternatives | Candidate-satisfied |
| Explicit account authorization | No account inferred or created; no API key authorized | Candidate-satisfied safety boundary |
| Capability and unsupported mapping | Non-ACP capability profile, plan/sandbox flags, zero-tool-use enforcement | Candidate-satisfied |
| Same relationship-scoped suggestion | Common deterministic fake-product scenario passes | Partial: real model not run |
| Version, cleanup, limitations | Pinned package integrity, isolated-home cleanup, adapter document | Candidate-satisfied |

### #42 and #44 shared execution path

| Issue | Current evidence | Audit status |
|---|---|---|
| #42 generalized admission | #43 validates ACP, Codex, and Gemini adapter refs and strict bounded evidence over one claimed envelope | Candidate-satisfied |
| #44 unified runner | #45 fake-all passes mailbox claim/acceptance, exact marker, confirmation, audit, and cleanup; live mode has dual review/operator gates | Candidate-satisfied implementation; real execution not-run |

## Real-product evidence still required

After the M0 and merged-M1 gates pass, the same runner must produce:

1. Codex: exact bootstrap marker, registered persisted receiver, exact
   coordinator marker, completed turn evidence, resume, and exact thread delete;
2. Kimi: exact coordinator marker in the created ACP session, no permission
   grant, delete, and list-confirmed absence;
3. Gemini: explicitly authorized key, exact coordinator marker, exit 0, zero
   tool use, and removal of the exact isolated home;
4. a timestamped sanitized evidence record for every attempt, including
   `passed`, `blocked`, `failed`, or `not-run` and the exact repository commit.

At least two materially different harness families must pass before M2 can
close. Quota, authentication, handshake, no-model, or fake-product results are
never promoted to a live pass.

## Post-M2 evaluation gap

The original product goal is proactive cross-session coordination, not marker
echoing. Even after M2 passes, the project still needs an interference study
that compares useful dependency help against unwanted receiver disruption. That
work belongs to M3 and must measure suggestion acceptance, outcome improvement,
false-positive coordination, receiver delay, user-turn displacement, and
cleanup/recovery behavior before proactive discovery is enabled by default.
