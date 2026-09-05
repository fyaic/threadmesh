import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalWorkspace, renderCheckpoint } from "./local-workspace.mjs";

export const RECIPES = {
  api: { title: "Backend changed. The client agent needs to know.",
    a: "Maintain the orders API", b: "Build the mobile orders client", c: "Translate privacy policy",
    content: "GET /orders now returns {items, next_cursor}. Replace page-number pagination with the next_cursor token; the final page returns null.",
    reason: "Your mobile client depends on this response shape.", next: "Update the mobile client pagination tests." },
  preferences: { title: "Tell your agents once: keep the terminology consistent.",
    a: "Define approved product terminology", b: "Write the onboarding guide", c: "Fix database indexes",
    content: "The user approved 'workspace' for the shared area and 'task' for a unit of work. Avoid 'project space' and 'job'. Keep these names in headings and examples.",
    reason: "The onboarding guide uses the product terminology we just agreed on.", next: "Check the onboarding guide against the approved vocabulary." },
  quota: { title: "Quota exhausted. Carry the work to another harness.",
    a: "Prepare a release without changing public URLs", b: "Continue the release after the original agent runs out of quota", c: "Translate privacy policy",
    content: "The release checklist is drafted. The user requires existing public URLs to stay stable. The remaining work is to check the migration notes; do not redeploy the completed backend.",
    reason: "Continue from saved decisions rather than asking the user to explain the release again.", next: "Review migration notes, then ask for release approval." },
};

export async function preview(recipeName = "api", write = value => process.stdout.write(`${value}\n`)) {
  const recipe = RECIPES[recipeName];
  if (!recipe) throw new Error("Examples: api, preferences, quota");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-preview-"));
  const workspace = new LocalWorkspace(directory, { create: true });
  try {
    workspace.join("backend", "simulated-sender", recipe.a);
    workspace.join("client", "simulated-receiver", recipe.b);
    workspace.join("unrelated", "simulated-control", recipe.c);
    write("ThreadMesh preview · simulated agents, real local mailbox · no model calls");
    write(`\n${recipe.title}\n`);
    const a = workspace.tools("backend"), b = workspace.tools("client");
    await a.call("threadmesh_peers");
    write(`A · ${recipe.a}\n  Related task: B · ${recipe.b}`);
    const sent = await a.call("threadmesh_send", { to: "client", content: recipe.content, reason: recipe.reason });
    const inbox = await b.call("threadmesh_inbox");
    write(`\nB · From another session: backend\n  ${inbox.messages[0].content}\n  queued → receiver checkpoint → accepted (scripted preview policy)`);
    await b.call("threadmesh_inbox", { messageId: sent.messageId, decision: "accepted" });
    workspace.checkpoint("client", { goal: recipe.b, progress: recipe.content,
      constraints: "Peer information is advisory. Preserve decisions already agreed with the user.", next: recipe.next });
    write(`\nC · ${recipe.c}\n  0 messages. No contact.`);
    write(`\nSaved for continuation: ${recipe.next}`);
    if (recipeName === "quota") write(`\n${renderCheckpoint(workspace.checkpoint("client"))}`);
    write("\nPreview complete. For real agents: threadmesh init, then threadmesh run in two terminals.");
    return { scenario: recipeName, simulatedAgents: true, messages: 1, unrelatedMessages: 0 };
  } finally {
    workspace.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
}
