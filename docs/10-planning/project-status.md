# Project status

> Snapshot: 2026-09-01 at `main` commit
> `711da6606ac8b0c326f199a96d1713bc7a6de68c`. Technical evidence includes the
> deterministic no-plan autonomous fixture and the earlier real Codex M5.2
> model/tool canary. Neither is a real autonomous M5.2 product pass.

## Executive summary

ThreadMesh is a pre-alpha protocol and reference-runtime experiment. The
repository has progressed beyond documentation-only research: it contains
machine-readable schemas, deterministic conformance fixtures, an authenticated
local JSON-RPC binding, an experimental SQLite coordinator, and conservative
ACP, Codex App Server, and Gemini headless adapters. All three have real
no-model product evidence and share one deterministic coordinator-mediated
validation runner. The maintainer has authorized bounded real-product
experiments. Real model paths count only when their bounded result and
limitations are recorded.

The implementation is not a production coordinator. One real Codex-to-Kimi
case now establishes a bounded cross-product integration path, but not general
interoperability, hostile-peer safety, or production reliability. The normative
M0 blockers are resolved; M0 remains open only for two independent reviews,
including one outside the maintainer organization.

The current product gap is sharper than the technical gap. ThreadMesh has no
independent adopter, and its one-message demonstration does not yet remove a
meaningful workflow burden. The active mainline is therefore an
[attention and handoff router](product-mainline-2026-08-28.md): a one-command,
observable implementation/review/fix loop that eliminates manual relay and
polling while preserving receiver control. Protocol expansion and general
orchestration are paused until this outcome is demonstrated.

## Evidence ledger

