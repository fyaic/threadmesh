import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executable } from "../src/workspace/launch.mjs";

test("Codex reuses an executable desktop bundle only after PATH, without guessing other harnesses", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-codex-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const previous = process.env.THREADMESH_CODEX_COMMAND;
  delete process.env.THREADMESH_CODEX_COMMAND;
  t.after(() => { if (previous === undefined) delete process.env.THREADMESH_CODEX_COMMAND; else process.env.THREADMESH_CODEX_COMMAND = previous; });
  const bundled = path.join(root, "desktop-codex");
  fs.writeFileSync(bundled, "", { mode: 0o700 });
  const options = { platform: "darwin", searchPath: "", bundledCodexPaths: [bundled] };
  assert.equal(executable("codex", options), bundled);
  assert.equal(executable("kimi", options), null);
  assert.equal(executable("codex", { ...options, platform: "linux" }), null);
  const onPath = path.join(root, "codex");
  fs.writeFileSync(onPath, "", { mode: 0o700 });
  assert.equal(executable("codex", { ...options, searchPath: root }), onPath);
  process.env.THREADMESH_CODEX_COMMAND = bundled;
  assert.equal(executable("codex", { ...options, searchPath: root }), bundled);
  process.env.THREADMESH_CODEX_COMMAND = "relative-command";
  assert.throws(() => executable("codex", options), /must be absolute/);
});
