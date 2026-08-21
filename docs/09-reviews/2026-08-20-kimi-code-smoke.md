# Kimi Code smoke evidence — 2026-08-20

## Environment

- Binary: `/Users/veil/.kimi-code/bin/kimi`
- Kimi Code CLI: `0.36.1`
- Interface: stable ACP v1 over stdio
- Adapter dependency: `@agentclientprotocol/sdk` `1.3.0`
- Binary digest:
  `sha256:53b8a5d9380131a23c58937f28d64e93830c56aa92c41432f24ab9d8eccf0e50`

## Real Kimi probe

`npm run smoke:kimi` successfully launched `kimi acp`, negotiated ACP protocol
version 1, and observed:

- agent name `Kimi Code CLI`;
- version `0.36.1`;
- session list, resume, close, delete, fork, and additional-directory support;
- HTTP and SSE MCP support;
- image and embedded-context prompt support;
- capability snapshot digest
  `sha256:edeac5f99428a5497a18f83cac49aa6a4927c2d95bef00221c2111d530be7ed2`.

This handshake does not require a model turn and passed against the installed
binary.

## Real session lifecycle preflight

The hardened `npm run smoke:kimi` no-model path ran from
`2026-08-20T12:37:51.255Z` through `2026-08-20T12:37:53.986Z` and:

- created session `session_382e4238-2576-43d9-80e6-9c8506d20c0c`;
- found that exact session through paginated `session/list`;
- deleted that exact session through `session/delete`;
- listed again and proved the session was absent;
- reproduced the capability snapshot digest before and after cleanup.

This is a real Kimi product lifecycle pass. It performs no model turn and does
not prove model behavior.

## Live prompt result

An earlier live adapter attempt successfully reached the real Kimi ACP prompt
path. Kimi returned
HTTP 403 because the account had reached its billing-cycle usage limit. The
script classified only this recognized quota response as
`kimi_quota_exhausted` and exited `2`. The live model result is therefore
**blocked**, not passed. No purchase or account change was attempted.

## Offline behavioral result

The same adapter passed against a deterministic fake ACP agent:

- stdio process spawn and ACP initialize;
- session creation and reload by registered session ID;
- prompt submission and streamed message aggregation;
- a real ACP permission request cancelled by the adapter;
- fail-closed client filesystem and terminal capabilities;
- minimal child-process environment allowlist;
- absolute executable-path validation.

The SQLite coordinator integration additionally passed:

- durable mailbox recovery after process restart;
- same-ID replay and different-payload conflict rejection;
- expected-revision CAS;
- current-grant reauthorization before a durable, single-use admission claim;
- rejection of sender-claimed user provenance;
- owner-scoped grant installation and mandatory issuer identity;
- adversarial JSON provenance rendering;
- adapter evidence recorded only after successful ACP delivery.

The claim is the explicit revocation boundary. A post-claim crash leaves the
message in-flight for reconciliation; it is not automatically redelivered.

The fake agent proves protocol and coordinator behavior, not Kimi model
semantics. Disabling ACP client methods is also not an operating-system sandbox.

The live alias remains gated and delegates to the common runner:

```sh
npm test
npm run smoke:kimi
npm run smoke:kimi:live
```

The second command is the no-model lifecycle preflight. When M0/M1 are merged,
the checked-out repository is clean synchronized `main`, and Kimi quota is
available, the third command passes only if the untruncated
response is exactly `KIMI_THREADMESH_LIVE_OK`, the turn ends normally, and no
permission was requested. It deletes the exact created session in `finally` and
then verifies absence. Unexpected protocol, marker, or cleanup errors are
`failed`, not `blocked`. Until then, autonomous A-to-B model behavior is not
claimed as verified.
