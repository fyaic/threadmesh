# M5.2 durable event-pump recovery

Date: 2026-09-01

Evidence class: deterministic SQLite restart and concurrency fixture

Reviewed `main`: `711da6606ac8b0c326f199a96d1713bc7a6de68c`

Merged change: [#122](https://github.com/fyaic/threadmesh/pull/122)

## Established

The autonomous pump now persists exact selection and publication state for each
dispatch. Recovery binds the event and cursor, registry, scenario and chain,
pump identity, handler and route, owner lease epoch, native turn execution,
selection result, and publication ownership in SQLite checkpoints.

The deterministic tests establish:

- selected exact-head work survives coordinator reopen and an expired lease can
  be taken over without looking ahead;
- restart after the native turn but before settlement reuses the bound turn;
- restart after settlement but before publication promotes once without a new
  native turn;
- only one publication callback enters while its lease is held;
- a stale publication epoch is fenced;
- a committed publication orphan is completed without replaying its callback,
  before a later head is considered;
- mutations to dispatch identity, selection, checkpoint chain, publication
  owner/epoch, schema, index, or foreign-key shape fail closed on reopen.

The public scenario consequently reports
`eventPumpSelectionDurable=true`,
`durablePerDispatchRecordsValid=true`, and five valid dispatch records.

## Migration evidence

SQLite v9 introduced durable event-pump dispatches and append-only checkpoints.
SQLite v10 adds publication owner/epoch/expiry, a publication-lease index, and
checkpoint `digest_version`. Migration tests preserve genuine non-empty v9
selected, completed-bound, and published rows and their version-1 checkpoint
hashes. New publication-bound checkpoints use version 2.

## Boundary

This is durable per-dispatch evidence only. The pump explicitly reports
`selectionChainValid=null` and
`selectionChainScope=global-chain-not-implemented`; there is no global
cross-dispatch append-only selection chain.

It is not OS-kill evidence, does not prove lease heartbeat through a long model
turn, and is not a real Codex, real Kimi, or external-verifier pass. The
scenario remains `liveProductEvidence=false`, uses a deterministic policy
oracle, and signs with a fixture-owned ephemeral key.
