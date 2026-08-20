# Adapter implementability review — 2026-08-20

- Reviewer: internal Codex sub-agent
- Reviewed commit: `c38873026222175433fb86f2fcac1a655ffcc932`
- Method: read-only cross-harness and Kimi Code feasibility review
- Verdict: **Request changes**

## P1 findings

### No receiver mailbox-read operation

The reviewed operations had message submission and disposition updates but no
receiver-owned `mailbox.listPending`, claim/lease, cursor, or read operation.
An adapter therefore had to invent a private API to inspect pending work.

The reviewed coordinator supplied only a target-principal in-process cursor.
The later JSON-RPC binding now publishes authenticated list, claim,
acknowledgement, restart, and cursor semantics.

### No executable task-registration or transport binding

Stable task/incarnation mappings are required, but `tasks.register`, attach,
incarnation rotation, typed operation errors, authentication, and concurrency
rules were absent. A minimal JSON-RPC or MCP binding is still needed before the
M0 portability exit claim can be approved.

### Partial interruption result is missing

An ACP session cancellation proves neither tool-call nor subprocess
cancellation. Interrupt support must remain disabled until a typed partial
result exists.

## P2 findings

- Capability fields need conditional coherence rules.
- Provenance rendering needs behavioral tests, not only JSON shape checks.
- Restart, cursor replay, stale incarnation, expiry-before-admission, and
  duplicate delivery need end-to-end scenarios.

## Conservative Kimi profile

The initial review recommended a wider profile. The implemented machine-readable
profile is deliberately narrower and currently exposes only:

- `suggest`;
- receiver-mediated `checkpoint-offer`;
- explicit-only task discovery;
- canonical-JSON, untrusted-peer, model-visible rendering;
- no active steer or interrupt;
- no claimed checkpoint event, model-turn cancellation or subprocess cancellation;
- no client filesystem, terminal, or automatic permission authority.

## Approval condition

Publish a typed mailbox and task-registration binding, add restart and
provenance scenarios, and keep unsupported state-changing behavior explicit.

## Prototype follow-up

Pull request [#20](https://github.com/fyaic/threadmesh/pull/20) added stored ACP
session references, persistent fake-session reload with unknown-session
rejection, separation of load replay from the new turn, strict live-marker
classification, runtime chronology checks, permission and timeout fixtures, and
a schema-valid conservative capability profile. The reviewer approved the
experimental adapter path after re-review.

The later authenticated binding resolves the public task/mailbox and two-profile
requirements in [#17](https://github.com/fyaic/threadmesh/issues/17), while
normative external-effect receipt semantics remain open in
[#19](https://github.com/fyaic/threadmesh/issues/19).
