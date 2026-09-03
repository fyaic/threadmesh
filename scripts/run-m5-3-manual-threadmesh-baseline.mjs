import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { sha256Digest } from "../src/canonical-json.mjs";
import { CodexLiveAgentRuntime } from "../src/validation/live-agent-scenario.mjs";
import { runM53ManualThreadmeshBaseline } from
  "../src/validation/m5-3-manual-threadmesh-baseline.mjs";

const LIVE_ACK = "maintainer-approved-threadmesh-m53-baseline-live";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("usage");
    values[key.slice(2)] = value;
  }
  return values;
}

let artifactsDirectory = null;
try {
  const values = parse(process.argv.slice(2));
  const mode = values.mode ?? "fake";
  if (!["fake", "live"].includes(mode)) throw new Error("usage");
  artifactsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-m53-baseline-"));
  const live = mode === "live";
  const command = values.command ?? process.env.THREADMESH_CODEX_COMMAND;
  if (live && (
    (values.ack ?? process.env.THREADMESH_M53_BASELINE_LIVE_ACK) !== LIVE_ACK ||
    !path.isAbsolute(command ?? "") || !fs.statSync(command).isFile()
  )) throw new Error("live-preflight");
  const productProbe = live
    ? await new CodexLiveAgentRuntime({ command, model: values.model ?? null })
      .probe(artifactsDirectory)
    : null;
  const result = await runM53ManualThreadmeshBaseline({
    artifactsDirectory,
    realEffects: live,
    sourceRoot: live ? root : null,
    validatedBaseSha: live ? execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8",
    }).trim() : null,
    temporaryParent: live ? artifactsDirectory : null,
    productProbe,
    model: values.model ?? null,
    runtimeFactory: live
      ? () => new CodexLiveAgentRuntime({ command, model: values.model ?? null })
      : null,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.state === "passed" ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({
    state: "failed",
    code: error.message === "usage" ? "threadmesh_m53_baseline_usage_invalid" :
      (error.message === "live-preflight" ? "threadmesh_m53_baseline_preflight_failed" :
        (error.code ?? "threadmesh_m53_baseline_failed")),
    errorDigest: sha256Digest({ name: error.name, code: error.code ?? null }),
  }, null, 2));
  process.exitCode = error.message === "usage" || error.message === "live-preflight" ? 3 : 1;
} finally {
  if (artifactsDirectory !== null) {
    if (fs.existsSync(artifactsDirectory) && fs.readdirSync(artifactsDirectory).length === 0) {
      fs.rmdirSync(artifactsDirectory);
    }
  }
}
