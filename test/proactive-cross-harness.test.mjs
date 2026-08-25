import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createAcpProactiveReceiverRuntime } from
  "../src/validation/acp-proactive-receiver.mjs";
import {
  PROACTIVE_B_MARKER,
  PROACTIVE_B_MISSING_MARKER,
  runProactiveCodexScenario,
} from "../src/validation/proactive-codex-scenario.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(root, "test", "fixtures", name);

test("Codex Agent A proactively supplies a persisted ACP Agent B", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-cross-proactive-"));
  const codexEnv = {
    FAKE_CODEX_STATE_FILE: path.join(directory, "codex-state.json"),
    FAKE_CODEX_AUTONOMOUS_TOOL: "1",
    FAKE_CODEX_AUTONOMOUS_MARKER: "Agent A sent the useful dependency.",
  };
  const acpState = { FAKE_ACP_STATE_FILE: path.join(directory, "acp-state.json") };
  const receiverRuntime = createAcpProactiveReceiverRuntime({
    command: process.execPath,
    args: [fixture("fake-acp-agent.mjs")],
    cwd: root,
    baselineEnv: {
      ...acpState,
      FAKE_ACP_EXACT_MARKER: PROACTIVE_B_MISSING_MARKER,
    },
    receiverEnv: {
      ...acpState,
      FAKE_ACP_EXACT_MARKER: PROACTIVE_B_MARKER,
    },
    cleanupEnv: acpState,
  });

  try {
    const result = await runProactiveCodexScenario({
      command: process.execPath,
      args: [fixture("fake-codex-app-server.mjs")],
      cwd: root,
      env: codexEnv,
      autonomousEnv: codexEnv,
      receiverRuntime,
      runId: "cross_harness01",
      clock: () => Date.parse("2026-08-25T10:15:00Z"),
    });

    assert.equal(result.state, "passed");
    assert.equal(result.productId, "codex-proactive-acp");
    assert.equal(result.adapterKind, "acp-session");
    assert.deepEqual(result.aToolCalls, [
      "threadmesh_related_tasks",
      "threadmesh_send_suggestion",
    ]);
    assert.equal(result.sendCalls, 1);
    assert.equal(result.receiverActivated, true);
    assert.equal(result.outcomeScore, 1);
    assert.equal(result.bMarkerMatched, true);
    assert.equal(result.productMetadata.agentName, "threadmesh-fake-agent");
    assert.equal(result.cleanup.aThreadDeleted, true);
    assert.equal(result.cleanup.bSessionDeleted, true);
    assert.equal(result.cleanup.bAbsenceVerified, true);
    assert.equal(result.cleanup.complete, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
