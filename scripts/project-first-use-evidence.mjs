import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// Publish a small projection, never raw transcripts, reasoning, credentials or native IDs.
const directory = path.resolve(process.argv[2] ?? "");
const report = JSON.parse(fs.readFileSync(path.join(directory, "report.json"), "utf8"));
const raw = fs.readFileSync(path.join(directory, "events.json"));
const rows = JSON.parse(raw);
const models = new Set();
const timeline = [];
for (const row of rows) {
  const event = row.event;
  if (event.type === "message_end" && event.message?.role === "assistant") {
    models.add(`${row.session}: ${event.message.provider}/${event.message.model}`);
  }
  if (["agent_start", "agent_end", "tool_execution_start", "turn.completed", "turn.failed"].includes(event.type)) {
    timeline.push({ session: row.session, elapsedMs: row.elapsedMs, type: event.type,
      ...(event.toolName ? { tool: event.toolName } : {}) });
  }
}
const result = { kind: "maintainer-live-run-projection", rawEventsSha256: createHash("sha256").update(raw).digest("hex"),
  ...report, models: [...models], timeline,
  clientSource: fs.readFileSync(path.join(directory, "client", "client.mjs"), "utf8") };
const serialized = JSON.stringify(result, null, 2).replaceAll(directory, "<fixture>")
  .replaceAll(directory.replace("/var/", "/private/var/"), "<fixture>");
process.stdout.write(serialized + "\n");
