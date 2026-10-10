# Native plugin candidate review

Date: 2026-10-10. Scope: distribution and native-workflow instructions.
This is not a live collaboration or independent-user acceptance report.

## Delivered increment

- Repository marketplace entry for `threadmesh-codex@threadmesh`.
- Skill plugin version `0.1.0-alpha.2`; the CLI package remains alpha.3.
- Short activation with explicit peer/topic/send scope; existing authorization
  is reused. The plugin's default action only checks readiness.
- Directional reply authorization, stopped-receiver handling, and an API/client
  workflow that preserves the receiver's existing constraints.
- [Matched value acceptance](../10-planning/native-value-acceptance-2026-10-10.md)
  with an unrestricted native baseline and all live result fields unfilled.

## Validation

The maintainer and installation agent each ran Codex 0.154.0's actual plugin
listing with per-command local marketplace overrides. It discovered exactly
`threadmesh-codex@threadmesh`, version `0.1.0-alpha.2`, with `installed: false`
and `enabled: false`. No persistent registration, installation or chat action
was performed. Listing without those overrides did not discover an unregistered
checkout; the guide was corrected accordingly.

`npm test` passed: 14 schemas, 55 schema cases, 7 transitions; 460 passing tests
and one optional skipped test; documentation lint passed. The plugin skill and
UI YAML were parsed and linted separately because the normal docs glob excludes
plugin files. These checks establish package readability and existing code
regression status, not model compliance with the new skill.

An independent internal reviewer walked through missing reply authorization,
new advice after stop, review-only reception, unavailable skill in an old chat,
unpublished installation instructions and the fairness of the native baseline.
A single-direction setup also remains valid: A may send while B uses review-only
for outgoing advice, completes its own authorized work and reports locally.

The reviewer found that the manual guide still fetched the September workflow,
so its stop/reply behavior would lag behind the new plugin. At that review, both guide URLs and
the Git marketplace command were pinned to candidate `a8a02a0101143d6033de855597e0d7ce291bc5e1`.
The candidate branch was pushed; GitHub returned byte-identical skill,
marketplace and plugin manifests at that revision. The guide-pin fix is a
separate commit so its source reference is real and immutable. This closes the
stale-workflow finding; it is not a live behavioral pass.

## Remaining product gates

[Official plugin documentation](https://learn.chatgpt.com/docs/plugins) describes
skill availability in new chats or CLI sessions after installation. It does not
establish existing-chat hot-loading. The candidate's documented distribution
requires the Codex CLI; an ordinary-user GUI install has not been demonstrated.

Installation itself, existing-task pickup, a real API/client comparison and an
independent user's original-receiver result remain unverified. No new messages
were sent to business tasks. No claimed improvement comes from Codex's native
transport, a repeated historical fixture or these regression tests.

## Merge-readiness follow-up

A fresh review found a further delivery mismatch: the installed candidate still
contained an older package README with a placeholder installation ref and a
relative link outside the plugin, while the current README linked to the feature
branch that could be deleted after merge.

The package README now contains standalone activation, status, stop and limit
instructions. Installation commands live only in the repository's bilingual
desktop guides. They pin the corrected package snapshot `3206c00f5b28b6e9b6a00abc13a23ea78c9dd617`.
No package documentation depends on the feature branch or files outside the
installed directory. The manual workflow remains pinned to the earlier skill
snapshot because the skill bytes did not change in this documentation repair.

The independent reviewer verified the corrected package snapshot, both guide
pins and byte-identical skill content. No remaining merge blocker was found.
This fixes a package/documentation issue. It does not establish actual
installation, old-chat skill availability or business benefit.
