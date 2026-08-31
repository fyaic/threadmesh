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

| Issue | Acceptance evidence on merged `main` | Audit status |
|---|---|---|
| #9 storage and migration | `sqlite-storage-contract.md`; migration manifest, adoption, upgrade, rollback, drift, WAL, retention tests | Merged; issue closed |
| #10 registry, mailbox, audit | Atomic submit/audit, replay, expiry, restart, scoped enumeration tests through JSON-RPC | Merged; issue closed |
| #11 relationship policy | Fail-closed policy, stable denial, reauthorization, revocation invalidation, atomic proposal-to-grant test | Merged; issue closed |
| #12 dispatcher and disposition | Shared legal transition table, freshness/expiry CAS, durable idempotency, outcome-unknown and reconciliation tests | Merged; issue closed |
| #13 stream and inspector | Restart-safe cursor, provenance projection, authorization-aware redaction, deterministic snapshots | Merged; issue closed |
| #14 two harness profiles | Pull-mailbox and event-watching profiles, transition audit, explicit degradation, deterministic cleanup | Merged; issue closed |
| #34 retention purge | Append-only schema v3, bounded purge, unknown-effect exclusion, replay preservation, restart/WAL tests | Merged; issue closed |

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
| Resume without a new turn | Real validation creates a persisted bootstrap thread, resumes it for accepted context, then deletes it | Satisfied for experimental product evidence |
| Acceptance, provenance, denial, bounded evidence, timeout/malformed behavior | Deterministic App Server tests and common admission matrix | Candidate-satisfied |
| Conservative capability advertisement | Suggest-only; no steer/interrupt | Candidate-satisfied |
| Real marker, durable resume, exact cleanup | Exact marker, evidence, audit, persisted receiver path, and exact cleanup passed at `0dda5a7` | Satisfied for maintainer-experimental product evidence |

### #37 Kimi Code ACP

| Criterion group | Current evidence | Audit status |
|---|---|---|
| Exact product/capability probe | Real 0.38.0 binary and ACP snapshot recorded | Satisfied |
| Session lifecycle and cleanup | Real create/list/delete/absence passes | Candidate-satisfied |
| Reload without historical output contamination | Real accepted turn loads the created ACP session; deterministic replay-isolation test passes | Satisfied |
| Permission requests default-cancelled | Real adapter behavior covered by SDK fake agent | Candidate-satisfied |
| Unique accepted marker | Exact real marker passed at `b248343` | Satisfied for maintainer-experimental product evidence |
| Reproducible timestamped report | 2026-08-25 live evidence records version, digests, UTC times, state, and cleanup | Satisfied |

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
| #42 generalized admission | Merged #45 validates ACP, Codex, and Gemini adapter refs and strict bounded evidence over one claimed envelope | Merged; real Codex and Kimi evidence complete |
| #44 unified runner | Fake-all passes; real Codex passed at `0dda5a7` and Kimi at `b248343` | Merged with two real product passes |

### #53 proactive Codex A-to-B case

| Criterion group | Current evidence | Audit status |
|---|---|---|
| Model-selected communication | A called related-task discovery then bounded send; `scriptedSubmitCount` was zero | Satisfied for maintainer-experimental positive case at `248d650` |
| Coordinator and receiver path | One authorized suggestion was claimed, accepted, admitted, audited, and consumed by persisted B | Satisfied for the positive case |
| Tool and message budget | Exactly one related-task call, one send, and zero observed non-ThreadMesh tool calls | Satisfied for the positive case |
| Cleanup and repository boundary | A and B deleted; clean main and detached child remained bound to exact `248d650` | Satisfied |
| Scored control/relevant/irrelevant conditions | Control 0; relevant 1; irrelevant lookup with zero send; complete cleanup at `0dd2c82` | First real behavioral gate passed |
| Repetitions, stale/duplicate, B defer/reject | Not yet run | Open #53 follow-up; blocks default enablement, not minimal adapter extraction |

### Minimal adapter kit

| Criterion | Current evidence | Audit status |
|---|---|---|
| One public package entry | M4 shipped the root SDK export; M5 adds explicit runtime subpaths and an installed CLI | Satisfied on merged main |
| Small harness API | Register, publish/discover summary, suggest, poll, and decide | Satisfied on merged main |
| Bounded behavior | 30-minute maximum TTL, bounded content/reason, no global task enumeration | Satisfied on merged main |
| End-to-end lifecycle | Async SDK test traverses authenticated JSON-RPC and SQLite through acceptance plus defer/reconsider | Satisfied on merged main |
| Consumer install | About 20 kB tarball installs and runs the proactive bridge from a fresh temporary npm consumer | Satisfied |
| Short integration path | 30-minute guide and one HTTP transport example | Satisfied on merged main |

The merged package is intentionally not published to npm yet. GitHub
installation and the packed artifact were sufficient to test the integration
surface without creating a release claim.

## Optional real-product follow-up

Codex and Kimi completed the two-harness M2 threshold. Any future live attempt
must still produce:

1. Gemini remains optional: if run, require an explicitly authorized key,
   exact coordinator marker, exit 0, zero tool use, and removal of the exact
   isolated home;
2. a timestamped sanitized evidence record for every attempt, including
   `passed`, `blocked`, `failed`, or `not-run` and the exact repository commit.

Codex App Server and Kimi ACP now satisfy the two-harness threshold. Quota,
authentication, handshake, no-model, or fake-product results remain excluded
from live passes.

## Post-M2 evaluation gap

The original product goal is proactive cross-session coordination, not marker
echoing. Even after M2 passes, the project still needs an interference study
that compares useful dependency help against unwanted receiver disruption. That
work belongs to M3 and must measure suggestion acceptance, outcome improvement,
false-positive coordination, receiver delay, user-turn displacement, and
cleanup/recovery behavior before proactive discovery is enabled by default.
