import test from "node:test";
import assert from "node:assert/strict";
import { auditNativeEvidence } from "../scripts/audit-native-evidence.mjs";

function pair() {
  const a = { thread: { id: "SECRET-A", hostId: "local", cwd: "/private/a" }, page: { hasMore: false }, turns: [
    { status: "completed", items: [{ type: "mcpToolCall", tool: "send_message_to_thread", status: "completed",
      arguments: { threadId: "SECRET-B", hostId: "local", prompt: "PRIVATE-CONTENT" } }] },
  ] };
  const b = { thread: { id: "SECRET-B", hostId: "local", cwd: "/private/b" }, page: { hasMore: false }, turns: [
    { status: "completed", completedAt: 1, items: [{ type: "agentMessage", text: "Prior user constraint retained." }] },
    { status: "completed", startedAt: 2, items: [
      { type: "functionCallOutput", name: "send_message_to_thread", output: { text: "<codex_delegation>\n  <source_thread_id>SECRET-A</source_thread_id>\n  <input>PRIVATE-CONTENT</input>\n</codex_delegation>", truncated: false } },
      { type: "fileChange", status: "completed", changes: [{ path: "/private/b/landing.json", diff: { text: "PRIVATE-DIFF", truncated: false } }] },
    ] },
  ] };
  return [a, b];
}

test("native evidence audit emits only structural facts, not private content or business success", () => {
  const result = auditNativeEvidence(...pair());
  assert.equal(result.completedReceiverOwnedFileChanges, 1);
  assert.match(result.businessCorrectness, /requires separate/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|PRIVATE|\/private/);
});

test("native evidence rejects incomplete, truncated or non-completed histories", () => {
  for (const mutate of [
    ([a]) => { a.page.hasMore = true; },
    ([, b]) => { b.turns[1].items[0].output.truncated = true; },
    ([, b]) => { b.turns[1].items[1].changes[0].diff.truncated = true; },
    ([a]) => { a.turns[0].status = "inProgress"; },
  ]) { const p = pair(); mutate(p); assert.throws(() => auditNativeEvidence(...p)); }
});

test("empty completed turns cannot hide later sends behind an earlier valid handoff", () => {
  for (const side of [0, 1]) {
    const p = pair();
    p[side].turns.push({ status: "completed", items: [] });
    assert.throws(() => auditNativeEvidence(...p));
  }
  const p = pair();
  p[1].turns[0].items = [];
  assert.throws(() => auditNativeEvidence(...p));
});

test("native evidence rejects wrong destination, wrong source, duplicate sends and missing context", () => {
  for (const mutate of [
    ([a]) => { a.turns[0].items[0].arguments.threadId = "other"; },
    ([a]) => { a.turns[0].items[0].arguments.hostId = "other"; },
    ([, b]) => { b.turns[1].items[0].output.text = "unattributed"; },
    ([a]) => { a.turns[0].items.push(structuredClone(a.turns[0].items[0])); },
    ([, b]) => { b.turns.shift(); },
  ]) { const p = pair(); mutate(p); assert.throws(() => auditNativeEvidence(...p)); }
});

test("native evidence requires a completed receiver-owned native patch", () => {
  for (const target of ["/private/b-other/landing.json", "/private/b/../a/landing.json", "landing.json"]) {
    const p = pair(); p[1].turns[1].items[1].changes[0].path = target;
    assert.throws(() => auditNativeEvidence(...p));
  }
  const p = pair(); p[1].turns[1].items[1].status = "failed";
  assert.throws(() => auditNativeEvidence(...p));
});
