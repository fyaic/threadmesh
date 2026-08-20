# Gemini CLI headless adapter experiment

> Experimental implementation note for `@google/gemini-cli` `0.56.0`. The
> package is invoked through a pinned `npx` specifier and is not installed as a
> repository dependency.

Gemini CLI is the selected third harness because its non-ACP headless process
surface is materially different from Codex App Server JSON-RPC and Kimi ACP.
The official headless interface emits JSONL events for initialization, messages,
tool use, errors, and results. The CLI also exposes plan approval mode, sandbox
startup, caller-selected session IDs, and session list/delete commands.

Primary references:

- [Gemini CLI headless mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md)
- [Gemini CLI reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md)

## Implemented surface

- exact version and required-flag probe without a model turn;
- `stream-json` parsing with event, stdout, stderr, and model-text limits;
- caller-selected UUID session binding;
- receiver-accepted suggestion admission;
- canonical JSON provenance under
  `THREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1`;
- `plan` approval mode plus requested sandbox startup;
- failure on any tool-use event in the bounded marker scenario;
- typed auth, quota, protocol, output-limit, and timeout failures;
- child termination and isolated `GEMINI_CLI_HOME` cleanup.

## Capability claim

The adapter advertises only receiver-mediated `suggest` at a checkpoint. It
does not advertise steer, interrupt, wake, subprocess cancellation, structured
gate responses, or durable native idempotency. A manually selected session UUID
is correlation evidence, not proof that a prompt effect is queryable after an
ambiguous process failure.

Gemini `stream-json` reports a tool-use event but does not let this subprocess
adapter interpose before every possible tool effect. The live marker therefore
runs in `plan` mode, requests the sandbox, requires zero tool-use events, and
fails rather than claiming a clean marker when a tool appears.

## Authentication and isolation

The default preflight does not start a model or request Google login. The live
script accepts only an explicitly supplied `GEMINI_API_KEY`; it does not search
for, create, or print provider credentials. Each run creates one temporary
`GEMINI_CLI_HOME` and deletes that exact directory in `finally`, isolating test
session/config state from the user's normal Gemini home.

The CLI receives the repository cwd. Plan mode and the requested product
sandbox reduce effects but are not an OS sandbox supplied or verified by
ThreadMesh. Model-visible provenance is ordinary input text and cannot establish
a provider-native lower-priority role.

## Run

```sh
npm test
npm run smoke:gemini
```

The second command performs only a real version/capability preflight. The gated
live command is:

```sh
GEMINI_API_KEY=... npm run smoke:gemini:live
```

No API key has been authorized for this project, so the live result remains
`not-run`. A stacked deterministic test now runs the same coordinator admission
claim through ACP, Codex, and Gemini. See the
[selection and preflight evidence](../09-reviews/2026-08-20-third-harness-selection.md).
The shared live runner additionally requires the external-review acknowledgement
and removes its exact isolated home; see the
[real product runbook](../09-reviews/real-product-e2e-runbook.md).
