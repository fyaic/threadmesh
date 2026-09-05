import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("packed CLI runs the attention-router demo in a fresh consumer", { timeout: 120_000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-packed-demo-"));
  const packageDirectory = path.join(directory, "package");
  const consumerDirectory = path.join(directory, "consumer");
  fs.mkdirSync(packageDirectory);
  fs.mkdirSync(consumerDirectory);

  try {
    const packed = JSON.parse(execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", packageDirectory],
      { cwd: root, encoding: "utf8" },
    ));
    assert.equal(packed.length, 1);
    const publishedPaths = new Set(packed[0].files.map((entry) => entry.path));
    for (const requiredPath of [
      "bin/threadmesh.mjs",
      "spec/schema/threadmesh-envelope.schema.json",
      "src/coordinator/sqlite-coordinator.mjs",
      "src/demo/attention-router-demo.mjs",
      "src/protocol-validator.mjs",
      "src/routing/lifecycle-events.mjs",
      "src/workspace/cli.mjs",
      "src/workspace/mcp-server.mjs",
      "src/integrations/pi-extension.mjs",
      "src/integrations/pi-entry.js",
      "src/bindings/jsonrpc.mjs",
    ]) {
      assert.ok(publishedPaths.has(requiredPath), `missing packed CLI input: ${requiredPath}`);
    }

    fs.writeFileSync(
      path.join(consumerDirectory, "package.json"),
      JSON.stringify({ name: "threadmesh-packed-demo-consumer", private: true }),
    );
    const tarball = path.join(packageDirectory, packed[0].filename);
    execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball], {
      cwd: consumerDirectory,
      encoding: "utf8",
    });

    const publicSurface = execFileSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `
        const sdk = await import("@fyaic/threadmesh");
        const coordinator = await import("@fyaic/threadmesh/coordinator/sqlite");
        const demo = await import("@fyaic/threadmesh/demo/attention-router");
        const inspector = await import("@fyaic/threadmesh/inspector/attention-snapshot");
        const wake = await import("@fyaic/threadmesh/routing/attention-wake");
        const routing = await import("@fyaic/threadmesh/routing/lifecycle-events");
        process.stdout.write(JSON.stringify({
          sdk: typeof sdk.createThreadMeshClient,
          coordinator: typeof coordinator.SqliteCoordinator,
          demo: typeof demo.runAttentionRouterDemo,
          inspector: typeof inspector.projectAttentionSnapshot,
          wake: typeof wake.AttentionWakeCursorConsumer,
          routing: typeof routing.evaluateAttentionRoute,
        }));
      `,
    ], { cwd: consumerDirectory, encoding: "utf8" });
    assert.deepEqual(JSON.parse(publicSurface), {
      sdk: "function",
      coordinator: "function",
      demo: "function",
      inspector: "function",
      wake: "function",
      routing: "function",
    });

    const output = execFileSync(
      path.join(consumerDirectory, "node_modules", ".bin", "threadmesh"),
      ["demo", "--json"],
      { cwd: consumerDirectory, encoding: "utf8" },
    );
    const result = JSON.parse(output);
    assert.equal(result.state, "passed");
    assert.deepEqual(result.sequence.map((step) => step.eventType), [
      "artifact-ready",
      "review-failed",
      "artifact-ready",
      "dependency-satisfied",
    ]);
    assert.deepEqual(result.counters, {
      manualRelayActions: 0,
      modelPollingTurns: 0,
      incorrectUnlocks: 0,
      durableReconciliations: 4,
    });
    assert.deepEqual(result.cleanup, { attempted: true, complete: true });
    assert.equal(JSON.stringify(result).includes(directory), false);
    const cli = path.join(consumerDirectory, "node_modules", ".bin", "threadmesh");
    for (const scenario of ["api", "preferences", "quota"]) {
      const preview = execFileSync(cli, ["preview", scenario], { cwd: consumerDirectory, encoding: "utf8" });
      assert.match(preview, /simulated/i);
      assert.match(preview, /0 messages/);
    }
    execFileSync(cli, ["init"], { cwd: consumerDirectory, encoding: "utf8" });
    const setup = JSON.parse(execFileSync(cli, ["setup", "deepseek", "--name", "research", "--goal", "Investigate API changes"], { cwd: consumerDirectory, encoding: "utf8" }));
    assert.equal(setup[0].insert[0].name, "@deepseek-ai/dsh-mcp-client");
    const status = JSON.parse(execFileSync(cli, ["status"], { cwd: consumerDirectory, encoding: "utf8" }));
    assert.equal(status[0].name, "research");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
