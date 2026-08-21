# Milestone acceptance audit

> Snapshot: 2026-08-21. PR #45 was squash-merged and revalidated on `main` at
> `e761e98da83426a5ebae3b47a341f606186dfca6`. The independent M0 review target
> remains `265e461f1b8714c56f7fe817795b81d895f732c6`; its evidence gate is still
> unsatisfied.

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

The M1 implementation is merged, but normative M0 acceptance remains open at
issue #7. Real M2 turns may now run either with valid external-review records or under
the explicit maintainer-experimental authorization. The latter never satisfies
M0 and must remain labeled non-normative.

## M0 gate

| Requirement | Evidence | Audit status |
|---|---|---|
| All normative blockers resolved | #15–#19 closed; 14 schemas, 55 schema cases, 7 transition cases | Satisfied |
| Exact reproducible review target | `265e461f1b8714c56f7fe817795b81d895f732c6`; corrected by #46 | Satisfied |
| Two independent reviews | #7 and Discussion #27 contain no qualifying external verdict | Missing: 0 of 2 |
| At least one outside reviewer | Integrity-bound gate manifest has no records | Missing: 0 of 1 |
| Every finding dispositioned | Cannot begin until reviews arrive | Pending |

`npm run validate:review-gate` truthfully exits 3 while these records are
missing. Qualifying records must resolve to real issue-#7 comments and match one
canonical reviewer-authored block plus authenticated per-finding disposition
blocks; resolved fixes must be merged into the candidate. The live-product
bootstrap also requires a separate exact operator acknowledgement and executes
from a detached worktree at verified GitHub `main`, with start/end checks; none
of these mechanisms can substitute for another.

The maintainer-experimental override is a separately labeled execution
authorization, not a substitute for the missing reviews. It preserves an
unsatisfied review-gate projection in every result.

## M1 — Local reference coordinator

| Issue | Acceptance evidence in the stacked candidate | Audit status |
|---|---|---|
| #9 storage and migration | #28; `sqlite-storage-contract.md`; migration manifest, adoption, upgrade, rollback, drift, WAL, retention tests | Candidate-satisfied |
| #10 registry, mailbox, audit | #29; atomic submit/audit, replay, expiry, restart, scoped enumeration tests through JSON-RPC | Candidate-satisfied |
| #11 relationship policy | #30 at reviewed `61c15ae`; fail-closed policy, stable denial, immediate reauthorization, revocation invalidation, atomic proposal-to-grant test | Candidate-satisfied; atomic fix propagated through every descendant stacked branch |
| #12 dispatcher and disposition | #31; shared legal transition table, freshness/expiry CAS, durable idempotency key, outcome-unknown and reconciliation tests | Candidate-satisfied |
| #13 stream and inspector | #32; restart-safe local cursor, complete provenance projection, authorization-aware redaction, deterministic snapshots | Candidate-satisfied |
| #14 two harness profiles | #33; pull-mailbox and event-watching profiles, audit per transition, explicit degradation, deterministic database cleanup | Candidate-satisfied |
| #34 retention purge | #35; append-only schema v3, bounded policy-only purge, unknown-effect exclusion, replay preservation, redaction, restart/WAL tests | Candidate-satisfied |

### M1 integration result

PR #45 integrated the full stack into `main`; `npm ci`, `npm test`, and
`npm audit --audit-level=high` passed on the merged tree. The integration PR
closed #9–#14 and #34. This proves the merged experimental implementation and
its deterministic tests, while #7 continues to govern normative M0 acceptance.

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
| #42 generalized admission | Merged #45 validates ACP, Codex, and Gemini adapter refs and strict bounded evidence over one claimed envelope | Merged implementation; real evidence pending |
| #44 unified runner | Merged #45 fake-all passes mailbox claim/acceptance, exact marker, confirmation, audit, and cleanup; every live alias uses the isolated exact-main bootstrap | Merged implementation; maintainer-authorized real execution next |

## Real-product evidence still required

The merged runner must now produce:

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
