# Permission model

> Draft normative document.

Authorization evaluates the tuple:

```text
(actor, sender incarnation, target incarnation, relationship grant, intent,
delivery mode, freshness, policy)
```

The actor named inside a request is claimed authorship, not operation
authority. Operation authority comes only from the transport-authenticated
context. A request payload cannot supply or override that context.

## Baseline matrix

| Sender relationship | `notify` | `suggest` | `steer` | `interrupt` |
|---|---:|---:|---:|---:|
| User owner | Allow | Allow | Allow | Allow |
| `supervisor` | Allow | Allow | Policy | Policy |
| `parent` | Allow | Allow | Policy | Policy |
| `child` | Allow | Allow | Deny | Deny |
| `peer` or `dependency` | Allow | Allow | Deny | Deny |
| `observer` | Policy | Deny | Deny | Deny |
| Unrelated | Deny | Deny | Deny | Deny |

Deployments MAY make the matrix stricter. They MUST NOT make user-owned tasks peer-steerable by default.

## Capability versus permission

Capability answers whether an adapter can perform an operation. Permission answers whether this sender may request it for this target. Both must pass.

Authorization to send is not authorization to inject model context. The
receiver independently owns context admission and MAY reject, defer, or
downgrade a permitted request to a safer supported mode when semantics remain
honest. It MUST reject mappings that would change the requested intent.

## Approval

Policies may require user approval for:

- first contact between peer tasks;
- any `steer` of a user-owned task;
- interruption of a running tool;
- delivery across a trust boundary;
- disclosure of task summaries above a sensitivity threshold.

An agent-authored relationship proposal is never approval. Effective grants
are created only by an authenticated owner or policy decision and bind the
issuer, authentication event ID, decision ID, grant version, optional proposal
ID, and recomputable canonical integrity digest.

## Revocation

Revoking a relationship invalidates queued state-changing messages. Adapters should also rotate or invalidate cached capability grants.

Mailbox reads, claims, decisions, summary reads, and adapter admission
preparation reauthorize the exact current grant/version. Revoked or superseded
queued content is quarantined before envelope disclosure.

Task recreation invalidates every grant bound to the previous incarnation,
even if a harness reuses the same human-readable task ID.
