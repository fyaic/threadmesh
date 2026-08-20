# Multi-product context-admission conformance

The reference coordinator now exercises one receiver-owned accepted suggestion
through three different adapter boundaries:

| Adapter kind | Native evidence required at confirmation |
|---|---|
| `acp-session` | exact session, capability snapshot, `end_turn` |
| `codex-app-server` | exact thread and turn, capability snapshot, completed turn |
| `gemini-headless` | exact caller-selected session, capability snapshot, exit 0, zero tool use |

The common flow is:

```text
registered target adapter
  → relationship-scoped suggestion persisted
  → receiver decision accepted
  → single durable admission claim
  → adapter receives the claimed envelope + admission projection
  → exact kind-specific evidence confirmed
  → context-admitted disposition + projected audit evidence
```

The admission claim stores the adapter-reference digest and is still the
revocation linearization boundary. The coordinator does not accept a generic
success boolean. Unknown adapter kinds, wrong session/thread/snapshot, missing
turn identity, non-completed Codex turns, nonzero Gemini exits, or Gemini tool
use fail closed.

Only a small kind-specific evidence projection is written to audit. Extra
adapter fields are not persisted merely because a trusted-process caller
supplied them.

Run the deterministic matrix with:

```sh
node --test test/threadmesh-multi-product-e2e.test.mjs
npm run validate:products:fake
```

The first command focuses on coordinator evidence rejection. The second uses a
single product-validation runner and additionally proves mailbox claim and
acknowledgement, exact marker matching, bounded audit projection, and exact
product-resource cleanup for all three fake endpoints.

The matrix uses fake product endpoints to prove coordinator/adapter semantics.
It does not prove real model behavior. The mechanically gated live commands use
the same runner and are documented in the
[real product runbook](../09-reviews/real-product-e2e-runbook.md).
