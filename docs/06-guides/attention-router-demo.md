# Deterministic attention-router loop

This is the shortest current demonstration of the M5 product direction. It
runs an implementation → review → fix → review → dependent-task loop through
the real local coordinator without calling a model.

## Run it

Requirements: Node.js 22 or newer, npm, and a platform supported by
`better-sqlite3` (a prebuilt binary or local native build toolchain).

Run the public GitHub package directly:

```sh
npx --yes --package=github:fyaic/threadmesh threadmesh demo
```

Or run a checked-out source tree:

```sh
git clone https://github.com/fyaic/threadmesh.git
cd threadmesh
npm ci
npm run demo
```

Use the machine-readable form for automation:

```sh
npm run demo -- --json
```

The command creates four task incarnations, directional relationship grants,
an isolated SQLite coordinator, and a versioned product dependency edge. It
then publishes these product events through existing `suggest` envelopes:

```text
implementation --artifact-ready--> review
review ---------review-failed-----> fix
fix ------------artifact-ready----> review
review ---------dependency-satisfied--> dependent
```

Every event is offered at a receiver checkpoint. Receipt and receiver
acceptance are visible but do not unlock the final dependency. Unlock occurs
only after an Ed25519-signed external-verification attestation passes the
coordinator-configured trust anchor and the current dependency edge still
matches. The final state is closed, reopened, and read from SQLite before the
inspector is rendered.

## What to inspect

A passing terminal result includes:

- the four sessions and their workstream status;
- the prerequisite → dependent edge;
- the latest lifecycle event and its source provenance;
- the routing reason and receiver disposition;
- external-verification and dependency-effect state;
- zero manual relay actions, model polling turns, and incorrect unlocks;
- four bounded durable-cursor reconciliations, including the dropped-wake path;
- successful deletion of the temporary database and runtime directory.

The JSON form is deterministic and excludes temporary paths, private keys, raw
event content, and credentials. The inspector rejects absolute paths,
content-shaped fields, unsupported states, and contradictory unlock claims.

## What this proves—and what it does not

This run proves the local event, authorization, mailbox, disposition,
verification, dependency-effect, inspector, and cleanup logic as one closed
path. It also proves that the six lifecycle events fit the existing envelope;
no new wire-protocol intention is needed.

The participants are scripted, so this is not evidence of model initiative.
The trusted verifier is also a local simulation: setup creates its key before
the coordinator starts, the coordinator receives only the public trust anchor,
and the verifier retains the private key. This proves the trust boundary and
signature checks, not organizational independence.
The installed package now includes the local runtime and native SQLite
dependency; consumers that need only the SDK should import the root SDK surface
and avoid runtime subpaths. The real Codex implementation/review/fix case
remains the next M5 gate.

For model-selected behavior already validated on narrower advisory cases, see
the [real agent case portfolio](real-world-cases.md). For the active product
sequence, see the [M5 sprint plan](../10-planning/m5-sprint-1.md).
