import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runM52SigkillCanary } from "../src/validation/m5-2-sigkill-canary.mjs";

test("SIGKILL after external native-start observation reopens exact state and never resends", async () => {
  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m52-sigkill-test-"));
  try {
    const result = await runM52SigkillCanary({ temporaryParent });
    assert.equal(result.canaryKind, "deterministic-persistent-fake-product-process");
    assert.equal(result.realCodexProductEvidence, false);
    assert.deepEqual(result.processDeath, { signal: "SIGKILL", observed: true });
    assert.equal(result.checkpoint.phase, "native-start-observed-before-coordinator-bind");
    assert.equal(result.checkpoint.nativeStartExternallyObservable, true);
    assert.equal(result.checkpoint.coordinatorTurnBoundBeforeKill, false);
    assert.deepEqual(result.recovery, {
      state: "abandoned",
      terminalStatus: "interrupted",
      nativeTurnCount: 1,
      nativeStartCount: 1,
      nativeResubmitCount: 0,
      toolEffectCount: 0,
      auditEventCount: 0,
      receiptCount: 0,
      actionCount: 0,
    });
    assert.equal(result.cleanup.complete, true);
    assert.equal(result.cleanup.sidecarAbsence, true);
    assert.equal(result.cleanup.temporaryFileAbsence, true);
    assert.deepEqual(fs.readdirSync(temporaryParent), []);

    const serialized = JSON.stringify(result);
    for (const raw of [
      "execution_m52_sigkill_canary",
      "thread_m52_sigkill_canary",
      "turn_m52_sigkill_canary",
      temporaryParent,
    ]) assert.equal(serialized.includes(raw), false);
    for (const value of Object.values(result.identityDigests)) {
      assert.match(value, /^sha256:[a-f0-9]{64}$/u);
    }
    assert.match(result.evidenceDigest, /^sha256:[a-f0-9]{64}$/u);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});
