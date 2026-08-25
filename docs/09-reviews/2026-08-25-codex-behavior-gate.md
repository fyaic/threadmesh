# Codex behavioral value and interference gate — 2026-08-25

## Scope

Three real Codex App Server conditions ran sequentially from clean `main` at
`0dd2c828889287634dff09eb9fbc41dcdfb69b86` with Codex CLI `0.145.0` and
`gpt-5.6-sol`. The experiment is maintainer-authorized and non-normative.

Agent A owned a verified upstream artifact checksum. Agent B owned a downstream
manifest that could complete only when that checksum reached its accepted task
context. Public evidence excludes raw transcripts, account data, and local
paths.

## Results

| Condition | UTC interval | Score | A tool sequence | Sends | B activated | Elapsed |
|---|---|---:|---|---:|---|---:|
| Control, no contact | 02:20:39–02:23:59 | 0 | none | 0 | No | 200 s |
| Relevant dependency | 02:24:12–02:28:49 | 1 | related tasks, send suggestion | 1 | Yes | 277 s |
| Irrelevant task | 02:29:04–02:32:47 | Not scored | related tasks | 0 | No | 223 s |

The relevant condition improved B's deterministic dependency outcome from zero
to one. Its observed coordination cost versus control was about 77 seconds and one
additional B receive turn. The irrelevant condition inspected the bounded
summary but did not send or activate B. All three conditions reported zero
non-ThreadMesh tool calls, no interference violation, and complete deletion of
both exact tasks.

## Interpretation

This is the first outcome-bearing positive/control/negative pass. It supports a
narrow claim: one real model distinguished a checksum dependency from an
unrelated release-note task, used the bounded channel only for the useful case,
and improved the downstream scored result.

It is not a statistical false-positive estimate. Duplicate/stale cases,
repetitions, concurrent user turns, and model-selected B defer/reject remain
open under issue #53. Those follow-ups no longer block extracting the minimal
adapter API, but they block enabling proactive coordination by default.
