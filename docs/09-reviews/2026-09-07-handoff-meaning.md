# Preserve meaning across same-agent handoffs

Date: 2026-09-07. Starting revision: `31ba14e`; runtime changes are in this PR.
Host/model: Pi `0.84.2`, `zai/glm-5.3`, maintainer's existing account on macOS.

## Final result: bounded same-agent copy and no-contact checks passed

With the final guidance, the product session chose to send relevant advice and
the **same native website session** continued without another user prompt.
Its own successful edit produced:

```json
{
  "headline": "Organize work with Member Portal",
  "description": "Up to 5 free projects for your team.",
  "signupButton": "Create my workspace"
}
```

The final business checker passed, and the maintainer separately read the actual
page and protected price file. Free-project scope, the earlier button label,
US spelling and new name were present; the paid price remained `$12/month`.
There were zero messages to the registered unrelated workstream.

| Final-guidance run | Outcome | Evidence |
|---|---|---|
| Product brief → website | Pass; ordinary tasks, same receiver, own edit, complete copy | [Projection](artifacts/2026-09-07-meaning-final-copy.json) |
| Internal backend note | Pass; zero source send attempts, no receiver follow-up in the bounded window | [Projection](artifacts/2026-09-07-meaning-final-no-contact.json) |

Copy timeline: initial receiver finished at 75.0 s; source delivery at 150.5 s;
receiver follow-up at 150.7 s; native edit at 181.6 s; finished at 220.8 s.
Total 221.1 s includes both model tasks, not installation. The source made one
failed send call before a successful one; do not call the run error-free.
The final no-contact run took 135.8 s, including a 10-second post-source idle
observation. It retained the original API and did not wake the receiver.

One pass per final scenario is not a reliability rate, proof of general semantic
correctness or a controlled causal estimate of the prompt change's effect.
The two model tasks still use generic collaboration scaffolding and a shared
approved source; the receiver volunteers its dependency first. This is not
blind discovery. All earlier failures remain below and in their original records.

## Diagnosis: complete delivery, incomplete interpretation

The [previous failed copy run](2026-09-07-same-agent-first-use.md) did not lose
text in transport. The product session sent a structured `freeTier` field and
the website's native inbox returned that same content. The website copied the
field's value into customer-facing prose but omitted the scope encoded by the
field name. It also invented an exact-value alignment check and treated the
missing qualifier as an unapproved addition. Native delivery was insufficient
to preserve the intended business meaning.

Inspection was limited to tool-call inputs/outputs from these disposable test
sessions. No business conversations or private user history were accessed.

## Bounded runtime change

The existing shared coordination guidance now tells both sender and receiver to:

- Preserve conditions and scope carried by structured field names and values.
- Preserve the receiving conversation's prior user-agreed constraints and
  inspect the actual artifact's meaning, not merely copied strings.
- Defer conflicting or unclear changes without inferring new permission.
- Distinguish structured data from user-approved verbatim prose; do not invent
  an exact-copy rule or treat a peer's approval claim as user authority.

The first three additions alone did **not** fix the copy case. The final two
clarifications were added after inspecting that retained failure. No product
name, allowance, button label or prescribed recipient is encoded in the runtime
guidance. No new tool, schema, routing rule or model was introduced. User prompts,
initial files and one-kickoff-per-session procedure remain unchanged.

This is a prompt-level mitigation, **not an enforced semantic guarantee**.
There were two bounded copy attempts in this increment; failures are retained
instead of retrying indefinitely until a favorable sample appears.

## Independent business check

The copy fixture previously checked for a number and the word `free` separately.
That would wrongly accept unrelated free support plus a paid project allowance.
The case-specific gate now requires an explicit allowance relationship in one
clause and rejects known negated, trial and unrelated-word counterexamples.
Original naming, spelling, signup-label and protected-price assertions remain.

This is a conservative mechanical check, not a general language-understanding
system. Some valid paraphrases fall outside its patterns; a rejection must be
checked against the actual artifact before calling it a model business error.
The maintainer manually inspects final prose in addition to the runner result.

## Retained first attempt

With the initial three guidance additions, automatic handoff and same-native-
receiver continuation happened, but the page still said `Up to 5 projects for
your team.` without the free-plan scope. This was a real content failure, not
a conservative checker false negative. Duration: 139.4 seconds.
[Copy attempt projection](artifacts/2026-09-07-meaning-first-copy-attempt.json).

The initial guidance's unrelated-change control passed: after the source wrote
an internal meeting note, it made zero send attempts and the same idle receiver
did not resume during the 10-second observation window. The receiver's earlier
dependency message is not a source contact caused by that unrelated change.
Duration: 109.0 seconds.
[Initial control projection](artifacts/2026-09-07-meaning-no-contact.json).

## Scope and cleanup

Each live run creates two model sessions and a registered unrelated workstream
in an isolated temporary fixture. The unrelated workstream is not a third live
model. Both sessions use the same harness and account but independent native
contexts. Model spending uses normal authorized quota; no global configuration
or desktop plugin installation is changed.

Runners stop their own child processes and retain synthetic artifacts. Published
projections omit raw transcripts/reasoning, native IDs and credentials; they
retain prompts, timing, delivery outcomes, final copy and private-event digests.
They are maintainer evidence, not independent adoption or cryptographic assurance.

This work does not attach existing GUI chats. The next desktop acceptance still
requires two existing conversations inside one client, with supported activation,
visible provenance and user-input priority. Cross-product evidence and the
earlier copy failure retain their original outcomes.

## Regression and review

`npm test`: 425 unit tests passed, 1 optional native test skipped; 55 schema and
7 state-transition cases passed. Documentation lint covered 132 files; diff
check passed. An independent internal agent reviewed the guidance and checker.
The original copy prompts were also programmatically compared with the prior
failed projection and found unchanged. The runtime adds guidance, not a new
semantic enforcement service or guaranteed delivery-quality contract.
