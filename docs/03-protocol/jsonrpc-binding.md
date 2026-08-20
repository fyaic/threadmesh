# JSON-RPC binding

> Draft normative binding plus an executable local reference implementation.

ThreadMesh binds its logical operations to JSON-RPC 2.0 without placing
authentication claims inside the JSON-RPC request. A host authenticates the
transport first, resolves a typed authentication context, and passes that
context beside the request to the binding.

```text
transport credential
  -> authenticator
  -> AuthContext(authenticationId, principal, mechanism)
     + JSON-RPC request(no principal field)
  -> authorization and operation dispatch
```

The machine-readable request, success, and error envelopes are in
[`threadmesh-jsonrpc.schema.json`](../../spec/schema/threadmesh-jsonrpc.schema.json).
The resolved context is defined by
[`threadmesh-auth-context.schema.json`](../../spec/schema/threadmesh-auth-context.schema.json).

## Authentication boundary

`params.principal`, `params.actor`, and equivalent caller-selected authority are
invalid. The request payload may contain claimed authorship, such as an envelope
sender, but the server compares that claim with the transport-authenticated
principal:

- a task principal may author only as `agent` for its exact task incarnation;
- `user` or `policy` authorship requires the corresponding authenticated
  control-plane principal and an exact `actorId` match;
- a user principal must own the claimed sender task; policy authority remains a
  separately provisioned control-plane role;
- service authorship is not enabled by the reference binding.

The checked-in `StaticTokenAuthenticator` is only a local reference mechanism.
It accepts contexts provisioned by the trusted host and refuses mechanism labels
other than `local-static-token`. Production deployments must replace it with a
real mTLS, OAuth access-token, or host-attestation verifier and must not accept a
client-supplied `AuthContext`.

## Bound methods

| Method | Required principal | Mutation controls |
|---|---|---|
| `tasks.register` | user owner or policy | incarnation ID plus durable idempotency key |
| `tasks.get` | owner, policy, or exact task | read only |
| `tasks.attach` | owner, policy, or exact task | task revision CAS and idempotency key |
| `tasks.rotateIncarnation` | owner or policy | old task revision CAS and idempotency key |
| `tasks.publishSummary` | owner, policy, or summarized task | summary version CAS, current grant projection, idempotency key |
| `tasks.getSummary` | exact grant source task | current grant and version reauthorization |
| `relationships.propose` | exact source task | proposal ID, expiry, and idempotency key; no authority is created |
| `relationships.grant` | owner or policy | decision ID, optional proposal binding, integrity digest, idempotency key |
| `relationships.revoke` | issuer, target owner, or policy | grant-version CAS and idempotency key |
| `messages.send` | exact task or authenticated owner/policy author | message replay protection plus operation idempotency |
| `messages.respond` | exact receiver task | disposition revision CAS and idempotency key |
| `messages.getDisposition` | exact sender or receiver task | read only |
| `mailbox.listPending` | exact receiver task | opaque monotonic cursor, expiry and current-grant filtering |
| `mailbox.claim` | exact receiver task | disposition revision CAS, 60-second bounded claim, idempotency key |
| `mailbox.ack` | exact receiver task holding claim | claim token, disposition revision CAS, idempotency key |
| `tasks.wait` | exact task | cursor-based immediate event poll |
| `audit.list` | exact sender or receiver task | read only |

The local `tasks.wait` implementation is a non-blocking cursor poll: an empty
page returns `timedOut: true`. A network host may hold the request until an event
or timeout while preserving the same cursor and response semantics.

## Proposals and effective grants

A relationship proposal is agent-authored, non-authoritative, and expiring.
`relationships.grant` creates a distinct effective grant only after an owner or
policy decision. The server stamps the authenticated issuer, authentication
event ID, decision ID, decision/effective-creation time, optional proposal ID,
and a SHA-256 digest over the canonical grant plus authorization decision.
Consumers recompute the digest; a correctly shaped but tampered digest is
invalid.

Direct owner or policy grants are permitted without a proposal. Agents cannot
turn proposals into effective grants, and approval cannot silently change the
proposal's relationship, endpoints, intents, modes, or summary visibility.

## Idempotency and CAS

The durable operation replay scope is:

```text
(authenticationId, method, idempotencyKey)
```

An identical retry returns the stored result with `operationReplay: true`. Reuse
of the same scoped key with different canonical params returns
`threadmesh_idempotency_conflict`. Resource-level IDs, grant versions, message
IDs, and expected revisions remain independently enforced; the RPC request ID
is only a correlation identifier.

Task attachment and rotation, summary publication, receiver responses, mailbox
acknowledgement, and grant revocation use explicit expected revisions. A stale
write returns `threadmesh_revision_conflict` and does not partially apply.

## Mailbox claim and acknowledgement

`mailbox.listPending` filters expired messages and any message whose exact grant
or grant version is no longer current. Revoked content is therefore quarantined
before its envelope is disclosed.

`mailbox.claim` persistently binds one receiver task, message, disposition
revision, random token, and bounded expiry. `mailbox.ack` requires that exact
token and performs the receiver decision under CAS. Mailbox claims are distinct
from adapter-effect admission claims: the former coordinate receiver workers;
the latter are the irreversible dispatch boundary described in the delivery
semantics.

## Typed errors

Errors use a JSON-RPC numeric category plus stable ThreadMesh data:

```json
{
  "code": -32009,
  "message": "threadmesh_revision_conflict",
  "data": {
    "threadmeshCode": "threadmesh_revision_conflict",
    "retryable": true
  }
}
```

| Numeric code | Category |
|---:|---|
| `-32001` | authentication required or invalid |
| `-32003` | authenticated but not authorized |
| `-32004` | resource not found |
| `-32009` | revision, idempotency, or in-flight conflict |
| `-32010` | expired or retired resource |
| `-32602` | schema-invalid request or params |
| `-32000` | other typed ThreadMesh failure |

Clients branch on `data.threadmeshCode`, not on free-form text.

## Executable reference path

[`jsonrpc.mjs`](../../src/bindings/jsonrpc.mjs) implements schema validation,
authentication injection, dispatch, and typed errors. The reference client and
two deliberately different mock harness profiles live in
[`jsonrpc-client.mjs`](../../src/client/jsonrpc-client.mjs): one pulls, claims,
and acknowledges mailbox work; the other watches cursor events and reads
dispositions. The end-to-end test serializes requests and responses, restarts
SQLite between send and receive, and never calls coordinator business methods
from either harness.

This module is a binding, not an Internet-facing server. TLS termination,
credential rotation, rate limiting, process isolation, and deployment-specific
framing remain host responsibilities.
