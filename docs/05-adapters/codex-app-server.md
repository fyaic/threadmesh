# Codex App Server adapter notes

> Design notes, not an implemented adapter or compatibility claim. Evidence
> boundary: Codex Desktop has shipped product-level persistent
> cross-thread operations, while open-source Codex also contains a separate
> root-tree-scoped multi-agent mailbox. This adapter must not assume those two
> surfaces share one implementation. See the
> [Codex orchestration deep dive](../07-research/codex-orchestration-deep-dive.md).

Codex App Server exposes documented thread and turn primitives over a bidirectional JSON-RPC-style protocol. Relevant mappings include:

| ThreadMesh | Candidate Codex mapping |
|---|---|
| Task | Codex thread |
| Active run | Codex turn |
| Start run | `turn/start` |
| Active steering | `turn/steer` with expected turn ID |
| Interrupt | `turn/interrupt` |
| Status/events | `thread/*`, `turn/*`, and `item/*` notifications |
| Stored context injection | `thread/inject_items` where appropriate |
| Product-provided peer messaging | Dynamic `codex_app` tools when present and capability-checked |

The adapter must not equate all of these primitives directly:

- A ThreadMesh `suggest` should normally remain in the ThreadMesh mailbox until accepted; calling `turn/steer` immediately would violate context sovereignty.
- A ThreadMesh freshness token should bind to the active Codex turn and local objective metadata.
- Source provenance must remain visible when accepted content is sent to Codex.
- Cancellation results must distinguish turn interruption from cleanup of tools or processes.
- `thread/inject_items` persists model-visible history without starting a turn;
  it is therefore an admission primitive, not a safe peer mailbox.
- A product-provided `send_message_to_thread` tool must be discovered as a
  runtime capability. Its presence, parameters, and delivery semantics must not
  be inferred from App Server version alone.
- Plain cross-task text must not resolve `request_user_input`, approvals, MCP
  elicitations, or other structured control gates.

Primary reference: [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).

## Open adapter questions

- Which source role best preserves cross-task provenance without impersonating the user?
- How should accepted suggestions be represented in stored rollout history?
- Can checkpoint timing be inferred reliably from item and turn events?
- Which App Server surfaces are stable enough for an initial adapter?
- Does the detected peer-message surface report queued, started, steered,
  interrupted, or rejected as distinct outcomes?
- Can the adapter use a documented native queue operation, or must ThreadMesh
  retain mail until the target becomes safely idle?
