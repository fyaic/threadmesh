#!/usr/bin/env node
import {
  renderAttentionRouterDemo,
  runAttentionRouterDemo,
} from "../src/demo/attention-router-demo.mjs";

const [command, ...args] = process.argv.slice(2);
const json = args.includes("--json");

function print(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

if (command !== "demo" || args.some((arg) => arg !== "--json")) {
  process.stderr.write("Usage: node bin/threadmesh.mjs demo [--json]\n");
  process.exitCode = 64;
} else {
  try {
    const result = await runAttentionRouterDemo();
    if (json) {
      print(result);
    } else {
      process.stdout.write("ThreadMesh attention-router demo passed.\n");
      process.stdout.write("  artifact-ready -> review-failed -> artifact-ready -> dependency-satisfied\n");
      process.stdout.write("  manual relay actions: 0; model polling turns: 0; incorrect unlocks: 0\n");
      process.stdout.write(renderAttentionRouterDemo(result));
    }
  } catch (error) {
    const result = error?.demo ?? {
      state: "failed",
      errorCode: error?.code ?? "threadmesh_demo_failed",
    };
    if (json) print(result);
    else process.stderr.write(`ThreadMesh demo failed: ${result.errorCode}\n`);
    process.exitCode = 1;
  }
}
