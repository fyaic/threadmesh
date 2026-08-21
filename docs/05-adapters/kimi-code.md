# Kimi Code ACP adapter experiment

> Experimental implementation note. This is not a production compatibility
> claim.

Kimi Code CLI `0.36.1` exposes an ACP v1 stdio server through `kimi acp`.
ThreadMesh uses the official `@agentclientprotocol/sdk` client to probe the
binary and run receiver-mediated prompts.

## Supported experimental surface

- ACP initialization and capability snapshot digest;
- creation and reload of a registered ACP session ID;
- paginated exact-session lookup and deletion with absence verification;
- streamed text aggregation;
- canonical JSON rendering of untrusted peer suggestions;
- fail-closed permission requests;
- no client filesystem or terminal capabilities.

The experiment does not advertise `steer` or `interrupt`. ACP session
cancellation alone cannot prove that tools or external subprocesses stopped.
It also advertises `durableSubmissionIdempotency: none`: ACP v1 does not expose
a stable prompt-operation key or queryable receipt in this integration.

## Run

```sh
npm test
npm run smoke:kimi
```

Set `KIMI_BIN` to override the default local binary path.
The default smoke performs no model turn. The gated live alias
`npm run smoke:kimi:live` invokes the common product runner.

## Provenance rule

ThreadMesh content is rendered as canonical JSON beneath a fixed version marker.
JSON escaping prevents peer content from terminating or forging the metadata
wrapper. The object labels its authority as `untrusted-peer` and carries message,
source incarnation, relationship, actor type and claim status fields.

ACP v1 still carries that object through the ordinary prompt surface. Therefore
this experiment preserves semantic labels, but cannot prove a distinct provider
role or higher/lower instruction precedence inside the receiving harness.

Before dispatch, the coordinator atomically creates a durable, single-use
admission claim bound to the message revision, grant version and registered ACP
session/capability digest. The adapter independently revalidates the canonical
envelope and matching receiver acceptance before sending its ordinary prompt.
The
claim is the revocation linearization boundary: revocation before it blocks the
dispatch; revocation after it cannot retract an already in-flight prompt. If a
process crashes after dispatch but before confirmation, the persisted claim
stays `in-flight` and requires reconciliation rather than automatic redelivery.
Confirmation accepts only matching ACP session and capability evidence.

Mailbox claims currently identify the receiver task, not a worker instance.
Receiver replicas sharing the same authenticated task principal can replay the
same bounded claim token; disposition CAS still permits only one acknowledgement.
Per-worker claim ownership and takeover are required before a multi-worker
deployment can claim exclusive work leasing.

This legacy admission claim is distinct from the public native submission
receipt state machine. It safely prevents automatic duplicate prompt admission,
but it cannot manufacture an ACP receipt query. Consequently the Kimi profile
remains suggestion-only even though the coordinator can model crash-safe native
receipts for harnesses that expose them.

`session/load` notifications are treated as historical replay and cleared before
the new prompt turn is collected.

## Trust and isolation boundary

The coordinator is a trusted, in-process, single-user prototype. Its `principal`
arguments are identity injection points for a future authenticated transport;
they are not themselves an authenticator. It stores task owners and rejects a
user grant outside the issuer's owned source and target tasks.

The adapter passes only a small environment allowlist plus explicit overrides.
Disabling ACP client filesystem and terminal methods does not sandbox the child
agent: it still has the native privileges of its operating-system process and
receives the configured working directory. Untrusted agents require a container,
OS sandbox or equivalent worktree isolation supplied by the operator.

## Current limitation

The 2026-08-20 live prompt attempt reached the real Kimi ACP path but was
blocked by the account's billing-cycle quota. A later real no-model run created,
listed, deleted, and proved absence of one exact session. The deterministic
fake-agent session reload, permission-denial and delivery behavior also passed.
The stacked multi-product matrix runs this same admission claim beside Codex and
Gemini. A shared runner now rehearses the exact session cleanup and full
coordinator path before any live turn. See the
[smoke evidence](../09-reviews/2026-08-20-kimi-code-smoke.md) and
[real product runbook](../09-reviews/real-product-e2e-runbook.md).
