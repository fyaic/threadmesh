# Gated product validation internal review — 2026-08-21

## Scope and status

Three independent internal Codex sub-agents reviewed
`510df05257ee6c0218b129c3a8a1c8067ed513c1` from distributed-systems,
agent-safety, and adapter-implementability perspectives. All three initially
returned **request changes**. These reviews guide Draft PR #45 but are not
organizationally independent external reviews and do not count toward issue #7.

The remediation below is candidate work until it is committed, independently
re-reviewed, merged, and rerun on `main`.

The first remediation commit, `5921f3a19aec5137ddb789548f15c0892902aa1a`,
also received three **request changes** verdicts. Reviewers found that
natural-language substring matching could reverse reviewer intent, disposition
evidence was not semantically bound, loaded feature code was not locked to the
later clean-main snapshot, one Codex smoke import was missing, and public
product metadata was not byte bounded. The second remediation replaces those
surfaces with canonical machine blocks, authenticated dispositions, an isolated
exact-SHA bootstrap, a tested schema-digest helper, and bounded metadata.

## Merge-blocking findings and remediation

| Finding | Initial risk | Candidate remediation |
|---|---|---|
| Repository-local review records could self-assert or reverse reviewer intent | A maintainer could invent records or transcribe “request changes” as approval | Resolve numeric issue-#7 comments through authenticated GitHub API access and require one exact canonical reviewer-authored machine block |
| Live validation had alternate product-specific paths and an injectable verifier | Tests or operators could bypass the external-review records | Make every `smoke:*:live` alias invoke the one runner; remove product-specific model turns and verifier injection |
| Proposal approval and grant installation were separate deferred transactions | One proposal could install more than one grant under an interleaving | Put proposal validation, grant checks and insert, approval CAS, and audit in one immediate transaction; test rollback on CAS failure |
| Gemini accepted an official terminal error result containing the marker | Provider failure could be reported as a pass | Require exactly one terminal `result` with `status: success`, project that status into coordinator evidence, and regress the official error shape |
| Gemini cleanup accepted and recursively deleted a caller-owned directory | A failed validation could delete unrelated caller data | Accept only a temporary parent and always create and remove a driver-owned child directory |
| Marker comparison normalized surrounding whitespace | A non-exact answer could pass an “exact” assertion | Compare the returned string directly without trimming |

## Additional hardening included

- A built-in-only bootstrap verifies clean synchronized `main`, then starts a
  new child from an isolated detached worktree at that SHA and rechecks both
  worktrees after execution.
- Every finding disposition is another authenticated issue-#7 machine block;
  resolved fixes must be merged and contained in the candidate.
- ACP, Codex, and Gemini each revalidate the canonical envelope and matching
  receiver acceptance at the adapter boundary.
- Codex uses a local bootstrap turn to make a thread resumable; it does not
  fabricate a peer admission for that bootstrap.
- Public JSON-RPC and validation results expose stable error codes instead of
  arbitrary internal or provider exception text.
- Product metadata is allowlisted and byte bounded; oversized or controlling
  strings are replaced by length plus stable digest.
- Gemini terminal status, exact-marker, caller-root preservation, and atomic
  proposal approval all have deterministic regression coverage.

## Deferred production work

These items do not block the sequential, trusted-process marker experiment but
remain blockers for broader production claims:

- mailbox claims need worker-instance identity, claimant idempotency, a busy
  result for competing replicas, and expiry-based takeover;
- admission claims need receiver-authenticated inspect and manual reconciliation
  when a crash loses the bearer token;
- Codex deletion currently proves an exact delete acknowledgement, not an
  independent absence query because the product surface has no equivalent of
  ACP session listing;
- ordinary prompt provenance does not establish a provider-native lower-priority
  role, and ThreadMesh does not supply an OS sandbox.

## Verification snapshot

Before the second reviewer re-entry, the candidate passes 14 schemas, 55 schema cases,
7 transition cases, and 117 unit/subtests. Fake-all also passes all three
product fixtures, dependency audit reports zero vulnerabilities, and the
external gate truthfully exits 3. The
checked-in M0 manifest remains `awaiting` with zero qualifying external reviews,
so real model execution remains `not-run`.
