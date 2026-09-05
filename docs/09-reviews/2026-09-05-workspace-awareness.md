# Workspace awareness and a real approved-copy handoff

Date: 2026-09-05. Baseline: `aaa6def` (first-use alpha). Maintainer experiment,
not an independent user report or a general reliability claim.

## Useful result: tell the brand task, not every task

Two real Pi `0.84.2` sessions used `zai/glm-5.3`, normal file tools and the
ThreadMesh extension. Each received one ordinary kickoff. The user changed
the approved brief only in the brand task; no later user prompt went to the
website task. Neither kickoff prescribed a recipient, messaging tool or send.

The website session first volunteered to keep its copy aligned. After updating
the brief, the brand session chose to send the new decision to that session.
The idle website session resumed through the extension, checked the shared
brief, and edited its real file. This is reciprocal, model-selected coordination
under generic opt-in guidance—not an unprompted model with no integration.

| Observation | Retained result |
|---|---|
| Brand message queued | 109,026 ms from experiment start |
| Idle website follow-up begins | 110,717 ms; no second user prompt |
| Website edits its file | 125,319 ms |
| Independent business assertions | Pass at 167,535 ms |
| Final headline | `Organize work with Member Portal` |
| Final description | `Up to 5 projects for your team on the free plan.` |
| Old name and unlimited claim | Absent |
| Unrelated price file | Still `Paid plan: $12/month` |
| Unrelated database workstream | 0 messages; no model was launched for this control |

This does not measure general US-spelling correctness, a success rate, human
time saved, or arbitrary-host wake. The copy assertion checks the fixture's
known spelling/claim constraints. The source could read the website's voluntary
message; this was not an isolated blind-source experiment.

Three send attempts initially failed because the model treated a startup goal
hint as fresh discovery. Each was followed by discovery and a successful send;
the public projection records both failures and deliveries. The send tool's
description now explicitly says to call `threadmesh_peers` before each send.
That clarification is unit-checked, not a measured reduction in retries yet.

Evidence: [prompts, timeline, send outcomes and final file](artifacts/2026-09-05-workspace-preferences.json).
Private native events have SHA-256
`b3b70cf44ba54933ae1c31ec60685d8488ac72f5dd3a2e17b9f56eed55a7e836`.
Raw reasoning, credentials and native session identifiers are not published.

## Codex: separate visibility, authorization and initiative

The installed Codex version is `0.145.0`. Its official
[MCP documentation](https://developers.openai.com/codex/mcp/) describes server
initialize instructions as model-visible guidance. The matching
[source tag](https://github.com/openai/codex/tree/rust-v0.145.0) preserves those
instructions as namespace/search descriptions in
`codex-rs/codex-mcp/src/rmcp_client.rs` and
`codex-rs/core/src/tools/handlers/mcp.rs`.

The ThreadMesh SDK handshake returned all four tools and server instructions.
A pre-turn native inventory probe returned an empty catalog or timed out; it
did not establish missing tools. An explicit, read-only native model diagnostic
subsequently found `threadmesh_peers` and attempted it. Codex reported
`user cancelled MCP tool call`: no human canceled it, and the headless process
could not complete the approval interaction. This diagnostic is not initiative
evidence and did not send messages.

Changes retained:

- MCP initialize guidance now includes bounded, untrusted startup peer goals,
  so a host need not first expose an individual discovery-tool description.
- `threadmesh run codex` preapproves only the four named local workspace tools
  for that invocation, using the pinned source's per-tool
  `approval_mode="approve"`. Shell, filesystem sandbox and other MCP servers'
  approval policies are unchanged. No global configuration is written.
- Goals are still a startup hint. Fresh discovery remains necessary before
  sending; the model still chooses whether to contact anyone.

The same read-only diagnostic **passed after the scoped approval change**:
native Codex called `threadmesh_peers` and received the Pi client's published
goal, with no approval interaction, message or file edit. The
[before/after diagnostic](artifacts/2026-09-05-codex-approval-diagnostic.json)
retains the exact prompt, outcome and private event hashes. This verifies the
authorization fix, not spontaneous tool selection under an ordinary task.

The awareness-only ordinary API attempt still failed: Codex edited and checked
the contract, but sent no message. Native networking retried WebSockets before
falling back to HTTPS. Network delay does not explain away a completed silent
turn. [Negative projection](artifacts/2026-09-05-codex-awareness-negative.json).
Do not advertise the guidance change alone as a Codex initiative fix.

The authorization-adjusted ordinary API run also completed without a peer
message (260,359 ms including receiver setup and network fallback). There was
no ordinary-task MCP call in its retained source timeline. This removes neither
the behavioral gap nor the need to check native onboarding independently.
[Authorization-adjusted negative](artifacts/2026-09-05-codex-preapproval-negative.json).
DeepSeek's native MCP test remains valid, but no local provider key is available
for a model run. Kimi's weekly quota remains a separate limitation; no quota
bypass or repeated Kimi attempt was made.

Regression checks: 398 tests passed, plus 55 schema and 7 transition cases;
Markdown lint checked 121 files with zero issues. The approved-copy case passed
before the later send-description clarification; it must not be presented as
an after-change retry-rate comparison.

## Reproduce and next acceptance

Requires a checkout with dependencies installed, authenticated Pi and the
explicit provider/model below. These commands spend normal model quota and
create isolated fixtures; they do not operate on existing user sessions.

```sh
npm ci
node scripts/validate-workspace-live.mjs pi preferences
node scripts/validate-workspace-live.mjs codex api
```

The script prints its private artifact directory. Use
`node scripts/project-first-use-evidence.mjs PATH` for a small public projection,
reviewing it before publishing. Run `npm test` for non-model regression checks.

Next: native turn-start workspace awareness for Codex rather than relying only
on tool metadata, a successful ordinary task, a fresh
non-contact control, DeepSeek with an available provider, and an independent
first-run report. Do not restart the larger five-role audit as a prerequisite.
