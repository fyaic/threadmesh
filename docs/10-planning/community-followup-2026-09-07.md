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

### Latest review and reply gate

Rechecked #158 and recent repository comments on September 7. The latest external
comment remains `hlinor-systems` at 08:12:18 UTC, linked above; no newer demand
was found. Do not describe a fresh inspection as a new comment. #158 and #79
remain open.

The current README now leads with user chores, one complete native desktop case
and three distinct entry paths. It separates the 49-second desktop observation
from the 273-second packaged example and removes the global Node badge: Node is
a package requirement, not a requirement of the native skill workflow. Native
attribution and the absence of measured incremental benefit remain explicit.

**Decision: draft only; do not post this turn.** The three requested maintainer
example/progress/receiver-evidence improvements have shipped. Another README
rearrangement is not a new functional release. The next useful increment is the
remaining Codex desktop pairing/activation friction: test a publicly retrievable
workflow with supported task references, without maintainer-local paths or manual
ID hunting. Record the first failure and actual setup steps. After that bounded
increment, recheck the comment and send one consolidated update; do not wait for
every adapter, perfect reliability or a marketing video. No automatic posting or
scheduled follow-up is configured by this document.

### Proposed reply to #158 — not sent

Public-entry checkpoint: the bilingual title-and-topic prompt now uses a pinned
public workflow; anonymous retrieval and byte parity passed. The readiness-only
mode preserves previous stops. Title matching in the dedicated desktop pair has
not been dispatched pending scoped permission; do not claim the new entry has
passed merely because HTTP retrieval did. See the
[record](../09-reviews/2026-09-07-native-public-entry.md). The draft below remains
unsent, with no scheduled posting.

> Thank you, Andrei. We followed the three concrete priorities in your report.
>
> [v0.1.0-alpha.3](https://github.com/fyaic/threadmesh/releases/tag/v0.1.0-alpha.3)
> now defaults to a self-contained Codex → Codex example using the existing login
> and model. `threadmesh try --live` prepares the sample and runs both sessions;
> no custom harness, application fixture, Pi installation or second subscription
> is required. The [install/run guide](https://github.com/fyaic/threadmesh/blob/main/docs/06-guides/first-workspace.md)
> shows installation progress and explains quota, runtime and timeout failures.
> We do not bypass exhausted quota or silently switch products.
>
> The installed-package default run completed in 272.604 seconds within its
> 300-second cap. The original receiver made its own checked edit, preserving
> the earlier button decision and paid price. We retained the failed attempts
> as well as the [passing evidence](https://github.com/fyaic/threadmesh/blob/main/docs/09-reviews/2026-09-07-codex-first-use-release.md).
>
> Separately, a controlled desktop pair with completed prior context produced
> native advice and the original receiver's own edit; the [actual exchange and diff](https://github.com/fyaic/threadmesh/blob/main/docs/evidence/codex-native-2026-09-07/README.md)
> are public. Codex supplies that route's native transport. Its synthetic busy
> and stop checks are not proof of race-free delivery or general desktop onboarding.
>
> These are maintainer results, not an independent live pass or a reliability
> rate. We are keeping this issue open for the remaining onboarding gaps. No need
> to retry with exhausted quota or share private transcripts. Your report changed
> the first-use path and what we require before calling a handoff useful.

Before posting, add only the actual outcome of the next entry-path increment,
recheck release links and claims, and remove anything superseded by a new comment.
Do not copy an unverified planned result into this draft.

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
