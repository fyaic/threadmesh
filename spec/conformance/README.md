# Conformance fixtures

This directory turns the `0.0-draft` protocol boundaries into deterministic
checks. [`manifest.json`](manifest.json) lists each fixture, its schema, and
whether it must be accepted or rejected. It also declares legal and illegal
delivery, decision, and outcome transitions.

The negative cases are security properties, not malformed examples to copy:

- a state-changing steer without freshness is rejected;
- a low-authority notify cannot request active steering;
- evidence claims require evidence references;
- a steer grant must explicitly allow active-steer delivery;
- externally verified outcomes require evidence;
- private prompt text is not allowed in task summaries;
- restricted summaries cannot be public and projections bind grant versions;
- decision states cannot carry contradictory reason codes;
- active modes require matching intents and runtime features;
- peer, dependency, child, and observer grants cannot escalate authority;
- user authorship requires an actor ID and JSON-RPC params cannot inject an
  operation principal;
- proposals remain non-authoritative and effective grant decision digests must
  match canonical authorization content;
- steer and interrupt declarations require durable native submission
  idempotency;
- adapter receipts require the pre-call unknown boundary, and observed effects
  cannot precede adapter submission;
- context admission cannot coexist with receiver rejection;
- terminal state machines cannot silently regress.

Run all checks from the repository root with `npm test`.
