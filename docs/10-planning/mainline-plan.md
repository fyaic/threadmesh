# Mainline plan

## Goal

Turn the current trusted-process demonstration into a protocol whose safety and
failure semantics can be implemented by more than one harness without private
assumptions. The critical path is M0 stabilization followed by M1 completion;
live adapter code may be prepared in parallel, but no model result counts toward
completion before the gate and merged coordinator path are satisfied.

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

Recommended implementation order:

1. storage migration, rollback, retention, and deletion contract (#9);
2. registry, mailbox, audit, expiry, and restart completion (#10);
3. policy engine and stable denial reasons (#11);
4. dispatcher, legal state transitions, receipts, and reconciliation (#12);
5. cursor event stream and provenance inspector (#13);
6. two deliberately different mock-harness profiles in CI (#14).

The #9 implementation candidate now records an immutable baseline migration,
rejects newer or checksum-mismatched databases, rolls back failed adoption,
configures durable WAL concurrency, and documents protocol/table mapping plus
retention and operational rollback. Its merge remains gated by #7.

The stacked #10 candidate adds a bounded control-plane expiry sweep that writes
the disposition and audit event atomically, excludes irreversible in-flight
effects, exposes no global task list, and exercises the behavior through the
authenticated JSON-RPC surface. Its merge is also gated by #7.

The stacked #11 candidate extracts a deterministic relationship policy engine,
separates trusted internal causes from one non-disclosing public denial,
rechecks authority immediately before native submission, and couples grant
revocation with audited invalidation of queued `steer`/`interrupt` work. Its
merge is also gated by #7.

The #45 review found that proposal approval and grant installation were not one
transaction. The remediation uses one immediate transaction and a checked
pending-to-approved CAS. That commit must be propagated into the #11 slice
before #30 is considered closure evidence.

The stacked #12 candidate introduces an append-only version-2 migration,
runtime freshness snapshots under CAS, a transition table shared by conformance
and runtime, all explicit receiver terminal states, and a durable dispatcher.
The dispatcher writes `outcome-unknown` before one native call and suppresses
automatic retry after exceptions or restart. Its merge is also gated by #7.

The stacked #13 candidate adds a `tasks.wait`-compatible local stream with
strict cursor validation and caller-owned restart checkpoints. Its authorized
snapshot distinguishes user and peer authorship, renders delivery, decision,
and outcome separately, and redacts content and evidence after expiry or grant
revocation. It is not a hosted stream and its merge is also gated by #7.

The stacked #14 candidate turns the two mock harness profiles into an explicit
behavior matrix and CI conformance kit. It covers related-only summaries,
side-channel notification, accept/reject/defer, stale and unsupported
state-changing intents, replay, queued revocation, provenance, audit evidence,
and deterministic test-database cleanup. Its merge is also gated by #7.

The stacked #34 retention candidate adds an append-only schema-v3 migration and
a policy-only bounded purge. It tombstones expired messages, audit detail,
inactive proposals/summaries, and retired adapter references while retaining
canonical digests and excluding in-flight/unknown external effects. It also
tests v1/v2 upgrade, restart, replay, idempotent JSON-RPC, and explicit WAL
truncation. Its merge is gated by #7 and the lower M1 stack.

Once the stack merges and is revalidated on `main`, real agent-product
validation becomes the next evidence workstream.

### 7. Complete real product validation

Status: M2 adapter issues [#36](https://github.com/fyaic/threadmesh/issues/36)–
[#38](https://github.com/fyaic/threadmesh/issues/38) plus shared-admission
[#42](https://github.com/fyaic/threadmesh/issues/42) are open. The first Codex
App Server candidate is implemented as a stack above M1 and its no-model
preflight passes against CLI `0.145.0` in Draft
[#39](https://github.com/fyaic/threadmesh/pull/39). The live first turn remains
gated. The Kimi hardening candidate also passes a real no-model
create/list/delete/absence lifecycle with exact binary digest; its live marker
remains quota-blocked and gated in Draft
[#40](https://github.com/fyaic/threadmesh/pull/40).
Gemini CLI headless `stream-json` is selected for #38; its pinned package and
isolated no-model preflight pass, while model execution waits for explicit
provider credential authorization in Draft
[#41](https://github.com/fyaic/threadmesh/pull/41).
A further stacked slice generalizes the coordinator's admission claim and exact
evidence confirmation across all three adapter kinds; this is deterministic
preparation in Draft [#43](https://github.com/fyaic/threadmesh/pull/43), not a
substitute for the post-gate real model run.

Draft [#45](https://github.com/fyaic/threadmesh/pull/45), tracked by
[#44](https://github.com/fyaic/threadmesh/issues/44), adds the final shared
execution surface: fake-all and live modes now traverse the same mailbox claim,
receiver acceptance, admission token, exact marker, strict evidence, audit, and
cleanup path. Fake-all passes. Live mode remains mechanically `not-run` unless
two records resolve to qualifying GitHub machine blocks, the operator supplies
the exact post-review acknowledgement, and a built-in-only bootstrap starts a
fresh child from a detached worktree at clean verified GitHub `main`. Start and
end snapshots must remain on the same SHA. Every legacy live alias delegates to
this one path.

After M0 closes and the M1 stack is merged and revalidated:

- merge and revalidate the conservative Codex App Server adapter;
- run its exact live marker, persisted resume, and exact-thread cleanup;
- run a coordinator-mediated A-to-B accepted-suggestion scenario against an
  already persisted Codex receiver;
- harden the generic ACP/subprocess adapter and rerun Kimi when quota permits;
- merge the selected Gemini CLI non-ACP headless adapter, then run it only with
  an explicitly authorized provider credential;
- keep every live product on the common mailbox acceptance, durable admission
  claim, kind-specific evidence, and context-admitted audit path;
- run the same envelope, acceptance, provenance, restart, and cleanup assertions
  against at least two harness families;
- measure useful coordination and interference cost before enabling proactive
  discovery.

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

## Next pull-request slices

Keep each change independently reviewable:

1. `docs: publish the external M0 reviewer packet`
2. `feat: complete the M1 storage and migration contract`
3. `feat: complete policy, dispatcher, stream, and inspector slices`
4. `test: complete the two-profile M1 conformance kit`
5. `feat: implement retention-driven sensitive-content purge`
6. `feat: add Codex App Server adapter and no-model product preflight`
7. `test: add one gated coordinator-mediated product validation runner`
8. `test: run real product adapters after normative and M1 completion`

## Mainline guardrails

- Do not close a normative issue with prototype-only evidence.
- Do not advertise a capability that cannot be observed and tested end to end.
- Do not add proactive discovery before bounded summaries and interference
  budgets are enforceable.
- Do not auto-redeliver an in-flight external effect whose outcome is unknown.
- Do not treat internal sub-agent review as organizationally independent review.
- Keep live-provider quota or authentication failures distinct from test passes.
