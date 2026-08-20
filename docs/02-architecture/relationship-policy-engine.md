# Relationship policy engine

> M1 implementation contract. Merge of the implementation remains gated by
> the independent M0 review in issue #7.

The reference coordinator evaluates one authorization tuple before accepting a
message and again before every receiver disclosure or adapter-effect boundary:

```text
(authenticated actor, sender incarnation, target incarnation,
 current relationship grant, intent, delivery mode, freshness, local policy)
```

The implementation lives in
[`relationship-policy.mjs`](../../src/policy/relationship-policy.mjs). It is a
pure decision function: the coordinator supplies registry and grant snapshots
read inside the surrounding SQLite transaction. The function does not consult
ambient process identity or caller-selected authority.

## Fail-closed order

The engine denies when any of these checks fails:

1. both exact task incarnations exist and are not retired;
2. an effective grant exists for the exact directional edge;
3. the grant is current, unrevoked, unexpired, and scope-bound;
4. structured gate responses remain disabled in this profile;
5. only `supervisor` and `parent` relationships may carry `steer` or
   `interrupt` authority;
6. the exact intent and delivery mode are present in the grant.

Schema validation supplies the portable intent/mode and freshness shape.
Runtime policy supplies current registry and grant state. Passing one layer
does not bypass the other.

## Non-disclosing denial

The decision has two reason surfaces:

- untrusted callers receive the single stable error
  `threadmesh_policy_denied` and JSON-RPC authorization category `-32003`;
- trusted audit/tests may inspect a bounded internal reason such as
  `grant-missing`, `grant-revoked`, `grant-superseded`,
  `stale-incarnation`, or `relationship-authority-insufficient`.

The binding never serializes the internal reason. Consequently, a caller cannot
distinguish a hidden relationship from a revoked, expired, or superseded one by
probing message delivery.

## Revocation boundary

Grant revocation and queued state-changing invalidation share one immediate
SQLite transaction. Pending, deferred, or accepted `steer`/`interrupt`
messages that have not reached `adapter-submitted` or the durable
`outcome-unknown` external-attempt boundary become `decision = revoked`, gain a
new disposition revision, and receive an `authorization-revoked` audit event.

An `outcome-unknown` attempt is not rewritten because an external effect may
already have occurred. It remains quarantined for receipt recording or manual
reconciliation. Advisory mail is hidden by current-grant reauthorization but
is not rewritten as state-changing work.

## Reauthorization points

The coordinator re-runs policy at message admission, mailbox listing and claim,
receiver decision, context-admission preparation, adapter-submission
preparation, and immediately before the native call boundary. A durable message
or prepared submission is therefore not a cached permission grant.

The current profile has no structured approval response and no production
policy service. A deployment that requires approval must resolve it into a new
effective grant before retrying; it must not silently downgrade a denied
operation.
