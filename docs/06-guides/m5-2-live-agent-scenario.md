# M5.2 persistent-agent scenario runner

This runner prepares the product-evidence boundary for the persistent
implementer A, independent reviewer R, same-A fix, and independent verifier V
scenario. It does not yet provide M5.2 pass evidence.

## Current gate

The deterministic fixture now runs the happy path through a real isolated
SQLite v7 coordinator. Real Codex and Kimi modes perform an
auth-preserving, no-model capability probe and then fail closed as `blocked`.
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

It also registers an authorized-but-irrelevant task and proves zero model turns
and a zero cursor for that control. This is a scripted integration fixture, not
evidence of model initiative or an independent verifier service.

Restart closure remains deliberately open. In particular, the adapter has no
query/reconcile surface for a crash after native `turn/start` but before the
operation binding is stored, and the database stores only the final verifier
result digest, not enough signed response material to reconstruct finalization
after a runner restart. A private durable verifier-result journal and the full
event-created/native-started/receipt/final-verification/satisfaction fault
matrix are required before live mode can run.

## One-command deterministic rehearsal

Run from a clean checkout:

```sh
npm run validate:m5-2:fake
```

The command runs a scripted A→R→same-A→V plan through an isolated SQLite v7
coordinator, including grants, a bound dependency, exact task admission,
durable turn/tool receipts, evidence promotion, cursor commits, and atomic v7
finalization. Lifecycle-producing tool arguments freeze the exact source event,
outgoing message/type/target/relationship, and material commit, finding, or
chain coordinates; altered or reused effects fail before submission. The final
dependent path uses its own durable decision and admission receipt rather than
a harness-authored acceptance. It emits these files in a new temporary
directory:

- `private-trace.jsonl`: hash-linked detailed trace, including fixture adapter
  references. It is local audit material and must not be published verbatim.
- `result.json`: bounded public projection with
  `liveProductEvidence=false`. It labels the tool plan and handoff as scripted,
  reports one orchestrator prompt submission after review, and labels the
  verification mode `deterministic-in-process-fixture-signing`.
- `integrated-coordinator.sqlite`: private coordinator audit database.
- `cleanup-manifest.json`: exact retained-evidence manifest.

A fixture `passed` result proves the integrated coordinator happy path, strict
ordering, same-A adapter identity, dependency locked-before/satisfied-after,
and the irrelevant zero-turn control. The tools and handoffs are scripted, and
the orchestrator submits one prompt after review. The in-process test signer is
trusted only inside this fixture and is explicitly reported as
`signedIndependentAttestation=false`. It does not prove model initiative,
independent product verification, restart safety, or a live integration.

## Real product preflight

Live commands require an explicit acknowledgement before even a no-model
probe:

```sh
export THREADMESH_LIVE_AGENT_SCENARIO_ACK=maintainer-approved-threadmesh-live-agent-scenario
npm run validate:m5-2:live:codex
npm run validate:m5-2:live:kimi
```

As of 2026-08-31, both commands are expected to exit `2` with `state=blocked`:

- Codex CLI `0.145.0`: app-server initialization, persistent thread creation,
  resume, and dynamic tool callbacks are available. The missing boundary is
  ThreadMesh's event/cursor/admission/finalization glue. The runner starts no
  model turn and creates no thread while this gate is closed.
- Kimi Code `0.39.1`: ACP initialization and persistent session
  create/list/load/delete are available. The current ACP integration does not
  expose bounded dynamic tool callbacks, a pre-effect model-selection receipt,
  or a queryable prompt-submission receipt. The runner creates no session and
  cannot claim an A→R→A→V pass.

`blocked` is an intentional safety result, not a fixture failure. Do not change
the projection to `passed` merely because a CLI is installed or a deterministic
agent returned the expected tool plan.

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
result, cleanup manifest, and SQLite evidence database remain in the explicitly
reported artifacts directory. Product live mode must never use the fixture
runtime under a Codex or Kimi label. Kimi quota or authentication problems are
reported as blocked preconditions; they must not be rewritten as successful
compatibility evidence.
