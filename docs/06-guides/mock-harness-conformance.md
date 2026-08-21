# Two-profile mock harness conformance kit

> Deterministic M1 reference evidence. Passing this kit does not imply real
> product interoperability or production security.

## Profiles

The kit deliberately uses two different interaction styles defined by
`MOCK_HARNESS_PROFILES`:

| Profile | Interaction style | Advertised boundary |
|---|---|---|
| `eventWatcher` | observes task events, dispositions, audit, summaries, and snapshots | relationship-scoped discovery; notify/suggest only; no context admission or cancellation |
| `pullMailbox` | pulls receiver mail, distinguishes side-channel notification, and claims/decides checkpoint offers | receiver-mediated suggestion admission; notify/suggest only; steer/interrupt degrade explicitly |

Both profiles are validated against the public capability schema before the
scenario runs. They use serialized authenticated JSON-RPC calls rather than
calling coordinator mutation methods directly.

## Behavior matrix

[`mock-harness-conformance.test.mjs`](../../test/mock-harness-conformance.test.mjs)
covers:

| Scenario | Required evidence |
|---|---|
| Relationship discovery | related projected summary succeeds; another relationship projection and global task enumeration fail |
| Dropped notification response | identical retry is an operation replay; one durable receive event exists; no adapter submission exists |
| Side-channel notification | pull profile observes `notify`/`side-channel` with `modelVisible: false`; delivery never becomes context-admitted |
| Suggestion decisions | accept, reject, and defer each produce receive, mailbox-claim, and receiver-decision audit events |
| Receiver rendering | peer authorship and both harness identities remain visible through the inspector |
| Stale state change | stale objective versions for both steer and interrupt fail policy before persistence |
| Unsupported capability | fresh steer and interrupt are recorded as `unsupported` with `unsupported-intent` rather than approximated as prompts |
| Revocation race | queued steer becomes `revoked`, receives `authorization-revoked` audit evidence, and disappears from the mailbox |
| Cleanup | the coordinator closes and its temporary database directory, including WAL/SHM files, is removed in `finally` |

Every persisted scenario checks ordered audit event types. Policy rejection
before persistence is not represented as a message transition.

## Running the kit

Run the whole public conformance boundary:

```sh
npm test
```

Run only the two-profile matrix while iterating:

```sh
node --test test/mock-harness-conformance.test.mjs
```

The test uses a fixed clock, stable logical IDs, a temporary SQLite database,
and no network or model provider. It is deterministic in CI.

## What this does not prove

The profiles do not exercise a real model, provider-native role separation,
OS sandbox, network authenticator, hosted event stream, or real cancellation.
They intentionally advertise no steer or interrupt capability. Real agent
product validation begins only after the normative review gate and the local
coordinator stack are stable.
