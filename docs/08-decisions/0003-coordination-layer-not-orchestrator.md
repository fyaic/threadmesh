# ADR 0003: Coordination layer, not orchestrator

- Status: Accepted
- Date: 2026-08-20

## Context

Agent frameworks already provide loops, planning, tools, workflow graphs, memory, and model routing. Rebuilding those features would create another vertically integrated framework and reduce adoption across harnesses.

## Decision

ThreadMesh standardizes task relationships, proactive coordination intents, delivery semantics, permissions, freshness, provenance, and adapter behavior. It does not own the agent loop or workflow scheduler.

## Consequences

- Existing harnesses remain replaceable.
- ThreadMesh can use MCP and A2A rather than competing with them.
- The reference coordinator remains small.
- Some deployments will need a separate workflow engine or message transport.
- Core feature proposals must pass the differentiation test in the prior-art document.
