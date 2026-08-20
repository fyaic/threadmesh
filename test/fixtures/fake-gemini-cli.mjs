const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("0.56.0\n");
  process.exit(0);
}

if (args.includes("--help")) {
  process.stdout.write(
    "--prompt --sandbox --approval-mode --session-id --list-sessions --delete-session --output-format\n",
  );
  process.exit(0);
}

if (process.env.FAKE_GEMINI_HANG === "1") {
  process.on("SIGTERM", () => {});
  await new Promise(() => setInterval(() => {}, 1_000));
}

let input = "";
for await (const chunk of process.stdin) input += chunk.toString();

if (process.env.FAKE_GEMINI_MALFORMED === "1") {
  process.stdout.write("{malformed\n");
  process.exit(0);
}

const sessionIndex = args.indexOf("--session-id");
const sessionId = args[sessionIndex + 1];
const send = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

send({ type: "init", session_id: sessionId, model: "fake-gemini" });
if (process.env.FAKE_GEMINI_AUTH === "1") {
  send({ type: "error", message: "Authentication required: set GEMINI_API_KEY" });
  send({ type: "result", status: "error" });
  process.exit(0);
}
if (process.env.FAKE_GEMINI_TOOL === "1") {
  send({ type: "tool_use", tool_name: "write_file", parameters: { path: "forbidden" } });
}
if (process.env.FAKE_GEMINI_EXACT_MARKER) {
  send({ type: "message", role: "assistant", content: process.env.FAKE_GEMINI_EXACT_MARKER });
} else {
  send({ type: "message", role: "assistant", content: "FAKE_GEMINI:" });
  send({ type: "message", role: "assistant", content: input });
}
send({ type: "result", status: "success", stats: { models: {} } });
