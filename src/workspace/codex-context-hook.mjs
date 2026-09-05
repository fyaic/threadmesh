import { codexWorkspaceContext } from "./codex-context.mjs";

// Codex owns stdin and writes one lifecycle event. Do not inspect the prompt or
// transcript_path: only the explicitly joined ThreadMesh room is in scope.
try {
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("oversized hook event");
  }
  const event = JSON.parse(raw);
  if (!["SessionStart", "UserPromptSubmit"].includes(event.hook_event_name)) throw new Error("unsupported hook event");
  const [directory, name] = process.argv.slice(2);
  const additionalContext = codexWorkspaceContext(directory, name);
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: event.hook_event_name, additionalContext,
  } }));
} catch {
  // Fail open for the user's ordinary work, but visibly report lost awareness.
  process.stdout.write(JSON.stringify({ systemMessage: "ThreadMesh workspace context could not be loaded; collaboration awareness is unavailable for this checkpoint." }));
}
