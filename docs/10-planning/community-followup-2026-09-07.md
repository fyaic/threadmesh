# Community follow-up: improve first, reply with evidence later

Date: 2026-09-07. Owner: maintainers. Status: internal delivery reference;
no new external reply is authorized until several concrete improvements are ready.

## What the contributor actually requested

In the [latest #158 comment](https://github.com/fyaic/threadmesh/issues/158#issuecomment-5567487268)
(2026-09-07 08:12 UTC), `hlinor-systems` acknowledged our distinction between
observed guarantees and unfinished product claims. Their preferred next step is
a self-contained two-session example, visible installation/run and quota status,
and evidence that the receiving session changes the intended artifact after
acceptance. They explicitly left live-receiver and native desktop-session checks
for a separate run when a usable account path exists.

This continues the [independent report](https://github.com/fyaic/threadmesh/issues/158):
installation took about five minutes with little feedback; public-API handoff
checks worked; a Codex usage limit prevented a model turn. The manually driven
harness artifact change was not evidence of agent-owned business completion.
The latest comment adds agreement on the next outcome, not a new security review
or a request for more protocol machinery. It is one contributor's feedback,
not a community-wide demand ranking.

## Fit with the original product requirement

The primary audience is Codex users. The original request is for sessions of
the same agent to discover relevant work and proactively contact another session
without the user repeatedly explaining prior decisions. Cross-product adapters
are an extension, not a first-use prerequisite. A Pi example does not require
Codex users to adopt Pi, and a new-session Codex example does not fulfill existing
desktop-session attachment.

The [published alpha.2 follow-up](https://github.com/fyaic/threadmesh/issues/158#issuecomment-5567451304)
already delivered a packaged, self-contained Pi entry with visible progress and
business checks. It remains optional for existing Pi users. The [Codex candidate](../09-reviews/2026-09-07-codex-first-use-candidate.md)
preserves the earlier timed failure. The subsequent [Codex installed-package
acceptance](../09-reviews/2026-09-07-codex-first-use-release.md) passed with the
default command in 272.604 seconds after the runtime-selection repair. This
closes the bounded maintainer example, not independent adoption or desktop use.
Neither deterministic tests nor a working install count as the live result.

## Three acceptance checks before the next community reply

1. **Self-contained same-Codex use:** from an installed candidate package, use
   the user's existing authenticated Codex runtime and configuration for two
   independent sessions. No custom harness, application fixture, manual peer ID,
   second product or additional subscription is required. Retain the exact
   command, runtime/model, timing and actual result. A clean-package help check
   alone is insufficient; the full real case must complete within its stated bound.
2. **Visible setup and accountable failure:** installation and runtime stages
   are visible; missing runtime/login, quota limits, retrying connections,
   deadline and cancellation produce distinct actionable outcomes. A detected
   binary or login is not asserted to prove remaining quota. Native retries
   stay within the original deadline; no silent account/model switch or simulated
   success substitutes for a failed run. Keep private logs local and publish only
   reviewed, reduced evidence of the first failing step.
3. **Receiver-owned useful result:** preserve ordinary prompts and actual native
   events showing model-selected contact, receiver disposition, same-receiver
   continuation and the receiver's own artifact edit. Independently check the
   complete changed business meaning and retained prior constraints. Acceptance
   alone is not completion, and harness-written output is not agent initiative.

Busy/live-receiver behavior and existing native desktop conversations remain
separate acceptance work. Do not recruit this contributor to those tests until
a usable supported account/activation path exists. Do not remove the desktop
goal because the smaller new-session example is easier to validate.

## Deferred reply and execution discipline

Subsequent native desktop evidence is now retained as [actual excerpts and diff](../evidence/codex-native-2026-09-07/README.md).
That controlled prior-context pair passed; it is not this contributor's independent
live result. The [native-value correction](../00-overview/native-capabilities-and-value.md)
credits Codex's existing transport and discloses that the skill has no measured
advantage over native-only use. These are material clarifications to include when
a reply is authorized, not reasons to post another immediate acknowledgement.

The user explicitly asked us to make several real improvements before replying
again. Therefore do not post another acknowledgement, roadmap promise, test
request or issue closure now. Continue implementation, review and verification
inside the authorized task rather than stopping after each small step.

The next reply should contain the actual released install/run entry, a short
account of the improvements against the three checks, a retained useful result
and precise remaining limits. If Codex is still blocked, do not describe the
Pi pass as resolving that gap or request repeated quota-consuming retries.
Do not promise a release date, desktop support, reliability rate or star count
without corresponding evidence. Leave #158 and the broader #79 gates open until
their remaining outcomes are met; this note itself is not delivery.
