# Other harnesses

ThreadMesh should support different integration depths.

## Native adapter

The harness exposes stable task/run APIs, event streams, cancellation, and context roles. This provides the strongest semantics.

## Tool adapter

ThreadMesh operations are exposed to the agent as tools, often through MCP. A sidecar tracks task identity and mailbox state. The harness may need prompt instructions to check the mailbox at checkpoints.

## Subprocess adapter

The adapter supervises a CLI process and translates its stream or session files. Capabilities are limited to what can be observed and controlled reliably.

## Cooperative loop adapter

A custom agent loop calls ThreadMesh directly before model requests and after tool calls. This is the simplest reference implementation and should be used for conformance tests.

## Evaluation requirement

A harness name should not be listed as supported until an adapter publishes:

- supported version range;
- capability document;
- conformance test results;
- known semantic gaps;
- security and permission notes.
