# ThreadMesh protocol draft

This directory contains machine-readable artifacts for the pre-alpha protocol.

## Schemas

- [`threadmesh-envelope.schema.json`](schema/threadmesh-envelope.schema.json) — coordination envelope.
- [`threadmesh-capabilities.schema.json`](schema/threadmesh-capabilities.schema.json) — adapter capabilities.
- [`threadmesh-disposition.schema.json`](schema/threadmesh-disposition.schema.json) — orthogonal delivery, receiver-decision, and outcome snapshot.
- [`threadmesh-relationship-grant.schema.json`](schema/threadmesh-relationship-grant.schema.json) — relationship-scoped authority.
- [`threadmesh-task-summary.schema.json`](schema/threadmesh-task-summary.schema.json) — privacy-bounded discovery summary.
- [`threadmesh-audit-event.schema.json`](schema/threadmesh-audit-event.schema.json) — immutable transition evidence.
- [`threadmesh-types.schema.json`](schema/threadmesh-types.schema.json) — shared task, actor, freshness, delivery, evidence, and reason types.
- [`threadmesh-conformance-manifest.schema.json`](schema/threadmesh-conformance-manifest.schema.json) — executable fixture manifest.

The schemas are exploratory and use the version label `0.0-draft`. They are not a compatibility promise.

Human-readable semantics live in [`docs/03-protocol`](../docs/03-protocol/README.md). When a schema and prose document disagree during the draft phase, open an issue rather than assuming either behavior is stable.

## Conformance kit

[`conformance/manifest.json`](conformance/manifest.json) declares positive and
negative schema fixtures plus legal and illegal state transitions. Run it with:

```sh
npm install
npm test
```

The validator compiles every schema, verifies the manifest, tests every
fixture, checks envelope chronology, and evaluates the draft state machines.

## Planned additions

- authenticated JSON-RPC or MCP operation binding;
- task registration, incarnation rotation, and receiver mailbox schemas;
- coherent summary, relationship, reason-code, and capability constraints;
- durable receipts and outcome-unknown reconciliation;
- typed interruption results and verification attestations;
- adapter behavior scenarios across two distinct mock harness profiles.

The SQLite/ACP prototype supplies implementation feedback for these additions,
but its in-process methods are not the normative binding.
