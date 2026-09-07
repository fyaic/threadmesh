# Same-agent first use: real initiative, incomplete copy

Date: 2026-09-07. Runtime baseline: `d6d9eeb`. Pi `0.84.2`, both sessions using
`zai/glm-5.3` through the maintainer's existing account. One run; normal quota.

## Result: automatic handoff observed; business acceptance failed

Two independent **Pi sessions** handled the approved product brief and website
copy. The website first completed its own task and retained the exact signup
label `Create my workspace`. The product session then changed the name to
Member Portal, limited the free tier to five projects, and chose to notify the
website. The same native website session resumed without a second user prompt
and used its own write tool to update the page.

The final page kept the signup label and new name, but said only
`Up to 5 projects for your team.` It omitted that the limit applies to the
**free plan**, so the unchanged business assertion rejected it. Do not present
this as a fully successful copy task. The earlier Codex → Pi copy failure is
not fixed; the same gap now has fresh same-product evidence.

| Elapsed from start | Native observation |
|---|---|
| 214.1 s | Website chooses to send its dependency message |
| 238.8 s | Website's first task completes |
| 279.3 s | Product session successfully queues relevant advice |
| 280.8 s | Original website session starts its follow-up |
| 326.2 s | Website's native write updates its artifact |
| 373.5 s | Follow-up completes; business assertion then fails |

Delivery-to-follow-up latency was about 1.4 seconds in this run. Total time was
about 6 minutes 14 seconds, including a long initial receiver task. This is not
setup time, a universal speed promise, or a manual-versus-automatic benchmark.

## What this proves, and what it does not

- Same product, same model, separate conversations; one ordinary kickoff each.
- Generic collaboration guidance was enabled. Neither task prescribed a peer
  recipient or a send command. The website volunteered its dependency first:
  reciprocal model-selected cooperation, not blind discovery of private chats.
- Native receiver ID before/after matched; a second post-delivery native turn
  and successful receiver write were observed, not inferred from an acknowledgement.
- The two models worked in separate project directories sharing an explicit
  ThreadMesh room and approved brief. They did not share all chat history.
- A registered unrelated workstream was present, but the final no-contact
  assertions were not reached after the copy failure. Do not credit a fresh
  no-contact pass or a third live model session from this run.
- This used CLI-created sessions with an earlier task in the same process,
  **not existing desktop conversations**, a long-context migration, independent
  first-user onboarding, or a queued-user-input race test.

## Reproduce and inspect

From an installed repository checkout, with Pi authenticated for that model:

```sh
node scripts/validate-workspace-live.mjs pi preferences
```

The script creates an isolated temporary project and spends normal model quota.
It prints `report.json` and artifact locations and exits nonzero on a failed
business assertion. Do not weaken the free-plan check to obtain a green result.
The [sanitized projection](artifacts/2026-09-07-same-agent-preferences.json)
contains exact prompts, model identities, timeline, delivery outcomes and final
copy. Raw events and native IDs remain private; the projection includes a digest,
not an independent verification certificate. Test child processes were stopped
by the runner; synthetic files and native test session artifacts were retained.

## Shipped follow-up

English/Chinese READMEs and first-use guides now lead with the retained successful
Pi-pair API case. A second product is optional, not a prerequisite. The CLI's
room-created message also says two sessions may use the same agent. A regression
checks three same-harness members retain distinct identities, mail, checkpoints
and mute state. No runtime routing architecture was replaced.

Validation: `npm test` passed 55 schema cases, 7 transition cases and 423 unit
tests with 1 optional native test skipped; 131 Markdown files linted cleanly.
Independent internal review caught and corrected reuse of a Pi-bound workstream
name in the optional Codex instructions. Final review and diff check passed.
These regression results do not override the failed live business assertion.

The desktop plan now requires two existing conversations in **one client**.
Next acceptance must preserve both prior user decisions and the complete meaning
of new advice. Same-product positioning does not close either the desktop
activation gap or this content-quality gap.
