import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PROACTIVE_A_BOOTSTRAP_MARKER,
  PROACTIVE_A_MARKER,
  PROACTIVE_B_BOOTSTRAP_MARKER,
  PROACTIVE_B_MARKER,
  runProactiveCodexScenario,
} from "../src/validation/proactive-codex-scenario.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(root, "test", "fixtures", "fake-codex-app-server.mjs");

test("Agent A selects ThreadMesh tools before its suggestion reaches real-shaped Agent B", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-proactive-"));
  const baseEnv = { FAKE_CODEX_STATE_FILE: path.join(directory, "state.json") };
  try {
    const result = await runProactiveCodexScenario({
      command: process.execPath,
      args: [fixture],
      cwd: root,
      env: baseEnv,
      bootstrapEnv: {
        ...baseEnv,
        FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_BOOTSTRAP_MARKER,
      },
      aBootstrapEnv: {
        ...baseEnv,
        FAKE_CODEX_EXACT_MARKER: PROACTIVE_A_BOOTSTRAP_MARKER,
      },
      autonomousEnv: {
        ...baseEnv,
        FAKE_CODEX_AUTONOMOUS_TOOL: "1",
        FAKE_CODEX_AUTONOMOUS_MARKER: PROACTIVE_A_MARKER,
      },
      receiverEnv: {
        ...baseEnv,
        FAKE_CODEX_EXACT_MARKER: PROACTIVE_B_MARKER,
      },
      clock: () => Date.parse("2026-08-21T10:30:00Z"),
      runId: "deterministic01",
    });

    assert.equal(result.state, "passed");
    assert.equal(result.productId, "codex-proactive");
    assert.equal(result.modelSelectedCommunication, true);
    assert.equal(result.scriptedSubmitCount, 0);
    assert.equal(result.relatedTaskCalls, 1);
    assert.equal(result.sendCalls, 1);
    assert.equal(result.nonThreadMeshToolCalls, 0);
    assert.deepEqual(result.aToolCalls, [
      "threadmesh_related_tasks",
      "threadmesh_send_suggestion",
    ]);
    assert.equal(result.mailbox, "claimed-and-accepted");
    assert.equal(result.delivery, "context-admitted");
    assert.equal(result.aMarkerMatched, true);
    assert.equal(result.bMarkerMatched, true);
    assert.deepEqual(result.cleanup, {
      attempted: true,
      complete: true,
      aThreadDeleted: true,
      bThreadDeleted: true,
      threadDeleted: true,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
