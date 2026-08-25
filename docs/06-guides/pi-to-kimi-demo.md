# Real Pi-to-Kimi proactive coordination demo

This case is the first validation in which a harness outside the repository
imports the packaged public SDK, exposes ThreadMesh as native model tools, and
then coordinates with a second real agent product.

It demonstrates a narrow but useful claim:

> A real Pi agent can notice a host-authorized dependency, choose to contact it
> once, and deliver a bounded advisory input to a persistent Kimi task without
> sharing global history or taking control of the receiver.

It does not demonstrate global task search, verified peer claims, state-changing
authority, or safe processing of arbitrary hostile prompts.

## The case

Agent A runs in Pi with only two tools:

1. `threadmesh_related_tasks` reads relationship-scoped summaries.
2. `threadmesh_send_suggestion` sends at most one advisory message after
   discovery.

Agent B is a persistent Kimi ACP session that owns a downstream release
manifest. The host registers A and B, grants only `suggest`, and publishes a
bounded summary saying that B is waiting for an upstream release input.

```text
Pi Agent A              ThreadMesh                 Kimi Agent B
    │                       │                           │
    │ discover once         │                           │
    ├──────────────────────>│                           │
    │ waiting summary       │                           │
    │<──────────────────────┤                           │
    │ suggest once          │                           │
    ├──────────────────────>│ mailbox                   │
    │                       │ receiver accepts          │
    │                       ├──────────────────────────>│
    │                       │ context-admitted evidence │
    │                       │<──────────────────────────┤
```

The release input is intentionally an unverified coordination value. The
public proactive bridge labels peer claims as unverified, so the benchmark does
not ask Kimi to treat Agent A as a cryptographic verifier.

## Three validation layers

### Layer 1 — package and contract

```sh
npm ci
npm run validate:pi-consumer
```

The runner executes `npm pack`, installs the tarball in a fresh temporary
project, and imports only `@fyaic/threadmesh`. It verifies exact tool
enumeration, the authorized success path, send-before-discovery rejection,
unknown-target rejection, duplicate-send rejection, receiver disposition, and
cleanup.

### Layer 2 — real Pi behavior

The real-model runner compares three conditions:

| Condition | Expected Pi behavior |
|---|---|
| Relevant | discover once, send once |
| Irrelevant | discover once, do not send |
| Control | call neither ThreadMesh tool |

Pi runs with no built-in tools, no skills, no context files, no persistent
session, and an allowlist containing only the two ThreadMesh tools. The result
records tool names and bounded digests, not the model transcript.

### Layer 3 — real Pi to real Kimi

The relevant path is repeated with Kimi Code as B. The coordinator requires a
mailbox claim, receiver acceptance, a durable admission claim, exact ACP
evidence, and a `context-admitted` audit event before the case passes.

Kimi receives a receiver-local system policy from an isolated temporary
`KIMI_CODE_HOME`. Only the current authentication and provider configuration
needed for the run is copied into that 0700 directory. The real user home is
not modified, and the temporary home, Kimi session, SQLite fixture, and packed
consumer are deleted afterward. This follows Kimi's documented
[`SYSTEM.md` behavior](https://moonshotai.github.io/kimi-code/en/customization/agents).

## Running the real case

The checked-in command deliberately refuses to run unless the repository is a
clean, synchronized `main` checkout and the operator supplies the exact
acknowledgement:

```sh
THREADMESH_PI_LIVE_ACK=I_UNDERSTAND_THIS_RUNS_REAL_PI_AND_KIMI_MODELS \
  npm run validate:pi:live
```

The local environment must already have authenticated Pi and Kimi products.
The command does not print credentials, task/session identifiers, local home
paths, or transcripts. Provider quota and authentication failures are reported
as `blocked`, not `passed`.

## Recorded result

The formal run on 2026-08-25 used synchronized main commit
`02d8d24e41d0e7800a3b648c8a41376aba849535`, Pi `0.84.2` with
`zai/glm-5.3`, and Kimi Code `0.38.0`. All three behavior conditions passed;
the cross-harness message was accepted and admitted; Kimi returned the exact
outcome marker; session absence and every temporary-resource cleanup check
passed.

See the full [validation record](../09-reviews/2026-08-25-pi-integration-kit-validation.md)
for package digests, negative-path codes, failed attempts, their dispositions,
and the precise claim boundary.

## What to copy into another harness

The Pi extension in
[`test/fixtures/pi-threadmesh-extension.mjs`](../../test/fixtures/pi-threadmesh-extension.mjs)
is the clean-consumer example. It imports only the package root, converts
`bridge.tools` into Pi's native tool descriptors, and forwards each tool call
to `bridge.handleToolCall`.

For another harness, preserve the same boundaries:

- create one bridge per model turn;
- let the authenticated host choose the relationship set;
- expose discovery as read-only;
- require discovery before send and keep the send budget small;
- keep receiver acceptance separate from transport delivery;
- record unwanted communication and cleanup as first-class outcomes.
