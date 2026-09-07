# Packaged first useful collaboration

Date: 2026-09-07. Candidate: `0.1.0-alpha.2`, following `613f5ca`.

## User outcome

An already configured Pi user can run `threadmesh try preferences --live` from
an installed package. No custom harness, repository checkout, application
fixture, workspace argument or second terminal is required. The sample creates
two new sessions. It does not attach existing desktop conversations.

This directly addresses the setup burden exposed by the independent
[#158 report](https://github.com/fyaic/threadmesh/issues/158). It does not turn
that contributor's quota-blocked attempt into a successful live test.

## Verification

Environment: macOS, Node `26.3.1`, Pi `0.84.2`, configured `zai/glm-5.3`.
Both tasks receive the retained ordinary prompts in
[live-scenarios.mjs](../../src/workspace/live-scenarios.mjs); no task-specific
recipient or send instruction was added. Generic coordination guidance and
published peer goals remain enabled.

| Check | Result | Limit |
|---|---|---|
| CLI without `--live` | Instructions only; no harness starts | Deterministic test |
| Missing model, quota, early exit, silent runtime, Ctrl-C | Failed/cancelled reports, bounded exit and stopped sample processes | Deterministic process fixtures, not fresh provider-quota evidence |
| Real copy case from working source | Pass, 201.880 seconds | One Pi pair |
| Independent package consumer install | 97 dependencies installed; command available without repository scripts | Warm npm cache, not cold-install timing |
| Real API case from that installed package | Pass, 158.371 seconds | One Pi pair |
| Full regression | 435 passed, 1 optional native test skipped; 55 schema and 7 transition cases | Not a live reliability score |

The real runs used the final coordination/verification behavior. Later changes
added the inline copy comparison and clarified the local-log/provider-network
footer; those output paths are covered by deterministic tests, not a third live
run. Release packaging also adds the final documentation.

### Copy: earlier decisions survive another session's update

The website session finished its first task and volunteered a dependency to
the brand workstream. The brand model then chose to send its update. The same
website session resumed at 135.028 seconds, wrote its own artifact at 171.314
seconds and completed at 201.591 seconds. No second user prompt was sent.

| Field | Before the handoff | After the receiver's own work |
|---|---|---|
| Headline | Organise work with Team Hub | Organize work with Member Portal |
| Description | Unlimited free projects for your team. | 5 free projects for your team. |
| Signup button | Create my workspace | Create my workspace |
| Protected paid-plan price | $12/month | $12/month |

All three observed native sends succeeded; the third was the receiver's reply.
No send targeted the unrelated workstream. This is reciprocal model-selected
cooperation, not blind discovery of arbitrary user conversations.

### API: installed package, useful receiver-owned result

The client first volunteered its dependency; one failed native send preceded
its successful send. The backend later chose to deliver the cursor change.
The same client session resumed at 94.702 seconds, successfully edited its own
file at 129.182 seconds, and completed at 158.058 seconds. The business checker
confirmed two pages, flat returned items and termination.

```js
export async function fetchAll(fetchPage) {
  const items = []; let cursor = null;
  do { const data = await fetchPage({ cursor }); items.push(...data.items); cursor = data.next_cursor; } while (cursor != null);
  return items;
}
```

Both sample process sets stopped. Private events, native transcripts, before/
after files and reports are retained locally, not published with this record.
Event-file SHA-256 commitments:

- Copy: `fee7ecc0462292bca98a812b0829e2573c54dd57316c56720b238a516a88592a`
- API: `0eafa3240da6cc61ef8435891ddd17e807cb1e7c88b1896386a55a34fd4d5c27`

## Review and debugging

Three delegated lanes reviewed runtime failure handling, implemented deterministic
first-use tests, and updated both language entry paths; the root integrated and
ran the real cases. A first no-model native preflight failed because the code
expected `get_state.autoRetryEnabled`; the installed Pi does not expose that
field. The check was removed before the live runs. Retries are disabled with a
sample-local `.pi/settings.json`, not the RPC setter that writes global settings.

The runner uses one five-minute overall limit, bounded verification in a child
process, and POSIX process-group cleanup. Pi retains ordinary OS permissions:
this is not a sandbox or a guarantee against a hostile model. Windows native
process behavior remains unverified. Authentication and quota are checked by
actual model execution, not inferred from an installed binary.

## Next acceptance

Observe a willing independent user's installed-package attempt. Native existing
same-client desktop adoption remains the primary integration gap; neither this
entry nor the new release satisfies it. Do not add more model permutations or
general protocol work before responding to the next first-use failure.
