# Mainline plan

## Goal

Prove that a user can run several durable agent sessions without acting as
their clipboard, status poller, or handoff scheduler.

The protocol, coordinator, real Codex/Kimi path, proactive behavior gate, and
minimal SDK are now evidence foundations rather than the product destination.
The active critical path is the
[attention and handoff router plan](product-mainline-2026-08-28.md): one-command
onboarding, typed lifecycle events, dependency-aware routing, a visible
inspector, and an independently repeated implementation/review/fix loop.

Normative M0 review remains a parallel governance track. Maintainer-authorized
experiments are explicitly labeled and do not satisfy it.

## Active critical path — 2026-09-01

M5.2 remains the only implementation critical path, but its next checkpoint is
behavioral evidence rather than infrastructure closure. The repository now has
enough deterministic substrate to ask the product question directly: can real
Codex sessions complete `A -> R -> same-A -> V -> dependent` after one user
kickoff while the runner supplies no later phase prompt or direct activation?

The older product canary proved real multi-tool turns, same-A reuse, a bounded
Git chain, controls, and cleanup, but its four prompts were runner-submitted.
The newer event-pump gate has not completed a live chain. Its three attempts
stopped at product-probe validation, timestamp evidence validation, and an
operator pause after five-session bootstrap respectively. The paused attempt
had zero coordinator tasks, turn intents, and pump dispatches before five of
five sessions and exact temporary resources were cleaned.

Execute in this order:

1. Close the already observed bounded SIGINT/SIGTERM cleanup gap, then run the
   current `c17c837` event-pump surface fresh. Do not add another prerequisite
   that was not exposed by a live run.
2. Retain exact real session, native-turn, model-action, durable-dispatch,
   dependent-ordering, irrelevant-control, and cleanup evidence. The required
   behavioral counts are one kickoff, zero runner phase/business prompts or
   direct activation dispatches, eight protected receiver turns, and nine total
   bound native turns.
3. Publish the bounded attempt as `blocked`, `failed`, or `not-run`. A completed
   chain remains `blocked` and `liveProductEvidence=false` while verifier
   custody and Git effects are simulated.
4. Only after that chain is retained, reuse the existing bounded Git worktree
   and verifier foundations in the same correlated run, add the manual
   relay/polling baseline and minimum critical negative/restart case, and close
   #91 when its original product outcome is satisfied.
5. Then resume repetition, Kimi parity, and production-hardening evidence.

Mainline guardrail: do not add a new substrate or generalize an existing one
unless the current live chain demonstrates that it is the blocking condition.
OS-kill matrices, long-turn heartbeat, a global cross-dispatch chain, new
harnesses, A2A/Cotal work, hosted operation, and presentation-only polish are
paused. Small PRs remain acceptable; scope, not PR size, is the constraint.

The detailed historical gates remain in the
[real Codex scenario plan](m5-2-real-codex-scenario.md). The
[event-pump attempt audit](../09-reviews/2026-09-01-m5-2-real-codex-event-pump-attempt-audit.md)
is the canonical live-attempt status until a fresh run supersedes it.

## Product sequence — 2026-08-28

1. Define the flagship closed-loop demo using existing primitives and the six
   product events: `completed`, `blocked`, `needs-input`, `review-failed`,
   `artifact-ready`, and `dependency-satisfied`.
2. Ship a one-command local demo with generated identities/grants and no manual
   task-ID or token setup.
3. Add dependency-aware routing that requires receiver admission and verified
   state before unlocking downstream work.
4. Show the loop and every routing decision in a minimal inspector.
5. Validate once Codex-first, once across Codex and an ACP harness, and then
   with three independent operators.

Success is measured by zero manual relay, zero polling loops, zero irrelevant
wakes, correct verification/authority handling, and time to first value under
15 minutes. New protocol intentions, general orchestration, production hosting,
and further internal review loops are off the critical path.

## Completed foundation workstreams

