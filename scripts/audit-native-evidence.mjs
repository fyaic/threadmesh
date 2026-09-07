import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// This is a structural audit of user-supplied exports, not host attestation,
// semantic correctness or a claim that ThreadMesh supplied native transport.
export function auditNativeEvidence(a, b) {
  const reject = () => { throw new Error("Native evidence is incomplete or does not establish one attributed receiver-owned handoff."); };
  for (const d of [a, b]) {
    if (!d?.thread?.id || !d.thread.cwd || !d.thread.hostId || d.page?.hasMore !== false || !Array.isArray(d.turns) ||
        d.turns.some(t => t.status !== "completed" || !Array.isArray(t.items) || t.items.length === 0 ||
          t.items.some(i => i.output?.truncated || i.changes?.some(c => c.diff?.truncated)))) reject();
  }
  if (a.thread.id === b.thread.id) reject();
  const calls = d => d.turns.flatMap(t => t.items).filter(i => i.type === "mcpToolCall" && i.tool === "send_message_to_thread");
  const sends = calls(a);
  if (sends.length !== 1 || calls(b).length || sends[0].status !== "completed" ||
      sends[0].arguments?.threadId !== b.thread.id ||
      sends[0].arguments?.hostId !== b.thread.hostId) reject();
  const received = b.turns.filter(t => t.items.some(i => i.type === "functionCallOutput" &&
    i.name === "send_message_to_thread" && i.output?.text?.startsWith(
      `<codex_delegation>\n  <source_thread_id>${a.thread.id}</source_thread_id>\n  <input>`)));
  if (received.length !== 1) reject();
  const turn = received[0];
  const changes = turn.items.filter(i => i.type === "fileChange" && i.status === "completed")
    .flatMap(i => i.changes ?? []);
  const ownChanges = changes.filter(c => {
    if (typeof c.path !== "string" || !path.isAbsolute(c.path)) return false;
    const relative = path.relative(b.thread.cwd, c.path);
    return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!ownChanges.length || !b.turns.some(t => Number.isFinite(t.completedAt) &&
      Number.isFinite(turn.startedAt) && t.completedAt < turn.startedAt)) reject();
  return {
    schemaVersion: 1,
    kind: "structural-audit-of-retained-native-exports",
    transport: "Codex native task tools, not ThreadMesh coordinator",
    sourceTurns: a.turns.length,
    receiverTurns: b.turns.length,
    outgoingPeerMessages: { A: sends.length, B: calls(b).length },
    originalReceiverHasPriorCompletedContext: true,
    sourceAttributedReceiverTurn: true,
    completedReceiverOwnedFileChanges: ownChanges.length,
    modelOrThinkingOverride: Object.hasOwn(sends[0].arguments, "model") || Object.hasOwn(sends[0].arguments, "thinking"),
    businessCorrectness: "requires separate artifact assertions and human review",
    busyAndStopBehavior: "requires separate turn-history review",
    authenticity: "not cryptographically attested; hashes commit only to supplied files",
    privacy: "no task IDs, paths, prompts, diffs or account data are emitted",
  };
}

export function auditFiles(senderFile, receiverFile) {
  const read = filename => {
    if (fs.statSync(filename).size > 16 * 1024 * 1024) throw new Error("Evidence export exceeds the 16 MiB limit.");
    const bytes = fs.readFileSync(filename);
    return { value: JSON.parse(bytes), sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  const a = read(senderFile), b = read(receiverFile);
  return { ...auditNativeEvidence(a.value, b.value), sourceHashes: { A: a.sha256, B: b.sha256 } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error("usage");
    console.log(JSON.stringify(auditFiles(process.argv[2], process.argv[3]), null, 2));
  } catch {
    // Do not echo native export text, local paths or parser excerpts on failure.
    console.error("Evidence audit failed. Supply two complete native read_thread JSON exports: sender, receiver. No data was published.");
    process.exitCode = 1;
  }
}
