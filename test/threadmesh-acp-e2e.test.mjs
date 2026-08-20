import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AcpStdioAdapter } from "../src/adapters/acp-stdio.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeAgent = path.join(root, "test", "fixtures", "fake-acp-agent.mjs");
const clock = () => Date.parse("2026-08-20T09:00:00Z");
const owner = { kind: "user", principalId: "owner" };
const sender = { kind: "task", taskId: "task_a", incarnationId: "inc_task_a01" };
const receiver = { kind: "task", taskId: "task_b", incarnationId: "inc_task_b01" };

test("moves a trusted in-process peer suggestion into its registered ACP receiver", async () => {
  const coordinator = new SqliteCoordinator({ clock });
  const adapter = new AcpStdioAdapter();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-e2e-"));
  const fakeEnv = { FAKE_ACP_STATE_FILE: path.join(directory, "sessions.json") };
  try {
    const acpSession = await adapter.createSession({
      command: process.execPath,
      args: [fakeAgent],
      cwd: root,
      env: fakeEnv,
    });
    coordinator.registerTask(
      { taskId: "task_a", incarnationId: "inc_task_a01", harness: "mock-a" },
      owner,
    );
    coordinator.registerTask(
      {
        taskId: "task_b",
        incarnationId: "inc_task_b01",
        harness: "acp",
        adapterRef: {
          kind: "acp-session",
          sessionId: acpSession.sessionId,
          snapshotDigest: acpSession.snapshotDigest,
        },
      },
      owner,
    );
    coordinator.issueGrant(
      {
        specVersion: "0.0-draft",
        grantId: "grant_task_a_b",
        grantVersion: 1,
        relationshipId: "rel_task_a_b",
        relationshipType: "dependency",
        source: { taskId: "task_a", incarnationId: "inc_task_a01" },
        target: { taskId: "task_b", incarnationId: "inc_task_b01" },
        allowedIntents: ["suggest"],
        allowedDeliveryModes: ["checkpoint-offer"],
        summaryVisibility: "coordination",
        structuredGateResponses: false,
        createdAt: "2026-08-20T08:00:00Z",
        expiresAt: "2026-08-20T10:00:00Z",
      },
      {
        decisionId: "decision_task_a_b",
        authenticationId: "authn_owner_e2e01",
        decidedAt: "2026-08-20T08:00:00Z",
      },
      owner,
    );

    const envelope = {
      specVersion: "0.0-draft",
      messageId: "msg_task_a_b01",
      messageType: "suggestion",
      intent: "suggest",
      claimStatus: "evidence-referenced",
      sender: {
        taskId: "task_a",
        incarnationId: "inc_task_a01",
        actorType: "agent",
        harness: "mock-a",
      },
      target: {
        taskId: "task_b",
        incarnationId: "inc_task_b01",
        harness: "acp",
      },
      relationshipId: "rel_task_a_b",
      content: "The dependency now reports capability count 10; re-check the old assertion.",
      reason: "Task B appears blocked on an obsolete capability count.",
      evidenceRefs: ["artifact://task-a/capabilities@revision-10"],
      delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
      createdAt: "2026-08-20T09:00:00Z",
      expiresAt: "2026-08-20T09:10:00Z",
    };

    coordinator.submit(envelope, sender);
    const pending = coordinator.listPending(
      { taskId: "task_b", incarnationId: "inc_task_b01" },
      {},
      receiver,
    );
    assert.equal(pending.messages.length, 1);
    coordinator.respond("inc_task_a01", "msg_task_a_b01", "accepted", 0, receiver);
    const prepared = coordinator.prepareContextAdmission(
      "inc_task_a01",
      "msg_task_a_b01",
      1,
      receiver,
    );
    const result = await adapter.runPrompt({
      command: process.execPath,
      args: [fakeAgent],
      cwd: root,
      env: fakeEnv,
      sessionId: prepared.adapterRef.sessionId,
      promptText: prepared.rendering,
    });
    const admitted = coordinator.confirmContextAdmission(
      "inc_task_a01",
      "msg_task_a_b01",
      1,
      prepared.admissionToken,
      result.evidence,
      receiver,
    );

    assert.equal(result.state, "completed");
    assert.equal(result.evidence.sessionLoaded, true);
    assert.equal(result.evidence.sessionId, acpSession.sessionId);
    assert.match(result.text, /FAKE_ACP:RESTORED:sentinel-[^:]+:THREADMESH_UNTRUSTED/);
    assert.doesNotMatch(result.text, /REPLAY:/);
    assert.match(result.text, /"sourceTask":"task_a"/);
    assert.match(result.text, /"claimStatus":"evidence-referenced"/);
    assert.match(result.text, /capability count 10/);
    assert.equal(admitted.delivery, "context-admitted");
  } finally {
    coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
