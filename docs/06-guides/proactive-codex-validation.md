# Proactive Codex A-to-B validation

## Purpose

This experiment tests the behavior that originally motivated ThreadMesh: Agent
A notices a bounded dependency, chooses whether another task is useful, and
initiates one advisory message to Agent B. The validation uses the documented
Codex App Server experimental dynamic-tool flow; the harness does not call the
coordinator submit operation on A's behalf.

The first bounded case was tracked by
[issue #53](https://github.com/fyaic/threadmesh/issues/53). This is
maintainer-authorized experimental evidence, not normative M0 evidence and not
a production autonomy claim.

## Proven path

The compressed scenario creates two persisted Codex tasks and one
relationship-scoped dependency grant:

1. B's first persisted turn records the outcome-bearing
   `missing dependency` baseline.
2. A starts as a persistent task and receives its objective plus two dynamic
   ThreadMesh tools in the same first turn: read related summaries and send one
   suggestion.
3. A chooses both tools and sends the schema-bounded suggestion exactly once.
4. The coordinator authorizes and queues the envelope. The harness applies a
   deterministic receiver checkpoint acceptance, durable admission claim, and
   acknowledgement.
5. B consumes the admitted context and returns an exact marker.
6. The runner verifies admission evidence, audit, and deletion of both tasks.

This removes one non-business bootstrap model turn from every condition.
Control and irrelevant use two turns; relevant uses a third B receiver turn.

The public result requires `scriptedSubmitCount: 0`, a completed A decision
turn, the exact tool order, exactly one real coordinator send, zero observed
non-ThreadMesh tool calls, B's outcome marker, and complete two-task cleanup.
Agent A's final prose is not a success criterion. Dynamic tool arguments and
outputs are represented only by bounded digests outside the adapter process.

## Commands

Run the deterministic fake-product rehearsal:

```sh
npm run validate:proactive:fake
```

After enabling the maintainer-experimental acknowledgements documented in the
[real product runbook](../09-reviews/real-product-e2e-runbook.md), run Codex:

```sh
npm run validate:proactive:live:codex
```

The live alias uses the same exact-main detached-worktree bootstrap and strict
result projection as the receiver-only product validation.

## Recorded live result

The maintainer-experimental run on 2026-08-21 passed from clean synchronized
`main` at `248d650ab06e6e34de9cc41ede641c841c1e36a3`. Codex `0.145.0` with
`gpt-5.6-sol` produced the exact A and B markers. The projected evidence records
one related-task call, one send call, zero scripted submits, zero observed
non-ThreadMesh tool calls, `context-admitted` delivery, and deletion of both
persisted tasks.

The first attempt at `6a4b17a` failed safely before A's autonomous turn because
an empty App Server thread has no resumable rollout. B was deleted. PR #55 then
made A's local persistence bootstrap explicit; the successful rerun used that
merged fix. Neither result satisfies the still-open normative review gate.

## What this does not prove

- B's checkpoint decision is currently deterministic harness policy, not an
  autonomous B-model accept/reject decision.
- The scored result is one run per condition, not a false-positive rate; stale,
  duplicate, interruption, and concurrent-user-input cases remain.
- App Server dynamic tools are experimental, and this adapter is pinned to the
  tested Codex CLI compatibility range.
- Tool-event observation and read-only sandbox configuration are evidence for
  this bounded run, not an operating-system security boundary.
- A successful Codex result does not establish portability until another
  materially different harness passes the same behavioral case.

The minimal adapter API and a materially different real receiver harness are
now complete. Cross-harness proactive behavior and broader stale/duplicate
interference are separate follow-up work.

The first scored control/relevant/irrelevant run is recorded in the
[2026-08-25 behavioral gate](../09-reviews/2026-08-25-codex-behavior-gate.md).
It improved the downstream dependency score from 0 to 1 in the relevant case,
while the irrelevant case performed one read-only lookup and did not send or
activate the receiver.

The compressed flow merged in PR #66. PR #70 then replaced the redundant Agent
A text-marker check with observed behavior: completed decision turn, exact
`related tasks → send suggestion` sequence, one coordinator send, and no other
tools. B's business-outcome marker remains mandatory.

Three fresh real relevant runs on `9a6381a` produced two complete successes and
one `threadmesh_proactive_model_tool_decision_missing` failure. The successful
runs took 181 and 268 seconds; the failed run took 142 seconds. All three runs
deleted both A and B. This improves signal quality but does not yet meet a 3/3
reliability threshold, so proactive coordination remains default-off. The
deterministic three-condition command and field interpretation are documented
in the [end-to-end demonstration](end-to-end-demo.md).

PR #72 then made the model policy explicitly two-stage without scripting the
send: when the objective may affect another task, A reads the authorized
summaries once; it sends only when a returned summary explicitly needs the
current result. The handler also requires discovery before send and reports
missing discovery separately from missing send.

Three fresh real relevant runs on `a134b39` all passed in 85, 88, and 132
seconds. Each selected the exact two-tool sequence, sent once, activated B,
produced outcome score 1, used no other tool, and deleted A and B. A fresh
control made zero tool calls and zero sends; a fresh irrelevant run made one
read-only lookup and zero sends. This satisfies the bounded M3 case threshold.
The profile is eligible for explicit maintainer-experimental opt-in use, but it
remains off by default while ThreadMesh is pre-alpha and M0 review remains open.
