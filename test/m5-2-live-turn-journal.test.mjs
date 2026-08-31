import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  projectM52LiveTurnJournal,
  readM52LiveTurnJournal,
  writeM52LiveTurnJournal,
} from "../src/validation/m5-2-live-turn-journal.mjs";
import {
  createCodexPersistedTurnObservation,
  freezeCodexNativeTurnBaseline,
} from "../src/state/codex-turn-reconciliation.mjs";

const snapshotDigest = `sha256:${"a".repeat(64)}`;

function resource(kind, exactId, method, parameters) {
  return {
    kind,
    exactId,
    identifierDigest: sha256Digest(exactId),
    cleanupContext: {
      method,
      parameters,
      parametersDigest: sha256Digest(parameters),
    },
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-live-turn-"));
  const filename = path.join(directory, "turn-journal.json");
  const adapterIdempotencyKey = "adapter_m52_live_a_implementation";
  const observation = createCodexPersistedTurnObservation({
    threadId: "thread-live-a",
    snapshotDigest,
    threadStatus: "idle",
    readTurns: [{
      id: "turn-bootstrap-a",
      status: "completed",
      items: [{ type: "userMessage", clientId: "bootstrap-a" }],
    }],
    listedTurns: [{
      id: "turn-bootstrap-a",
      status: "completed",
      items: [{ type: "userMessage", clientId: "bootstrap-a" }],
    }],
  });
  const baseline = freezeCodexNativeTurnBaseline(observation, {
    clientUserMessageId: adapterIdempotencyKey,
  });
  const input = {
    filename,
    scenarioId: "scenario-m52-live-canary",
    executionId: "execution-a-implementation",
    role: "a",
    phase: "implementation",
    adapterRef: {
      kind: "codex-app-server",
      threadId: "thread-live-a",
      snapshotDigest,
    },
    adapterIdempotencyKey,
    baseline,
    resourceManifest: {
      resources: [
        resource("codex-thread", "thread-live-a", "codex-thread-delete", {
          command: "/fake/codex", args: ["app-server", "--listen", "stdio://"],
          cwd: "/private/fixture", env: {},
        }),
      ],
    },
  };
  return {
    directory,
    filename,
    input,
    cleanup() {
      fs.chmodSync(directory, 0o700);
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("persists the exact pre-turn baseline before returning and exposes digest-only projection", () => {
  const current = fixture();
  try {
    const written = writeM52LiveTurnJournal(current.input);
    const loaded = readM52LiveTurnJournal({
      filename: current.filename,
      expectedScenarioId: current.input.scenarioId,
      expectedExecutionId: current.input.executionId,
    });
    assert.equal(fs.statSync(current.filename).mode & 0o777, 0o600);
    assert.equal(loaded.baseline.baselineDigest, current.input.baseline.baselineDigest);
    assert.deepEqual(projectM52LiveTurnJournal(loaded), {
      recordDigest: written.recordDigest,
      baselineDigest: current.input.baseline.baselineDigest,
      observationDigest: current.input.baseline.observationDigest,
      baselineTurnCount: 1,
      resourceCount: 1,
    });
    assert.equal(JSON.stringify(projectM52LiveTurnJournal(loaded)).includes("thread-live-a"), false);
    assert.equal(JSON.stringify(projectM52LiveTurnJournal(loaded)).includes("bootstrap-a"), false);
    assert.deepEqual(
      fs.readdirSync(current.directory).filter((entry) => entry.endsWith(".tmp")),
      [],
    );
    assert.equal(writeM52LiveTurnJournal(current.input).replay, true);
  } finally {
    current.cleanup();
  }
});

test("rejects conflict, tamper, truncation, unsafe links, and permission changes", () => {
  for (const variant of ["conflict", "tamper", "truncated", "symlink", "file-mode", "parent-mode"]) {
    const current = fixture();
    let linked;
    try {
      writeM52LiveTurnJournal(current.input);
      if (variant === "conflict") {
        assert.throws(
          () => writeM52LiveTurnJournal({ ...current.input, phase: "fix" }),
          { code: "threadmesh_m52_live_turn_journal_conflict" },
        );
        continue;
      }
      if (variant === "tamper") {
        const record = JSON.parse(fs.readFileSync(current.filename, "utf8"));
        record.phase = "fix";
        fs.writeFileSync(current.filename, JSON.stringify(record));
      } else if (variant === "truncated") {
        fs.writeFileSync(current.filename, "{");
      } else if (variant === "symlink") {
        linked = path.join(current.directory, "linked.json");
        fs.symlinkSync(current.filename, linked);
      } else if (variant === "file-mode") {
        fs.chmodSync(current.filename, 0o644);
      } else {
        fs.chmodSync(current.directory, 0o755);
      }
      assert.throws(
        () => readM52LiveTurnJournal({
          filename: linked ?? current.filename,
          expectedScenarioId: current.input.scenarioId,
          expectedExecutionId: current.input.executionId,
        }),
        { code: variant === "tamper"
          ? "threadmesh_m52_live_turn_journal_integrity_mismatch"
          : variant === "truncated"
            ? "threadmesh_m52_live_turn_journal_shape_invalid"
            : variant === "parent-mode"
              ? "threadmesh_m52_live_turn_journal_parent_invalid"
              : "threadmesh_m52_live_turn_journal_shape_invalid" },
      );
    } finally {
      current.cleanup();
    }
  }
});

test("requires exact scenario/execution binding and a private parent", () => {
  const current = fixture();
  try {
    writeM52LiveTurnJournal(current.input);
    for (const [override, code] of [
      [{ expectedScenarioId: "other" }, "threadmesh_m52_live_turn_journal_scenario_mismatch"],
      [{ expectedExecutionId: "other" }, "threadmesh_m52_live_turn_journal_execution_mismatch"],
    ]) {
      assert.throws(
        () => readM52LiveTurnJournal({
          filename: current.filename,
          expectedScenarioId: current.input.scenarioId,
          expectedExecutionId: current.input.executionId,
          ...override,
        }),
        { code },
      );
    }
    const unsafe = path.join(current.directory, "unsafe");
    fs.mkdirSync(unsafe, { mode: 0o755 });
    assert.throws(
      () => writeM52LiveTurnJournal({
        ...current.input,
        filename: path.join(unsafe, "journal.json"),
      }),
      { code: "threadmesh_m52_live_turn_journal_parent_invalid" },
    );
    const unsupported = resource("filesystem", "/private/fixture", "filesystem-remove", {
      command: "/bin/rm", args: [], cwd: "/private", env: {},
    });
    assert.throws(
      () => writeM52LiveTurnJournal({
        ...current.input,
        filename: path.join(current.directory, "unsupported.json"),
        executionId: "execution-unsupported",
        resourceManifest: { resources: [unsupported] },
      }),
      { code: "threadmesh_m52_live_turn_journal_shape_invalid" },
    );
    for (const resources of [
      [],
      [current.input.resourceManifest.resources[0], current.input.resourceManifest.resources[0]],
      [resource("codex-thread", "thread-other", "codex-thread-delete", {
        command: "/fake/codex", args: [], cwd: "/private/fixture", env: {},
      })],
    ]) {
      assert.throws(
        () => writeM52LiveTurnJournal({
          ...current.input,
          filename: path.join(current.directory, `bad-binding-${resources.length}-${resources[0]?.exactId ?? "empty"}.json`),
          executionId: `execution-bad-binding-${resources.length}`,
          resourceManifest: { resources },
        }),
        { code: "threadmesh_m52_live_turn_journal_integrity_mismatch" },
      );
    }
  } finally {
    current.cleanup();
  }
});
