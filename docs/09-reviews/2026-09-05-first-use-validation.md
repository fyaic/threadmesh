# First-use alpha: native integrations, initiative and recovery

Date: 2026-09-05. Branch: `feat/first-use-workspaces`, baseline `38178e1`.
Maintainer-run on macOS, Node `26.3.1`; not independent adoption evidence.

## Outcome, without mixing evidence levels

| Check | Result | What it establishes |
|---|---|---|
| Official DeepSeek Harness `0.1.2-rc.1` MCP plugin | Pass | Four native tools, bidirectional delivery, non-consuming inbox, acceptance, checkpoint save |
| DeepSeek model-selected collaboration | Not run | No available DeepSeek provider key; no model initiative claim |
| Pi `0.84.2`, `zai/glm-5.3`, two persistent workstreams | Pass | Ordinary tasks, model-selected messages, idle receiver follow-up, real client file update, independent two-page assertion |
| Codex `0.145.0` → Pi workspace attempt | Not passed | Codex completed its contract edit after network retries but sent no peer message |
| Kimi Code `0.39.1` workspace attempt | Blocked | Real 403 weekly quota exhaustion before a usable source model turn |
| Public `continue` command → Pi `zai/glm-5.3` | Pass | Explicit seeded checkpoint preserves approved naming/constraints and leads to a correct real file edit and new checkpoint |
| Clean packed consumer | Pass | Installs tarball; original demo, three previews, room init and DeepSeek configuration execute outside the checkout |
| Regression suite | Pass | 395 unit/subtests; 55 schema cases; 7 transition cases; documentation lint |

These results do not establish automatic cross-harness collaboration for the
new MCP launchers. Earlier Codex→Kimi and Pi→Kimi adapter benchmarks remain
separate, more constrained evidence. The first-use recommendation is the
**tested Pi pair**, not a promise that any model/host combination works equally.

## The actual initiative case

Both agents retained normal file tools. Neither user task specified a recipient,
message text, or tool-call sequence. The extension did supply a reusable
cooperation policy: inspect peer goals/inbox at task checkpoints, decide
whether a change matters, share useful advice, avoid acknowledgement loops,
and save explicit progress. This is **configured model-selected initiative**,
not a claim that prompting or runtime scaffolding was absent.

Client's only user kickoff:

> You maintain client.mjs. Inspect it and make sure it follows the current API
> contract in ../backend/contract.json (the shared source of truth). Keep the
> exported fetchAll(fetchPage) API returning a flat array. Leave the file ready
> for use. This task continues as the project evolves.

Backend's only user kickoff:

> Revise contract.json to use cursor pagination: requests take cursor (null for
> first page); responses contain items and next_cursor (null at the end). Remove
> next_page. Keep the /orders endpoint and item schema unchanged. Finish the
> backend contract update.

The operator initially joined three workstreams: backend, client and an
unrelated privacy-policy translator. The client ran first and chose to tell
the backend what it depended on. The backend subsequently edited its contract,
read the inbox and sent the migration advice. Pi's native custom-message
follow-up woke the idle client, which checked the actual shared contract,
updated `client.mjs`, ran tests and saved progress. No second user prompt was
sent to the client. The unrelated workstream received zero messages.

| Elapsed from test start | Observation |
|---|---|
| 78.4 s | Client's successful peer send after discovery |
| 89.9 s | Backend's ordinary task starts |
| 128.3 s | Backend sends the contract change |
| 128.9 s | Idle client starts its next native turn without another user prompt |
| 170.4 s | Client writes its update after reading the shared contract |
| 204.6 s | Independent assertion passes: correct cursor arguments, both pages, flat result, termination |

This duration includes model work and coordination on one prepared fixture; it
is not measured install time, a manual-vs-automatic comparison, or a universal
three-minute promise. Some model calls attempted sending before discovery and
corrected after the error; do not describe the run as error-free.

The [sanitized evidence projection](artifacts/2026-09-05-workspace-pi.json)
contains the exact prompts, model identities, event timeline, final client
source and raw-event digest. It omits raw reasoning, credentials and native
session IDs. A maintainer-produced projection/digest is not an independent
verification certificate.

## What failed, and what we learned

- **Pi extension was silently absent:** `.mjs` is not a discovered CLI entry
  in the installed Pi package. Added a `.js` entry and a connection preflight
  before model spending. Regression covers packed entry inclusion and lifecycle.
