# Mainline plan

## Goal

Turn the current trusted-process demonstration into a protocol whose safety and
failure semantics can be implemented by more than one harness without private
assumptions. The critical path is M0 stabilization followed by M1 completion;
additional live adapters are evidence work, not the mainline.

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

### 7. Resume live adapter expansion

After M0 closes and M1 has an observable coordinator:

- build the Codex App Server adapter;
- harden the generic ACP/subprocess adapter;
- add one materially different non-ACP harness;
- rerun the Kimi live marker test when quota is available;
- measure useful coordination and interference cost before enabling proactive
  discovery.

## Next pull-request slices

Keep each change independently reviewable:

1. `docs: publish the external M0 reviewer packet`
2. `feat: complete the M1 storage and migration contract`
3. `feat: complete policy, dispatcher, stream, and inspector slices`
4. `test: run real product adapters after normative and M1 completion`

## Mainline guardrails

- Do not close a normative issue with prototype-only evidence.
- Do not advertise a capability that cannot be observed and tested end to end.
- Do not add proactive discovery before bounded summaries and interference
  budgets are enforceable.
- Do not auto-redeliver an in-flight external effect whose outcome is unknown.
- Do not treat internal sub-agent review as organizationally independent review.
- Keep live-provider quota or authentication failures distinct from test passes.
