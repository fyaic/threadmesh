# Third real harness selection and preflight — 2026-08-20

## Decision

Select Gemini CLI headless `stream-json` as the third ThreadMesh harness
candidate. This is a non-ACP subprocess event stream and is materially different
from both Codex App Server bidirectional JSON-RPC and Kimi ACP sessions.

## Candidate evidence

| Candidate | Product boundary | Availability and decision |
|---|---|---|
| GitHub Copilot cloud agent | Asynchronous issue/task/PR service | Official `suggestedActors` query returned no Copilot actor for `fyaic/threadmesh`; REST assignability returned 404. Not available and not assigned. |
| Gemini CLI | Apache-2.0 headless JSON/JSONL subprocess | Official package `0.56.0` can be pinned and probed without login. Selected. |
| Claude Code | Headless subprocess/SDK | Not installed or authenticated; npm package uses a product-specific license. Deferred rather than creating an Anthropic account. |
| OpenCode | MIT headless HTTP/OpenAPI server | Strong future native-server candidate, but no connected model provider is authorized locally. Deferred. |

GitHub documents that Copilot availability must be verified through repository
`suggestedActors` before assignment. The read-only check followed that
requirement and performed no agent task creation. See the
[official Copilot API guide](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-via-the-api).

OpenCode remains useful future evidence because its official server exposes
health, provider, session, message, event, and OpenAPI surfaces. See the
[official OpenCode server documentation](https://dev.opencode.ai/docs/server/).

## Package and real product preflight

- Package: `@google/gemini-cli@0.56.0`
- License reported by npm: Apache-2.0
- Registry integrity:
  `sha512-q4oBfb/Oh/HNLMYBOJMp88/QQ8hLffnB0ykoVThi6A5isbGHJ/ylWLMosMGqukKY0Q1Jv/XRDpb46Q1BV+zQqw==`
- Invocation: pinned package through `/opt/homebrew/bin/npx --yes`
- Preflight time: `2026-08-20T12:48:38.052Z` to
  `2026-08-20T12:48:43.983Z`
- Capability snapshot:
  `sha256:d364b68df9e63816e8c384496f6be0eb4c09b311996bfd74f66efb495fd9b46f`

The real no-model preflight verified version `0.56.0` and the documented flags
for prompt, sandbox, plan approval, caller-selected session ID, session list,
session deletion, and `stream-json`. It created an isolated temporary
`GEMINI_CLI_HOME` and proved that exact directory was removed.

## Deterministic adapter evidence

The fake headless product covers:

- pinned version and required-surface probe;
- accepted suggestion delivery over bounded JSONL;
- exact caller-selected session correlation;
- canonical provenance under delimiter attacks;
- rejection without receiver acceptance;
- failure on any tool-use event;
- malformed event and explicit authentication failures;
- timeout termination and child cleanup;
- a schema-valid suggestion-only capability profile.

## Live-model gate

No Gemini provider credential is authorized for ThreadMesh. The adapter does
not start login or create an account. `npm run smoke:gemini:live` delegates to
the common gated runner, requires an explicit `GEMINI_API_KEY`, uses an isolated
home, plan mode, and sandbox request, and accepts only one successful terminal
result with the exact untruncated marker and zero tool-use events.

The real model scenario remains `not-run`, not blocked or passed. After #7 and
the M1 stack merge, an explicitly authorized key can run the marker and the same
coordinator-mediated A-to-B acceptance scenario used by Codex and Kimi.
