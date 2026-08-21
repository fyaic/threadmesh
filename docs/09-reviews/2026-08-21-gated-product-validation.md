# Gated product validation internal review — 2026-08-21

## Scope and status

Three independent internal Codex sub-agents reviewed
`510df05257ee6c0218b129c3a8a1c8067ed513c1` from distributed-systems,
agent-safety, and adapter-implementability perspectives. All three initially
returned **request changes**. These reviews guide Draft PR #45 but are not
organizationally independent external reviews and do not count toward issue #7.

After two remediation rounds, all three lanes independently approved exact
commit `84299b433ab5b6206088593c541f9716eb58bd76` for the conservative #45
experimental prototype. This is not normative M0 approval, does not count
toward issue #7, and does not authorize a real model turn before the external
gate and synchronized-main requirements are satisfied.

The first remediation commit, `5921f3a19aec5137ddb789548f15c0892902aa1a`,
also received three **request changes** verdicts. Reviewers found that
natural-language substring matching could reverse reviewer intent, disposition
evidence was not semantically bound, loaded feature code was not locked to the
later clean-main snapshot, one Codex smoke import was missing, and public
product metadata was not byte bounded. The second remediation replaces those
surfaces with canonical machine blocks, authenticated dispositions, an isolated
exact-SHA bootstrap, a tested schema-digest helper, and bounded metadata.
Reviewers found one remaining fail-open in `7fa96dd483cd3237766e97a5be1625e1fffb1bf4`:
a child could print a valid pass result and then time out or be killed while the
bootstrap still propagated the JSON. Final remediation `84299b4` binds the
result to the child process outcome and exact execution evidence.

## Merge-blocking findings and remediation

| Finding | Initial risk | Candidate remediation |
|---|---|---|
| Repository-local review records could self-assert or reverse reviewer intent | A maintainer could invent records or transcribe “request changes” as approval | Resolve numeric issue-#7 comments through authenticated GitHub API access and require one exact canonical reviewer-authored machine block |
| Live validation had alternate product-specific paths and an injectable verifier | Tests or operators could bypass the external-review records | Make every `smoke:*:live` alias invoke the one runner; remove product-specific model turns and verifier injection |
| Proposal approval and grant installation were separate deferred transactions | One proposal could install more than one grant under an interleaving | Put proposal validation, grant checks and insert, approval CAS, and audit in one immediate transaction; test rollback on CAS failure |
| Gemini accepted an official terminal error result containing the marker | Provider failure could be reported as a pass | Require exactly one terminal `result` with `status: success`, project that status into coordinator evidence, and regress the official error shape |
| Gemini cleanup accepted and recursively deleted a caller-owned directory | A failed validation could delete unrelated caller data | Accept only a temporary parent and always create and remove a driver-owned child directory |
| Marker comparison normalized surrounding whitespace | A non-exact answer could pass an “exact” assertion | Compare the returned string directly without trimming |
| Live child output was trusted independently of process termination | A child could print `passed`, then time out or receive a signal, and still be reported as successful | Require a known state with its exact exit code, no spawn error or signal, exact product/repository/review bindings, and pass-specific mailbox, admission, marker, and cleanup evidence |

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
- A real child-process regression writes a forged pass and then hangs; the
  bootstrap observes `ETIMEDOUT`/`SIGTERM` and rejects it as an exit mismatch.

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
- admission and mailbox recovery limitations above remain production work; the
  strict child-result projection, ISO timestamp validation, and
  adapter-kind-specific cleanup/evidence checks are now implemented as
  pre-real-run hardening after the approval target.

## Verification snapshot

At exact approved commit `84299b433ab5b6206088593c541f9716eb58bd76`,
the candidate passed 14 schemas, 55 schema cases, 7 transition cases, and 117
unit/subtests. The subsequent strict-result projection candidate raises that to
118 and awaits focused internal re-review. Fake-all passes all three product
fixtures, dependency audit reports zero vulnerabilities, and PR #45 conformance
and link checks are green. The checked-in M0 manifest remains `awaiting` with
zero qualifying external reviews and the verifier truthfully exits 3, so real
model execution remains `not-run`.
