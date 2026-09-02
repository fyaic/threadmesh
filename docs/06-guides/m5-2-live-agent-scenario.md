# M5.2 persistent-agent scenario runner

This runner prepares the product-evidence boundary for the persistent
implementer A, independent reviewer R, same-A fix, and independent verifier V
scenario. It does not yet provide M5.2 pass evidence.

## Current gate

The deterministic fixtures run bounded paths through a real isolated SQLite
v10 coordinator. At `c17c837`, the operator-supplied Codex-shaped path has a
strict probe, protected multi-tool receiver turns, an event-pump-driven live
entry point, timestamp normalization, and bounded failure cleanup. The command
surface being available is not evidence that the proactive chain passed. Kimi
remains a no-model capability preflight for this M5.2 path.
The fixture machine-verifies this sequence:

1. a lifecycle event is durably created;
2. the receiver claims only its next cursor event;
3. a receiver-owned model turn selects accept or defer;
4. accepted context obtains an admission receipt;
5. the exact registered receiver task is resumed;
6. the completed turn is bound and its model-selected effect is promoted;
7. only then is the receiver cursor committed;
8. the dependent independently claims the final event, selects acceptance,
   admits it into its exact registered task, and binds that completed decision;
9. the fixture-signed final chain is replayed and atomically finalized before
   dependency satisfaction;
10. a specialized finalized-dependency commit advances the dependent cursor
    without pretending its decision turn was an evidence promotion.

It also registers an authorized-but-irrelevant task, persists an
`irrelevant-skip` cursor commit, and proves zero claims and zero native model
turns for that control. This is a scripted integration fixture, not evidence of
model initiative or an independent verifier service.

## Autonomous no-plan fixture

The newer coordinator-driven fixture removes the scripted phase dispatcher.
Run its focused evidence test from the repository root:

```sh
node --test test/coordinator-driven-no-plan-scenario.test.mjs
```

There is exactly one explicit user kickoff for A. One bounded in-process event
pump then reads exact next SQLite attention events and drives:

```text
A implementation → R review → same-A fix → V verification → dependent
```

The fixture records all of the following:

- one user kickoff (`initialUserStartPrompts=1`);
- zero fixture-runner activation dispatches and zero fixture-runner phase or
  business prompts;
- eight pump-protected receiver native turn starts: one decision and one
  admitted business turn for each of R, same-A, V, and dependent;
- nine lifecycle native turn starts in total after including the A kickoff,
  each with a distinct bound native turn ID;
- `humanRelayCount=0` and `pollingCount=0`;
- the same native A reference for kickoff and fix;
- a separate V native session and model-selected verification turn;
- trusted finalization persisted before the dependent business turn starts;
- zero dependent turns and effects when finalization is injected to fail;
- zero claims and zero turns for the authorized but irrelevant route;
- every offered cursor committed and every exact scenario artifact removed.

This is the first fixture that demonstrates the product shape the project calls
session initiative: later sessions act because durable authorized lifecycle
state becomes relevant, not because the user or runner submits the next phase.
It remains deterministic policy-mediated behavior, not emergent intelligence.

The boundary fields are part of the evidence, not caveats hidden in prose:

- `liveProductEvidence=false`;
- `deterministicPolicyOracle=true`;
- `externalIndependentVerifier=false`;
- `signer=fixture-owned-ephemeral-key`;
- `eventPumpSelectionDurable=true` as of `711da66`;
- `durablePerDispatchRecordsValid=true` for all five offered events;
- `selectionChainValid=null` and
  `selectionChainScope=global-chain-not-implemented`.

