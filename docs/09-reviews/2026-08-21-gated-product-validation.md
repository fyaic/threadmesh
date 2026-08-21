# Gated product validation internal review — 2026-08-21

## Scope and status

Three independent internal Codex sub-agents reviewed
`510df05257ee6c0218b129c3a8a1c8067ed513c1` from distributed-systems,
agent-safety, and adapter-implementability perspectives. All three initially
returned **request changes**. These reviews guide Draft PR #45 but are not
organizationally independent external reviews and do not count toward issue #7.

The remediation below is candidate work until it is committed, independently
re-reviewed, merged, and rerun on `main`.

## Merge-blocking findings and remediation

| Finding | Initial risk | Candidate remediation |
|---|---|---|
| Repository-local review records could self-assert reviewer identity | A maintainer could invent two records and unlock live execution | Resolve numeric issue-#7 comments through authenticated GitHub API access; verify author login and association, timestamp, exact body digest, target, lane, verdict, and transcribed findings |
| Live validation had alternate product-specific paths and an injectable verifier | Tests or operators could bypass the external-review records | Make every `smoke:*:live` alias invoke the one runner; remove product-specific model turns and verifier injection |
| Proposal approval and grant installation were separate deferred transactions | One proposal could install more than one grant under an interleaving | Put proposal validation, grant checks and insert, approval CAS, and audit in one immediate transaction; test rollback on CAS failure |
| Gemini accepted an official terminal error result containing the marker | Provider failure could be reported as a pass | Require exactly one terminal `result` with `status: success`, project that status into coordinator evidence, and regress the official error shape |
| Gemini cleanup accepted and recursively deleted a caller-owned directory | A failed validation could delete unrelated caller data | Accept only a temporary parent and always create and remove a driver-owned child directory |
| Marker comparison normalized surrounding whitespace | A non-exact answer could pass an “exact” assertion | Compare the returned string directly without trimming |

## Additional hardening included

- Real execution requires a clean `main` whose `HEAD` equals GitHub `main`, and
  the sanitized result records that repository snapshot and product metadata.
- ACP, Codex, and Gemini each revalidate the canonical envelope and matching
  receiver acceptance at the adapter boundary.
- Codex uses a local bootstrap turn to make a thread resumable; it does not
  fabricate a peer admission for that bootstrap.
- Public JSON-RPC and validation results expose stable error codes instead of
  arbitrary internal or provider exception text.
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

Before reviewer re-entry, the candidate passes 14 schemas, 55 schema cases,
7 transition cases, and 111 unit/subtests. Fake-all also passes all three
product fixtures, dependency audit reports zero vulnerabilities, and the
external gate truthfully exits 3. The
checked-in M0 manifest remains `awaiting` with zero qualifying external reviews,
so real model execution remains `not-run`.
