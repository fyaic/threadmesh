# Open questions

## M0 blockers

### What is the minimum portable task summary?

It must support useful relevance judgments without leaking prompts, filenames, customers, or private objectives.

### How is accepted peer advice represented to the model?

Harnesses expose different message roles. The protocol needs a provenance-preserving representation that does not impersonate the user or weaken instruction hierarchy.

### Which freshness token is mandatory?

Run ID is easy to understand but insufficient when an objective mutates within one run. Objective hashes can leak information or change for editorial reasons.

### What does `applied` mean?

A harness can prove that content entered model context, but not that the model followed it. The disposition vocabulary must avoid overstating causal influence.

## Research questions

- Can task relevance be discovered from graph and artifact metadata without embeddings over private histories?
- How should an agent estimate interruption cost?
- What benchmark separates helpful initiative from excessive coordination?
- How do we detect message storms and multi-agent confirmation loops?
- Can causal tracing estimate whether a suggestion improved the outcome?
- When should an accepted suggestion persist through context compaction?
- How should authority transfer work when a child becomes user-owned?
- Can cross-harness adapters preserve provenance under incompatible role systems?
- Which subset maps cleanly to A2A extensions?

## Evaluation dimensions

- Task success and correctness.
- Time and token cost.
- Number and severity of interruptions.
- Suggestion acceptance and rejection quality.
- Stale-message prevention.
- Context contamination.
- Duplicate or conflicting work.
- User override preservation.
- Audit completeness.
