# M5.2 real Codex model/tool canary

> Classification: completed real-product canary, intentionally `blocked` for
> the integrated M5.2 gate. This is not evidence of complete session
> initiative or a ThreadMesh-driven lifecycle handoff.

## Recorded run

| Field | Recorded value |
| --- | --- |
| Date | 2026-09-01 |
| Scenario | `m52-real-codex-20260901-01` |
| Validated source base | `1155fc8439d81438a4f6892f4414355f129b0444` |
| Product | Codex CLI `0.145.0`, ChatGPT-authenticated App Server |
| Implementation | [PR #114](https://github.com/fyaic/threadmesh/pull/114) |
| Product evidence class | `real-codex-product-canary` |
| Claim | `real_product_model_tool_canary` |
| Result | `state=blocked`, `liveProductEvidence=false` |
| Public evidence | 25 records; head `sha256:061a199d99bf30ec6ec6fb85f6a293ff436ea82858a41052fdb5ec9bb77e44d6` |

The operator retained the bounded public result, private trace, and cleanup
manifest locally for this run. Private artifact paths and raw task identifiers
are intentionally absent from this public record. The same bounded result is
also recorded in the
[issue #91 run comment](https://github.com/fyaic/threadmesh/issues/91#issuecomment-5483969422).

## What ran

The runner pre-created five real Codex roles: implementer A, reviewer R,
verifier V, a waiting dependent, and an authorized irrelevant control. It then
submitted four bounded phase prompts:

1. A implemented and selected the artifact-publication tools;
2. R inspected the exact implementation and reported a reproducible finding;
3. the original A thread and worktree resumed and created the fix;
4. V selected exact-chain verification.

The run observed seven model-selected tool calls and two fixture commits. The
implementation commit `e8ab19a3582ce7d626770654070ddcd4ba5877dd` and fix commit
`86109b3227f956ca941a7fe039ebb39c3d7be91f` formed the required direct-parent
chain from fixture seed `3e27758ed9eb5302754b825b8945b5e8b3ceffe5`.
The implementer and resumed-implementer identity digests matched exactly, and
the same worktree was retained. The dependent and irrelevant controls each had
zero post-bootstrap turns.

Cleanup was exact: five threads were created, five were deleted, five absence
checks passed, and the fixture was removed. All four business-turn journals
were retired.

## Evidence summary

| Required canary observation | Result |
| --- | --- |
| Five roles pre-created | Pass |
| Four post-bootstrap business turns | Pass |
| Seven model-selected bounded tool calls | Pass |
| A published an implementation | Pass |
| R discovered and reported a reproducible finding | Pass |
| Same A thread and worktree fixed the finding | Pass |
| V requested exact-chain verification | Pass |
| Two commits with direct-parent relationship | Pass |
| Dependent and irrelevant controls stayed at zero turns | Pass |
| Five deletions and five confirmed absences | Pass |

## Honest claim boundary

This run proves that real Codex persistent threads can execute the bounded
A -> R -> same-A -> V model/tool sequence and preserve identity, Git-chain,
negative-control, and cleanup invariants.

It does **not** prove the product effect targeted by M5.2. The runner submitted
all four phase prompts (`phasePromptsSubmittedByRunner=4`), and ThreadMesh did
not initiate lifecycle handoffs (`lifecycleHandoffsByThreadMesh=false`). The
dependent remained locked, so the result correctly reports
`liveProductEvidence=false`. No documentation or release claim should describe
this record as complete cross-session initiative, autonomous receiver consent,
or an M5.2 pass.

The public result lists the remaining integrated gates explicitly:

- coordinator attention routing;
- receiver-owned decisions;
- context-admission receipts;
- durable recovery checkpoints;
- independent verifier attestation;
- dependency finalization.

The next run must replace runner-directed phase sequencing with the real
coordinator lifecycle, admission, durable recovery, signed verification, and
authority-bearing dependency-finalization path. Only that separate
`real-codex-integrated-gate` result can set `liveProductEvidence=true`.
