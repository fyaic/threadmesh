# Proactive Codex A-to-B validation

## Purpose

This experiment tests the behavior that originally motivated ThreadMesh: Agent
A notices a bounded dependency, chooses whether another task is useful, and
initiates one advisory message to Agent B. The validation uses the documented
Codex App Server experimental dynamic-tool flow; the harness does not call the
coordinator submit operation on A's behalf.

Tracked by [issue #53](https://github.com/fyaic/threadmesh/issues/53). This is
maintainer-authorized experimental evidence, not normative M0 evidence and not
a production autonomy claim.

## Proven path

The scenario creates two persisted Codex tasks and one relationship-scoped
dependency grant:

1. B is bootstrapped into a resumable task.
2. A receives two dynamic ThreadMesh tools: read related summaries and send one
   suggestion.
3. A receives a release-decision objective, chooses both tools, and sends the
   schema-bounded suggestion exactly once.
4. The coordinator authorizes and queues the envelope. The harness applies a
   deterministic receiver checkpoint acceptance, durable admission claim, and
   acknowledgement.
5. B consumes the admitted context and returns an exact marker.
6. The runner verifies admission evidence, audit, and deletion of both tasks.

The public result requires `scriptedSubmitCount: 0`, the exact tool order,
exactly one send, zero observed non-ThreadMesh tool calls, both markers, and
complete two-task cleanup. Dynamic tool arguments and outputs are represented
only by bounded digests outside the adapter process.

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

The next product slice extracts a minimal adapter API, then ports the same tool
contract to another harness family. Repetitions and stale/duplicate interference
remain tracked under issue #53.

The first scored control/relevant/irrelevant run is recorded in the
[2026-08-25 behavioral gate](../09-reviews/2026-08-25-codex-behavior-gate.md).
It improved the downstream dependency score from 0 to 1 in the relevant case,
while the irrelevant case performed one read-only lookup and did not send or
activate the receiver.