- **Model dependence is real:** the local default `zai-vision/glm-4.6v`
  completed ordinary file work but did not coordinate, including an attempt
  after the extension loaded. Explicit `zai/glm-5.3` did use the tools.
- **Codex silence:** three exploratory workspace attempts completed local
  contract work without the desired message; early attempts also had an
  unloaded Pi receiver. The final receiver-loaded attempt still produced no
  sender message after Codex network retries. Configuration alone is not enough.
- **Kimi invocation drift:** initial probes exposed unsupported `--print`
  and a prohibited `--prompt`/`--yolo` combination; the corrected command then
  reached the real provider and was rejected for weekly quota. No new Kimi
  model success is claimed.
- **Advisory versus contradictory files:** with two separate contract copies,
  Pi noticed the peer's claim conflicted with its local source of truth. It
  resumed automatically but declined the rewrite and asked the backend to
  reconcile. The business assertion failed, correctly. The final fixture uses
  one actual shared contract; the runner does not copy changes between agents.
- **Ambiguous tool field:** models interpreted `receipt` as a free-text note.
  Renamed it `receiptMessageId` with an explicit lookup description, and reject
  combining receipt lookup with a decision. A readable inbox is not evidence
  that every attempted disposition succeeded.

These were iterative development attempts with changing fixtures/configuration,
not repetitions of a frozen experiment. No success-rate percentage is inferred.

## Checkpoint continuation case

A deliberately seeded checkpoint represented a prior Kimi workstream. It
recorded the approved name **Member Portal**, US English, a protected version
file and the next editing step. No source Kimi chat was exported or recovered.

The public `threadmesh continue original --agent pi --name recovery` command
started a real Pi model. Independent file assertions confirmed the approved
name, “Organize” and “favorite”, absence of the rejected name/UK spellings, and
an unchanged `version.txt`. The destination saved its own checkpoint.

This proves the continuation mechanism for **saved explicit context**, not
quota detection, lossless history migration, or recovery of inaccessible
unsaved context. Kimi's actual quota error is a separate observation.

## Reproduce

From the repository, after installing dependencies:

```sh
npm test
node scripts/validate-workspace-live.mjs pi
node scripts/validate-checkpoint-live.mjs
```

Live scripts use existing authenticated products and consume normal model
quota. Pi is explicitly configured to `zai/glm-5.3`; override
`THREADMESH_LIVE_PI_PROVIDER` and `THREADMESH_LIVE_PI_MODEL` for a separately
reported comparison. Use `codex` or `kimi` as the first script's argument to
attempt those senders; they are not claimed passes in this record.

For DeepSeek, install the official preview in an isolated directory and pass
its `node_modules` path (this test makes no model call):

```sh
npm install --prefix /absolute/disposable/dsh-runtime @deepseek-ai/dsh@0.1.2-rc.1
node scripts/validate-deepseek-workspace.mjs /absolute/disposable/dsh-runtime/node_modules
```

The native check uses the published `@deepseek-ai/cordis`, `dsh-tools`,
`dsh-system-prompt` and `dsh-mcp-client` packages, actual stdio transport and
the actual ThreadMesh coordinator—not a fixture MCP client.

## Authority, disposition, result and cleanup

- **Initiator:** the model of a named, explicitly joined local workstream.
- **Policy:** same-owner local room consent; host-issued directional suggest
  routes through the existing coordinator, with expiry and send budgets.
- **Receiver:** peer content is labelled advisory; Pi follows up only while
  idle and opted in. Inbox decisions are separate from receiving a notification.
- **Evidence:** assertions inspect actual files after model work. Receipt
  `accepted` alone is never promoted to verified completion.
- **Cleanup:** validation subprocesses are stopped; local synthetic artifacts
  and native test session records are deliberately retained for review, not
  claimed deleted. No global provider config was replaced. The isolated Kimi
  test folder contains its generated project MCP entry. Remove retained test
  artifacts deliberately when they are no longer needed; never delete arbitrary
  user session stores as “cleanup”.

Production authorization, hostile-peer isolation, native tab identity mapping,
broader task repetitions, new cross-harness live success and independent user
adoption remain open. The next work is to improve first-use awareness, not
reopen the entire five-role evidence architecture as the critical path.
