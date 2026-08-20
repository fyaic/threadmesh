# Contributing to ThreadMesh

ThreadMesh is currently documentation-first. Contributions that clarify semantics, identify unsafe edge cases, or demonstrate adapter constraints are especially valuable.

## Before opening a pull request

1. Read the [vision](docs/00-overview/vision.md), [scope](docs/00-overview/scope.md), and [design principles](docs/00-overview/principles.md).
2. Search existing issues and Architecture Decision Records.
3. Open a design issue before proposing a protocol-breaking change or a new coordination intent.
4. Keep one pull request focused on one coherent outcome.

## Change categories

- **Editorial:** clarity, grammar, navigation, examples; no semantic change.
- **Specification:** protocol fields, operations, lifecycle, or required behavior.
- **Safety:** permissions, consent, privacy, threat mitigations, or defaults.
- **Adapter:** harness-specific mapping or conformance behavior.
- **Implementation:** reference runtime, SDK, CLI, inspector, or tests.

Specification and safety changes should include:

- the use case and failure mode;
- compatibility impact;
- security and context-sovereignty impact;
- at least one positive and one negative example;
- an ADR when the decision is durable or difficult to reverse.

## Documentation style

- Use plain, precise language.
- Use **MUST**, **SHOULD**, and **MAY** only for normative protocol requirements.
- Distinguish current behavior from proposals.
- Do not claim compatibility with a harness without a testable adapter or primary-source reference.
- Prefer small examples that expose failure behavior, not only the happy path.

## Commits and pull requests

- Use imperative, descriptive commit subjects.
- Explain why the change is needed in the pull request body.
- Link the issue or ADR when applicable.
- Update `CHANGELOG.md` for user-visible changes after versioning begins.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
