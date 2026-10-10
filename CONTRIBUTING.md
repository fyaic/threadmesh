# Contributing to ThreadMesh

ThreadMesh explores useful cooperation between selected agent tasks. The current
focus is a small, opt-in Codex workflow: make setup understandable, preserve each
task's existing constraints, and distinguish a sent message from useful work.
The repository also contains an experimental CLI, runtime, and protocol drafts.

Useful contributions include clearer instructions, reproducible first-run
failures, and focused fixes. Start from an observed problem and explain the
expected outcome before adding another adapter, service, or protocol feature.
See the [current status](docs/10-planning/project-status.md) for what has been
verified and what remains experimental.

## Before opening a pull request

1. Read the relevant guide and check the [current priorities](ROADMAP.md).
2. Search existing issues for the same problem. Include reproduction steps,
   your installation path, and the result you expected when reporting a bug.
3. Keep one pull request focused on one coherent outcome.
4. For protocol or safety changes, also read the [scope](docs/00-overview/scope.md),
   [design principles](docs/00-overview/principles.md), and relevant Architecture
   Decision Records. Open a design issue before a protocol-breaking change or
   a new coordination intent.

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

## Local checks

For repository development, use Node.js 22 or newer:

```sh
npm ci
npm test
```

`npm test` validates the schemas, runs automated tests, and lints documentation.
It does not require a model account or a paid live run. For documentation-only
edits, `npm run lint:docs` is a useful focused check; also verify changed links.
Node.js is a repository development requirement, not a prerequisite for users
of the native Codex skill.

Live-model runs are separate, optional checks that require an authenticated
harness and may consume quota. Do not run them just to submit an editorial fix.
If a change needs live validation that you cannot perform, state that limitation
in the PR. Never include credentials or private conversations in reports.

## Documentation style

- Use plain, precise language.
- Use **MUST**, **SHOULD**, and **MAY** only for normative protocol requirements.
- Distinguish current behavior from proposals.
- Do not claim compatibility with a harness without a testable adapter or primary-source reference.
- Do not close a normative issue with trusted-process prototype evidence alone.
- Prefer small examples that expose failure behavior, not only the happy path.

## Commits and pull requests

- Use imperative, descriptive commit subjects.
- Explain why the change is needed in the pull request body.
- Link the issue or ADR when applicable.
- Update `CHANGELOG.md` for user-visible changes. Distinguish source changes,
  Codex plugin versions, and CLI releases; they do not ship together automatically.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
