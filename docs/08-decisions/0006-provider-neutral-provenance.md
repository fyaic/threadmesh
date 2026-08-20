# ADR 0006: Keep the core envelope provider-neutral

- Status: Accepted
- Date: 2026-08-20
- Issue: [#3](https://github.com/fyaic/threadmesh/issues/3)

## Context

Harnesses and model providers expose incompatible message roles, item types,
turn APIs, hooks, and injection surfaces. A provider-specific representation
can be rejected by another Responses-compatible endpoint. Rendering peer text
as user-authored content also erases provenance and can raise its instruction
authority.

Ordinary text is additionally unsafe as a substitute for structured approval,
permission, elicitation, or user-input responses.

## Decision

The ThreadMesh core envelope contains provider-neutral coordination semantics.
Conversion to a harness-native role or item occurs only inside the receiving
adapter after authorization and context admission.

Adapters MUST preserve at least:

- source task and incarnation;
- source actor type;
- relationship and message identity;
- coordination intent;
- the fact that content is peer-authored rather than user-authored;
- referenced evidence without implying it was verified.

Plain ThreadMesh messages cannot resolve structured gates. A future typed gate
response requires its own capability, exact target request ID, declared answer
schema, freshness check, and audit event. The initial protocol advertises this
capability as unsupported.

## Consequences

- Core schemas remain independent of OpenAI, Anthropic, or other message item
  formats.
- Each adapter needs a documented provenance rendering strategy.
- Some harnesses will support only side-channel or checkpoint delivery.
- Structured approvals remain in the target harness's normal authority path.
- Compatibility tests must inspect actual model-visible rendering where
  possible.

## Rejected alternatives

### Standardize one chat role

Role semantics differ across providers and can change instruction precedence.

### Treat peer content as user input

This impersonates the user and may bypass safeguards that distinguish user,
developer, tool, and external content.

### Parse approval-like prose

Natural language is ambiguous, replayable, and cannot safely bind an exact
pending structured request.
