# Workspace awareness and real handoff evidence

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

## Follow-up: native Codex task-time awareness

The MCP-only negatives below remain retained. A subsequent implementation adds
invocation-scoped `SessionStart` and `UserPromptSubmit` context hooks, following
the official [Codex Hooks](https://learn.chatgpt.com/docs/hooks) surface and
the pinned `rust-v0.145.0` source. They refresh published peer goals and a bounded
inbox preview; neither hook chooses a recipient or sends a message. Existing
instructions and lower-layer hooks remain in place. Only our two exact command
definitions are trusted; there is no global hook-trust bypass.

The native no-model test verified both exact trusted entries, preservation of
an untrusted project hook, and actual SessionStart completion with peer context.
SessionStart is dispatched inside the first turn, not merely `thread/start`.
A test-only blocking prompt hook and unreachable local provider prevented model
sampling during this probe. Main-agent rerun: 4/4 passed. This establishes the
context seam, not model initiative. Compatibility is pinned to Codex `0.145.0`
on macOS; Windows is MCP-only and disabled hooks stay disabled.

The [acceptance plan](../10-planning/cross-harness-acceptance-2026-09-05.md)
and [internal independent review](2026-09-05-mainline-independent-review.md)
require a successful native send, durable envelope, unchanged receiver-native
session identity, post-delivery receiver tool edit and independent business
assertion. A send-budget reservation or changed file timestamp cannot substitute
for those observations. Busy/queued-input protection has deterministic coverage,
not a new native busy-receiver result.

### Ordinary Codex → Pi API case: pass

Codex `0.145.0` updated the backend contract and chose to send useful advice.
Pi `0.84.2` with `zai/glm-5.3` resumed in the same already-started native session,
used its own `write` tool to update the client and passed an independent
two-cursor-page assertion. Each session received one ordinary kickoff, neither
prescribing a message or recipient. The source model identifier was not exposed
by native Codex exec JSON and is not inferred from a default.

| Event | Milliseconds from experiment start |
|---|---:|
| Receiver finishes its initial task | 50,497 |
| Source successfully queues advice | 212,990 |
| Same receiver automatically starts follow-up | 214,845 |
| Receiver's own successful client write | 243,117 |
| Independent business assertion passes | 269,664 |

Unrelated messages: **0**. The receiver initially volunteered its dependency;
this is configured reciprocal collaboration, not a blind-source experiment.
Its later reply first failed fresh-discovery validation and then succeeded;
the [public projection](artifacts/2026-09-05-codex-pi-api.json) retains that failure
alongside successful sends. The source encountered five network retries before
falling back to HTTP in the same run; no manual resend or second source kickoff
repaired the outcome. This is not a timing or reliability claim.

Reproduce from the repository with authenticated Codex/Pi and the recorded Pi
provider: `node scripts/validate-workspace-live.mjs codex api`. The source flags
are `exec --ignore-user-config --skip-git-repo-check --sandbox workspace-write
--json`, preceded by the public launcher's scoped MCP/hook configuration. The
receiver uses native RPC plus the ThreadMesh extension, with unrelated Pi
extensions, skills, context files and prompt templates disabled. Optional Codex
MCP OAuth/cache warnings were present: these flags are not evidence of a fully
isolated user configuration. Native transcripts and identifiers stay private.

### Ordinary Codex → Pi copy case: business-quality failure

The second task family used the same integration and one ordinary kickoff per
session. Codex's message explicitly carried the new product name, **free tier**
limit and US spelling. The same Pi website session resumed and edited its own
file, keeping its earlier `signupButton: "Create my workspace"` constraint.
But the description became `Up to 5 projects for your team.`: it omitted that
the limit applies to the free plan. The unchanged `/free/i` business assertion
failed at 234,978 ms. This case is **not a pass**.

The message and shared brief retained the free-tier information, so this was
receiver-side semantic loss, not missing transport data. Contact, continuity
and an edit alone did not preserve the complete user intent. The record
illustrates why receipt/acceptance must not be advertised as verified completion.
No later prompt, manual edit or weakened assertion repaired the published run.
The [negative projection](artifacts/2026-09-05-codex-pi-preferences-negative.json)
retains ordinary prompts, successful sends, final file and raw-event hash.

The prior button requirement also existed in the initial file: retaining it
is not proof of hidden-memory transfer. Pi volunteered the initial dependency
in this case too. The next product check must retain meaningful constraints
and expose an unsuccessful result, not add more message-routing roles or tune
the fixture until it appears green.

### Unrelated ordinary change: no-contact control passes

In a fresh third run, Codex was asked to write an internal Monday-meeting note
without changing the API contract. It actually called peer discovery, inbox
and checkpoint tools, but made **zero send attempts**. The existing Pi receiver
kept the same native identity, had no follow-up turn and retained its initial
client file; the API contract was unchanged. The run passed at 216,066 ms,
including 10 seconds of observation after the source completed.

Pi had sent its initial dependency message, so this is zero **source contact
about the unrelated change**, not zero workspace traffic for the entire run.
The result does not mean silence caused by missing tools, nor prove long-term
silence or busy-user arbitration. [Public control record](artifacts/2026-09-05-codex-pi-no-contact.json).

Final three-run outcome: **API pass / copy-quality failure / no-contact pass**.
Each was attempted once. Non-model regression: 407 passed, one optional native
test skipped; 55 schema and 7 transition cases; 123 Markdown files, zero lint
issues. The optional native hook test separately passed 4/4. Internal review
also ran alternate two-page and empty-page client assertions. These maintainer
and subagent checks are not independent community adoption.

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

CI also exposed an old ACP quota-test race: the fake agent threw a generic
exception (serialized by the SDK as `Internal error`) and relied on stderr
arriving first for classification. The fixture now returns an explicit JSON-RPC
quota error without stderr, matching what its test claims to exercise. The
production classifier and acceptance assertion were not weakened.

## Reproduce and next acceptance

Requires a checkout with dependencies installed, authenticated Pi and the
explicit provider/model below. These commands spend normal model quota and
create isolated fixtures; they do not operate on existing user sessions.

```sh
npm ci
node scripts/validate-workspace-live.mjs pi preferences
node scripts/validate-workspace-live.mjs codex api
node scripts/validate-workspace-live.mjs codex preferences
node scripts/validate-workspace-live.mjs codex api-no-contact
```

The script prints its private artifact directory. Use
`node scripts/project-first-use-evidence.mjs PATH` for a small public projection,
reviewing it before publishing. Run `npm test` for non-model regression checks.

Native task-start awareness and the ordinary cross-harness API task have now
passed as recorded above, along with the fresh no-contact control. Remaining
acceptance includes complete business-constraint retention, native prior-session
attachment, DeepSeek with an available provider, and an independent first-run
report. Do not restart the larger five-role audit as a prerequisite.
