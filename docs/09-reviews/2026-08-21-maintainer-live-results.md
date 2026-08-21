# Maintainer-authorized live results — 2026-08-21

## Scope

These are real product attempts through the merged ThreadMesh coordinator at
`dea644ce316be965651e42d1215f73948a54a25f`. The maintainer explicitly
authorized the bounded experimental mode. The results are non-normative:
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
| Gemini CLI | Not started | `not-run` | Explicit credential unavailable | No resource created |

## Interpretation

The execution gate and exact-main bootstrap are no longer the blocker. Codex
reached the real model boundary but did not return the exact marker. Kimi
started the real ACP product path but returned a product error. Both failures
were preserved as failures, and both cleanup checks passed. Gemini correctly
remained unstarted because no explicit `GEMINI_API_KEY` was present.

The next mainline slice is intentionally narrow: improve the bounded Codex
marker instruction without weakening exact comparison, classify the Kimi ACP
failure to a stable actionable category without publishing provider text, then
rerun the same immutable scenario. No result becomes `passed` until the exact
marker, coordinator evidence, audit event, and cleanup all succeed.
