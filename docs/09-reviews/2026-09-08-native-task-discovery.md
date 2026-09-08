# Native task discovery: empty-preview exclusion

Date: 2026-09-08. Result: **the selected agent-created validation tasks are
excluded by the installed runtime's normal list filter; they are not missing
because their titles are wrong**. This is a read-only diagnosis, not successful
public-entry pairing or activation.

## Scoped observations

The official App Server stdio interface, using installed Codex 0.153.1, read only
the two previously authorized validation tasks. No private database, rollout
file or host socket was accessed directly. No task was created, resumed, started,
renamed, moved, enabled or messaged; no model ran. Each diagnostic process exited
after its reads. Only reduced metadata and item counts were printed.

| Returned field | Task A | Task B |
|---|---|---|
| Name | Matches the authorized sidebar title | Matches the authorized sidebar title |
| Source / model provider | `vscode` / `openai` | `vscode` / `openai` |
| Ephemeral | `false` | `false` |
| History mode | `paginated` | `paginated` |
| Thread source | `agent_created_thread` | `agent_created_thread` |
| Preview | Empty string | Empty string |
| Section / parent task | `null` / `null` | `null` / `null` |
| Stored turns returned | 7 | 6 |
| `userMessage` items | 0 | 0 |
| `functionCallOutput` items | 7 | 6 |

The two titles, IDs, working-directory paths and conversation content are omitted
from this public record. The task metadata was readable by the already authorized
IDs. This does not establish a user-friendly discovery route by itself.

## Minimal reproduction

After the documented `initialize` / `initialized` handshake:

1. Call `thread/read` with an already authorized task ID and
   `includeTurns: false`; inspect its name, preview, source and working directory.
2. Call `thread/list` with `limit: 10`, the exact returned `cwd`,
   `sourceKinds: ["vscode"]`, `useStateDbOnly: true`, and `archived: false`.
3. Repeat the same scoped query with `archived: true`.

For each selected task, both list queries returned `data: []` and
`nextCursor: null`. No `searchTerm` was used, so title matching cannot explain
these empty results. The working-directory filter prevents a broad unrelated
task inventory. An additional `thread/read` with `includeTurns: true` produced
the item-type counts above without printing message content.

The [official App Server documentation](https://learn.chatgpt.com/docs/app-server)
describes `thread/read` as non-resuming and documents `cwd` filtering and
`useStateDbOnly`. The latter avoids the default scan-and-repair behavior; this
diagnosis did not invoke a metadata-repair path.

## Why the existing sample cannot validate ordinary title discovery

The public source for the **same version**, not merely current `main`, explains
the exclusion:

- The normal list query adds `threads.preview <> ''` unless a relationship filter
  or an explicit nonempty section applies. See
  [list-query construction](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/state/src/runtime/threads.rs#L1229)
  and the [empty-preview filter](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/state/src/runtime/threads.rs#L1388).
- Preview metadata is populated from user-message events/items; inter-agent
  communication records are not treated as those user-message events. See
  [event handling](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/thread-store/src/thread_metadata_sync.rs#L266)
  and [preview assignment](https://github.com/openai/codex/blob/rust-v0.153.1/codex-rs/thread-store/src/thread_metadata_sync.rs#L316).

The selected tasks have empty previews and neither a section nor a parent.
Their stored input items are manager-delivered function outputs, not direct
`userMessage` items. These observations and the version-matched filter explain
why another valid list limit or another manager message is not a fix.
The earlier successful business exchange remains valid, but this manager-created
sample must not be presented as an independent test of a person typing directly
into two established desktop conversations.

## Product decision

Stop repeating manager messages to try to repair the preview. Do not edit private
host storage, fabricate a user message, or silently move tasks into a section to
make the test pass. Existing collaboration remains stopped.

Prefer the official task deep-link route for an explicitly selected peer: it
avoids dependence on a bounded title inventory and lets users provide a task
reference rather than hunt for an internal ID. The receiving workflow must
validate the selected task through supported tools and preserve consent and stop
rules. This diagnosis alone does **not** validate copying a link in the desktop
UI, consuming it in the workflow, activating a pair, or a new business handoff;
those results need their own acceptance evidence.
