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
- an approving verdict and immutable public source URL; and
- every finding with a terminal disposition, rationale, and repository evidence.

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

The verifier rejects duplicate reviewers, missing perspectives, a missing
outside reviewer, target mismatch, digest tampering, non-approving verdicts,
and findings without terminal public dispositions.