### 1. Make the schema vocabulary coherent

Primary issue: [#18](https://github.com/fyaic/threadmesh/issues/18).

Status: completed in the M0 coherence change. The draft now binds task-summary
projections to grant versions, constrains relationship direction, decision
reasons, intent/mode pairs, freshness, wake, and cancellation declarations, and
includes focused negative fixtures.

- define one directional relationship vocabulary;
- reject restricted-public summaries;
- constrain decision/reason combinations;
- encode valid intent, delivery-mode, freshness, and cancellation capability
  combinations;
- add a negative fixture for every prohibited combination.

This comes first because every transport, policy, and adapter depends on the
same vocabulary.

### 2. Define authority and the executable binding together

Primary issues: [#15](https://github.com/fyaic/threadmesh/issues/15) and
[#17](https://github.com/fyaic/threadmesh/issues/17).

Status: completed in the authenticated JSON-RPC binding change. Claimed
authorship is checked against transport-derived principals; proposals and
effective grants are distinct; lifecycle, mailbox, response, wait, disposition,
and audit methods are executable through two serialized mock harness profiles.

- separate claimed authorship from authenticated operation identity;
- define effective grants and proposal/approval boundaries;
- publish task registration, incarnation rotation, mailbox read/claim, respond,
  wait, disposition, and audit request/response schemas;
- define typed errors, idempotency scopes, CAS, and authenticated context;
- implement two transport-level mock scenarios without private coordinator
  calls.

Authority cannot remain an informal object passed beside an otherwise public
binding, so these issues should move as one design slice.

### 3. Specify crash and reconciliation semantics

Primary issue: [#19](https://github.com/fyaic/threadmesh/issues/19).

Status: completed in the durable adapter-submission change. The protocol now
persists the canonical envelope digest and a pre-call `outcome-unknown`
boundary, records exact receipts atomically with disposition CAS, prohibits
blind restart retry, requires reconciliation evidence, and gates steer and
interrupt on durable harness idempotency.

- define canonical envelope digest conflicts;
- define durable adapter receipts and `outcome-unknown` reconciliation;
- specify the admission-claim linearization boundary;
- define cross-state invariants and concurrent disposition updates;
- add crash-before-receipt, crash-after-effect, restart, and concurrent-claim
  fixtures.

The SQLite implementation and serialized JSON-RPC tests are executable evidence
for the normative schema and state machine.

### 4. Add typed verification and partial interruption

Primary issue: [#16](https://github.com/fyaic/threadmesh/issues/16).

Status: completed in the typed interruption and signed verification change.
The protocol has per-target model/tool/process results with explicit coverage,
no umbrella success, and signed attestations bound to authenticated verifier,
claim subject, evidence digest, time, trust-policy decision, and external trust
anchor. Conformance verifies a real Ed25519 signature.

- separate model-turn, tool-call, and subprocess cancellation results;
- prohibit umbrella success claims;
- define authenticated verification attestations;
- add attacker-controlled evidence and partial-cancellation cases.

No adapter should advertise `interrupt` until these types and conformance cases
exist.

### 5. Obtain independent M0 review

Primary issue: [#7](https://github.com/fyaic/threadmesh/issues/7).

Status: reviewer packet and findings template published. Two qualifying verdicts
are still required; no internal agent review is counted toward this gate.

- prepare a compact reviewer packet containing schemas, state machines, threat
  model, transport binding, conformance command, and known limitations;
- obtain distributed-systems and agent-safety reviews;
- include at least one reviewer outside the maintainer organization;
- disposition every finding publicly.

The operational gate must resolve each numeric issue-#7 comment through GitHub
and compare one canonical reviewer-authored machine block. Every finding needs
an authenticated maintainer disposition block; a resolved fix must be merged
and contained in the candidate. Natural-language substring matching and
repository-local identity fields are not reviewer authentication.

M0 closes only after the resulting fixes and evidence are merged.

### 6. Finish the local reference coordinator

Primary issues: [#9](https://github.com/fyaic/threadmesh/issues/9)–
[#14](https://github.com/fyaic/threadmesh/issues/14).

Status: complete as an experimental implementation. PR #45 integrated #9–#14
and #34 into `main`; every issue is closed and the superseded stacked PRs are
closed. The merged runtime contains versioned migrations, mailbox/audit,
fail-closed relationship policy, atomic proposal approval, crash-safe dispatch
and reconciliation, event inspection, two-profile conformance, and bounded
retention purge. Normative M0 review remains independently open at #7.

PR #45 squash-merged the stack to `main` at
`e761e98da83426a5ebae3b47a341f606186dfca6` and the merged tree passed install,
test, lint, schema, transition, and audit checks. Real agent-product validation
is now the active evidence workstream.

### 7. Complete real product validation

Status: shared admission #42, unified runner #44, Codex #36, and Kimi #37 are
closed with real product passes. Gemini #38 remains optional pending an
explicitly supplied credential. All adapter code is merged, and superseded PRs
39–43 are closed.

Merged [#45](https://github.com/fyaic/threadmesh/pull/45), tracked by
[#44](https://github.com/fyaic/threadmesh/issues/44), adds the final shared
execution surface: fake-all and live modes now traverse the same mailbox claim,
receiver acceptance, admission token, exact marker, strict evidence, audit, and
cleanup path. Fake-all passes. The preferred live mode requires two records
resolving to qualifying GitHub machine blocks. The explicit
maintainer-experimental mode permits bounded learning runs without claiming M0
closure. Both require the operator acknowledgement, and a built-in-only bootstrap starts a
fresh child from a detached worktree at clean verified GitHub `main`. Start and
end snapshots must remain on the same SHA. Every legacy live alias delegates to
this one path. Three independent internal lanes approved exact commit `cf674bc`
for this conservative experimental scope after final regressions bound child
stdout to error/signal/status, exact product and repository state, bounded
public projection, and all four result states with product-specific cleanup.

Codex completed the first real maintainer-experimental pass at `0dda5a7` and
the scored proactive conditions at `0dd2c82`. Kimi then passed the same shared
receiver-acceptance path at `b248343`, including exact marker, bounded evidence,
audit, and delete-plus-absence cleanup. The M2 milestone is closed with five
issues complete and zero open. Gemini remains optional and unstarted; it is not
maintained as a competing live branch. The bounded #53 proactive behavior and
interference threshold subsequently passed under the two-stage policy at
`a134b39`.

Before production or parallel receiver replicas, add claimant-specific mailbox
leases with expiry takeover, and a receiver-authenticated inspection and manual
reconciliation operation for admission claims whose token is lost after a
crash. Neither blocks the current sequential marker experiment; both block a
production multi-worker claim.

Use the [real product runbook](../09-reviews/real-product-e2e-runbook.md) for the
gate, commands, result taxonomy, cleanup requirements, and evidence record.

The validation ledger must distinguish `passed`, `blocked`, `failed`, and
`not-run`. A handshake, a fake server, or an unavailable quota is never promoted
to a live-model pass.

## Product mainline reset — 2026-08-25

The protocol and reference runtime are sufficient for the next product
questions. No new protocol, persistence, validation-worker, steer, interrupt,
or production-isolation work enters the mainline until the following gates pass.

### Gate 1 — Behavioral value and interference

Status: completed. The first scored pass landed at `0dd2c82`; the compressed,
outcome-based flow later passed relevant 3/3 at `a134b39`. A current control
used no tool and did not contact B. A current irrelevant run used one read-only
lookup and did not send or activate B. Every task was deleted.

Run three real Codex conditions with the same task objective and scoring rubric:

1. no ThreadMesh contact;
2. relevant dependency available through ThreadMesh;
3. irrelevant or stale dependency available through ThreadMesh.

Record outcome score, completion, model turns, elapsed time, sends, receiver
disposition, unwanted receiver activation, persistent-context residue, and exact
cleanup. The relevant condition must improve the scored outcome over control;
the irrelevant/stale condition must not send or disrupt the receiver. The
bounded first case was tracked by #53.

### Gate 2 — Minimal adapter kit

Status: implementation candidate complete. The `@fyaic/threadmesh`
`0.1.0-alpha.0` package exposes one transport-agnostic entry point for task
registration, bounded summary publication/discovery, suggestion send, mailbox
poll, and receiver disposition. The public entry has zero runtime package
dependencies. Its packed-consumer import and full
coordinator-mediated lifecycle pass locally; npm publication is not required
for this gate and has not been performed.

This paragraph records the M4 package boundary. The later M5 one-command demo
adds explicit runtime subpaths, Ajv, native SQLite, and an installed CLI; the
root export remains the bounded harness SDK.

A maintainer-run clean-consumer validation now also passes with Pi `0.84.2`:
the real model selected discovery/send only for the relevant case, did not send
for the irrelevant case, stayed completely quiet for the control, and reached
a persistent Kimi `0.38.0` receiver through audited context admission. The
technical integration path is complete; issue #79 remains open only for
feedback from an independent human harness author.

Only after Gate 1 passes, expose the smallest usable API for task registration,
relationship discovery, bounded suggestion send, receiver disposition, and
mailbox polling. Add one integration example that a new harness can complete in
roughly 30 minutes. Do not expose coordinator internals or require readers to
understand every protocol schema.

### Gate 3 — One different real harness

Status: completed at `b248343`. Kimi Code CLI `0.38.0` consumed the same
receiver-accepted suggestion through ACP, produced the exact marker, and passed
session deletion plus absence verification. This is portability evidence, not
proof that Kimi autonomously selects relationships.

Choose exactly one: Kimi when quota is available, otherwise Gemini with an
explicit credential. Run the same behavioral case and cleanup assertions. Do
not maintain two competing live-validation branches.

The three reset gates, bounded Codex M3 behavior case, and first cross-harness
proactive case are complete. On `e0adb0e`, real Codex A selected discovery plus
one bounded send and persistent Kimi ACP B consumed it successfully; both sides
passed exact cleanup. No new protocol branch starts automatically.

### Post-gate repetition decision

Historical status: default enablement rejected. Across three real runs per condition,
control stayed quiet 3/3, relevant passed 1/3, and irrelevant passed 2/3 with
one inconclusive marker failure. The third relevant run exposed a bootstrap
cleanup reference bug; its exact thread was manually deleted and absence-
verified, and PR #64 merged the regression fix.

The shorter outcome-bearing benchmark, observed-behavior gate, and two-stage
policy are now merged. The final fresh relevant sample passed 3/3; fresh control
and irrelevant runs did not send. This qualifies the bounded profile for
explicit experimental opt-in, not repository-wide default enablement. The
cross-harness Codex-to-Kimi case is now complete using the existing coordinator
and adapters. Issue #77 packages the smallest reusable integration and operator
demo as a zero-runtime-dependency SDK bridge with per-turn budgets and external
consumer execution. After that implementation lands, the next evidence is one
independent harness-author integration attempt; it is not protocol expansion.

Independent review #7 continues as a parallel governance track. Hostile-worker
schema #48 is deferred. Production authentication, OS isolation, parallel
worker leases, hosted streaming, steer, and interrupt remain out of mainline.

## Mainline guardrails

- Do not close a normative issue with prototype-only evidence.
- Do not advertise a capability that cannot be observed and tested end to end.
- Do not add proactive discovery before bounded summaries and interference
  budgets are enforceable.
- Do not auto-redeliver an in-flight external effect whose outcome is unknown.
- Do not treat internal sub-agent review as organizationally independent review.
- Keep live-provider quota or authentication failures distinct from test passes.