| Area | Current evidence | Status |
|---|---|---|
| Research and problem framing | Codex deep dive, community signals, ecosystem comparison, ADRs | Established |
| Community adoption | No external stars, forks, watchers, issue comments, or independent setup result as of 2026-08-28 | Unvalidated |
| Active product outcome | One-command lifecycle-event and dependency-handoff loop with an inspector | Deterministic autonomous A/R/same-A/V/dependent fixture merged; real Codex M5.1 seam passed; real autonomous M5.2 product loop pending |
| Protocol draft | 14 JSON Schemas; 55 schema cases; 7 transition cases; 360 tests | Executable draft; counts are reported separately |
| Minimal adapter SDK | `@fyaic/threadmesh` `0.1.0-alpha.0`; six bounded client methods, per-turn proactive bridge, about 20 kB tarball, packed-consumer execution | Real Pi clean-consumer pass; not published to npm |
| Local binding | Schema-validated JSON-RPC, transport-derived principals, typed errors | Executable local reference |
| Local persistence | SQLite v10 registry, lifecycle state, append-only Git evidence, and durable per-dispatch event-pump selection/publication checkpoints | Experimental; global cross-dispatch pump chain absent |
| Safety boundary | Authenticated authorship checks, effective-grant decisions, revocation, CAS | Executable local policy |
| ACP adapter | ACP v1 initialize, session create/load, prompt aggregation, permission denial, timeout cleanup | Experimental |
| Kimi Code | CLI 0.38.0 handshake plus exact create/list/delete/absence lifecycle | Real no-model preflight passed |
| Live Kimi model behavior | CLI 0.38.0 accepted one coordinator suggestion, returned the exact marker, and passed deletion plus absence verification at `b248343` | Real maintainer-experimental pass |
| Codex App Server | CLI 0.145.0, 273 generated-schema files, JSONL handshake, empty read-only thread start | Real no-model preflight passed |
| Codex live model behavior | Exact marker, evidence, audit, persisted resume path, and exact thread cleanup at `0dda5a7` | Real maintainer-experimental pass |
| Codex proactive A-to-B | A selected related-task discovery and one bounded send; B consumed admitted context; both tasks deleted at `248d650` | Real maintainer-experimental positive-case pass |
| Codex scored behavior gate | Control score 0; relevant score 1 with one send; irrelevant performed one lookup and no send; all tasks deleted at `0dd2c82` | First real outcome/interference pass |
| Codex repetition matrix | Control 3/3; relevant 1/3; irrelevant 2/3 with one inconclusive marker failure; exact leaked bootstrap thread manually removed and cleanup regression merged in #64 | Default enablement rejected |
| Two-stage Codex behavior flow | Relevant 3/3; fresh control zero tools/sends; fresh irrelevant one read-only lookup and zero sends; all A/B cleanup complete | Bounded M3 case passed; explicit experimental opt-in only |
| Codex-to-Kimi proactive flow | Codex A selected discovery and one send; persistent Kimi ACP B completed; exact A deletion and B delete/absence passed at `e0adb0e` | First real cross-harness proactive case passed |
| Pi integration-kit flow | Fresh packed consumer exposed exactly two native tools; real Pi passed relevant/irrelevant/control behavior and supplied one admitted input to Kimi at `02d8d24` | Maintainer integration passed; independent human feedback pending |
| Codex M5 attention seam | Real persistent A model-selected discovery/publication; durable cursor resumed the pre-created persistent B exactly once; local verification unlocked the dependency and restart recovered B as ready at `3d5caee` | M5.1 passed; logical wake only, local verifier simulation; M5.2/M5.3 pending |
| M5.2 Git evidence foundation | Independent temporary bare repo and role worktrees, same-worktree implementer fix, SQLite v5 evidence chains, SQLite v6 turn/cursor recovery, SQLite v7 bound verifier-only atomic unlock, private signed-result recovery journal, five controlled coordinator-reopen checkpoints, and a preconfigured-key child verifier bound to exact commits/finding/test | Deterministic safety, persistence, model-action receipt, authority, and coordinator-reopen recovery seams passed; integrated process-crash recovery and coordinator-driven real loop pending |
| M5.2 real Codex model/tool canary | Five persistent roles; four real A/R/same-A/V turns; seven model-selected tool calls; exact two-commit chain; same-A identity/worktree; dependent and irrelevant zero-turn controls; five-of-five cleanup on base `1155fc8` | Canary completed; intentionally `blocked` with `liveProductEvidence=false` because the runner submitted four phase prompts and ThreadMesh performed no lifecycle handoff |
| M5.2 autonomous no-plan fixture | One user kickoff; durable SQLite attention drives A→R→same-A→V→dependent; zero fixture-runner activation dispatches or phase/business prompts; zero manual relay and polling; pump starts protected receiver turns; trusted finalization precedes dependent turn; exact cleanup | Deterministic in-process fixture at `711da66`; per-dispatch recovery durable, global chain absent; OS kill/heartbeat/live products/external verifier pending |
| Gemini CLI headless | Official package 0.56.0 integrity, required flags, isolated-home cleanup | Real no-model preflight passed |
| Gemini live model behavior | Exact marker script requires explicit provider key | Not authorized, not run |
| Multi-product admission | One mailbox/acceptance/claim/evidence path across ACP, Codex, and Gemini fakes | Merged experimental implementation |
| Product validation runner | Built-in bootstrap, isolated exact-main worktree, start/end SHA checks, bounded child evidence, acknowledgement, marker, audit, and cleanup | Fake-all plus real Codex and Kimi passed |
| External-review gate | GitHub-authenticated canonical review/disposition blocks, merged-fix ancestry, reviewer diversity, and target ancestry | Mechanically awaiting 2 records |
| Independent review | Three internal lanes complete; external reviewer packet and public template published | Awaiting two external verdicts |
| Production authentication | Local static-token reference; no TLS/OAuth verifier supplied | Host integration required |
| OS isolation | No child-process sandbox supplied by ThreadMesh | Not implemented |
| Steer and interrupt | Not advertised by the ACP prototype | Intentionally unsupported |
| Interruption result | Per-target model/tool/process schema; no umbrella success | Normative, no live cancellation adapter yet |
| External verification | Signed attestation schema plus real Ed25519 conformance proof | Normative, conformance trust anchor only |
| Cross-harness conformance | Pull-mailbox and event-watching mock profiles over JSON-RPC | Local behavior demonstrated |
| Event stream and inspector | Restart checkpoint, strict local cursor order, provenance, authorization-aware redaction | Merged experimental implementation |
| M1 behavior matrix | Two capability-valid mock profiles, related discovery, notify/suggest decisions, stale/unsupported state change, revocation, cleanup | Merged conformance implementation |
| Retention purge | Schema v3 tombstones, policy-only bounded operation, unknown-effect exclusion, replay preservation, WAL checkpoint | Merged experimental implementation |

## Milestone accounting

GitHub is authoritative for milestone closure.

### M0 — Foundation and protocol draft

