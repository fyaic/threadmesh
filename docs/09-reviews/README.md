# Design reviews

This directory preserves review evidence, including reviewer identity,
reviewed commit, verdict, findings, and follow-up disposition.

## M0 external review

- [Reviewer packet](m0-external-reviewer-packet.md)
- [Review submission template](external-review-template.md)
- [Machine-checkable review gate](m0-review-gate.json)
- [External review record format](external/README.md)
- [Public review issue #7](https://github.com/fyaic/threadmesh/issues/7)

The packet targets the first commit containing all normative M0 blocker fixes.
External verdicts and finding dispositions will be linked here without
rewriting their original text.

The checked-in gate manifest currently remains `awaiting`. It cannot become
accepted until two qualifying public records exist and pass
`npm run validate:review-gate`.

## 2026-08-20 internal review round

Three independent read-only review lanes examined
`c38873026222175433fb86f2fcac1a655ffcc932`:

| Perspective | Reviewer | Initial draft verdict | Prototype re-review |
|---|---|---|---|
| Distributed systems and protocol correctness | Internal Codex sub-agent | Request changes | Approved |
| Agent safety, authorization, and privacy | Internal Codex sub-agent | Request changes | Approved |
| Cross-harness implementability | Internal Codex sub-agent | Request changes | Approved |

- [Distributed-systems review](2026-08-20-distributed-systems.md)
- [Safety review](2026-08-20-safety.md)
- [Adapter implementability review](2026-08-20-adapter-implementability.md)
- [Kimi Code integration evidence](2026-08-20-kimi-code-smoke.md)
- [Codex App Server preflight evidence](2026-08-20-codex-app-server-preflight.md)
- [Third harness selection and Gemini preflight](2026-08-20-third-harness-selection.md)
- [Real agent-product validation runbook](real-product-e2e-runbook.md)

These are independent review passes but not organizationally independent
external reviews. They therefore do not, by themselves, satisfy the external
review requirement in GitHub issue #7.

The final approvals apply only to the conservative experimental implementation
merged in [#20](https://github.com/fyaic/threadmesh/pull/20). The normative
findings originated in #15–#19. Issues #15–#19 now have normative, executable
resolutions. Independent review under #7 is the remaining M0 gate.

## 2026-08-21 gated-product review round

Three new independent internal lanes reviewed the exact pre-remediation head of
Draft PR #45. All requested changes; the candidate remediation closes the live
gate, proposal transaction, Gemini terminal-state, cleanup-ownership, and exact
marker findings while recording multi-worker and crash-reconciliation work as
explicit production follow-up.

- [Gated product validation review and disposition](2026-08-21-gated-product-validation.md)

This round is internal and also does not count toward issue #7.
