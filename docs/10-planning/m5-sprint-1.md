# M5 sprint 1 — deterministic attention-router vertical slice

> Sprint window: 2026-08-31 through 2026-09-04. This is an execution plan,
> not a release-date promise. The product outcome and stop conditions remain
> defined by the [product mainline](product-mainline-2026-08-28.md).

## Sprint goal

Ship one deterministic, one-command implementation/review/fix-shaped loop that
uses the existing ThreadMesh protocol, explains every routing decision, cleans
up completely, and is ready to replace its scripted participants with real
Codex sessions.

## Product acceptance

The sprint succeeds only if one command demonstrates:

- six lifecycle-event projections without adding a new protocol intention;
- dependency routing that distinguishes offer eligibility from dependency
  satisfaction;
- no dependency unlock from receipt, sender assertion, or receiver acceptance
  alone;
- zero manual task IDs, tokens, relay actions, and model polling turns;
- zero irrelevant wakes and zero incorrect dependency unlocks;
- a bounded inspector view that explains session, event, disposition,
  verification, and dependency state;
- complete cleanup of the temporary database and runtime directory;
- packed-consumer and repository test evidence.

## Workstreams and ownership

| Priority | Workstream | Owner | Deliverable | Dependency |
|---|---|---|---|---|
| P0 | Lifecycle event projection and route/effect decisions | Lifecycle core agent | Pure domain API and negative-case tests for [#90](https://github.com/fyaic/threadmesh/issues/90) | Existing envelope, grant, and disposition vocabulary |
| P0 | One-command deterministic demo | Demo CLI agent | `threadmesh demo`, isolated fixture, bounded JSON result, cleanup test for [#89](https://github.com/fyaic/threadmesh/issues/89) | Stable lifecycle-domain interface at integration time |
| P0 | Attention/dependency inspector | Inspector agent | Pure bounded snapshot and terminal renderer for [#92](https://github.com/fyaic/threadmesh/issues/92) | Stable route/effect projection at integration time |
| P0 | Interface convergence and integration | Primary maintainer | One coherent public execution path, end-to-end assertions, package surface | All three workstreams |
| P1 | Documentation and evidence | Primary maintainer | Quickstart, architecture note, sprint validation record | Deterministic path passes |
| Stretch | Real Codex closed loop | Primary maintainer | Bounded real-product evidence for [#91](https://github.com/fyaic/threadmesh/issues/91) | Deterministic path and cleanup pass |

## Execution order

### Phase A — parallel bounded implementation

The three implementation agents work only in their assigned files. The core
does not modify schemas or coordinator persistence. The CLI and inspector use
pure interfaces so they can converge without creating a framework dependency.

### Phase B — maintainer integration

The primary maintainer reviews all public shapes, removes duplicate validation,
connects the demo to the lifecycle and inspector modules, and adds one
end-to-end acceptance test. Any interface that cannot explain its state in the
inspector is rejected.

### Phase C — deterministic release gates

Required gates:

1. lifecycle and inspector unit tests;
2. one-command demo test with cleanup assertion;
3. packed-package consumer execution;
4. existing schemas, transitions, unit tests, and documentation lint;
5. repeat the demo to confirm stable output and idempotent decisions.

### Phase D — real Codex evidence

Only after Phase C passes, replace scripted implementer and reviewer decisions
with bounded real Codex turns. Preserve the same event, route, inspector, and
cleanup assertions. A model marker without the complete loop is not a pass.

### Phase E — cross-harness repetition

After the Codex-first loop is useful and stable, move one role to an existing
ACP-compatible harness under [#93](https://github.com/fyaic/threadmesh/issues/93).
This is not part of the P0 sprint commitment.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Product events accidentally expand the normative protocol | Restarts schema review and delays the demo | Project onto existing envelope fields; add protocol only after a proven incompatibility |
| Demo imports private internals as its user-facing API | External operators cannot reproduce it | Keep private provisioning behind the CLI; verify the installed package and public command |
| Inspector becomes a general UI project | Mainline drifts into dashboard work | Pure bounded snapshot plus terminal renderer only |
| Accepted messages are mistaken for verified completion | Incorrect dependency unlock | Separate attention route and dependency effect; require trusted external verification for satisfaction |
| Existing timing-sensitive adapter tests distract the sprint | Mainline returns to unrelated hardening | Record baseline flakes, require targeted evidence, and change adapter code only if the new slice causes a regression |
| Real model variance obscures product correctness | False pass or repeated debugging | Freeze deterministic scenario and assertions before real-agent execution |

## Definition of done

- [x] P0 files reviewed and integrated by the primary maintainer.
- [x] One package-installed public command runs the deterministic loop.
- [x] Route and dependency decisions have stable machine-readable reason codes.
- [x] Inspector output is bounded, redacted, and deterministic.
- [x] Temporary state is absent after success and failure.
- [x] Package consumer, test suite, spec validation, and docs lint pass.
- [x] Quickstart and evidence record show commands, outputs, limitations, and
  the next real-agent gate.
- [ ] GitHub issues and milestone status match the merged evidence.
