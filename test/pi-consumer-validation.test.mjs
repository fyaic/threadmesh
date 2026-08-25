import assert from "node:assert/strict";
import test from "node:test";

import { runPiConsumerSmoke } from "../src/validation/pi-consumer-validation.mjs";

test("fresh Pi consumer exercises the packaged proactive bridge and cleans up", {
  timeout: 60_000,
}, async () => {
  const result = await runPiConsumerSmoke();
  assert.equal(result.state, "passed");
  assert.deepEqual(result.checks.map(({ id, state }) => ({ id, state })), [
    { id: "PI-L1-01", state: "passed" },
    { id: "PI-L1-02", state: "passed" },
    { id: "PI-L1-03", state: "passed" },
    { id: "PI-L1-04", state: "passed" },
    { id: "PI-L1-05", state: "passed" },
    { id: "PI-L1-06", state: "passed" },
  ]);
  assert.equal(result.checks[1].toolCount, 2);
  assert.deepEqual(result.checks[1].toolNames, [
    "threadmesh_related_tasks",
    "threadmesh_send_suggestion",
  ]);
  assert.match(result.checks[1].toolsHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.cleanup.complete, true);
  assert.equal(result.cleanup.temporaryConsumerRemoved, true);
});
