# Real agent case portfolio

ThreadMesh is intended to produce **selective initiative**, not merely message
delivery. A useful case therefore needs all four of these observations:

1. Agent A sees only a host-authorized, bounded view of another task;
2. A decides for itself whether the relationship matters now;
3. irrelevant and control conditions stay within an interference budget;
4. B retains a separate acceptance and context-admission boundary.

This page summarizes the real product evidence. Detailed records are linked for
reproduction and audit.

## Start with the everyday-work test

The new [first-use validation](../09-reviews/2026-09-05-first-use-validation.md)
tests normal file-editing tasks through the public launcher, not just an exact
output marker. It records successful and unsuccessful attempts, and separates
native integration, model-selected contact, idle wake and an independent file
assertion. Use the [workspace guide](first-workspace.md) to try this path.

The older cases below used stronger benchmark instructions and narrower tool
sets. They establish bounded behavior, not spontaneous discovery in arbitrary
user sessions.

## At a glance

| Case | Agent A | Agent B | Initiative observed | Receiver outcome | Evidence |
|---|---|---|---|---|---|
| Codex lifecycle chain | Codex CLI `0.145.0`, implementation/review/fix/verifier roles | Codex dependent + irrelevant control | One kickoff; 9 native turns; 0 later phase prompts/direct activations; irrelevant 0 turns | Dependent ran only after accepted finalization; cleanup 5/5 | [behavior](../09-reviews/2026-09-01-m5-2-real-codex-event-pump-behavior.md) · [real-effects status](../09-reviews/2026-09-01-m5-2-real-effects-integration.md) |
| Pi → Kimi | Pi `0.84.2`, `zai/glm-5.3` | Kimi Code `0.38.0`, ACP v1 | Relevant: discover + send; irrelevant: discover only; control: zero calls | One advisory input accepted and admitted; exact marker | [Guide](pi-to-kimi-demo.md) · [record](../09-reviews/2026-08-25-pi-integration-kit-validation.md) |
| Codex → Kimi | Codex CLI `0.145.0`, `gpt-5.6-sol` | Kimi Code `0.38.0`, ACP v1 | Codex selected the exact discover → send sequence with no other tool | Missing dependency became completed benchmark outcome | [record](../09-reviews/2026-08-25-codex-to-kimi-proactive.md) |
| Codex same-product matrix | Codex CLI `0.145.0` | Codex CLI `0.145.0` | Two-stage policy passed relevant 3/3; fresh irrelevant read only; control stayed quiet | B activated only on relevant send | [behavior gate](../09-reviews/2026-08-25-codex-behavior-gate.md) · [repetitions](../09-reviews/2026-08-25-codex-behavior-repetitions.md) |

## Flagship case — a review loop advances itself

The sixth retained Codex event-pump attempt is the clearest evidence of the
session initiative that motivated ThreadMesh. The operator kicked off A once.
After that, durable lifecycle attention advanced:

```text
A implementation → R review → same-A fix → V verification → dependent
```

The run contained nine real native Codex turns and zero later runner phase
prompts or direct activations. The authorized irrelevant session ran zero
turns. The dependent ran only after accepted finalization, and five of five
sessions plus coordinator artifacts were removed.

