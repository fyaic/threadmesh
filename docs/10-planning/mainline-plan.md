# Mainline plan

## Goal

Turn the current trusted-process demonstration into a protocol whose safety and
failure semantics can be implemented by more than one harness without private
assumptions. The active critical path is the merged coordinator plus real-agent
evidence. Normative M0 review remains a parallel governance track;
maintainer-authorized experiments are explicitly labeled and do not satisfy it.

## Workstream order

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

Status: shared admission #42, unified runner #44, and Codex #36 are closed.
Codex has a real product pass. Kimi #37 remains open because provider quota
blocked its exact marker; Gemini #38 remains open pending an explicitly supplied
credential. All adapter code is merged, and superseded PRs #39–#43 are closed.

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

Immediate execution order on merged `main`:

- rerun Kimi when quota permits;
- run Gemini only with an explicitly authorized provider credential;
- extend the passed Codex path from a fixed marker into a coordinator-mediated
  A-to-B dependency suggestion against an already persisted receiver; the real
  model-selected positive case passed at `248d650` under issue #53;
- keep every live product on the common mailbox acceptance, durable admission
  claim, kind-specific evidence, and context-admitted audit path;
- preserve the strict projected child-result schema, ISO timestamps, and
  adapter-kind-specific cleanup/evidence checks when recording public evidence;
- run the same envelope, acceptance, provenance, restart, and cleanup assertions
  against at least two harness families;
- measure useful coordination and interference cost before enabling proactive
  discovery.

Codex completed the first real maintainer-experimental pass at `0dda5a7`,
including exact marker, evidence, audit, and cleanup. Kimi is currently
quota-blocked with cleanup verified; Gemini remains unstarted without an
explicit credential. The real Codex proactive dependency case passed at
`248d650`: A selected relationship discovery and one bounded send without a
scripted submit, B consumed the admitted suggestion, and both tasks were
deleted. The next behavioral threshold is irrelevant-task and
receiver-interference controls. The portability threshold remains one
additional materially different harness pass rather than more runner
scaffolding.

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

Status: first real scored pass completed at `0dd2c82`. Control scored 0;
relevant coordination scored 1 at an observed cost of about 77 seconds and one
additional B receive turn; the irrelevant condition did not send or activate B.
Repetitions and stale/duplicate cases remain issue #53 follow-ups but do not
block Gate 2.

Run three real Codex conditions with the same task objective and scoring rubric:

1. no ThreadMesh contact;
2. relevant dependency available through ThreadMesh;
3. irrelevant or stale dependency available through ThreadMesh.

Record outcome score, completion, model turns, elapsed time, sends, receiver
disposition, unwanted receiver activation, persistent-context residue, and exact
cleanup. The relevant condition must improve the scored outcome over control;
the irrelevant/stale condition must not send or disrupt the receiver. This is
the only active implementation workstream and is tracked by #53.

### Gate 2 — Minimal adapter kit

Status: active mainline.

Only after Gate 1 passes, expose the smallest usable API for task registration,
relationship discovery, bounded suggestion send, receiver disposition, and
mailbox polling. Add one integration example that a new harness can complete in
roughly 30 minutes. Do not expose coordinator internals or require readers to
understand every protocol schema.

### Gate 3 — One different real harness

Choose exactly one: Kimi when quota is available, otherwise Gemini with an
explicit credential. Run the same behavioral case and cleanup assertions. Do
not maintain two competing live-validation branches.

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
