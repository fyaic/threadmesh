# Project status

> Snapshot: 2026-08-20, after merge commit `2e74aa8` and pull request
> [#20](https://github.com/fyaic/threadmesh/pull/20).

## Executive summary

ThreadMesh is a pre-alpha protocol and reference-runtime experiment. The
repository has progressed beyond documentation-only research: it contains
machine-readable schemas, deterministic conformance fixtures, an experimental
SQLite coordinator, and a conservative ACP adapter exercised against a
persistent fake agent and the local Kimi Code ACP endpoint.

The implementation is not a production coordinator and does not establish
cross-harness interoperability. Normative M0 remains open because authenticated
transport bindings, coherent schema constraints, typed interruption and
verification results, crash reconciliation, and two independent external
reviews are unfinished.

## Evidence ledger

| Area | Current evidence | Status |
|---|---|---|
| Research and problem framing | Codex deep dive, community signals, ecosystem comparison, ADRs | Established |
| Protocol draft | 8 JSON Schemas, 13 positive/negative cases, 7 transition cases | Executable draft |
| Local persistence | SQLite task registry, grants, mailbox, dispositions, audit events, admission claims | Experimental |
| Safety boundary | Owner-scoped grants, revocation, expiry, CAS, canonical peer provenance | Experimental trusted process |
| ACP adapter | ACP v1 initialize, session create/load, prompt aggregation, permission denial, timeout cleanup | Experimental |
| Kimi Code | CLI 0.36.1 handshake and capability snapshot | Handshake verified |
| Live Kimi model behavior | Prompt reached provider but returned billing-cycle quota exhaustion | Blocked, not passed |
| Independent review | Three internal review lanes approved the conservative prototype after fixes | Internal only |
| Production authentication | No authenticated network/control-plane binding | Not implemented |
| OS isolation | No child-process sandbox supplied by ThreadMesh | Not implemented |
| Steer and interrupt | Not advertised by the ACP prototype | Intentionally unsupported |
| Cross-harness conformance | One persistent ACP fake-agent profile | Not yet demonstrated |

## Milestone accounting

GitHub is authoritative for milestone closure.

### M0 — Foundation and protocol draft

- 5 issues closed.
- 6 issues open: [#7](https://github.com/fyaic/threadmesh/issues/7) and
  [#15](https://github.com/fyaic/threadmesh/issues/15)–
  [#19](https://github.com/fyaic/threadmesh/issues/19).
- Internal review findings have prototype mitigations, but their normative
  acceptance criteria remain open.
- Exit is blocked by the five normative review tracks and two independent
  reviews, including at least one outside the maintainer organization.

### M1 — Local reference coordinator

- 6 issues open: [#9](https://github.com/fyaic/threadmesh/issues/9)–
  [#14](https://github.com/fyaic/threadmesh/issues/14).
- Pull request #20 supplies partial implementation evidence for #9, #10, #11,
  #12, and #14.
- Migration/rollback, retention, complete policy reason codes, complete
  disposition reconciliation, event streaming, an inspector, and two-profile
  conformance remain unfinished.

## What the prototype proves

The current tests support the narrower claim that a trusted local process can:

1. register two task incarnations and an ACP session reference;
2. install an owner-scoped suggestion grant;
3. persist and replay-protect a peer envelope;
4. let the receiver accept the suggestion;
5. create one durable admission claim bound to grant and adapter evidence;
6. load the registered ACP session without mixing historical replay into the
   new turn;
7. confirm context admission only after matching adapter evidence;
8. preserve an audit trail across restart.

It does not prove autonomous task discovery, useful model behavior, native
provider-role isolation, exactly-once external effects, authenticated remote
callers, or safe interruption.

## Progress rule

An implementation demonstration may inform a normative issue, but it does not
close that issue until its public schema, operation semantics, negative cases,
and review evidence satisfy the issue acceptance criteria.
