import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readM52RecoveryJournal,
  writeM52RecoveryJournal,
} from "../src/validation/m5-2-recovery-journal.mjs";

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-journal-"));
  const filename = path.join(directory, "recovery-journal.json");
  const replayBinding = {
    executionId: "intent_verification",
    messageId: "msg_fix",
    eventDigest: `sha256:${"a".repeat(64)}`,
    actionDigest: `sha256:${"c".repeat(64)}`,
    resultDigest: `sha256:${"b".repeat(64)}`,
    expectedRevision: 5,
  };
  const bundle = {
    verification: {
      request: { chainId: "chain" },
      response: { signed: true, proof: "private-signed-proof" },
      expectedTrustAnchor: { keyId: "key_fixture" },
    },
    finalize: { dependencyId: "dependency", expectedRevision: 5 },
  };
  return {
    directory, filename, replayBinding, bundle,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test("atomically persists and reads an exact digest-protected recovery bundle", () => {
  const current = fixture();
  try {
    const written = writeM52RecoveryJournal({
      filename: current.filename,
      scenarioId: "scenario_m52_recovery",
      checkpoint: "final-verification",
      replayBinding: current.replayBinding,
      bundle: current.bundle,
    });
    const loaded = readM52RecoveryJournal({
      filename: current.filename,
      expectedScenarioId: "scenario_m52_recovery",
      expectedCheckpoint: "final-verification",
      expectedReplayBinding: current.replayBinding,
    });
    assert.deepEqual(loaded.bundle, current.bundle);
    assert.equal(loaded.recordDigest, written.recordDigest);
    const replay = writeM52RecoveryJournal({
      filename: current.filename,
      scenarioId: "scenario_m52_recovery",
      checkpoint: "final-verification",
      replayBinding: current.replayBinding,
      bundle: current.bundle,
    });
    assert.equal(replay.replay, true);
    assert.equal(fs.statSync(current.filename).mode & 0o777, 0o600);
    assert.deepEqual(
      fs.readdirSync(current.directory).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    current.cleanup();
  }
});

test("existing journal conflicts and unsafe parent directories are rejected", () => {
  const current = fixture();
  try {
    writeM52RecoveryJournal({
      filename: current.filename,
      scenarioId: "scenario_m52_recovery",
      checkpoint: "final-verification",
      replayBinding: current.replayBinding,
      bundle: current.bundle,
    });
    assert.throws(
      () => writeM52RecoveryJournal({
        filename: current.filename,
        scenarioId: "scenario_m52_recovery",
        checkpoint: "final-verification",
        replayBinding: current.replayBinding,
        bundle: { ...current.bundle, finalize: { expectedRevision: 6 } },
      }),
      { code: "threadmesh_m52_recovery_journal_conflict" },
    );
    assert.throws(
      () => writeM52RecoveryJournal({
        filename: path.join(current.directory, "wrong-checkpoint.json"),
        scenarioId: "scenario_m52_recovery",
        checkpoint: "satisfaction",
        replayBinding: current.replayBinding,
        bundle: current.bundle,
      }),
      { code: "threadmesh_m52_recovery_journal_checkpoint_invalid" },
    );
    const unsafe = path.join(current.directory, "unsafe");
    fs.mkdirSync(unsafe, { mode: 0o755 });
    assert.throws(
      () => writeM52RecoveryJournal({
        filename: path.join(unsafe, "journal.json"),
        scenarioId: "scenario_m52_recovery",
        checkpoint: "final-verification",
        replayBinding: current.replayBinding,
        bundle: current.bundle,
      }),
      { code: "threadmesh_m52_recovery_journal_parent_invalid" },
    );
  } finally {
    current.cleanup();
  }
});

test("journal reads reject symlinks, hard links, and oversized writes", () => {
  const current = fixture();
  try {
    const target = path.join(current.directory, "target.json");
    writeM52RecoveryJournal({
      filename: target,
      scenarioId: "scenario_m52_recovery",
      checkpoint: "final-verification",
      replayBinding: current.replayBinding,
      bundle: current.bundle,
    });
    const symlink = path.join(current.directory, "symlink.json");
    fs.symlinkSync(target, symlink);
    assert.throws(
      () => readM52RecoveryJournal({
        filename: symlink,
        expectedScenarioId: "scenario_m52_recovery",
        expectedCheckpoint: "final-verification",
        expectedReplayBinding: current.replayBinding,
      }),
      { code: "threadmesh_m52_recovery_journal_shape_invalid" },
    );
    const hardlink = path.join(current.directory, "hardlink.json");
    fs.linkSync(target, hardlink);
    assert.throws(
      () => readM52RecoveryJournal({
        filename: hardlink,
        expectedScenarioId: "scenario_m52_recovery",
        expectedCheckpoint: "final-verification",
        expectedReplayBinding: current.replayBinding,
      }),
      { code: "threadmesh_m52_recovery_journal_shape_invalid" },
    );
    assert.throws(
      () => writeM52RecoveryJournal({
        filename: current.filename,
        scenarioId: "scenario_m52_recovery",
        checkpoint: "final-verification",
        replayBinding: current.replayBinding,
        bundle: { payload: "x".repeat(1024 * 1024) },
      }),
      { code: "threadmesh_m52_recovery_journal_shape_invalid" },
    );
  } finally {
    current.cleanup();
  }
});

test("journal reads revalidate private file and parent permissions", () => {
  for (const variant of ["file-mode", "parent-mode", "parent-symlink"]) {
    const current = fixture();
    try {
      writeM52RecoveryJournal({
        filename: current.filename,
        scenarioId: "scenario_m52_recovery",
        checkpoint: "final-verification",
        replayBinding: current.replayBinding,
        bundle: current.bundle,
      });
      let filename = current.filename;
      let expectedCode = "threadmesh_m52_recovery_journal_parent_invalid";
      if (variant === "file-mode") {
        fs.chmodSync(current.filename, 0o644);
        expectedCode = "threadmesh_m52_recovery_journal_shape_invalid";
      } else if (variant === "parent-mode") {
        fs.chmodSync(current.directory, 0o755);
      } else {
        const linkedParent = `${current.directory}-link`;
        fs.symlinkSync(current.directory, linkedParent);
        filename = path.join(linkedParent, path.basename(current.filename));
        current.linkedParent = linkedParent;
      }
      assert.throws(
        () => readM52RecoveryJournal({
          filename,
          expectedScenarioId: "scenario_m52_recovery",
          expectedCheckpoint: "final-verification",
          expectedReplayBinding: current.replayBinding,
        }),
        { code: expectedCode },
      );
    } finally {
      if (current.linkedParent) fs.unlinkSync(current.linkedParent);
      fs.chmodSync(current.directory, 0o700);
      current.cleanup();
    }
  }
});

test("tamper and partial writes fail closed", () => {
  for (const variant of ["tamper", "partial", "truncated"]) {
    const current = fixture();
    try {
      writeM52RecoveryJournal({
        filename: current.filename,
        scenarioId: "scenario_m52_recovery",
        checkpoint: "final-verification",
        replayBinding: current.replayBinding,
        bundle: current.bundle,
      });
      if (variant === "tamper") {
        const parsed = JSON.parse(fs.readFileSync(current.filename, "utf8"));
        parsed.bundle.finalize.expectedRevision = 6;
        fs.writeFileSync(current.filename, JSON.stringify(parsed));
      } else if (variant === "partial") {
        fs.writeFileSync(current.filename, "{");
      } else {
        const raw = fs.readFileSync(current.filename);
        fs.writeFileSync(current.filename, raw.subarray(0, Math.floor(raw.length / 2)));
      }
      assert.throws(
        () => readM52RecoveryJournal({
          filename: current.filename,
          expectedScenarioId: "scenario_m52_recovery",
          expectedCheckpoint: "final-verification",
          expectedReplayBinding: current.replayBinding,
        }),
        { code: variant === "tamper"
          ? "threadmesh_m52_recovery_journal_integrity_mismatch"
          : "threadmesh_m52_recovery_journal_truncated" },
      );
    } finally {
      current.cleanup();
    }
  }
});

test("scenario, checkpoint, and replay bindings are exact", () => {
  const current = fixture();
  try {
    writeM52RecoveryJournal({
      filename: current.filename,
      scenarioId: "scenario_m52_recovery",
      checkpoint: "final-verification",
      replayBinding: current.replayBinding,
      bundle: current.bundle,
    });
    for (const [override, code] of [
      [{ expectedScenarioId: "other" }, "threadmesh_m52_recovery_journal_scenario_mismatch"],
      [{ expectedCheckpoint: "satisfaction" }, "threadmesh_m52_recovery_journal_checkpoint_mismatch"],
      [{ expectedReplayBinding: { ...current.replayBinding, messageId: "other" } }, "threadmesh_m52_recovery_journal_replay_binding_mismatch"],
    ]) {
      assert.throws(
        () => readM52RecoveryJournal({
          filename: current.filename,
          expectedScenarioId: "scenario_m52_recovery",
          expectedCheckpoint: "final-verification",
          expectedReplayBinding: current.replayBinding,
          ...override,
        }),
        { code },
      );
    }
  } finally {
    current.cleanup();
  }
});
