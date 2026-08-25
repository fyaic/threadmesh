import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("packed SDK exposes the proactive bridge to an external consumer", { timeout: 60_000 }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-sdk-consumer-"));
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
    const tarball = path.join(packageDirectory, packed[0].filename);
    fs.writeFileSync(
      path.join(consumerDirectory, "package.json"),
      JSON.stringify({ name: "threadmesh-consumer", private: true, type: "module" }),
    );
    execFileSync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      { cwd: consumerDirectory, encoding: "utf8" },
    );

    const output = execFileSync(process.execPath, [
      "--input-type=module",
      "--eval",
      `
        import {
          createProactiveToolBridge,
          THREADMESH_PROACTIVE_TOOL_NAMES,
        } from "@fyaic/threadmesh";
        const source = {
          taskId: "task_consumer_source",
          incarnationId: "inc_consumer_source01",
          harness: "consumer-sender",
        };
        const target = {
          taskId: "task_consumer_target",
          incarnationId: "inc_consumer_target01",
          harness: "consumer-receiver",
        };
        const bridge = createProactiveToolBridge({
          client: {
            discoverRelated: async () => ({
              task: target,
              coordination: { intents: ["suggest"], deliveryModes: ["checkpoint-offer"] },
            }),
            sendSuggestion: async () => ({
              disposition: { delivery: "control-plane-accepted", decision: "pending" },
            }),
          },
          source,
          relationships: [{ relationshipId: "rel_consumer01", target }],
          createMessageId: () => "msg_consumer01",
        });
        await bridge.handleToolCall({
          tool: THREADMESH_PROACTIVE_TOOL_NAMES.discover,
          arguments: {},
        });
        const sent = await bridge.handleToolCall({
          tool: THREADMESH_PROACTIVE_TOOL_NAMES.suggest,
          arguments: { targetTaskId: target.taskId, content: "result", reason: "dependency" },
        });
        process.stdout.write(JSON.stringify({
          tools: bridge.tools.map(({ name }) => name),
          sent: sent.sent,
          usage: bridge.usage(),
        }));
      `,
    ], { cwd: consumerDirectory, encoding: "utf8" });
    assert.deepEqual(JSON.parse(output), {
      tools: ["threadmesh_related_tasks", "threadmesh_send_suggestion"],
      sent: true,
      usage: {
        discoveryCalls: 1,
        sendCalls: 1,
        discoveryCompleted: true,
        sentTaskIds: ["task_consumer_target"],
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
