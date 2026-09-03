import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/canonical-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cases = Object.freeze([
  Object.freeze({
    condition: "relevant-3-of-3-and-irrelevant-zero",
    file: "test/m5-3-closure-matrix.test.mjs",
    pattern: "M5.3 deterministic relevant path passes three fresh runs",
  }),
  Object.freeze({
    condition: "stale-and-unverified-fail-closed",
    file: "test/lifecycle-events.test.mjs",
    pattern: "does not offer expired or target-stale events|unverified, rejected, and untrusted events cannot unlock dependencies",
  }),
  Object.freeze({
    condition: "restart-and-replay-exactly-once",
    file: "test/durable-event-pump.test.mjs",
    pattern: "durable pre-dispatch selection restarts|post-turn-pre-settle restart|post-settle-pre-publication restart|restart verifies the append-only dispatch checkpoint digest chain",
  }),
  Object.freeze({
    condition: "failure-cleanup-and-no-incorrect-unlock",
    file: "test/coordinator-driven-no-plan-scenario.test.mjs",
    pattern: "failed trusted finalization starts no dependent business turn|preverified admission requires exact durable provenance|bounded shutdown after role bootstrap cleans every created role",
  }),
]);

const records = cases.map(({ condition, file, pattern }) => {
  const started = Date.now();
  const child = spawnSync(process.execPath, [
    "--test", `--test-name-pattern=${pattern}`, file,
  ], { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const output = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  return Object.freeze({
    condition,
    state: child.status === 0 ? "passed" : "failed",
    elapsedMs: Math.max(1, Date.now() - started),
    exitCode: child.status,
    evidenceDigest: sha256Digest(output),
  });
});
const passed = records.every(({ state }) => state === "passed");
const body = {
  schemaVersion: 1,
  state: passed ? "passed" : "failed",
  evidenceClass: "deterministic-m5-3-negative-and-recovery-matrix",
  realProductEvidence: false,
  records,
  remainingLiveGates: Object.freeze([
    "real-codex-relevant-3-of-3",
    "complete-same-condition-manual-threadmesh-baseline",
  ]),
};
console.log(JSON.stringify({ ...body, recordDigest: sha256Digest(body) }, null, 2));
process.exitCode = passed ? 0 : 1;
