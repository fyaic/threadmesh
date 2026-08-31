# Real Codex attention validation

## What this proves

The `codex-attention` case connects the deterministic attention router to two
persistent Codex App Server threads. Agent A decides whether to publish a
bounded `dependency-satisfied` lifecycle event. ThreadMesh reads B's durable
event cursor and resumes the already-created B thread only when that event is
relevant.

The relevant condition then records B's receiver-owned acceptance, the exact
Codex turn receipt, a signed verification disposition, the dependency unlock,
and recovery of B as `ready` after the SQLite coordinator restarts. Control and
irrelevant conditions leave B waiting and do not start a receiver turn.

This is a logical wake implemented by ThreadMesh. The Codex adapter still
declares `idleWake: false`; the case does not claim a native Codex background
push. Its signing key is generated inside the isolated run, so
`verificationMode=local-simulation` proves trust-boundary plumbing but is not
evidence of an independent external verifier. The complete implementation →
review → fix → independent verify loop remains tracked by
[issue #91](https://github.com/fyaic/threadmesh/issues/91).

## Deterministic rehearsal

Run all three conditions without a model:

```sh
npm run validate:attention:fake
```

A pass requires:

- relevant: exact `related tasks → publish dependency` model-tool sequence,
  one durable cursor event, one B activation, `accepted`,
  `adapter-submitted`, `externally-verified`, a satisfied edge, and recovered
  `ready` state;
- control: no discovery, publication, durable message, or B activation;
- irrelevant: one read-only discovery, no publication, and no B activation;
  and
- all conditions: zero scripted submits, manual relay actions, and model
  polling turns, plus complete A/B thread and SQLite cleanup.

## Real Codex run

First read the authorization and repository-boundary requirements in the
[real product runbook](../09-reviews/real-product-e2e-runbook.md). For a bounded
maintainer experiment, set both documented acknowledgements and run:

```sh
CODEX_ATTENTION_MODEL=gpt-5.6-sol npm run validate:attention:live:codex
```

The command refuses a dirty or out-of-date `main`. It executes from a detached
worktree at the exact GitHub `main` SHA, installs the lockfile, projects only
bounded public evidence, verifies exact cleanup, and checks the original and
remote repository boundaries again before accepting the result.

Do not report a fake pass, a provider-blocked result, an exact marker alone, or
the local verifier simulation as completion of issue #91.
