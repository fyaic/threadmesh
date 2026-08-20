# SQLite storage and migration contract

> M1 implementation contract. Merge of the implementation remains gated by the
> independent M0 review in
> [#7](https://github.com/fyaic/threadmesh/issues/7).

## Scope and trust boundary

The reference coordinator uses one local SQLite database per trusted
single-user coordinator instance. SQLite is a durability and concurrency
boundary, not tenant isolation. The process that opens the database can read or
modify every row.

The current schema version is `2`. Version 1 is the immutable coordinator
baseline; version 2 adds task run/objective/checkpoint snapshots plus persisted
decision and delivery-failure reasons. `PRAGMA user_version` is the fast
compatibility check; `schema_migrations` is the immutable audit record for the
version name, checksum, and application time.

## Protocol-to-storage mapping

| Protocol object or operation | Primary storage | Integrity and identity |
|---|---|---|
| Task incarnation | `tasks`, `task_metadata` | `(task_id, incarnation_id)` primary key; globally unique incarnation index; revision CAS; run/objective/checkpoint freshness snapshot |
| Relationship proposal | `relationship_proposals` | `proposal_id` primary key plus canonical proposal digest |
| Effective grant | `grants` | `grant_id` primary key; unique relationship/endpoints/version tuple; signed authorization digest inside `grant_json` |
| Task summary projection | `task_summaries` | task/incarnation/relationship uniqueness plus grant ID/version and summary version |
| Envelope | `messages` | `(sender_incarnation_id, message_id)` uniqueness plus canonical `envelope_digest` |
| Disposition snapshot | `dispositions` | same message identity plus expected-revision CAS |
| Mailbox worker claim | `mailbox_claims` | one bounded claim per logical message; unique random token |
| Context admission claim | `admission_claims` | one irreversible admission boundary per logical message; unique token |
| Native adapter submission | `adapter_submissions` | one active submission per logical message; unique submission ID and adapter idempotency key |
| JSON-RPC operation replay | `operation_replays` | `(authentication_id, method, idempotency_key)` plus canonical request digest |
| Audit event | `audit_events` | monotonic local sequence and unique event ID |
| Interruption result | Not yet persisted | Typed schema exists; persistence belongs to dispatcher work in #12 |
| Verification attestation | Not yet persisted | Signed schema exists; production trust-store integration belongs to #12 |

The canonical protocol objects remain JSON in the corresponding `*_json`
columns. Indexed columns are deliberate projections used for authorization,
uniqueness, expiry, and lookup. Implementations MUST validate the JSON object
before persistence and MUST reject a projection that disagrees with it.

## Idempotency and uniqueness

Message idempotency is scoped to the authenticated sender incarnation and
message ID. An identical retry returns the existing disposition. A different
canonical envelope digest under the same identity is
`threadmesh_idempotency_conflict`.

JSON-RPC operation replay has a separate scope: authentication event, method,
and idempotency key. It does not replace resource-level uniqueness. Grant
versions, summary versions, task revisions, disposition revisions, mailbox
claims, and native adapter keys remain independently enforced.

## Transaction boundaries

Every consequential write uses `BEGIN IMMEDIATE`, so only one writer crosses a
state transition at a time while WAL readers continue.

| Boundary | Atomic writes |
|---|---|
| Receive | envelope row, initial disposition, `message-durably-received` audit event |
| Receiver decision | disposition revision/state CAS, `receiver-decided` audit event |
| Runtime freshness update | task metadata revision CAS for run/objective/checkpoint |
| Delivery failure | legal delivery transition, bounded reason, and `delivery-failed` audit event |
| Grant revocation | grant timestamp plus eligible queued state-changing decision revocation and audit events |
| Mailbox acknowledgement | exact claim transition plus receiver decision and its audit event |
| Context admission | exact admission-token transition, disposition CAS, context-admitted audit event |
| Native receipt | exact receipt storage, disposition CAS to adapter-submitted, audit event |
| Unknown-outcome reconciliation | submission resolution and audit event; confirmed-submitted reuses native receipt boundary |
| Task rotation | retire previous incarnation and metadata revision, register next incarnation |
| Summary publication | summary version CAS and current-grant projection |
| Expiry sweep | due-message disposition CAS plus `message-expired` audit event; active irreversible claims excluded |

No queue acknowledgement, adapter receipt, or audit event is emitted before its
corresponding durable state commits. A transaction failure leaves every member
of that boundary unchanged.

## Concurrency and crash recovery

The coordinator configures:

- WAL journal mode for concurrent readers;
- `synchronous = FULL` for durable commits;
- a 5-second busy timeout instead of an immediate lock failure;
- foreign-key enforcement;
- `secure_delete = FAST` as best-effort page cleanup.

SQLite recovery is authoritative after process failure. In-memory locks,
workers, and model sessions are not. Mailbox claims remain bounded by expiry.
Native calls that crossed the durable pre-call boundary remain
`outcome-unknown` and are never retried merely because a worker restarted.
Due queued mail becomes explicitly expired through a bounded control-plane
sweep; mailbox filtering does not substitute for a durable expiry transition.

The database supplies local sequence order only. It does not claim global
ordering across hosts or exactly-once external effects.

## Migration policy

Migrations are ordered, forward-only, and immutable after release.

1. Read `PRAGMA user_version` before any schema write.
2. Reject a database newer than the running binary without modifying it.
3. Run every pending migration and its migration-record insert in one immediate
   transaction.
4. Record version, stable name, checksum, and application time.
5. Reject a recorded version whose checksum differs from the binary.
6. Set `user_version` only after all migration statements succeed.

Version-zero prototype databases are adopted in place with idempotent baseline
DDL. Unknown or structurally incompatible prototype tables cause the entire
adoption transaction to roll back; they are never silently rebuilt or dropped.

### Operational rollback

ThreadMesh does not run destructive down migrations. Before an upgrade that
changes `user_version`, the operator MUST create a SQLite online backup, or stop
the coordinator, checkpoint WAL, and copy the database as a consistent unit.
A raw copy of only the main file while WAL is active is not a backup.

If migration fails, SQLite transaction rollback preserves the previous version
and the coordinator refuses to start. If the new binary must be rolled back
after a successful forward migration, restore the pre-upgrade backup before
starting the old binary. A newer database is deliberately rejected by the old
binary.

## Sensitive content retention

The database currently persists full envelopes, proposal reasons, summaries,
grant JSON, adapter references, operation results, reconciliation evidence, and
audit detail. File mode `0600` and a small child-process environment are not
encryption at rest.

The M1 purge implementation in #10 MUST follow these classes:

| Class | Examples | Required deletion behavior |
|---|---|---|
| Content | envelope content/reason, proposal reason, task summary fields, model-visible rendering | purge after configured expiry plus grace; never retain only for convenience |
| Credentials and secrets | transport tokens, provider keys, raw authorization headers | never persist in this database |
| Adapter-local references | session IDs, capability snapshots | delete on task retirement plus retention grace unless an active submission needs reconciliation |
| Integrity metadata | message ID, task/incarnation IDs, canonical digests, grant/version, disposition state, timestamps | may outlive content under policy for replay defense and audit |
| Audit detail | reason codes and bounded evidence references | redact fields that reveal purged content; retain only policy-approved metadata |
| Unknown external attempt | stable adapter key, receipt/reconciliation evidence | retain until reconciled and then for the configured audit period |

Deletion MUST preserve enough non-content metadata to reject replay and explain
that content was purged, without reconstructing the content. Purge must cover
the main database, WAL/checkpoint lifecycle, backups, exported inspector files,
and test artifacts according to their separate retention policies.

`secure_delete = FAST` reduces ordinary free-page remnants but does not promise
forensic erasure from SSD wear leveling, filesystem snapshots, backups, or
already exported logs. Operators needing stronger deletion guarantees must use
encrypted storage with key destruction and managed backup expiry.

## Tested migration invariants

The storage test suite verifies:

- a fresh database records ordered immutable versions 1 and 2;
- a version-1 database upgrades without rewriting its recorded checksum;
- a version-zero prototype database is adopted without deleting unrelated data;
- a newer database is rejected without modification;
- incompatible adoption rolls back `schema_migrations` and `user_version`;
- a modified migration checksum is rejected;
- required table columns and named indexes are revalidated on every open;
- existing restart, crash-window, CAS, receipt, and mailbox tests still pass.
