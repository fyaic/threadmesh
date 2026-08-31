# Deterministic attention-router vertical-slice validation

Date: 2026-08-31
Scope: M5 first deterministic implementation slice for issues
[#89](https://github.com/fyaic/threadmesh/issues/89),
[#90](https://github.com/fyaic/threadmesh/issues/90), and
[#92](https://github.com/fyaic/threadmesh/issues/92).

## Reviewed behavior

Three isolated implementation lanes produced the lifecycle domain API, local
demo, and bounded inspector. The primary maintainer then reconciled the
interfaces and corrected dependency direction before validation:

- protocol `relationshipType: dependency` retains its documented meaning that
  `grant.source` depends on `grant.target`;
- transport grants authorize envelopes only in their own source → target
  direction;
- the product dependency view is prerequisite → dependent;
- attention offer and semantic dependency unlock are separate decisions;
- receiver acceptance alone cannot unlock downstream work.

The integrated scenario uses four persisted envelopes, explicit checkpoint
acceptance, a real durable adapter receipt, a signed external-verification
attestation checked against coordinator-configured trust roots, an atomic
dependency satisfaction record, restart recovery, and cleanup in both success
and injected-failure cases.

## Commands and results

```sh
node --test test/lifecycle-events.test.mjs \
  test/attention-snapshot.test.mjs \
  test/attention-router-demo.test.mjs
```

Result: lifecycle, inspector, demo, durable dependency, wake, and migration
tests passed. The complete repository result below is canonical.

```sh
npm run demo -- --json
```

Result: `state=passed`, four events in the required order,
`dependency-satisfied-verified`, `unlock=true`, zero manual relay actions,
zero model polling turns, zero incorrect unlocks, and complete cleanup.

```sh
node --test test/sdk-package-consumer.test.mjs
```

Result: passed. A separate packed-CLI consumer test installs the generated
tarball into a fresh project, imports only declared public subpaths, and runs
the installed `threadmesh demo --json` binary successfully.

During first-slice integration, one repository-wide run passed schema
validation and 163 of 164 then-current parallel unit tests. The pre-existing
timing-sensitive test
`validation timeout retains the created thread for exact cleanup` failed in the
parallel run and immediately passed in isolation. No Codex adapter code changed
in this slice and immediately passed in isolation. A complete first-slice rerun
then passed. After the durable-state and packaging remediation, the final
canonical `npm test` result passed all 177 unit/subtests, 55 schema cases, seven
transition cases, and documentation lint. The standalone
documentation check also passed:

```sh
npm run lint:docs
```

Result: passed with 95 Markdown files and zero issues.

## Negative evidence

The tests fail closed for irrelevant receivers, unsubscribed events, expired or
stale freshness, revoked or unauthorized grants, duplicate offers, missing or
reversed dependency edges, rejected dispositions, unverified outcomes,
untrusted attestations, forged inspector state, raw content-shaped fields, and
absolute local paths.

## Remaining M5 gates

This record does not claim real-agent initiative. Remaining M5 work:

The deterministic verifier is a separate in-process component with a private
key and a coordinator-configured public anchor. It exercises the cryptographic
boundary but is not an independent external service or reviewer.

1. run the same loop with real Codex sessions and compare it with a manual
   baseline;
2. repeat one role through an ACP-compatible harness;
3. publish visual evidence after the real loop passes.
