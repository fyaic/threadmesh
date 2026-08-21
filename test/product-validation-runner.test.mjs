import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVE_E2E_ACK,
  runFakeAll,
  runLive,
} from "../scripts/validate-products-e2e.mjs";
import { runCoordinatorProductScenario } from "../src/validation/coordinator-product-scenario.mjs";

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
});

test("operator acknowledgement cannot bypass incomplete review records", async () => {
  const result = await runLive("codex", {
    THREADMESH_LIVE_E2E_ACK: LIVE_E2E_ACK,
  });
  assert.equal(result.state, "not-run");
  assert.equal(result.code, "external_review_records_incomplete");
  assert.equal(result.reviewGate.reviewCount, 0);
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

test("exact marker comparison rejects leading or trailing whitespace", async () => {
  let cleaned = false;
  await assert.rejects(
    runCoordinatorProductScenario({
      productId: "whitespace",
      marker: "STRICT_OK",
      runId: "whitespace01",
      setupProduct: async () => ({
        harness: "fake-acp",
        adapterRef: {
          kind: "acp-session",
          sessionId: "fake-whitespace-session",
          snapshotDigest: `sha256:${"a".repeat(64)}`,
        },
        async deliver(prepared) {
          return {
            text: " STRICT_OK\n",
            truncated: false,
            evidence: {
              sessionId: prepared.adapterRef.sessionId,
              snapshotDigest: prepared.adapterRef.snapshotDigest,
              stopReason: "end_turn",
            },
          };
        },
        async cleanup() {
          cleaned = true;
          return { complete: true };
        },
      }),
    }),
    { code: "threadmesh_product_marker_mismatch" },
  );
  assert.equal(cleaned, true);
});
