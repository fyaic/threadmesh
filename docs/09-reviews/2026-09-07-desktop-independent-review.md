# Desktop entry: independent product review

Date: 2026-09-07. Baseline: `550e64c`.
Internal subagent review; not external adoption or a native desktop test.
Scope: desktop entry plan, developer probe, current workspace implementation.
No GUI interaction, plugin installation, model call or transcript access.

## Verdict and shortest useful slice

The [desktop plan](../10-planning/desktop-entry-2026-09-07.md) addresses the real
remaining gap: users already have valuable GUI sessions, not empty processes
they want to relaunch with paths and JSON. The current probe establishes none
of the promised desktop collaboration. Reject feature-complete marketing now.

Ship one narrowly supported pair first: existing Codex and ZCode conversations
deliberately join through normal client controls, publish short goals, and
receive attributed peer advice at a native checkpoint. Models select whether
and whom to contact. Existing receiver context and its user's current task
remain authoritative. Clearly show **pending until next checkpoint** if no
supported idle wake exists. This is less autonomous than immediate wake, but
still removes human relaying; a dashboard and background wake are not required
to prove that narrower useful slice.

## Real blockers versus unnecessary gates

| Item | Assessment and next action |
|---|---|
| Previously opened conversation picks up extension | Real adoption blocker; test the old conversation, not a new CLI session |
| Native caller binding for sends | Real correctness blocker; a hook ID/fingerprint does not bind an MCP invocation to that conversation |
| Advice enters the same native receiver | Real delivery blocker; use documented checkpoint hooks or a supported directed interface |
| Public API for immediate idle wake | Blocker only for automatic wake; checkpoint delivery can be an explicitly narrower first release |
| No paths, JSON, manual runtime or IDs | Real first-user release requirement; not a reason to postpone a controlled developer feasibility probe |
| All harnesses, quota recovery, desktop dashboard | Not prerequisites for this one pair; retain other gaps without expanding this increment |
| Perfect model reliability or 100 stars | Not a feasibility gate; preserve failed examples and measure usable outcomes |

Do not infer the sender from a shared “last active session” variable: two tabs
can interleave. Do not substitute a model-supplied session ID for host binding.
Existing `startWorkspaceMcp` captures a caller-selected workstream name once;
that is not demonstrated GUI-native identity. A new App Server process or a
window-wide bearer token is not evidence of attachment to the existing owner.
The two native-bridge investigations should identify the exact supported seam;
if none exists, report that gap instead of automating UI typing or private IPC.

For this same-owner local alpha, native caller correlation plus an explicitly
trusted host-owned stdio process and opt-in can establish the binding. This
does **not** require a new cryptographic framework. Metadata alone is forgeable
by foreign clients; do not claim protection from arbitrary hostile local code.

## Probe readiness and privacy findings

The original five hook tests pass independently. The script validates event type and
ID length, bounds stdin to 1 MiB, emits only a hash marker and fixed diagnostic
text, and does not persist input, open transcript paths or use the network.
Invalid input returns empty hook output without echoing private content.

Important limits before a native installation:

- Hooks have no per-conversation opt-in filter. Their actual scope follows the
  host installation scope; a global install may annotate unrelated sessions.
  Use an isolated supported test context or disclose and control this scope.
- The deterministic 64-bit fingerprint is a correlation marker, not anonymity,
  authority or a routable address. Do not publish it alongside private context.
- The manifest invokes `node` from GUI PATH and assumes plugin-root expansion.
  Shell subprocess tests do not establish either property inside these apps.
  A missing runtime is a native readiness failure, not a reason for the user
  to debug their terminal setup in the eventual installation flow.
- Fail-open handling does not mean zero latency: each synchronous hook may
  wait for the host's timeout. A model repeating an old marker is not proof of
  current hook execution; retain native execution evidence after enable/disable.

No fixture-level code defect currently blocks a controlled native probe. This
does not certify manifests, identity fields or output handling in installed
client versions; the dedicated bridge lanes must supply that evidence.

## One bounded acceptance script

1. Start two disposable GUI conversations before installing the integration.
   In the website task, establish “Create my workspace” as the signup label.
   Keep a third unrelated task outside the opted-in pair.
2. Install through normal supported controls. Record every restart and manual
   prerequisite. Opt in just the pair with readable goals; do not ask the user
   for session IDs, paths or JSON. Verify prior native identities remain intact.
3. Give the product task the ordinary decision: Member Portal, free plan up to
   five projects. Do not name a recipient, tool or required send action.
4. Require a genuine model-selected send and attributed delivery. If checkpoint
   only, continue the receiver with ordinary work, without copying the decision
   or asking it to poll. Record that extra user turn; do not call it idle wake.
5. Require the receiver's actual artifact edit: correct name, **free-plan**
   qualifier, five-project limit and original signup label. Native send success,
   receiver identity and edit provenance must agree; a receipt is insufficient.
6. Exercise a queued receiver user task and then mute/revoke. Peer advice must
   not steer the active task or bypass mute at the next delivery checkpoint.
   Already injected context cannot be retracted; say so rather than promising it.
7. Disable the integration. Verify no new delivery/execution, preserve failures
   and count all operator interventions. Only then package the successful route
   for one independent first user; do not launch promotional work beforehand.

Final code review: hook plus both-vendor MCP identity diagnostics pass 10 tests
independently. No blocking code/privacy defect found; hashes remain correlation,
not consent. Native installation, old-session pickup and actual delivery remain open.
