# Changelog

All notable changes will be documented here. The project follows Keep a Changelog conventions once versioned releases begin.

## [Unreleased]

### Added

- Initial project vision and documentation architecture.
- Draft coordination intent model.
- Draft message envelope and capability schemas.
- Initial safety, permission, adapter, and governance documents.
- Executable schemas for dispositions, grants, task summaries, audit events,
  shared types, and conformance manifests.
- Deterministic positive, negative, and state-transition conformance fixtures.
- Experimental SQLite coordinator with task ownership, grants, mailbox,
  dispositions, audit events, CAS, idempotency, and durable admission claims.
- Conservative ACP stdio adapter with registered-session reload, replay
  isolation, permission denial, timeout cleanup, and capability reporting.
- Kimi Code ACP handshake and quota-blocked live-smoke evidence.
- Distributed-systems, safety, and adapter internal review artifacts.
- Evidence-backed project status and mainline execution plan.
- Negative conformance fixtures for summary disclosure, relationship direction,
  disposition reasons, capability freshness, cancellation, and idle wake.
- Transport-authenticated JSON-RPC schemas and an executable local binding with
  typed errors, durable idempotency, CAS, and cursor-based reads.
- Relationship proposals, owner/policy-generated effective grants, task attach
  and incarnation rotation, projected summaries, and mailbox claim/ack.
- Pull-mailbox and event-watching mock harness clients with restart recovery.

### Changed

- Project status advanced from documentation-only research to a reviewed
  pre-alpha experimental runtime; production and interoperability claims remain
  explicitly out of scope.
- Task-summary projections now bind relationship, grant version, and disclosure
  level; relationship grants, dispositions, and adapter capabilities reject
  incoherent combinations at schema validation time.
- Claimed request authorship is separated from transport-authenticated operation
  identity; canonical effective-grant decision digests are recomputed.
