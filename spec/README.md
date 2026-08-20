# ThreadMesh protocol draft

This directory contains machine-readable artifacts for the pre-alpha protocol.

## Schemas

- [`threadmesh-envelope.schema.json`](schema/threadmesh-envelope.schema.json) — coordination envelope.
- [`threadmesh-capabilities.schema.json`](schema/threadmesh-capabilities.schema.json) — adapter capabilities.

The schemas are exploratory and use the version label `0.0-draft`. They are not a compatibility promise.

Human-readable semantics live in [`docs/03-protocol`](../docs/03-protocol/README.md). When a schema and prose document disagree during the draft phase, open an issue rather than assuming either behavior is stable.

## Planned additions

- disposition schema;
- task summary schema;
- relationship grant schema;
- audit event schema;
- JSON-RPC binding;
- conformance scenario format.
