# M5.2 coordinator-driven autonomous fixture

Date: 2026-09-01

Evidence class: deterministic in-process fixture

Reviewed `main`: `3b91dcff82622a0fed936e8295b77905777c6ada`
Live product evidence: no

## What this record establishes

ThreadMesh now has a deterministic no-plan fixture in which the user starts
implementer A once and durable coordinator attention drives the remaining
bounded lifecycle:

```text
A implementation → R review → same-A fix → V verification → dependent
```

The result is useful because it demonstrates session initiative across a real
SQLite lifecycle boundary without making the user copy each intermediate
result. It is policy-mediated deterministic behavior, not evidence of emergent
intelligence or general autonomous discovery.

## Merged implementation

| PR | Exact merged commit | Narrow contribution |
|---|---|---|
| [#118](https://github.com/fyaic/threadmesh/pull/118) | `2a0d8550abc1a8c5dcebceb86d0372ea8d337b4d` | Deterministic no-plan adapter and coordinator-owned receiver decision/admission activation |
| [#119](https://github.com/fyaic/threadmesh/pull/119) | `d37cb428ea84b0683dac24787889e259a0a18c71` | Bounded in-process autonomous event pump, exact next-event selection, and scenario-private artifacts |
| [#120](https://github.com/fyaic/threadmesh/pull/120) | `3b91dcff82622a0fed936e8295b77905777c6ada` | V-to-dependent closure, pre-turn trusted finalization, stable handler bindings, and exact preverified provenance |

## Reproduction

Run the focused scenario test from a clean checkout of the reviewed commit:

```sh
npm ci
node --test test/coordinator-driven-no-plan-scenario.test.mjs
```

The repository-wide validation at the reviewed commit reported three separate
counts:

- 345 tests passed;
- 55 schema cases passed;
- 7 transition cases passed.

Documentation lint also passed. The counts above are not combined into a
single inflated total.

## Positive-path evidence

The bounded public result and tests establish:

- exactly one explicit user kickoff;
- zero activation dispatches by the fixture runner;
- zero raw phase prompts submitted by the fixture runner;
- zero manual relay and zero polling;
- exact-next in-process routing over durable attention events and cursors
  through A, R, the original A, V, and the dependent session;
- the same native A session for kickoff and fix;
- a separate V native session and distinct model-selected decision/business
  turns;
- exact decision, context-admission, lifecycle-action, evidence-chain, and
  handler-selection bindings;
- trusted finalization persisted before the dependent business turn starts;
- the dependent edge satisfied and task changed from `waiting` to `ready`
  before its admitted business tool can commit its effect;
- the authorized but irrelevant route created zero claims and zero turns;
- every offered cursor was committed and no active claim remained.

The fixture uses one call to the autonomous pump's bounded `runUntilIdle`
operation. The fixture runner does not call each activation phase itself.

## Failure and interference controls

An injected bad finalization binding fails before any dependent business turn:

- dependent business turn count: 0;
- dependent business tool action count: 0;
- dependency satisfaction/effect count: 0;
- edge and task remain `waiting`;
- cleanup still completes.

Preverified admission additionally fails closed for each of five exact
negatives: a state-only disposition/revision forgery, a missing receipt row, a
missing satisfaction row, a missing finalization row, or an altered disposition
digest. Each case starts zero dependent business turns and is rejected when the
SQLite coordinator is reopened.

## Cleanup evidence

Success and failure paths delete and absence-check all five fixture roles. The
scenario tracks only its exact journal paths, removes its private mode-`0700`
run root and SQLite database/sidecars, and preserves caller-owned JSON,
decision-action, legacy-journal, and same-named database files. Unknown
journal-like files make `cleanup.complete=false` without being deleted.

## Required honesty boundary

The result deliberately reports:

| Field | Value |
|---|---|
| `liveProductEvidence` | `false` |
| `deterministicPolicyOracle` | `true` |
| `externalIndependentVerifier` | `false` |
| `signer` | `fixture-owned-ephemeral-key` |
| `eventPumpSelectionDurable` | `false` |

V has an independent native fixture session, but the signing key remains owned
by the fixture process. That is not an external verifier service.

## Still pending

This record does not establish:

- durable event-pump selection across coordinator restart;
- a cross-process claimant or pump lease;
- OS-level kill and resume recovery;
- a real Codex A/R/same-A/V/dependent autonomous product run;
- a real Kimi or cross-harness repetition of the same chain;
- a production authorization, isolation, or exactly-once external-effect
  guarantee.

Until those gates pass, this evidence remains a full functional in-process
fixture, not an M5.2 live-product completion claim.
