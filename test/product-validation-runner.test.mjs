import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  LIVE_E2E_ACK,
  runFakeAll,
  runLive,
} from "../scripts/validate-products-e2e.mjs";
import {
  evaluateIsolatedCheckoutBoundary,
  evaluateMainCheckoutBoundary,
  validateIsolatedLiveChild,
} from "../scripts/run-live-product-validation.mjs";
import {
  runCoordinatorProductScenario,
  sanitizeProductMetadata,
} from "../src/validation/coordinator-product-scenario.mjs";

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

test("public product metadata is allowlisted and byte bounded", () => {
  const metadata = sanitizeProductMetadata("acp-session", {
    protocolVersion: 1,
    agentName: `agent\n${"x".repeat(2_000_000)}`,
    agentVersion: "1.0.0",
    secret: "must-not-escape",
  });
  assert.deepEqual(Object.keys(metadata), ["protocolVersion", "agentName", "agentVersion"]);
  assert.equal(metadata.agentName.redacted, true);
  assert.equal(metadata.agentName.byteLength, 2_000_006);
  assert.match(metadata.agentName.digest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(metadata), /must-not-escape|x{100}/);
});

test("live bootstrap binds main and detached execution to one SHA", () => {
  const sha = "a".repeat(40);
  assert.equal(evaluateMainCheckoutBoundary({
    head: sha,
    branch: "main",
    clean: true,
    remoteMain: sha,
    errors: [],
  }).satisfied, true);
  assert.equal(evaluateIsolatedCheckoutBoundary({
    head: sha,
    branch: "",
    clean: true,
    remoteMain: sha,
    errors: [],
  }, sha).satisfied, true);
  const changed = evaluateIsolatedCheckoutBoundary({
    head: sha,
    branch: "",
    clean: false,
    remoteMain: "b".repeat(40),
    errors: [],
  }, sha);
  assert.equal(changed.satisfied, false);
  assert.equal(changed.errors.length, 2);
});

test("live bootstrap accepts only a clean exact-SHA child result with a matching exit", () => {
  const sha = "a".repeat(40);
  const result = {
    mode: "live",
    productId: "codex",
    state: "passed",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:00:01.000Z",
    reviewGate: { satisfied: true },
    repository: {
      satisfied: true,
      head: sha,
      expectedSha: sha,
      remoteMain: sha,
      branch: "",
      clean: true,
    },
    mailbox: "claimed-and-accepted",
    delivery: "context-admitted",
    markerMatched: true,
    cleanup: { complete: true },
  };
  const validation = validateIsolatedLiveChild({
    stdout: JSON.stringify(result),
    status: 0,
    signal: null,
    error: undefined,
  }, { productId: "codex", executionSha: sha });
  assert.equal(validation.accepted, true);
  assert.deepEqual(validation.result, result);
});

test("live bootstrap rejects passed stdout when the child times out", () => {
  const sha = "a".repeat(40);
  const forgedPass = JSON.stringify({
    mode: "live",
    productId: "codex",
    state: "passed",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:00:01.000Z",
    reviewGate: { satisfied: true },
    repository: {
      satisfied: true,
      head: sha,
      expectedSha: sha,
      remoteMain: sha,
      branch: "",
      clean: true,
    },
    mailbox: "claimed-and-accepted",
    delivery: "context-admitted",
    markerMatched: true,
    cleanup: { complete: true },
  });
  const child = spawnSync(
    process.execPath,
    ["-e", "require('node:fs').writeSync(1, process.argv[1]); setInterval(() => {}, 1000)", forgedPass],
    { encoding: "utf8", timeout: 2_000 },
  );
  assert.equal(child.error?.code, "ETIMEDOUT");
  assert.equal(child.status, null);
  assert.equal(child.signal, "SIGTERM");
  const validation = validateIsolatedLiveChild(child, {
    productId: "codex",
    executionSha: sha,
  });
  assert.deepEqual(validation, {
    accepted: false,
    code: "isolated_live_child_exit_mismatch",
  });
});
