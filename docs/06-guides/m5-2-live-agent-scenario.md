# M5.2 persistent-agent scenario runner

This runner prepares the product-evidence boundary for the persistent
implementer A, independent reviewer R, same-A fix, and independent verifier V
scenario. It does not yet provide M5.2 pass evidence.

## Current gate

The deterministic fixture is runnable. Real Codex and Kimi modes perform an
auth-preserving, no-model capability probe and then fail closed as `blocked`.
They cannot return `passed` until the coordinator glue and trusted finalization
path machine-verify this sequence:

1. a lifecycle event is durably created;
2. the receiver claims only its next cursor event;
3. a receiver-owned model turn selects accept or defer;
4. accepted context obtains an admission receipt;
5. the exact registered receiver task is resumed;
6. the completed turn is bound and its model-selected effect is promoted;
7. only then is the receiver cursor committed;
8. the signed final chain is replayed and atomically finalized before any
   dependency satisfaction.

Required restart checkpoints are event-created, native-started,
receipt-recorded, final-verification, and satisfaction. An authorized but
irrelevant task must receive zero wake and zero model turn.

## One-command deterministic rehearsal

Run from a clean checkout:

```sh
npm run validate:m5-2:fake
```

The command creates an isolated bare Git repository and role worktrees, runs a
deterministic A→R→same-A→V tool plan, verifies the direct descendant, and
removes all scenario resources. It emits three files in a new temporary
directory:

- `private-trace.jsonl`: hash-linked detailed trace, including fixture adapter
  references. It is local audit material and must not be published verbatim.
- `result.json`: bounded public projection. Its claim is always
  `runner-contract-only-not-product-evidence` and
  `liveProductEvidence=false`.
- `cleanup-manifest.json`: per-role deletion and exact fixture-absence checks.

A fixture `passed` result proves runner ordering, bounded Git behavior, trace
integrity, the same-A identity assertion, the irrelevant zero-wake control,
and cleanup. It does not prove model initiative or a product integration.

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
  identity binding, cleanup absence check, or irrelevant control is missing.

## Cleanup and risk

The rehearsal removes the isolated bare repository, implementer/reviewer/
verifier worktrees, and role sessions. Evidence remains only in the explicitly
reported artifacts directory. Product live mode must never use the fixture
runtime under a Codex or Kimi label. Kimi quota or authentication problems are
reported as blocked preconditions; they must not be rewritten as successful
compatibility evidence.
