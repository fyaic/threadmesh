# 2026-09-02 mainline checkpoint

## Decision

The mainline remains the real Codex implementation → review → same-A fix →
verification → dependent loop in issue #91. The repository is not currently
implementation-blocked; it is live-evidence and adoption-blocked. No new
transport, scheduler, harness, or general orchestration subsystem enters the
critical path.

## Repository state

- branch base: `main`, synchronized with `origin/main` before this diagnostic
  slice;
- base commit: `e8b8ce62dd177dde09557b7311939f871b3e3954`;
- latest product work: real-effects integration #133 and product-proof update
  #134;
- public discovery: one star, zero forks, and no external operator report;
- open pull requests: Dependabot maintenance only.

## Local evidence retained

The following passed on the exact checkpoint commit:

- 385/385 unit and subtests;
- 55 schema cases and 7 transition cases;
- 114 Markdown files with zero lint issues;
- focused autonomous real-effects scenario: 9/9;
- one-command attention-router demo: `state=passed`;
- modeled manual lower bound: 9 user actions;
- ThreadMesh demo path: 1 kickoff, 0 relay actions, 0 status checks;
- active receiver remains `running` with a pending `checkpoint-offer`, 0 steer,
  0 interrupt, and 0 native-turn starts;
- dropped wake hints reconcile 4/4 and cleanup is complete.

The 9-to-1 comparison remains modeled workflow accounting. Elapsed time and
model tokens are not measured.

## Live-product preflight and attempt

Codex CLI 0.145.0 remained authenticated and locally healthy. The initial
Responses WebSocket diagnostic timed out, system DNS returned unexpected non-
provider addresses for `chatgpt.com`, and a direct certificate-verifying HTTPS
probe timed out. Read-only diagnosis found that macOS had a running local HTTP
and HTTPS proxy which was not present in the Codex process environment.

Supplying that proxy only to the validation process preserved TLS verification
and produced a successful Codex doctor result: WebSocket `101 Switching
Protocols` and provider HTTP reachability. No system DNS, Tailscale, proxy,
certificate, or Codex-version setting was changed.

A fresh real-effects run on `53df406` then created and registered all five
roles, published the real A implementation, and entered the reviewer admitted
turn. It failed closed as
`threadmesh_codex_live_context_reconciliation_ambiguous`. The bounded terminal
projection reported 5/5 role deletion and absence checks, coordinator removal,
and zero remaining journals. The exact empty caller-owned artifacts directory
was then removed. This is a failed partial attempt, not a product pass. See the
[attempt record](2026-09-02-m5-2-real-effects-live-attempt.md).

The follow-up diagnostic slice now captures a strict pre-cleanup SQLite
projection on scenario failure. It exposes only a fixed stage enum, ten
bounded aggregate counts, and an allowlisted ambiguous-reconciliation reason;
raw prompts, receipts, paths, thread IDs, and journal contents are not included.
Schema drift, excess counts, inconsistent stages, and unsafe reason strings are
rejected by the CLI projector. Failure-stage, tamper, privacy, and exact cleanup
tests pass.

Attempt 12 on merged commit `688c226` exercised that projection. It reported
`reviewer-admitted-turn-partial` and
`codex-native-turn-completed-observation-only`, with 5 tasks, 1 dispatch, 3
turn intents, 5 selected tool actions, 1 lifecycle publication, and 1 Git
evidence record. Exact cleanup passed. Because selected-action count alone does
not distinguish a rejected second callback from post-callback adapter failure,
the projection now also includes the bounded completed-action aggregate before
the next run.

Attempt 13 then reported 5 selected versus 4 completed actions, proving that
the second reviewer callback—not adapter finalization—was the failing boundary.
The correction replaces the redundant requirement for the model to copy a
coordinator-derivable digest from tool output with a coordinator-bound schema
constant. Exact path and counterexample matching against the detached checkout,
negative tamper coverage, and the downstream verifier chain remain mandatory.

## Ordered next gates

1. Run the merged real-effects Codex path once with the new partial-stage
   manifest, use its exact bounded reconciliation reason to correct the
   observed blocker, and retain one successful traversal.
2. One same-condition manual/ThreadMesh comparison with action, elapsed, usage,
   interruption, duplicate-delivery, and cleanup measurements.
3. The complete M5.3 matrix: relevant 3/3, irrelevant, stale/unverified,
   restart/replay, and failure cleanup.
4. Close #91 only after its canonical checklist passes.
5. Observe three independent 15-minute operators for #79.
6. Prioritize #135 and #136 from observed friction; keep #137 frozen until #91
   and #93 have real evidence.

## Community backlog decision

Community reports were grouped by user-visible failure mode rather than copied
one-for-one into the repository:

- #135: correlated handoff receipt and complete attention state;
- #136: durable non-interrupting attention plus context freshness;
- #137: owner-visible autonomous-chain budgets and circuit breakers.

These issues deliberately exclude project orchestration, model routing, Codex
writer takeover, UI bug fixes, hosted control planes, and new event buses.