The implementation landed through
[#118](https://github.com/fyaic/threadmesh/pull/118) at
`2a0d8550abc1a8c5dcebceb86d0372ea8d337b4d`,
[#119](https://github.com/fyaic/threadmesh/pull/119) at
`d37cb428ea84b0683dac24787889e259a0a18c71`, and
[#120](https://github.com/fyaic/threadmesh/pull/120) at
`3b91dcff82622a0fed936e8295b77905777c6ada`, and
[#122](https://github.com/fyaic/threadmesh/pull/122) at
`711da6606ac8b0c326f199a96d1713bc7a6de68c`.

The v9 SQLite migration adds durable dispatch and checkpoint records. The v10
migration adds a separate publication lease/fence and version-2 checkpoint
digests while preserving genuine v9 version-1 hashes. The focused recovery
tests cover expired selection-lease takeover, restart after a bound native turn,
restart after settlement but before publication, publication single-entry,
stale-epoch fencing, and completion of a committed publication orphan without
replaying its callback or looking ahead.

These are durable per-dispatch guarantees, not a global ordering chain across
dispatches. OS-level kill recovery, long-turn lease heartbeat, equivalent real
Codex and Kimi runs, and an external verifier remain pending. Passing this
fixture must not be transcribed as a live-product pass or an external-verifier
pass. See the
[exact evidence record](../09-reviews/2026-09-01-m5-2-autonomous-fixture.md).

The deterministic runner now closes and reopens the coordinator at five fixed
checkpoints: operation-bound native start, event creation, adapter receipt,
final verification, and satisfaction. Each reopen compares one state vector
covering messages/dispositions, admissions, adapter submissions, audit,
executions/actions, attention claims and commits, evidence, finalization,
satisfaction, task metadata, dependent revision, and fixture native-turn count;
an exact replay must add nothing. The native-start checkpoint occurs only after
the native turn ID is durably bound. It is not a process crash between native
`turn/start` and that binding.

The adapter now provides a bounded reconciliation observer using
`thread/read(includeTurns:true)` plus a fully paged experimental
`thread/turns/list`, with optional `thread/items/list`. It freezes the complete
pre-start turn projection and client request key. Only one exact-key terminal
delta (`interrupted` or `failed`) can be bound to an abandoned durable intent;
completed, in-progress, zero-delta, missing-key, multi-delta, or inconsistent
observations remain ambiguous and create no receipt, tool action, or retry.
Local Codex `0.145.0` can omit the client key on interrupted turns and does not
support `thread/items/list`, so process-level fault injection and the full live
recovery gate remain open. See the official [Codex App Server
reference](https://developers.openai.com/codex/app-server).

## One-command deterministic rehearsal

Run from a clean checkout:

```sh
npm run validate:m5-2:fake
```

The command runs a scripted A→R→same-A→V plan through an isolated SQLite v7
coordinator, including grants, a bound dependency, exact task admission,
durable turn/tool receipts, evidence promotion, cursor commits, and atomic v7
finalization. Lifecycle-producing tool arguments freeze the exact source event,
the complete bounded outgoing event body (message/type/target/relationship,
content, reason, evidence references, freshness, and causality), and material
commit, finding, or chain coordinates; altered or reused effects fail before
submission. Receiver decision actions bind their result digest to the stable
ack-time projection of message, exact receiver, state, reason code, and decision
revision. The final dependent path additionally requires a completed admission
whose exact adapter-reference digest matches the bound decision execution,
rather than a harness-authored acceptance. It emits these files in a new
temporary directory:

- `private-trace.jsonl`: hash-linked detailed trace, including fixture adapter
  references. It is local audit material and must not be published verbatim.
- `result.json`: bounded public projection with
  `liveProductEvidence=false`. It labels the tool plan and handoff as scripted,
  reports one orchestrator prompt submission after review, and labels the
  verification mode `deterministic-in-process-fixture-signing`.
- `integrated-coordinator.sqlite`: private coordinator audit database.
- `m5-2-recovery-journal.json`: runner-private, mode-`0600`, atomically replaced,
  digest-protected signed verifier bundle and exact finalization arguments. Its
  contents never enter the trace, result projection, or cleanup projection.
- `cleanup-manifest.json`: exact retained-evidence manifest, including the
  journal and machine-checked absence of SQLite WAL, SHM, rollback-journal,
  temporary, and unexpected files. `complete` is derived from those checks.

A fixture `passed` result proves the integrated coordinator happy path, strict
ordering, same-A adapter identity, dependency locked-before/satisfied-after,
the persistent irrelevant skip, and the five controlled coordinator reopens.
The tools and handoffs are scripted, and the orchestrator submits one prompt
after review. The in-process test signer is trusted only inside this fixture and is explicitly reported as
`signedIndependentAttestation=false`. It does not prove model initiative,
independent product verification, process-crash recovery, or a live
integration.

## Real event-pump attempt audit

Run the current live entry point only with explicit maintainer authorization:

```sh
export THREADMESH_M52_EVENT_PUMP_LIVE_ACK=maintainer-approved-threadmesh-m52-event-pump-live
export THREADMESH_CODEX_COMMAND=/absolute/path/to/codex
node scripts/run-m5-2-event-pump-gate.mjs --mode live --artifacts-dir /fresh/owned/directory
```

Eleven bounded attempts are retained. Attempts 1–6 cover the behavioral path;
attempts 7–11 exercise the real Git/child-verifier integration:

| Attempt | Stop | Chain evidence | Cleanup evidence |
|---|---|---|---|
| 1 | Product probe invalid | Preflight rejection only | Not asserted by this record |
| 2 | Timestamp evidence invalid | Adapter-boundary defect only | Not asserted by this record |
| 3 | Operator paused after five session bootstraps | Coordinator task/turn-intent/dispatch counts were `0/0/0`; chain not started | Normal signal cleanup did not run; one-off exact operator cleanup deleted and absence-confirmed five of five sessions and removed temporary resources |
| 4 | Exact lifecycle publication action mismatch after kickoff | Five tasks and one kickoff intent; no pump dispatch | Normal five-of-five session and temporary-resource cleanup |
| 5 | Ambiguous reconciliation during the admitted same-A fix turn | Real chain through reviewer review and same-A acceptance | Normal five-of-five session and temporary-resource cleanup |
| 6 | Completed with expected `threadmesh_m52_independent_verifier_service_pending` product-gate classification | Full real `A -> R -> same-A -> V -> dependent`; one kickoff, nine bound turns, zero later runner prompts/direct activations, irrelevant zero turns | Normal five-of-five session cleanup, coordinator removal, zero journals, and removal of the exact empty artifacts directory |
| 7 | R admitted turn ended before a tool selection | Real A implementation commit and autonomous R route | Complete role/verifier/Git/coordinator cleanup |
| 8 | R admitted turn ended after its detached-checkout read | Real A implementation plus one R read action | Complete role/verifier/Git/coordinator cleanup |
| 9 | R decision turn was terminally reconciled | Real A implementation and R route selection | Complete role/verifier/Git/coordinator cleanup |
| 10 | R admitted turn became ambiguous during a reproduced DNS/TLS endpoint failure | Real A implementation, R acceptance, and admission start | Complete role/verifier/Git/coordinator cleanup |
| 11 | Certificate-verified proxy connectivity passed; R admitted turn still reconciled ambiguously | Real A implementation commit/publication, one R dispatch, and reviewer admitted-turn partial progress | Complete 5/5 role, verifier, Git, coordinator, journal, and caller-owned empty-directory cleanup |

[#126](https://github.com/fyaic/threadmesh/pull/126) and
[#127](https://github.com/fyaic/threadmesh/pull/127) fixed the first two observed
boundaries, but do not retroactively upgrade those attempts. #129 added bounded
signal cleanup, #130 exposed exact coordinator-bound tool contracts, and #131
extended only protected admitted business turns to 300 seconds. Attempt 6 is a
completed `state=blocked` gate result and the first real autonomous behavioral
chain.

The bounded Git-worktree and process-isolated child-verifier foundations are
now wired into this correlated path. Process-scoped proxy configuration restored
certificate-verified Codex HTTP and WebSocket connectivity for attempt 11, so
DNS/TLS is no longer the immediate blocker. The next checkpoint is a bounded
partial-stage manifest and correction for the reviewer reconciliation failure,
then one successful live rerun, the manual relay/polling baseline, and minimum
critical negative/restart evidence. Until those gates pass, no product pass is
claimed.

See the [bounded attempt audit](../09-reviews/2026-09-01-m5-2-real-codex-event-pump-attempt-audit.md)
and [real behavior record](../09-reviews/2026-09-01-m5-2-real-codex-event-pump-behavior.md).

## Historical real product gate

Live commands require an explicit acknowledgement before even a no-model
probe:

```sh
export THREADMESH_LIVE_AGENT_SCENARIO_ACK=maintainer-approved-threadmesh-live-agent-scenario
npm run validate:m5-2:live:codex
npm run validate:m5-2:live:kimi
```

The acknowledgement is checked before a probe, module load, thread creation,
or model turn. The Codex gate implementation is loaded lazily only on the live
Codex route; injected gates exist for tests and cannot affect the deterministic
or Kimi routes.

As of 2026-09-01, both commands are expected to exit `2` with `state=blocked`:

- Codex CLI `0.145.0`: the product canary precreates A, R, V, dependent, and
  irrelevant threads and runs four runner-submitted A→R→same-A→V phase prompts.
  The model must select the bounded tools, the Git chain must be exact, the
  original A thread and worktree must be reused, dependent and irrelevant
  controls must run zero post-bootstrap turns, and all five threads plus the
  fixture must be removed. A completed run is still
  `evidenceClass=real-codex-product-canary`, `state=blocked`, and
  `liveProductEvidence=false`: `phasePromptsSubmittedByRunner=4` and
  `lifecycleHandoffsByThreadMesh=false` make clear that it does not yet show
  lifecycle-driven cross-task initiative.
- Kimi Code `0.39.1`: ACP initialization and persistent session
  create/list/load/delete are available. The current ACP integration does not
  expose bounded dynamic tool callbacks, a pre-effect model-selection receipt,
  or a queryable prompt-submission receipt. The runner creates no session and
  cannot claim an A→R→A→V pass.

The first real Codex canary completed on source base
`1155fc8439d81438a4f6892f4414355f129b0444` as scenario
`m52-real-codex-20260901-01`. It pre-created five roles, completed four real
model turns with seven model-selected tool calls, created the required two
commit direct-parent chain, reused the same A identity and worktree, kept the
dependent and irrelevant controls at zero post-bootstrap turns, and confirmed
five-of-five thread cleanup. The bounded record is preserved in the
[canary evidence document](../09-reviews/2026-09-01-m5-2-real-codex-canary.md).
Its result remains intentionally `blocked`: the runner submitted four phase
prompts, `lifecycleHandoffsByThreadMesh=false`, and
`liveProductEvidence=false`.

The canary reports all six missing closure gates: coordinator attention
routing, receiver-owned decisions, context-admission receipts, durable recovery
checkpoints, independent verifier attestation, and dependency finalization.
Its exact public schema has no attestation, admission, or process-kill fields
that the canary did not prove. A failed model/tool/Git/cleanup attempt is
`failed`, not `blocked`, and still writes bounded result and cleanup artifacts.

`blocked` is an intentional safety result, not a fixture failure. Only the
separate `real-codex-integrated-gate` schema can ever produce
`liveProductEvidence=true`, and only when every correlated initiative,
identity, recovery, independent verification, negative-control, and cleanup
invariant is present. Unknown fields, raw thread/turn identifiers, paths,
idempotency keys, prompts, or unsafe scenario identifiers are rejected rather
than copied into public output.

## Scenario and evidence rules

- R never receives the sealed expected finding. Its general finding fields are
  validated against the detached implementation and contract.
- Review context is untrusted peer context. A fix may occur only in the
  original A task and worktree.
- The private trace records tool selection before callback effects and tool
  completion afterward.
- Prompts, prose, fixture plans, and record counts are not authorization to
  unlock a dependency.
- A live result must remain blocked if any restart checkpoint, receipt,
  identity binding, cleanup absence check, or real irrelevant control is
  missing.

## Cleanup and risk

The rehearsal creates no product threads or sessions. Its hash-linked trace,
result, cleanup manifest, SQLite evidence database, and private recovery
journal remain in the explicitly reported artifacts directory. The directory
must be fresh; an existing database, journal, or SQLite sidecar is never
deleted or overwritten. Product live mode must never use the fixture runtime
under a Codex or Kimi label. Kimi quota or authentication problems are
reported as blocked preconditions; they must not be rewritten as successful
compatibility evidence.

At `c17c837`, the repository baseline is 378 tests, 55 schema cases, and 7
transition cases. These are three separate validation counts; documentation
lint also passes.
