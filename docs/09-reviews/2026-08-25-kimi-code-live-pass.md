# Kimi Code live ThreadMesh pass — 2026-08-25

## Result

Kimi Code became the second real agent harness to consume a
coordinator-accepted ThreadMesh suggestion. The maintainer-experimental live
runner passed on clean GitHub `main` at
`b2483436ee48570a23030f4f81ca1d5114eef576`.

This is real product evidence and satisfies the project portability gate. It is
not an M0 external review and does not establish production security.

## Product and repository boundary

| Field | Evidence |
|---|---|
| Product | Kimi Code CLI `0.38.0` over ACP v1 |
| Binary digest | `sha256:92bf3b4b6643e7c4cc12c82e5680cc5b54a5a6768a301de815e5e9a02d2184bb` |
| Capability snapshot | `sha256:c00ac8ca455bf01c4e28795641dda8c04eccd6069d7abea5d384b7a7d927755c` |
| Repository commit | `b2483436ee48570a23030f4f81ca1d5114eef576` |
| Authorization | Maintainer-experimental; normative review unsatisfied |
| Started | `2026-08-25T02:49:34.557Z` |
| Finished | `2026-08-25T02:49:58.788Z` |

The bootstrap verified local `main`, GitHub `main`, and the detached execution
worktree at the same SHA before and after execution. Every boundary remained
clean and exact; isolated-worktree cleanup completed.

## Coordination evidence

- one relationship-authorized suggestion was submitted;
- the receiver mailbox exposed exactly that message;
- the receiver durably claimed and accepted it;
- one admission claim bound the accepted message to the ACP session;
- Kimi loaded the real session and returned the exact untruncated marker;
- evidence contained only `kind`, `sessionId`, `snapshotDigest`, and
  `stopReason`;
- the coordinator confirmed `context-admitted` with decision `accepted`;
- no provider quota, authentication, or permission exception occurred.

The no-model preflight immediately before the live run separately re-probed the
same CLI and capabilities, created and listed a real ACP session, then deleted
it and verified absence.

## Cleanup

The live session was deleted and list-confirmed absent. The runner reported:

```json
{
  "state": "passed",
  "adapterKind": "acp-session",
  "mailbox": "claimed-and-accepted",
  "delivery": "context-admitted",
  "decision": "accepted",
  "markerMatched": true,
  "cleanup": {
    "attempted": true,
    "complete": true,
    "sessionDeleted": true,
    "absenceVerified": true
  }
}
```

No raw transcript, credential, account metadata, local home path, or unbounded
provider error was retained.

## Scope

This pass proves a materially different ACP harness can consume the same
receiver-accepted ThreadMesh suggestion already validated on Codex App Server.
It does not prove autonomous relationship selection by Kimi, a statistical
interference rate, OS-level sandboxing, remote authentication, or safe
untrusted-peer prompt handling. Those claims remain outside this evidence.
