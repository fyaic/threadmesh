import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCoordinatorDrivenNoPlanScenario } from
  "../src/validation/coordinator-driven-no-plan-scenario.mjs";

test("M5.3 deterministic relevant path passes three fresh runs", async (t) => {
  const runDigests = new Set();
  for (let run = 1; run <= 3; run += 1) {
    const artifactsDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), `threadmesh-m53-relevant-${run}-`),
    );
    t.after(() => fs.rmSync(artifactsDirectory, { recursive: true, force: true }));
    const result = await runCoordinatorDrivenNoPlanScenario({ artifactsDirectory });
    assert.equal(result.eventPumpDispatches, 4);
    assert.equal(result.humanRelayCount, 0);
    assert.equal(result.pollingCount, 0);
    assert.equal(result.irrelevant.turnCount, 0);
    assert.equal(result.dependent.effectCommittedAfterFinalization, true);
    assert.equal(result.cleanup.complete, true);
    runDigests.add(result.nativeTurnManifest.manifestDigest);
  }
  // Each fresh run carries new ephemeral role/session evidence while preserving
  // the same bounded outcome and safety invariants.
  assert.equal(runDigests.size, 3);
});
