# Codex App Server adapter notes

> Design notes, not an implemented adapter or compatibility claim.

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

The adapter must not equate all of these primitives directly:

- A ThreadMesh `suggest` should normally remain in the ThreadMesh mailbox until accepted; calling `turn/steer` immediately would violate context sovereignty.
- A ThreadMesh freshness token should bind to the active Codex turn and local objective metadata.
- Source provenance must remain visible when accepted content is sent to Codex.
- Cancellation results must distinguish turn interruption from cleanup of tools or processes.

Primary reference: [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).

## Open adapter questions

- Which source role best preserves cross-task provenance without impersonating the user?
- How should accepted suggestions be represented in stored rollout history?
- Can checkpoint timing be inferred reliably from item and turn events?
- Which App Server surfaces are stable enough for an initial adapter?
