# External review records

This directory is reserved for machine-checkable transcriptions of qualifying
public reviews under [issue #7](https://github.com/fyaic/threadmesh/issues/7).
A reviewer may use the normal Markdown template; maintainers transcribe the
accepted public artifact here without changing its verdict or findings.

Each record must follow
[`external-review-record.example.json`](../external-review-record.example.json)
and must identify:

- a public GitHub reviewer login, affiliation, and relationship to `fyaic`;
- exactly one required perspective: `distributed-systems` or `agent-safety`;
- the exact M0 review target;
- an approving verdict, a numeric issue-#7 comment permalink, and the canonical
  digest of that exact comment body;
- every finding with a terminal disposition, rationale, and repository evidence.

Resolve the immutable source fields from the authenticated GitHub comment
without printing its body:

```sh
npm run review:source -- https://github.com/fyaic/threadmesh/issues/7#issuecomment-1234567890
```

The gate manifest stores the canonical SHA-256 digest of each record. Generate
it with:

```sh
npm run review:hash -- docs/09-reviews/external/<review>.json
```

After adding both records and their digests, change the manifest status from
`awaiting` to `accepted`, then run:

```sh
npm run validate:review-gate
```

The operational verifier resolves each comment through authenticated GitHub
API access. It rejects a missing comment, author-login or author-association
mismatch, changed body or timestamp, a body that does not bind the exact commit,
perspective, verdict, and transcribed findings, duplicate reviewers, missing
perspectives, a missing outside reviewer, target mismatch, non-approving
verdicts, nonexistent repository evidence URLs, and findings without terminal
public dispositions. The checked-in
record digest protects repository transcription integrity; it is not treated as
proof of reviewer identity.
