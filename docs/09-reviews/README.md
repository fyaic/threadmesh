# Design reviews

This directory preserves review evidence, including reviewer identity,
reviewed commit, verdict, findings, and follow-up disposition.

## 2026-08-20 internal review round

Three independent read-only review lanes examined
`c38873026222175433fb86f2fcac1a655ffcc932`:

| Perspective | Reviewer | Verdict |
|---|---|---|
| Distributed systems and protocol correctness | Internal Codex sub-agent | Request changes |
| Agent safety, authorization, and privacy | Internal Codex sub-agent | Request changes |
| Cross-harness implementability | Internal Codex sub-agent | Request changes |

- [Distributed-systems review](2026-08-20-distributed-systems.md)
- [Safety review](2026-08-20-safety.md)
- [Adapter implementability review](2026-08-20-adapter-implementability.md)
- [Kimi Code integration evidence](2026-08-20-kimi-code-smoke.md)

These are independent review passes but not organizationally independent
external reviews. They therefore do not, by themselves, satisfy the external
review requirement in GitHub issue #7.
