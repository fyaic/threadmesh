# Continue when one agent runs out of quota

**Yes, ThreadMesh can carry saved working context to another harness. No, it
cannot recover an unsaved invisible conversation or bypass a subscription limit.**

The useful unit is a portable checkpoint: your goal, decisions already made,
constraints, current progress, relevant files, and the next step. It is not a
lossless export of hidden model state, credentials, permissions, or every token
of a long conversation.

## Before the original provider is exhausted

The connected agent has `threadmesh_checkpoint` and generic guidance to save
after meaningful progress. Saving is model-selected, so verify a checkpoint
exists with `status`; do not assume it was saved. You can ask for a checkpoint
explicitly, or create a JSON file and import it:

```json
{
  "goal": "Finish the orders client release",
  "decisions": "Use cursor pagination; public endpoint stays /orders",
  "constraints": "Do not redeploy the backend. User approved US English copy.",
  "progress": "API contract updated; client tests still need revision",
  "files": "src/orders-client.mjs, test/orders-client.test.mjs",
  "next": "Inspect current files, update pagination tests, run the test suite"
}
```

```sh
npx threadmesh checkpoint backend --workspace .threadmesh --file checkpoint.json
npx threadmesh handoff backend --workspace .threadmesh --out handoff.md
```

Export refuses to overwrite an existing file. Checkpoints contain your data;
review them before sharing or committing. No secret scanning guarantee is made.

## Switch to another installed, authenticated harness

From the project containing the actual working files:

```sh
npx threadmesh continue backend --workspace .threadmesh --agent kimi --name recovery
```

This launches a **new native session**, supplying the last saved checkpoint as
its starting context. You can also choose `codex`, `pi`, or `deepseek`. DeepSeek
continuation uses its headless profile. The destination must have its own valid
account and quota. The source's hidden state and tool authority do not transfer.

This does not detect provider reset times, rotate accounts, wait for quota,
automatically stop the source, transfer files to another machine, or select a
new model without your direction. Stop/pause the source if it might later
resume and edit the same files. If there is no checkpoint, the command fails
clearly; use an available native export or manually summarize instead.

## What this solves in daily work

| Situation | Context worth carrying | Remaining human decision |
|---|---|---|
| Five-hour or weekly quota interrupts a coding task | Current commit/files, failed tests, agreed constraints, next step | Which other harness/account to use |
| Move from research to implementation | Accepted conclusions, sources, rejected approaches | Which conclusions need verification |
| Another agent rewrites copy you already approved | Terminology, tone and explicit user decisions | Which other workstreams should receive these constraints |
| Debugging repeats yesterday's dead ends | Reproduction, commands tried, negative results | Whether environment changes invalidate them |

These are practical recipes, not four independently benchmarked successes.
The first release validates checkpoint persistence/export and a real Pi model
continuing a deliberately seeded checkpoint: it kept the approved product name,
fixed spelling, left the protected version file unchanged and saved its own
checkpoint. This is not an export of an actual quota-blocked Kimi session; see
the [dated live record](../09-reviews/2026-09-05-first-use-validation.md).
