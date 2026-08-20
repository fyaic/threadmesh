# Open questions

## Resolved M0 blockers

### What is the minimum portable task summary?

Resolved by [ADR 0007](../08-decisions/0007-minimal-task-summary.md): a typed,
relationship-scoped document with no raw prompt, history, filesystem paths, or
arbitrary extension fields.

### How is accepted peer advice represented to the model?

Resolved by [ADR 0006](../08-decisions/0006-provider-neutral-provenance.md):
the core remains provider-neutral and the receiving adapter renders preserved
peer provenance only after context admission.

### Which freshness token is mandatory?

Resolved by [ADR 0005](../08-decisions/0005-task-incarnation-and-freshness.md):
all task references bind an incarnation; state-changing requests require a run
ID or monotonic objective version, and prompt hashes are not used.

### What does `applied` mean?

Resolved by [ADR 0004](../08-decisions/0004-separate-coordination-transitions.md):
delivery, receiver decision, and observed outcome are separate state machines;
the protocol has no bare `applied` state.

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
