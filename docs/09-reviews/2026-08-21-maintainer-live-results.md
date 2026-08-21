# Maintainer-authorized live results — 2026-08-21

## Scope

These are real product attempts through the merged ThreadMesh coordinator,
starting at `dea644ce316be965651e42d1215f73948a54a25f` and extending through the
proactive path at `248d650ab06e6e34de9cc41ede641c841c1e36a3`. The maintainer
explicitly authorized the bounded experimental mode. The results are non-normative:
`authorization.mode` is `maintainer-experimental`,
`normativeReviewSatisfied` is `false`, and issue #7 remains open with zero
qualifying external reviews.

Every attempt started from clean synchronized `main`, executed in a detached
worktree at the exact SHA, used the common mailbox/acceptance/admission path,
and completed its product-specific cleanup. Raw transcripts, provider details,
credentials, and local paths are intentionally not recorded.

## Result matrix

| Product | UTC interval | Result | Stable code | Cleanup |
|---|---|---|---|---|
| Codex App Server | 09:45:31–09:49:31 | `failed` | `threadmesh_product_marker_mismatch` | Exact thread deletion acknowledged |
| Kimi Code ACP | 09:49:57–09:50:03 | `failed` | `acp_agent_error` | Session deleted and absence verified |
| Codex App Server rerun | 09:56:17–10:00:03 | `passed` | — | Exact thread deletion acknowledged |
| Kimi Code ACP rerun | 10:00:20–10:00:26 | `blocked` | `acp_agent_quota_error` | Session deleted and absence verified |
| Gemini CLI | Not started | `not-run` | Explicit credential unavailable | No resource created |
| Codex proactive A-to-B, first attempt | 12:05:06–12:07:09 | `failed` | `codex_app_server_remote_error` | B deleted; empty A rollout did not persist |
| Codex proactive A-to-B, persisted-A rerun | 12:13:19–12:19:35 | `passed` | — | Both exact tasks deleted |

## Interpretation

The execution gate and exact-main bootstrap are no longer the blocker. The
first results produced a narrow cross-adapter correction: receiver-accepted
content is presented as safe advisory task context without being elevated to
user authority or permission to change external state, and ACP quota evidence
is classified across both the protocol error and stderr boundary.

The rerun at `0dda5a7c999ff07e37b157c943be313886622c33` produced the first real
ThreadMesh product pass. Codex `gpt-5.6-sol` traversed mailbox claim, receiver
acceptance, durable admission, exact marker, kind-specific evidence,
`context-admitted` audit, and exact thread cleanup. Kimi was truthfully
classified as provider-quota blocked and again proved deletion plus absence.
Gemini correctly remained unstarted because no explicit `GEMINI_API_KEY` was
present.

The proactive rerun at `248d650ab06e6e34de9cc41ede641c841c1e36a3` is the
first real model-selected cross-task communication pass. Agent A called the
relationship-summary tool and then the bounded suggestion tool exactly once;
the harness performed zero scripted submits and observed zero non-ThreadMesh
tool calls. Agent B consumed the coordinator-admitted suggestion and returned
its exact marker. Both task deletions completed. The failed precursor at
`6a4b17a` exposed the already known empty-thread persistence behavior and was
fixed by PR #55 before the successful clean-main rerun.

The next behavioral threshold is an irrelevant-task control and a measured
receiver-interference case. The next portability threshold is still a second
materially different harness pass, using Kimi after quota becomes available or
Gemini after an explicit credential is supplied. No blocked or credential-free
attempt is promoted to a pass.
