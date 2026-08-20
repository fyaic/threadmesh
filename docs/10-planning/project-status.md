# Project status

> Snapshot: 2026-08-20, including authenticated operations and crash-safe
> adapter submission reconciliation for
> [#19](https://github.com/fyaic/threadmesh/issues/19).

## Executive summary

ThreadMesh is a pre-alpha protocol and reference-runtime experiment. The
repository has progressed beyond documentation-only research: it contains
machine-readable schemas, deterministic conformance fixtures, an authenticated
local JSON-RPC binding, an experimental SQLite coordinator, and a conservative
ACP adapter exercised against a persistent fake agent and the local Kimi Code
ACP endpoint.

The implementation is not a production coordinator and does not establish
cross-product interoperability. Normative M0 remains open because typed
interruption and verification results and two independent external reviews are
unfinished.

## Evidence ledger

| Area | Current evidence | Status |
|---|---|---|
| Research and problem framing | Codex deep dive, community signals, ecosystem comparison, ADRs | Established |
| Protocol draft | 12 JSON Schemas, 44 positive/negative cases, 7 transition cases, 32 unit tests | Executable draft |
| Local binding | Schema-validated JSON-RPC, transport-derived principals, typed errors | Executable local reference |
| Local persistence | SQLite registry, proposals, grants, summaries, mailbox, claims, submission receipts, reconciliation, replay, audit | Experimental |
| Safety boundary | Authenticated authorship checks, effective-grant decisions, revocation, CAS | Executable local policy |
| ACP adapter | ACP v1 initialize, session create/load, prompt aggregation, permission denial, timeout cleanup | Experimental |
| Kimi Code | CLI 0.36.1 handshake and capability snapshot | Handshake verified |
| Live Kimi model behavior | Prompt reached provider but returned billing-cycle quota exhaustion | Blocked, not passed |
| Independent review | Three internal review lanes approved the conservative prototype after fixes | Internal only |
| Production authentication | Local static-token reference; no TLS/OAuth verifier supplied | Host integration required |
| OS isolation | No child-process sandbox supplied by ThreadMesh | Not implemented |
| Steer and interrupt | Not advertised by the ACP prototype | Intentionally unsupported |
| Cross-harness conformance | Pull-mailbox and event-watching mock profiles over JSON-RPC | Local behavior demonstrated |

## Milestone accounting

GitHub is authoritative for milestone closure.

### M0 — Foundation and protocol draft

- 9 issues closed, including coherence, authenticated binding, and crash-safety issues
  [#15](https://github.com/fyaic/threadmesh/issues/15),
  [#17](https://github.com/fyaic/threadmesh/issues/17),
  [#18](https://github.com/fyaic/threadmesh/issues/18), and
  [#19](https://github.com/fyaic/threadmesh/issues/19).
- 2 issues open: [#7](https://github.com/fyaic/threadmesh/issues/7) and
  [#16](https://github.com/fyaic/threadmesh/issues/16).
- Internal review findings have prototype mitigations, but their normative
  acceptance criteria remain open.
- Exit is blocked by interruption/verification and two independent reviews,
  including at least one outside the maintainer organization.

### M1 — Local reference coordinator

- 6 issues open: [#9](https://github.com/fyaic/threadmesh/issues/9)–
  [#14](https://github.com/fyaic/threadmesh/issues/14).
- Pull request #20 and the authenticated binding supply partial implementation
  evidence for #9–#14.
- Migration/rollback, retention, complete policy reason codes, complete
  disposition reconciliation, hosted event streaming, an inspector, and the
  complete M1 behavior matrix remain unfinished.

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
14. preserve an audit trail across restart.

It does not prove autonomous task discovery, useful model behavior, native
provider-role isolation, exactly-once external effects, production remote
credential verification, or safe interruption.

## Progress rule

An implementation demonstration may inform a normative issue, but it does not
close that issue until its public schema, operation semantics, negative cases,
and review evidence satisfy the issue acceptance criteria.
