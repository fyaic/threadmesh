# 15-minute external operator challenge

The next adoption gate is not another maintainer review. It is whether someone
outside the maintainer organization can reach and explain the value in fifteen
minutes without protocol coaching.

## Who should try it

Recruit three operators who already use at least one coding-agent harness. They
do not need ThreadMesh, MCP, ACP, or distributed-systems experience. Maintainers
may observe silently but must not fix the participant's environment during the
clocked attempt.

## Participant task

Start a 15-minute timer, then follow only the repository README:

1. Explain in one sentence what problem ThreadMesh solves.
2. Run the one-command demo from GitHub or a fresh clone.
3. Identify the four lifecycle handoffs.
4. Find why the dependent task became `ready`.
5. Find what happens when the target session is already running.
6. State one workflow where this would or would not be useful.

Stop the timer when all six are complete or at fifteen minutes.

## Record the attempt

Open an
[external operator report](https://github.com/fyaic/threadmesh/issues/new?template=operator.yml)
with:

- harness and OS, without local paths or identifiers;
- install path used and time to first successful demo;
- the participant's one-sentence explanation;
- first confusing or failed step;
- whether the checkpoint and verified-unlock distinction was understood;
- whether they would use the workflow, and why;
- exact cleanup result.

Do not include credentials, prompts, transcripts, repository secrets, task or
session IDs, or screenshots that expose private work.

## Exit criteria

The gate passes after three independent attempts when:

- at least two reach a successful demo inside fifteen minutes;
- all three can distinguish delivery from verified dependency unlock;
- no participant believes ThreadMesh is another general chat or workflow DAG;
- failures and confusion are converted into README or setup changes;
- at least one participant names a real workflow they would try next.

This is formative validation, not a claim of broad product-market fit.
