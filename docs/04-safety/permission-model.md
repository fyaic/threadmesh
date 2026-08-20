# Permission model

> Draft normative document.

Authorization evaluates the tuple:

```text
(actor, sender task, target task, relationship, intent, freshness, policy)
```

## Baseline matrix

| Sender relationship | `notify` | `suggest` | `steer` | `interrupt` |
|---|---:|---:|---:|---:|
| User owner | Allow | Allow | Allow | Allow |
| Explicit supervisor | Allow | Allow | Policy | Policy |
| Parent of delegated task | Allow | Allow | Policy | Policy |
| Child of target | Allow | Allow | Deny | Deny |
| Declared peer | Allow | Allow | Deny | Deny |
| Observer | Policy | Deny | Deny | Deny |
| Unrelated | Deny | Deny | Deny | Deny |

Deployments MAY make the matrix stricter. They MUST NOT make user-owned tasks peer-steerable by default.

## Capability versus permission

Capability answers whether an adapter can perform an operation. Permission answers whether this sender may request it for this target. Both must pass.

## Approval

Policies may require user approval for:

- first contact between peer tasks;
- any `steer` of a user-owned task;
- interruption of a running tool;
- delivery across a trust boundary;
- disclosure of task summaries above a sensitivity threshold.

## Revocation

Revoking a relationship invalidates queued state-changing messages. Adapters should also rotate or invalidate cached capability grants.
