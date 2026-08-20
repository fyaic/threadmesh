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

### Changed

- Project status advanced from documentation-only research to a reviewed
  pre-alpha experimental runtime; production and interoperability claims remain
  explicitly out of scope.
