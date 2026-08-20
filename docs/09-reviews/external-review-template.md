# M0 external review template

- Reviewer:
- Affiliation or perspective:
- Relationship to maintainers:
- Reviewed commit:
- Review lane: distributed systems / agent safety / both
- Method and tools:
- Verdict: approve / request changes / abstain

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

## Residual risks and non-blocking notes

-

## Final statement

State whether the reviewed commit is implementable without undocumented safety
or distributed-systems assumptions within the documented pre-alpha scope.