This retained run proves real model/session behavior, but its Git and verifier
effects were simulated. [#133](https://github.com/fyaic/threadmesh/pull/133)
subsequently merged real bounded Git worktrees and a process-isolated child
verifier into the same event-pump path. The later
[attempt 16](../09-reviews/2026-09-02-m5-2-real-effects-live-attempt.md)
completed that combined real traversal. Its full product gate remained blocked;
the subsequent same-condition baseline failed at reviewer admission. Neither
record establishes a reliable speed or token-cost advantage.

The deterministic one-command demo complements that evidence with two
reproducible product checks: a four-handoff workflow has a manual lower bound of
nine user actions versus one kickoff, and a running receiver retains the event
at a checkpoint with zero steer, interrupt, or native-turn starts. See the
[demo guide](attention-router-demo.md),
[manual baseline](manual-relay-baseline.md), and
[active-session safety case](non-interrupting-handoff.md).

## Case 1 — Pi notices a Kimi dependency

### Situation

Pi Agent A owns an upstream release input. A persistent Kimi Agent B owns a
downstream release task and publishes a minimal summary that it is waiting for
that input. The host authorizes only `suggest` from the exact A incarnation to
the exact B incarnation.

Pi receives two tools and no built-in alternatives:

- inspect the host-authorized related-task summaries;
- send one bounded suggestion after discovery.

### What made the behavior intelligent

The host did not call `sendSuggestion` on Pi's behalf and did not tell Pi which
tool sequence to emit. The model had to evaluate whether the summary and its
current result were related.

| Evaluation condition | Pi decision | Messages | B activation |
|---|---|---:|:---:|
| Relevant dependency | `threadmesh_related_tasks` → `threadmesh_send_suggestion` | 1 | Yes |
| Irrelevant authorized task | `threadmesh_related_tasks` only | 0 | No |
| Control with no coordination need | no ThreadMesh call | 0 | No |

This is the central product effect: the relevant session gained a useful input,
while unrelated sessions were not interrupted.

### End-to-end result

The relevant condition continued across products:

```text
Pi Agent A              ThreadMesh                 Kimi Agent B
    │ discover once         │                           │
    ├──────────────────────>│                           │
    │ bounded waiting hint  │                           │
    │<──────────────────────┤                           │
    │ suggest once          │                           │
    ├──────────────────────>│ mailbox → accept          │
    │                       ├──────────────────────────>│
    │                       │ context-admitted + marker │
    │                       │<──────────────────────────┤
```

The final run observed one send, zero non-ThreadMesh tool calls, receiver
acceptance, a durable admission claim, `context-admitted` audit evidence, and
the exact Kimi marker. Pi used no persistent session. The Kimi session was
deleted and verified absent; the packed consumer, SQLite database, and isolated
Kimi home were removed.

The peer input remained explicitly non-authoritative. An earlier checksum
variant asked Kimi to treat an `unverified` agent claim as verified; Kimi
correctly refused. The final case changed the application scenario instead of
weakening ThreadMesh's provenance semantics.

## Case 2 — Codex initiates contact with Kimi

### Situation

Codex Agent A has the input needed by an existing Kimi release session. The
Codex App Server adapter exposes exactly the two ThreadMesh dynamic tools. The
harness does not submit a message for the model.

### Observed behavior

Codex selected:

```text
threadmesh_related_tasks → threadmesh_send_suggestion
```

It made one relationship lookup, one suggestion, and no non-ThreadMesh tool
call. Kimi's harness claimed and accepted the mailbox item, admitted it into the
existing ACP session, and produced the expected completed benchmark marker.
Both the Codex task and Kimi session were deleted; Kimi session absence was
verified.

This case matters because the sender and receiver used materially different
product APIs and session lifecycles. The portable seam was only task identity,
a bounded summary, one envelope, receiver disposition, admission evidence, and
cleanup.

## Case 3 — learning when not to speak

The first repeated Codex matrix exposed an important limitation: control stayed
quiet 3/3, but relevant and irrelevant reliability was not initially strong
enough for default enablement. The project did not hide that result.

A shorter two-stage policy then separated read-only discovery from the decision
to send. It passed three fresh relevant runs in a row. A fresh control made zero
ThreadMesh calls, and a fresh irrelevant task made one read-only lookup but did
not send or activate B.

That result supports explicit experimental opt-in for the bounded profile. It
does not justify repository-wide default enablement.

## Reproduce without model cost

The deterministic three-condition behavior case is the fastest entry point:

```sh
npm ci
npm run validate:behavior:fake
```

Then run the cross-harness coordinator path:

```sh
npm run validate:cross-harness:fake
```

To validate the packaged SDK from a clean external consumer:

```sh
npm run validate:pi-consumer
```

The real-product commands intentionally have stronger environment, review,
exact-checkout, cleanup, and bounded-evidence requirements. Follow the
[Pi-to-Kimi guide](pi-to-kimi-demo.md) or the
[real-product runbook](../09-reviews/real-product-e2e-runbook.md); do not infer a
pass from an ad hoc model transcript.

## Honest claim boundary

These cases prove that:

- a model in one harness can decide to contact a task in another harness;
- the receiver can retain a separate mailbox and context-admission boundary;
- a bounded discovery/send policy can distinguish relevant, irrelevant, and
  control conditions in the recorded runs;
- the public integration seam is small enough for a fresh external consumer.

They do not prove production authentication, multi-tenancy, OS isolation,
arbitrary hostile-prompt safety, universal model reliability, or autonomous
receiver consent. Receiver acceptance in the cross-product cases was a
deterministic harness checkpoint policy. ThreadMesh remains pre-alpha and
disabled by default.
