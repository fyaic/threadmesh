# ADR 0007: Publish minimal relationship-scoped task summaries

- Status: Accepted
- Date: 2026-08-20
- Issue: [#2](https://github.com/fyaic/threadmesh/issues/2)

## Context

Agents need bounded information to discover relevant work, but complete prompts,
conversation histories, worktree paths, filenames, customer names, and tool
outputs create unnecessary disclosure and prompt-injection risk.

A fixed global summary is also too coarse: a supervisor, declared peer, and
observer may be entitled to different views.

## Decision

ThreadMesh task summaries contain only typed, independently disclosable fields:

- task and incarnation identity;
- harness family;
- coarse lifecycle state;
- summary revision and update time;
- optional objective hint with receiver-maintained objective version;
- advertised coordination intents and admission modes;
- optional blocker or dependency hints;
- sensitivity and audience scope.

The summary schema excludes raw prompt, full history, filesystem paths, secret
material, and arbitrary extension properties by default.

Summaries use an opaque `summaryId` plus a monotonic `summaryVersion`; they do not
derive identity or freshness from a content hash. A publisher may emit different
summary documents for different relationship IDs. Discovery remains
relationship-scoped rather than global enumeration.

## Consequences

- Relevance discovery receives less context and may produce false negatives.
- Publishers must maintain field-level disclosure policy.
- Adapters can populate only the fields they can safely and accurately expose.
- Extensions require an explicit namespaced mechanism in a later protocol
  revision rather than arbitrary JSON properties.
- Conformance fixtures can assert that private fields are rejected.

## Rejected alternatives

### Full conversation summary

It is expensive, difficult to redact, and lets unrelated content influence the
discovering model.

### Embedding over private histories by default

It leaks information into the discovery index and makes disclosure difficult to
audit.

### Content hash as summary version

It enables cross-context correlation and couples versioning to editorial text.
