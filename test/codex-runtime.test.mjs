import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { probeCodexVersion, selectCodexRuntime } from "../src/workspace/codex-runtime.mjs";

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-runtime-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const onPath = path.join(root, "codex"), bundled = path.join(root, "desktop-codex");
  for (const file of [onPath, bundled]) fs.writeFileSync(file, "", { mode: 0o700 });
  const select = (versions, options = {}) => selectCodexRuntime({ platform: "darwin", searchPath: root,
    override: "", bundledCodexPath: bundled, probeVersion: command => versions[command], ...options });
  return { root, onPath, bundled, select };
}

test("first-use selects a verified newer desktop Codex without changing generic launch preference", t => {
  const { onPath, bundled, select } = setup(t);
  assert.deepEqual(select({ [onPath]: "0.145.0", [bundled]: "0.153.1" }), {
    command: bundled, version: "0.153.1", source: "desktop-bundle",
    reason: "Installed desktop CLI 0.153.1 is newer than PATH CLI 0.145.0; account, model and configuration are unchanged.",
  });
  assert.equal(select({ [onPath]: "0.99.9", [bundled]: "0.100.0" }).command, bundled);
  assert.equal(select({ [onPath]: "1.0.0", [bundled]: "0.999.0" }).command, onPath);
  assert.equal(select({ [onPath]: "0.153.1", [bundled]: "0.153.1" }).command, onPath);
});

test("unknown or unparseable versions preserve PATH, and no PATH permits installed bundle", t => {
  const { onPath, bundled, select } = setup(t);
  for (const version of [null, "unknown", "0.145", "0.145.0-beta", "999999999999999999999.1.2"])
    assert.equal(select({ [onPath]: version, [bundled]: "0.153.1" }).command, onPath);
  assert.equal(select({ [onPath]: "0.145.0", [bundled]: null }).command, onPath);
  assert.equal(select({}, { searchPath: "" }).command, bundled);
  assert.equal(select({}, { probeVersion: () => { throw new Error("probe failed"); } }).command, onPath);
  assert.equal(select({}, { platform: "linux", searchPath: "" }), null);
});

test("explicit Codex override always wins and is never probed", t => {
  const { onPath, select } = setup(t);
  const selected = select({}, { override: "/missing-explicit-wrapper", probeVersion: () => assert.fail("must not probe override") });
  assert.equal(selected.command, "/missing-explicit-wrapper");
  assert.equal(selected.source, "explicit-override");
  assert.equal(selected.version, null);
  assert.equal(select({}, { override: onPath }).command, onPath);
  assert.throws(() => select({}, { override: "relative-wrapper" }), /must be absolute/);
});

test("read-only version probe rejects unrelated executables and missing files", () => {
  assert.equal(probeCodexVersion(process.execPath), null);
  assert.equal(probeCodexVersion("/missing-threadmesh-codex-version"), null);
});
