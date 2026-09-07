# Codex-first candidate: useful partial evidence, release gate not passed

Date: 2026-09-07. Base: `0863f90`. Branch: `feat/codex-first-use`.
Status: unreleased candidate; the published package remains `0.1.0-alpha.2`.

Historical candidate checkpoint: the later [installed-package acceptance](2026-09-07-codex-first-use-release.md)
supersedes the release stop below, not these failed attempts or their evidence.

## Product decision

Codex is the primary audience, especially people with separate existing desktop
conversations. Do not require Pi or a second subscription to try the intended
product. A new-session CLI example can reduce immediate setup work, but cannot
replace existing-desktop activation, native identity and delivery acceptance.

The candidate makes `try preferences --live` use the installed Codex and its
existing model/login. It prepares two disposable App Server threads, exposes
four bound coordination tools, and continues the same idle receiver only after
an actual model-selected durable message. No business-specific follow-up repair
instruction is scripted. Correct receiver-owned copy, its earlier signup label
and the protected price are required; delivery alone does not pass.

## Native attempts, including failures

Environment: macOS, Node `26.3.1`; PATH Codex `0.145.0`, desktop-bundled Codex
`0.153.1`. Existing ChatGPT login, default `gpt-6-astra`; one diagnostic used the
already listed `gpt-5.6-sol`. No account, global model, quota or security settings
were changed. All launched sample processes stopped; private artifacts remain.

| Attempt | Result | Meaning |
|---|---|---|
| PATH runtime, default model | Stopped at 53.222 s in initial receiver turn | Runner incorrectly treated a retry notification as terminal |
| Bundled runtime, default model | Same premature stop at 49.260 s | Updating the executable alone did not fix our handling |
| Bundled runtime, Sol diagnostic | Same premature stop at 50.402 s | Not evidence that switching models solves the issue |
| Fixed runner, bundled runtime, default model | Receiver completed; total 300.043 s expired during source work | Partial native evidence, not a completed collaboration |
| Sample-local HTTPS configuration experiment, both runtimes | Rejected before any turn | Built-in provider override is forbidden; experiment removed |

A separate no-tool native `codex exec` control with host-task environment
bindings removed also reported reconnects and was stopped at its 90-second
budget. That control did not reach completion; environment isolation is not an
established remedy for the connection failures.

### What actually worked in the corrected run

At 152.741 seconds, the website model voluntarily sent the brand workstream a
dependency message. It described its approved source, reported the current
landing copy, preserved the user's exact `Create my workspace` constraint and
asked to be advised when approved claims changed. The ordinary task did not
prescribe that recipient or a send. Generic opt-in coordination guidance and
peer goals were available.

The website turn completed at 160.596 seconds. The brand turn started at
160.726 seconds and later read peers and its inbox. The overall deadline expired
before the source finished; no A-to-B follow-up or final copy acceptance occurred.
Thus **real model-selected initiative was observed, but the full user outcome
was not achieved**. Do not publish this as the successful Codex hero case.

Corrected-run event SHA-256:
`be74434f2e377cd749f58844413e269323ef571888c8ed5cb1039a684272ada4`.
Private transcripts, raw native identifiers and account details are not published.

## Review fixes and deterministic checks

Three delegated lanes implemented the runner, tested/reviewed native boundaries
and prepared bilingual documentation. The root integrated, inspected source,
ran the actual products and withheld the release when the user outcome failed.

- Native `willRetry: true` now permits recovery within the original total
  deadline. Quota/auth and terminal errors still stop immediately. This follows
  the [official CLI's terminal-error condition](https://github.com/openai/codex/blob/25af12f7e61572b0bc18ddb1008be543b91519b0/codex-rs/exec/src/lib.rs#L998)
  and [native reconnect/fallback implementation](https://github.com/openai/codex/blob/25af12f7e61572b0bc18ddb1008be543b91519b0/codex-rs/core/src/responses_retry.rs#L25).
- Standalone children do not inherit the invoking desktop task's identity or
  tool-pipe bindings. Authentication, provider, network and policy environment
  remain intact. This isolation is not a claimed timeout fix.
- Calls bind to the active native thread and turn. Failed patches, wrong-thread
  requests, depleted quota, missing login, cancellation and timeout cannot pass.
- Codex first use is restricted to JSON-copy `preferences`. The API verifier
  imports model-written JavaScript outside the native sandbox; its zero exit
  alone could also skip assertions. Rather than expanding the verifier here,
  the candidate rejects Codex API mode before files, processes or model calls.
  The existing Pi API path retains its documented normal-OS-permission limit.
- The focused Codex suite passed 15 tests, including recovery, unchanged retry
  deadline, API rejection and environment isolation. These are deterministic
  fixtures, not a live success rate.

Final full regression: 451 passed, one optional native test skipped; 55 schema
cases, seven transition cases and 134 Markdown files passed. A fresh local
packed-package consumer installed 97 dependencies, displayed the Codex default
instructions and imported the new runner without repository scripts or a model
call. This warm-cache packaging check is not a public release or a live pass;
the candidate tarball remains private and does not replace the alpha.2 asset.

## Release and mainline gate

Do not publish `alpha.3`, advertise Codex first use as proven, or add nonexistent
release-asset links. The candidate is retained for review. The published Pi
example remains an optional path for people who already use Pi, not a prescribed
workaround for Codex users.

Next: complete this same Codex copy case from an installed candidate package
within its stated budget, without switching accounts or silently replacing the
model. Preserve the first failing step if it fails. Separately, the primary
desktop gate needs the supported user-operated plugin activation/trust checkpoint
on the retained disposable conversations, followed by native identity and
attributed delivery. Do not bypass the previously denied desktop automation
surface, change global trust, or substitute another new-session benchmark.

See the [desktop plan](../10-planning/desktop-entry-2026-09-07.md) and
[earlier native adoption failure](2026-09-07-desktop-native-adoption.md).
