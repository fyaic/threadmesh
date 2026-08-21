# M0 external review template

- Reviewer:
- Affiliation or perspective:
- Relationship to maintainers:
- Reviewed commit:
- Review lane: distributed systems / agent safety / both
- Method and tools:
- Verdict: approve / approve-with-resolved-findings / request changes / abstain

## Reproduction

- `npm test`:
- `npm audit --audit-level=high`:
- Other checks:

## Findings

Repeat this block for each finding. Use `P0` for a release-blocking catastrophic
boundary failure, `P1` for an M0 blocker, and `P2` for important follow-up.

### [P1] Short finding title

- Exact path or schema:
- Expected invariant:
- Observed behavior:
- Reproducer or fixture:
- Recommended resolution:

Write `No findings` when appropriate; do not omit the section.

For a gate-eligible final comment, append exactly one canonical, single-line
machine block. The JSON key order shown is canonical. Use `"findings":[]` for
no findings; otherwise include every finding ID, location, and summary:

```text
<!-- threadmesh-review-v1
{"findings":[],"perspective":"distributed-systems","reviewedCommit":"265e461f1b8714c56f7fe817795b81d895f732c6","schemaVersion":1,"verdict":"approve"}
-->
```

The machine block, not a natural-language substring, is the authoritative
transcription. Duplicate, non-canonical, missing, or contradictory blocks fail
closed. A request-changes review may use a later final comment after
dispositions are public; that final comment must repeat the full machine block.

## Residual risks and non-blocking notes

-

## Final statement

State whether the reviewed commit is implementable without undocumented safety
or distributed-systems assumptions within the documented pre-alpha scope.

## Maintainer disposition block

Every finding must also have an authenticated issue-#7 maintainer comment with
one canonical block. A resolved finding must link a merged PR or commit already
contained in the reviewed execution commit:

```text
<!-- threadmesh-disposition-v1
{"disposition":"resolved","findingId":"review-example-finding-1","fixUrl":"https://github.com/fyaic/threadmesh/pull/20","rationale":"Concise public disposition rationale.","reviewId":"review-example","schemaVersion":1}
-->
```
