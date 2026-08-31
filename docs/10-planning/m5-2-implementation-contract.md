# M5.2 implementation contract

This document is the implementation and acceptance contract for M5.2 of
[issue #91](https://github.com/fyaic/threadmesh/issues/91). Nothing here is a
claim that M5.2 has passed. A run is acceptable only when every required gate
below is supported by correlated private evidence and a bounded public
projection.

## Session and verifier topology

The scenario must pre-create and register these identities before their first
inbound event:

- one persistent implementer Codex session, reused for both implementation and
  the later fix;
- one separate persistent reviewer Codex session;
- optionally, one separate persistent verifier Codex session; and
- one independent verifier service that owns its signing key and directly
  checks repository state.

Every activation must resume the registered thread and snapshot. The adapter
receipt operation must match the observed receiver turn. Creating a replacement
receiver after an event, or using a new implementer for the fix, is a no-go.

Codex reports `idleWake: false`. A ThreadMesh wake is a bounded logical wake
caused by durable-cursor reconciliation. It is not a native Codex idle-session
push and must never be described as one.

## Model-selected lifecycle actions

`artifact-ready`, `review-failed`, and the fixed-artifact publication must each
originate from an observed dynamic-tool call in the responsible Codex turn. The
evidence chain must retain the tool name, bounded original arguments, thread and
turn identity, event and message identity, timestamp, and submission digest.

The runner may create identities, grants, sessions, worktrees, and bounded tool
surfaces. It must not select lifecycle events, submit outside the observed tool
callback, fill material tool arguments for the model, or prompt the exact
target, payload, finding, or fix. Final prose is not event evidence.

## Repository effect and finding integrity

The accepted chain must prove all of the following:

1. A clean base commit reproduces the bounded failure.
2. The implementation commit was created by the implementer session, descends
   from that base, contains the bounded change, and has recorded check results.
3. The reviewer inspects that exact implementation commit.
4. The fix commit was created by the same implementer session, descends from
   the implementation commit, and removes the reviewed defect.
5. A deterministic reproduction or equivalent direct-resource check fails
   before the fix and passes after it.

The reviewer must supply the bounded finding through its own tool call. The
reviewer context and related-task responses must not reveal the defect
location, expected finding, or repair. A sealed oracle may validate the finding
afterward, but must not enter the reviewer context. A fixed marker, accepted
mailbox item, or statement that the work is complete cannot replace repository
and test effects.

## Receiver-owned acceptance and logical wake

Each handoff must preserve separate, observable states for authorized routing,
durable cursor discovery, claim, receiver-owned accept/defer/reject, context
admission, adapter submission, receipt, verification, dependency satisfaction,
and task unlock. The harness must not unconditionally accept on the receiver's
behalf.

Only a relevant persisted event may activate a receiver. An irrelevant
authorized session must receive zero wake and zero turn. User relay, copy/paste,
scripted submission, and model-driven polling after scenario start must all be
zero.

## Append-only evidence and trust boundary

The private record must append, rather than overwrite, correlations for the
clean base, implementation, reviewed implementation, fix, finding, tool calls,
messages, sessions, turns, receipts, cursor checkpoints, dispositions,
verification, dependency state, and UTC transitions. Restarted execution must
continue from this durable chain.

Before the scenario starts, the coordinator must receive the independent
verifier service's public trust anchor. The verifier service must retain its
private key outside the implementer, reviewer, coordinator, and orchestration
runner. It must directly check a clean checkout of the exact implementation and
fix commits, reproduce the finding, run the allowlisted verification command,
and sign an attestation binding:

- repository identity and clean base commit;
- reviewed implementation and fix commits;
- finding and before/after effect;
- verification command and result digest;
- subject event, message, and verifier identity; and
- verification time and trust-policy decision.

A verifier Codex session may request or explain verification, but its prose is
not an attestation. A key generated inside the orchestration scenario is a local
simulation and does not count as independent verification.

## Unlock order

Delivery, acceptance, receipt, reviewer findings, and implementer assertions
must leave the dependency locked. Unlock is permitted only after a current
trusted attestation passes signature, subject, commit, evidence, freshness, and
policy checks, and every current inbound dependency is satisfied.

Bad-key, unverified, stale run/objective/checkpoint/edge, mismatched commit,
tampered evidence, and replay cases must remain locked with a durable reason.
No peer message may silently become execution authority.

## Restart, replay, and cleanup

Inject restarts after durable event creation, adapter submission start, adapter
receipt, verification, and satisfaction. Recovery must retain the same
sessions, cursors, repository chain, and dependency state without duplicating a
turn, event, commit, acceptance, attestation, or unlock.

Inject failure after every created resource class. Success, failure, timeout,
and cancellation paths must delete and confirm absence of every exact Codex
thread, app-server process, worktree and temporary ref, database and WAL/SHM
file, isolated home, temporary credential, verifier key artifact, and other
runtime file. An adapter reference returned on an error remains a cleanup
target. Any leak is a no-go.

## Public projection

Keep the exact correlation record private. The public result must contain only
allowlisted metadata, opaque identifier digests, commit identifiers appropriate
for the public repository, bounded reason codes, transition times, aggregate
counts, verification mode, and cleanup confirmations. It must not expose raw
transcripts, prompts, account data, credentials, absolute paths, private keys,
or raw thread and turn identifiers.

The projector must fail closed when any required correlation is absent or
inconsistent. It must label local simulations as simulations and must not
project M5.2 as passed from a marker, self-assertion, or partial chain.

## Recommended implementation order

1. Freeze the evidence schema, trust policy, cleanup manifest, public projector,
   and negative mutation tests.
2. Create the bounded failing fixture and sealed post-run oracle.
3. Pre-create persistent sessions, identities, grants, dependency edges,
   cursors, and the independent public trust anchor.
4. Run implementation, validate its commit and checks, then admit the
   model-selected `artifact-ready` event.
5. Cursor-wake the reviewer, obtain a receiver-owned decision, review the exact
   commit, and validate the model-selected finding without prior disclosure.
6. Cursor-wake the original implementer, create and validate the descendant fix
   commit, and admit its model-selected evidence.
7. Have the independent service reproduce, verify, and sign the exact chain;
   first prove that bad-key, stale, tampered, and unverified variants fail.
8. Satisfy and unlock only from the trusted attestation, then test restart and
   exact replay at each boundary.
9. Run failure injection and absence checks before producing the redacted public
   result.

## Go/no-go checklist

M5.2 is a go only when every item is true:

- [ ] Real, pre-created persistent implementer and reviewer sessions are used.
- [ ] The same implementer thread creates the implementation and fix commits.
- [ ] Every lifecycle event is caused by the responsible model's observed tool
  call, with zero scripted submit.
- [ ] Commit ancestry, exact reviewed commit, and before/after repository effect
  are proven.
- [ ] The reviewer finding was not disclosed or manufactured by the harness.
- [ ] Every receiver decision is receiver-owned and every wake is cursor-bound.
- [ ] The verifier service has independent key custody and direct-resource
  evidence bound to the exact fix.
- [ ] The append-only evidence chain verifies under a preconfigured current
  trust anchor.
- [ ] No receipt, assertion, stale event, or unverified result can unlock.
- [ ] Restart and replay create no duplicate turn or effect.
- [ ] Relevant resources are cleaned and confirmed absent on every tested exit.
- [ ] The public projection is bounded, redacted, and fail-closed.

If any item is false or unproven, M5.2 remains no-go and issue #91 remains open.
