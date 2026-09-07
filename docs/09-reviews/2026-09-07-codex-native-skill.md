# Codex native-task skill: packaging and behavioral review

Date: 2026-09-07. Status: experimental, native pair acceptance pending.

## Why this path

The current Codex host already exposes native task read/status/send/wait tools.
A skill can guide an explicitly selected pair without a Node runtime, an MCP
server or hook trust. This is use of **Codex's own capability**, not evidence
that ThreadMesh's external coordinator can control arbitrary desktop tasks.
It is a narrower route than waiting for an external daemon or plugin hook.

The root read official plugin documentation and the Skill Creator and Plugin
Creator instructions. The resulting package contains only a manifest, a skill
and its UI metadata. No marketplace, global configuration or installed plugin
was changed. The existing plugin/hook adoption failure remains in the record.

Entry: [English](../06-guides/codex-native-tasks.md) /
[中文](../zh-CN/codex-native-tasks.md). The source-read workflow asks the model to
read the skill in an existing conversation; it does not claim catalog hot-load.

## Independent behavioral tabletop

A fresh subagent read the actual skill and four realistic scenarios, with
fictional native tool schemas. It did not contact real tasks or run models.

| Scenario | Observed decision |
|---|---|
| Approved product change; opted-in idle receiver | Narrow advisory send, preserved free-plan scope and earlier button label; no completion claim |
| Receiver active and awaiting user input | Keep a pending suggestion; no send, steering or polling loop |
| Name only; user forbids other metadata and any interruption | Request a native reference; do not enumerate tasks; draft-only because the guarantee is unsupported |
| User says stop and no more messages | Stop sends; no final broadcast; explain that peer permission and submitted messages are separate |

The review found ambiguity about status freshness and existing pending work.
The root tightened the skill to require a fresh native status check immediately
before each send and to cancel prior pending suggestions when stopped. It also
made a disposable test pair a recommendation, not a reason to replace the user's
selected tasks or create tasks without permission.

The bundled skill and plugin validators passed using an isolated `uv` environment
with PyYAML. The ordinary Python and bundled Python lacked PyYAML; no global
Python package was installed to work around that. These are packaging and
tabletop results, **not live model-to-model desktop validation**.

## Unresolved native boundaries

Native send has no atomic idle-only condition, expected revision or queued-user
input control. Checking status first cannot eliminate the race. The skill uses
best-effort skip-busy behavior; stricter non-interruption means draft-only.
Stopping one task cannot atomically revoke permission in another task.
These are model instructions, not enforced authorization guarantees.

Native task listing returns unrelated titles/summaries too; prefer task references.
The root performed one inventory while looking for prior test tasks, but did not
read unrelated turns or send to business conversations. The retained diagnostic
task was not found in that inventory. The user has been asked to choose a pair
or authorize two dedicated tasks; none was created for this follow-up without
that answer.

Next real acceptance must retain prior receiver context and identity, actual
model-selected send with host attribution, receiver-owned useful edit, and
busy/stop negatives. It must record manual setup separately from ordinary
business prompts. Do not substitute the new App Server sample for this proof.
