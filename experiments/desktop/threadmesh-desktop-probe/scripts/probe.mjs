import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

// Diagnostic only. The host supplies stdin, which can contain private fields.
// Project only these two fields; never open transcript_path, log or store stdin.
export function probeEvent(event) {
  if (!event || !["SessionStart", "UserPromptSubmit"].includes(event.hook_event_name) ||
      typeof event.session_id !== "string" || !event.session_id.trim() ||
      event.session_id.length > 256) {
    throw new Error("unsupported probe event");
  }
  const fingerprint = createHash("sha256")
    .update("threadmesh-desktop-probe-v1\0").update(event.session_id)
    .digest("hex").slice(0, 16);
  return { hookSpecificOutput: {
    hookEventName: event.hook_event_name,
    additionalContext: `TM_DESKTOP_PROBE session=${fingerprint} event=${event.hook_event_name}. ` +
      "Developer diagnostic only: this marker proves neither session authorization nor peer delivery. " +
      "No ThreadMesh workspace was joined and no other session was contacted.",
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 1024 * 1024) throw new Error("oversized probe input");
      chunks.push(chunk);
    }
    process.stdout.write(JSON.stringify(probeEvent(JSON.parse(Buffer.concat(chunks).toString("utf8")))));
  } catch {
    // Never block the user's turn, continue Stop hooks, or echo private input.
    process.stderr.write("ThreadMesh desktop probe unavailable; no collaboration capability established.\n");
    process.stdout.write("{}");
  }
}
