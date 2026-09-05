# Earn the first 100 stars by being useful

Date: 2026-09-05. Owner: maintainers. Baseline: 2 stars, 0 forks.
100 legitimate stars is a target, not a delivery guarantee or a reason to
purchase stars, manufacture testimonials, or spam other projects' issues.

## What competitors teach us

| Observed signal | Lesson | ThreadMesh response |
|---|---|---|
| [Repowire #208](https://github.com/prassanna-ravishankar/repowire/issues/208): clean-checkout startup missing web output | A repository pass is not an install pass | Packed-consumer previews, workspace init and setup tests |
| [Repowire #192](https://github.com/prassanna-ravishankar/repowire/issues/192): MCP configuration handling | Integration must not damage the tools users already use | Invocation-scoped Codex/Pi config; preserve/backup Kimi servers |
| [Repowire #368](https://github.com/prassanna-ravishankar/repowire/issues/368): restart identity/presence | Workstreams must survive a daemon restart | Persistent names, inboxes and checkpoints; duplicate-live-name protection |
| [Agent Mail #254](https://github.com/Dicklesworthstone/mcp_agent_mail/issues/254): consuming inbox reads | Merely looking must not make work disappear | Repeated inbox reads return the same pending message; explicit decision |
| [Agent Mail #263](https://github.com/Dicklesworthstone/mcp_agent_mail/issues/263): project-addressed mailboxes | Users think in projects/workstreams, not opaque session IDs | Explicit named workspace members with published goals |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): composable official plugin runtime | Meet users in a product they already want to try | Official MCP client patch, not a new model gateway |

These are product-design lessons from actual reports, including closed issues;
they are not claims that competitors remain broken. DeepSeek's official
repository did not expose issues during this check, so no DeepSeek community
issue trend is invented here.

Our potential differentiation is the whole useful loop: relevant session
awareness → model-selected advice → controlled receiver action → recoverable
context. Messaging alone is not enough. Avoid describing a local mailbox as a
new form of general intelligence.

## Ordered launch, with measurable gates

1. **Usable alpha:** install from a clean consumer, confirm native tools, show
   one actual file-changing collaboration. Publish the exact model and prompts.
   Fix failed onboarding before spending time on another hero animation.
2. **Three independent attempts:** invite the existing #79 commenter after
   improvements, then accept short reports from interested users. Record
   install path, first failure, time to first useful result, and expected use.
   Maintainer/self tests do not count.
3. **Three task families:** API dependency, previously agreed constraints, and
   recovery from a saved checkpoint. Measure useful outcome and irrelevant
   messages. A real quota error is not proof that a handoff recovered context.
4. **One evidence-led launch post:** 20–40 seconds showing separate session
   names, A's actual tool call, B's peer-source indicator and the resulting file
   diff/test. No synthetic clip labelled as recording. A captioned event replay
   is acceptable only when explicitly labelled as a replay of retained events.
5. **Relevant distribution:** prepare an opt-in integration/example submission
   to the DeepSeek and Pi ecosystems after their corresponding live test passes;
   one substantive launch discussion where project sharing is welcomed. Check
   each community's current contribution rules before posting.
6. **Weekly decision:** track successful first runs, repeat use and actual
   collaborations alongside stars. If users load the tools but do not see
   value, fix awareness/workflow fit rather than multiplying adapters.

Near-term acceptance target: 3 independent setup attempts, 2 independently
reported useful outcomes, 1 returning user, then broaden outreach. These are
targets, not results. No autonomous recurring monitor has been configured.

## Suggested launch copy (draft, not posted)

“I kept copying decisions between coding-agent sessions, so I built ThreadMesh.
It gives sessions in a local workspace peer goals, advisory messages and a
portable checkpoint when I need to switch tools. Pi has an opt-in idle receiver;
other MCP hosts currently read messages during their normal turns. It's early,
and models sometimes stay silent. I'd especially like feedback on the first
setup step that fails or the moment you expected useful coordination and got
nothing.”

Only add a DeepSeek autonomous-model claim after that exact live path passes.
