import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_E2E_ACK,
  runFakeAll,
  runLive,
} from "../scripts/validate-products-e2e.mjs";

test("live product validation is refused without the exact review acknowledgement", async () => {
  const absent = await runLive("codex", {});
  assert.equal(absent.mode, "live");
  assert.equal(absent.state, "not-run");
  assert.equal(absent.productId, "codex");
  assert.equal(absent.code, "external_review_gate_not_acknowledged");
  assert.equal(absent.requiredAcknowledgement, LIVE_E2E_ACK);
  assert.match(absent.startedAt, /^2026-|^20/);
  assert.match(absent.finishedAt, /^2026-|^20/);
  const wrong = await runLive("kimi", { THREADMESH_LIVE_E2E_ACK: "yes" });
  assert.equal(wrong.state, "not-run");
  const missingGeminiKey = await runLive("gemini", {
    THREADMESH_LIVE_E2E_ACK: LIVE_E2E_ACK,
  });
  assert.equal(missingGeminiKey.state, "blocked");
  assert.equal(missingGeminiKey.code, "gemini_api_key_not_authorized");
});

test("one runner admits and cleans all three fake products", async () => {
  const result = await runFakeAll();
  assert.equal(result.state, "passed");
  assert.deepEqual(result.products.map((product) => product.productId), ["codex", "kimi", "gemini"]);
  for (const product of result.products) {
    assert.equal(product.state, "passed");
    assert.equal(product.mailbox, "claimed-and-accepted");
    assert.equal(product.delivery, "context-admitted");
    assert.equal(product.markerMatched, true);
    assert.equal(product.cleanup.attempted, true);
    assert.equal(product.cleanup.complete, true);
  }
});