- 10 issues closed, including all normative review blockers
  [#15](https://github.com/fyaic/threadmesh/issues/15),
  [#17](https://github.com/fyaic/threadmesh/issues/17),
  [#18](https://github.com/fyaic/threadmesh/issues/18),
  [#19](https://github.com/fyaic/threadmesh/issues/19), and
  [#16](https://github.com/fyaic/threadmesh/issues/16).
- 1 issue open: [#7](https://github.com/fyaic/threadmesh/issues/7).
- Exit is blocked only by two independent reviews, including at least one
  outside the maintainer organization.

### M1 — Local reference coordinator

The implementation stack was squash-merged by PR #45 and revalidated on
`main`. Issues #9–#14 and #34 were closed by that integration PR. This merge is
a maintainer-approved experimental implementation decision; it does not turn
the still-open M0 external-review requirement into a satisfied review.

- All seven implementation issues #9–#14 and #34 are closed.
- The merged implementation includes versioned migrations and rollback,
  registry/mailbox/audit, fail-closed relationship policy, atomic
  proposal-to-grant approval, crash-safe dispatch and reconciliation, event
  inspection, two-profile conformance, and retention-driven tombstoning.
- The superseded stacked PRs #28–#35 are closed; PR #45 is the authoritative
  integration history.
- Hosted event streaming remains unfinished and is not required by an existing
  M1 acceptance issue.
- The GitHub M1 milestone is closed with all seven issues complete.

### M2 — First real adapters

The adapters and unified runner are merged. Real Codex and Kimi products now
pass the same receiver-accepted suggestion path. Maintainer-experimental results
remain distinct from normative M0 evidence.

- Codex issue #36 passed at `0dda5a7`; Kimi issue #37 passed at `b248343` with
  CLI `0.38.0`; Gemini #38 is no longer an active competing branch. Shared
  admission #42 and runner #44 are closed.
- PR #45 merged the complete adapter/runner stack. Superseded stacked PRs
  #39–#43 are closed.
- The Codex implementation includes suggestion-only capability negotiation,
  receiver-acceptance enforcement, exact turn evidence, server-request denial,
  timeout cleanup, generated-schema digesting, and a real no-model product
  preflight.
- The Kimi implementation hashes the exact binary, timestamps each
  run, verifies one real session through create/list/delete/list, and separates
  the gated live marker from the default no-model preflight.
- Gemini CLI headless `stream-json` is selected for #38 after the repository's
  Copilot assignability checks returned unavailable. The official pinned package
  passes a no-model version/flag/integrity probe and its fake-product matrix;
  no Google account or API key was inferred or created.
- ACP, Codex, and Gemini consume the same claimed envelope and admission
  projection, then confirm with strict kind-specific evidence.
- Codex `0.145.0` does not persist an empty thread before its first turn. The
  live driver therefore keeps create plus a bounded local bootstrap turn on one
  connection, without presenting it as peer context, then separately validates
  the coordinator-accepted suggestion and exact-thread deletion.
- The M2 milestone is closed: real Codex App Server and Kimi ACP behavior ran
  through the merged coordinator, while Gemini live remains explicitly
  optional.

### Active product gates

The three product reset gates are complete: scored Codex behavior, minimal
zero-dependency adapter SDK, and a real Kimi ACP portability pass. Three Codex
repetitions subsequently rejected default enablement because the relevant path
passed only 1/3. The shorter reliability benchmark is now merged: it combines
A creation and autonomous decision into one turn and uses B's missing-dependency
result as the bootstrap baseline. Real control and irrelevant conditions pass;
the redundant A text marker has been replaced by actual tool/send evidence. A
two-stage discovery/send policy then passed relevant 3/3, with fresh control
and irrelevant runs preserving zero-send behavior and complete cleanup. The
bounded #53 acceptance case qualifies for explicit maintainer-experimental
opt-in use. Cross-harness proactive issue #74 then passed with Codex A and Kimi
B on the existing coordinator and adapters. Issue #77 then added the minimal
installable proactive bridge, per-turn budgets, reproducible harness example,
and a packed external-consumer test without expanding protocol surface. The
remaining M4 product task is independent harness-author feedback. Issue #7
remains parallel governance. Hostile-worker schema
issue #48, optional Gemini live validation, and further production hardening are
deferred.

### M5 — Attention and handoff router MVP

The active product milestone is open with five outcome-oriented issues:

- one-command demo [#89](https://github.com/fyaic/threadmesh/issues/89);
- lifecycle events and dependency routing
  [#90](https://github.com/fyaic/threadmesh/issues/90);
- real Codex closed loop [#91](https://github.com/fyaic/threadmesh/issues/91);
- minimal inspector and visual evidence
  [#92](https://github.com/fyaic/threadmesh/issues/92);
- cross-harness repetition [#93](https://github.com/fyaic/threadmesh/issues/93).

M5 is intentionally smaller than a general orchestration milestone. Its exit
criterion is measurable removal of manual relay and polling while preserving
receiver control, not broader protocol coverage.

The 2026-08-31 deterministic vertical slice now runs the required
implementation/review/fix event sequence with stable routing and unlock reason
codes, durable dependency/event binding, coordinator-configured trust roots,
restart recovery, a package-installed CLI, a redacted inspector, and complete
temporary-state cleanup. It is deterministic product integration evidence, not
by itself evidence of real Codex initiative: the participants are scripted.

M5.1 has now passed separately on real Codex CLI/App Server `0.145.0` with
`gpt-5.6-sol`. A persistent Agent A selected the two ThreadMesh tool calls, a
durable cursor event resumed the already-created persistent Agent B exactly
once, local simulated verification satisfied the edge, and restart recovered B
as `ready`, with zero manual relay, scripted submit, or model polling turns and
complete exact cleanup. This is a ThreadMesh logical wake, not native Codex
idle push, and it does not satisfy the M5.2 multi-role loop or M5.3 closure
matrix. See the
[public evidence record](../09-reviews/2026-08-31-codex-attention-live.md).

The first M5.2 foundation slice now isolates bounded fixture commits from the
source repository and preserves one prospective implementer worktree across the
fix,
checks exact reviewer and verifier commits, and permits the final evidence stage
only through a preconfigured-key child verifier whose signed response survives
JSON replay validation. It also rejects alternate keys, cross-chain replay,
wrong parents/tree/diff/finding/test bindings, writable-test substitution, path
escape, source `.git` placement, and incomplete cleanup. This is deterministic
safety infrastructure. SQLite schema v5 now persists its immutable requirement
and four-stage records, freezes the three Codex adapter bindings and task
revisions, atomically advances a materialized revision/head with CAS, detects
suffix truncation and schema-constraint drift, and fully replays the signed
chain after restart. SQLite schema v6 now persists the native turn boundary,
pre-effect model tool selection, post-effect result, completed adapter receipt,
unknown-outcome reconciliation, exact stage publication, and exclusive receiver
cursor claim/commit. A crash cannot invent a tool call or blindly repeat a
known-started turn, and a completed handler effect can retry without starting a
second model turn. SQLite schema v7 adds an immutable one-to-one chain-to-edge
binding and rejects generic satisfaction for a bound edge. Its verifier-only
finalizer requires completed promoted publication actions for the first three
stages and a completed-turn-bound exact-chain tool result for the fourth, then
atomically appends final evidence, promotes the turn, verifies the accepted
disposition, satisfies the edge, and persists their unified replay identity.
This closes the deterministic trusted-chain consumption seam. The first real
Codex model/tool canary has now also completed the bounded
implementation/review/same-session-fix/verification sequence: five roles, four
turns, seven model-selected tool calls, two directly related commits, exact
same-A reuse, zero-turn dependent and irrelevant controls, and five-of-five
cleanup. It remains a canary rather than the M5.2 product result because the
runner supplied all four phase prompts, ThreadMesh supplied no lifecycle
handoff, and the dependent stayed locked. See the
[public evidence record](../09-reviews/2026-09-01-m5-2-real-codex-canary.md).

Four merged PRs now close the deterministic coordinator-driven variant:

- [#118](https://github.com/fyaic/threadmesh/pull/118), exact merge
  `2a0d8550abc1a8c5dcebceb86d0372ea8d337b4d`, added no-plan receiver-owned
  decision/admission activation;
- [#119](https://github.com/fyaic/threadmesh/pull/119), exact merge
  `d37cb428ea84b0683dac24787889e259a0a18c71`, added the bounded in-process
  autonomous event pump and isolated scenario-owned artifacts;
- [#120](https://github.com/fyaic/threadmesh/pull/120), exact merge
  `3b91dcff82622a0fed936e8295b77905777c6ada`, closed V and dependent routing,
  required trusted finalization before the dependent turn, and bound
  preverified admission to exact durable provenance.
- [#122](https://github.com/fyaic/threadmesh/pull/122), exact merge
  `711da6606ac8b0c326f199a96d1713bc7a6de68c`, persisted per-dispatch selection,
  turn settlement, and publication recovery with leased and fenced ownership.

The resulting fixture has one explicit user kickoff. SQLite lifecycle attention
then drives `A → R → same-A → V → dependent` without fixture-runner activation
dispatch, fixture-runner phase/business prompts, manual relay, or polling. The
pump itself starts eight protected receiver native turns: one decision and one
admitted business turn for each later role. The irrelevant route has no claim
and no native turn. Trusted finalization is persisted before the dependent turn
starts; injected finalization failure starts zero dependent turns. Cleanup
verifies absence of all five roles, journals, the private run root, and SQLite
files. This demonstrates bounded session initiative under a deterministic
policy; it is not a claim of emergent intelligence.

At `711da66`, the pump durably binds each exact event, registry, scenario,
handler, route, owner epoch, selection, turn, and publication checkpoint.
SQLite v9 introduced the per-dispatch records; v10 adds publication ownership
and a versioned checkpoint digest without rewriting genuine v9 hashes. Tests
reopen selected and completed dispatches, replay publication without a new
turn, fence stale publication epochs, and finish a committed publication orphan
before considering a later head.

The public result remains deliberately limited:
`liveProductEvidence=false`, `deterministicPolicyOracle=true`,
`externalIndependentVerifier=false`, and signer
`fixture-owned-ephemeral-key`. Per-dispatch selection/publication recovery is
durable, but a global cross-dispatch chain is absent and reports
`selectionChainValid=null`. OS-kill recovery, long-turn lease heartbeat, and
equivalent real Codex and Kimi runs with an external verifier remain pending.
See the [autonomous fixture evidence](../09-reviews/2026-09-01-m5-2-autonomous-fixture.md)
and [durable recovery record](../09-reviews/2026-09-01-m5-2-durable-pump-recovery.md).

The Codex context-admission turn now uses the same private pre-turn baseline,
fsynced journal, exact client key, and read-first restart boundary. The journal
binds the coordinator-prepared token, message, revision, registered adapter
reference, and exact shared deterministic prompt. A known pre-start failure
durably retires the journal; after a possible start, only one exact
`interrupted` or `failed` turn may reconcile. Completed, zero, missing-client,
or multiple deltas remain ambiguous and never resend. Coordinator-backed tests
prove successful receipt/evidence can confirm the exact claim, while terminal
recovery leaves it unconfirmed. This remains deterministic recovery evidence,
not a killed-process or live-product pass.

## What the prototype proves

The current tests support the narrower claim that a local authenticated binding
can:

1. register, attach, and CAS-rotate task incarnations;
2. separate agent proposals from owner/policy effective grant decisions;
3. recompute grant integrity and reject authorship or principal forgery;
4. persist and replay-protect operations and coordination envelopes;
5. quarantine revoked content, then claim and acknowledge authorized mailbox work;
6. publish and reauthorize grant-projected summaries;
7. recover two public-path mock harness profiles after SQLite restart;
8. persist a native submission's pre-call `outcome-unknown` boundary and stable
   adapter idempotency key;
9. recover unknown attempts after restart without automatic redelivery;
10. store an exact adapter receipt atomically with disposition CAS, reject a
    conflicting receipt, and permit retry only after evidence-backed
    confirmed-not-submitted reconciliation;
11. create one durable adapter admission claim bound to grant and evidence;
12. load the registered ACP session without mixing historical replay into the
   new turn;
13. confirm context admission only after matching adapter evidence;
14. preserve an audit trail across restart;
15. reject umbrella interrupt success and require explicit model-turn,
    tool-call, and subprocess coverage;
16. reject arbitrary evidence, adapter-forged attestations, tampered digests,
    invalid signatures, and untrusted verifier keys.
17. default-deny missing, revoked, expired, stale-incarnation, superseded, and
    insufficient-authority policy cases without disclosing hidden grant state;
18. atomically invalidate queued state-changing work when its grant is revoked,
    while preserving unknown external attempts for reconciliation.
19. dispatch one idempotency-bound native call, persist the exact receipt, and
    suppress retry after ambiguous error or restart;
20. reject stale run/objective/checkpoint snapshots at admission and immediately
    before dispatch, and persist explicit decision/failure reasons.
21. resume a strictly ordered local event cursor after SQLite restart and render
    authorized provenance without leaking revoked content or raw audit detail.
22. run the complete M1 scenario matrix across an event watcher and pull-mailbox
    receiver with explicit capability degradation and per-transition audit.
23. tombstone expired sensitive content without losing replay defense, scrub
    retired adapter references, and preserve unresolved-effect evidence.
24. negotiate the real Codex App Server protocol, start an empty read-only
    thread, and reproduce generated-schema and initialize snapshot digests.
25. reject unaccepted Codex suggestions, delimiter attacks, malformed JSONL,
    server-initiated gate requests, and unresponsive child processes in a
    deterministic fake-product matrix.
26. probe the official pinned Gemini CLI package without a model turn, isolate
    its home, validate a non-ACP stream-json adapter, and refuse unaccepted or
    tool-using marker scenarios.
27. run the same receiver-accepted suggestion through one durable admission
    claim across ACP, Codex, and Gemini fake products, rejecting cross-kind or
    mismatched evidence and storing only bounded audit projections.
28. run one reusable validation entry point across all three fake products,
    requiring mailbox acknowledgement, exact markers, evidence confirmation,
    bounded audit, and exact product-resource cleanup while refusing live turns
    without the external-review acknowledgement;
29. reject self-authored or semantically reversed external-review records by
    resolving exact issue-#7 comments and comparing canonical reviewer and
    disposition blocks, including merged-fix ancestry;
30. prevent every repository-provided live alias from starting a model unless a
    built-in bootstrap re-executes from a detached worktree at verified GitHub
    `main` and the same SHA remains clean at completion;
31. atomically approve a relationship proposal and install its single grant,
    rolling both back if the proposal CAS fails;
32. reject Gemini terminal error results even when their stream contains the
    marker, and preserve caller-owned temporary roots during cleanup.
33. reject a child that prints a forged pass before timing out or receiving a
    signal, and bind every accepted live result to its exit code, product,
    repository SHA, review gate, admission, exact marker, and cleanup evidence.
34. let a real persisted Codex Agent A select relationship discovery and one
    bounded suggestion without harness-scripted submit, admit it to a real
    persisted Agent B, and delete both exact tasks.
35. install the minimal SDK from its packed tarball and run registration,
    relationship-scoped discovery, bounded suggestion, mailbox claim/decision,
    deferral/reconsideration, and stable remote error projection through the
    authenticated JSON-RPC binding.
36. load a real Kimi `0.38.0` ACP session with one coordinator-accepted
    suggestion, confirm bounded context-admission evidence, and delete plus
    list-confirm the exact session as absent.
37. let real Codex CLI `0.145.0` Agent A autonomously discover one authorized
    dependency and send once to a persistent real Kimi Code `0.38.0` ACP Agent
    B, observe the expected downstream outcome, delete A, and delete plus
    absence-verify B.
38. install the packed SDK and CLI in a fresh consumer project,
    expose only host-configured related tasks as model tools, enforce
    discovery-before-send and per-turn budgets, then complete one bounded
    suggestion without importing coordinator or validation internals.
39. let real Pi `0.84.2` with `zai/glm-5.3` consume only the public SDK,
    select discovery and one send for a relevant task, remain silent after an
    irrelevant lookup and in a no-contact control, then supply one advisory
    release input to real Kimi Code `0.38.0` with audited admission and complete
    cleanup.
40. let real persistent Codex Agent A model-select relationship discovery and
    dependency publication, reconcile the resulting durable cursor event to
    resume the pre-created persistent Agent B exactly once, bind its accepted
    receiver turn to locally simulated verification, satisfy the dependency,
    recover B as ready after restart, and clean up both exact threads without
    user relay, scripted submit, or model polling turns.
41. start the deterministic no-plan fixture once, then let durable lifecycle
    attention drive A/R/same-A/V/dependent with zero runner phase dispatch,
    zero irrelevant turns, pre-turn trusted finalization, fail-closed
    finalization negatives, and exact cleanup.

It does not prove general autonomous discovery across unrelated tasks, outcome
improvement, acceptable receiver-interference cost, native provider-role
isolation, exactly-once external effects, production remote credential
verification, safe interruption, managed backup expiry, or forensic erasure.
The mailbox lease also remains task-scoped rather than worker-scoped, and crash
recovery for a lost in-flight admission token still requires manual
reconciliation. Strict public-result projection and adapter-kind-specific
cleanup/evidence validation are implemented for the trusted exact-checkout
child; a hostile-worker boundary is not claimed.

## Progress rule

An implementation demonstration may inform a normative issue, but it does not
close that issue until its public schema, operation semantics, negative cases,
and review evidence satisfy the issue acceptance criteria.

The [milestone acceptance audit](acceptance-audit.md) maps every open M1/M2
criterion to current evidence and explicitly separates candidate, merge-pending,
blocked, and not-run states.
