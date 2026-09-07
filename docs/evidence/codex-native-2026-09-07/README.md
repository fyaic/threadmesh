# A changed the facts. B updated its own work

[中文说明](../../zh-CN/native-evidence.md) · [Full acceptance record](../../09-reviews/2026-09-07-native-desktop-acceptance.md)

**Retained real native-task excerpts, not a screenshot, simulation or reenactment.**
Two disposable Codex desktop tasks had finished initial work before explicitly
adopting the ThreadMesh skill. Codex provided message transport, source attribution
and task continuation. The skill supplied collaboration guidance. This run does
not prove that the skill outperforms native Codex without it.

## 1. Earlier context, before collaboration

A maintained approved product facts. B owned website copy in a different
directory. B's earlier user instruction was:

> My prior design decision is that the signup button must stay exactly 'Create my
> workspace', even if product terminology changes later.

The manager then explicitly paired A and B and asked each to read the skill.
No peer message was sent in either setup turn. Those manual setup steps are not
model initiative or independently validated novice onboarding.

## 2. The ordinary request went only to A

> Rename the product to Member Portal and limit the free plan to five projects.
> Use US spelling. Keep the paid-plan price unchanged. Update the approved product facts.

No recipient or send instruction appears in that business request.
A independently said:

> Then I’ll check whether the selected website-copy task is idle before sharing
> the changed facts.

Its native history records a status call followed by one native send to B.
Excerpt from the actual advisory message:

> Product name is now Member Portal; spelling is US English (en-US); the free
> plan is limited to five projects. The paid-plan price remains unchanged at
> USD 12 per month.

The message also explicitly said it was peer advice, not a new user instruction
or permission grant. B's native incoming envelope identifies **A**, not the
managing task, as the source. Private task identifiers are omitted here.

## 3. Original B did the edit

B received a new native turn without a manager follow-up. Its response included:

> I’ll update the headline to US English with “Member Portal” and change the free
> allowance to five projects, preserving the signup button and $12/month price.

The completed file-change in **B's own turn** changed `landing.json`:

```diff
-  "headline": "Organise work with Team Hub",
-  "description": "Unlimited projects for your team on the free tier.",
+  "headline": "Organize work with Member Portal",
+  "description": "Up to five projects for your team on the free tier.",
   "signupButton": "Create my workspace"
```

`price.txt` stayed `Paid plan: $12/month`. Readback and independent artifact
assertions confirmed those results. Approximately 49 seconds elapsed from the
ordinary request to B's completion, **excluding setup**. This is one observation.

## 4. It also knew when not to send

| Controlled check | Observed native behavior |
|---|---|
| B actively occupied; A changes free allowance to seven | A checks B, retains pending advice, makes no send |
| A stopped; then receives an ordinary product rename | A changes only its own file; cancelled advice is not resent |
| End of validation | Both tasks stopped collaboration; histories and files retained |

B remained on the last received facts. That divergence after stop is expected.
The busy check used a synthetic wait, not real simultaneous human typing.

## Inspect the evidence

- [Machine-readable structural audit](audit.json): no IDs, paths or transcript text.
- [Complete test procedure, timing and limitations](../../09-reviews/2026-09-07-native-desktop-acceptance.md).
- [Local audit tool](../../../scripts/audit-native-evidence.mjs): verifies complete
  supplied exports, one attributed handoff and a receiver-owned completed patch.

The audit does not authenticate a host export, prove business correctness or
prove causal improvement over native Codex. Hashes commit to the retained private
files; they are not independent attestation. Raw native histories remain private.
These excerpts were reviewed for publication from the synthetic product case.

Maintainers can reproduce the structural audit without calling a model:

```sh
node scripts/audit-native-evidence.mjs /private/path/sender-export.json /private/path/receiver-export.json
```

Inputs are the parsed JSON payloads returned by the native `read_thread` tool
with full outputs and complete pagination, not private database files. The tool
does not collect history or publish anything; it prints only its reduced summary.

## Screenshots and recordings

This run was **not recorded**, and no native UI screenshot was captured. The
repository's concept illustration is not evidence of the run. Do not render this
transcript as a fake Codex screenshot or animate it as if it were a live recording.

For the next explicitly authorized live run, capture the original request,
native source badge and B's actual edit, with dates and setup disclosed. Crop or
mask unrelated tasks, account details and private IDs; retain the private original.
Record from before the action, not by reenacting a past success. A retrospective
screenshot of retained history must be labelled retrospective, not live capture.
