# 2026-09-02 mainline checkpoint

## Decision

The mainline remains the real Codex implementation → review → same-A fix →
verification → dependent loop in issue #91. The repository is not currently
implementation-blocked; it is live-evidence and adoption-blocked. No new
transport, scheduler, harness, or general orchestration subsystem enters the
critical path.

## Repository state

- branch: `main`, clean and synchronized with `origin/main`;
- commit: `0c7165ead39499497827737c17e94e95f0f3286b`;
- latest product work: real-effects integration #133 and product-proof update
  #134;
- public discovery: one star, zero forks, and no external operator report;
- open pull requests: Dependabot maintenance only.

## Local evidence retained

The following passed on the exact checkpoint commit:

- 384/384 unit and subtests;
- 55 schema cases and 7 transition cases;
- 112 Markdown files with zero lint issues;
- focused autonomous real-effects scenario: 9/9;
- one-command attention-router demo: `state=passed`;
- modeled manual lower bound: 9 user actions;
- ThreadMesh demo path: 1 kickoff, 0 relay actions, 0 status checks;
- active receiver remains `running` with a pending `checkpoint-offer`, 0 steer,
  0 interrupt, and 0 native-turn starts;
- dropped wake hints reconcile 4/4 and cleanup is complete.

The 9-to-1 comparison remains modeled workflow accounting. Elapsed time and
model tokens are not measured.

## Live-product preflight

Codex CLI 0.145.0 remained authenticated and locally healthy. The Responses
WebSocket diagnostic timed out, system DNS returned unexpected non-provider
addresses for `chatgpt.com`, and a certificate-verifying HTTPS probe timed out
during the SSL connection. No DNS override, TLS bypass, live session creation,
or real Git-effect gate was attempted.

This is an environment blocker, not positive or negative ThreadMesh product
evidence. The next live attempt begins only after normal DNS and certificate-
verified connectivity are restored.

## Ordered next gates

1. One network-valid traversal of the merged real-effects Codex path.
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
