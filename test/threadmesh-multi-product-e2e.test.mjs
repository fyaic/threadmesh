import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AcpStdioAdapter } from "../src/adapters/acp-stdio.mjs";
import { CodexAppServerAdapter } from "../src/adapters/codex-app-server.mjs";
import { GeminiHeadlessAdapter } from "../src/adapters/gemini-headless.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeAcp = path.join(root, "test", "fixtures", "fake-acp-agent.mjs");
const fakeCodex = path.join(root, "test", "fixtures", "fake-codex-app-server.mjs");
const fakeGemini = path.join(root, "test", "fixtures", "fake-gemini-cli.mjs");
const owner = { kind: "user", principalId: "owner" };
const clock = () => Date.parse("2026-08-20T09:00:00Z");

function grant(suffix, harness) {
  return {
    specVersion: "0.0-draft",
    grantId: `grant_${suffix}`,
    grantVersion: 1,
    relationshipId: `rel_${suffix}`,
    relationshipType: "dependency",
    source: { taskId: `task_sender_${suffix}`, incarnationId: `inc_sender_${suffix}` },
    target: { taskId: `task_receiver_${suffix}`, incarnationId: `inc_receiver_${suffix}` },
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: "2026-08-20T08:00:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
    _harness: harness,
  };
}

function envelope(suffix, harness) {
  return {
    specVersion: "0.0-draft",
    messageId: `msg_${suffix}`,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "evidence-referenced",
    sender: {
      taskId: `task_sender_${suffix}`,
      incarnationId: `inc_sender_${suffix}`,
      actorType: "agent",
      harness: "mock-sender",
    },
    target: {
      taskId: `task_receiver_${suffix}`,
      incarnationId: `inc_receiver_${suffix}`,
      harness,
    },
    relationshipId: `rel_${suffix}`,
    content: `Shared accepted suggestion for ${harness}.`,
    reason: "The receiver depends on the sender result.",
    evidenceRefs: [`artifact://sender/${suffix}@1`],
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: "2026-08-20T09:00:00Z",
    expiresAt: "2026-08-20T09:10:00Z",
  };
}

async function productCase(kind, directory) {
  if (kind === "acp-session") {
    const adapter = new AcpStdioAdapter();
    const env = { FAKE_ACP_STATE_FILE: path.join(directory, "acp.json") };
    const created = await adapter.createSession({
      command: process.execPath,
      args: [fakeAcp],
      cwd: root,
      env,
    });
    return {
      harness: "acp",
      adapterRef: {
        kind,
        sessionId: created.sessionId,
        snapshotDigest: created.snapshotDigest,
      },
      deliver: (prepared) => adapter.runPrompt({
        command: process.execPath,
        args: [fakeAcp],
        cwd: root,
        env,
        sessionId: prepared.adapterRef.sessionId,
        promptText: prepared.rendering,
      }),
      projectedKeys: ["kind", "sessionId", "snapshotDigest", "stopReason"],
    };
  }
  if (kind === "codex-app-server") {
    const adapter = new CodexAppServerAdapter();
    const env = { FAKE_CODEX_STATE_FILE: path.join(directory, "codex.json") };
    const created = await adapter.createThread({
      command: process.execPath,
      args: [fakeCodex],
      cwd: root,
      env,
    });
    return {
      harness: "codex-app-server",
      adapterRef: created,
      deliver: (prepared) => adapter.runAcceptedSuggestion({
        command: process.execPath,
        args: [fakeCodex],
        cwd: root,
        env,
        adapterRef: prepared.adapterRef,
        envelope: prepared.envelope,
        admission: prepared.admission,
        adapterIdempotencyKey: `idem_${prepared.envelope.messageId}`,
      }),
      projectedKeys: ["kind", "snapshotDigest", "threadId", "turnId", "turnStatus"],
    };
  }
  const adapter = new GeminiHeadlessAdapter();
  const probe = await adapter.probe({
    command: process.execPath,
    baseArgs: [fakeGemini],
    cwd: root,
  });
  const sessionId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  return {
    harness: "gemini-headless",
    adapterRef: {
      kind: "gemini-headless",
      sessionId,
      snapshotDigest: probe.snapshotDigest,
    },
    deliver: (prepared) => adapter.runAcceptedSuggestion({
      command: process.execPath,
      baseArgs: [fakeGemini],
      cwd: root,
      envelope: prepared.envelope,
      admission: prepared.admission,
      sessionId: prepared.adapterRef.sessionId,
    }),
    projectedKeys: ["exitCode", "kind", "sessionId", "snapshotDigest", "toolUseCount"],
  };
}

test("admits the same accepted suggestion through ACP, Codex, and Gemini products", async (t) => {
  for (const kind of ["acp-session", "codex-app-server", "gemini-headless"]) {
    await t.test(kind, async () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), `threadmesh-${kind}-`));
      const coordinator = new SqliteCoordinator({ clock });
      try {
        const product = await productCase(kind, directory);
        const suffix = kind.replaceAll("-", "_");
        const grantValue = grant(suffix, product.harness);
        delete grantValue._harness;
        const sender = {
          kind: "task",
          taskId: `task_sender_${suffix}`,
          incarnationId: `inc_sender_${suffix}`,
        };
        const receiver = {
          kind: "task",
          taskId: `task_receiver_${suffix}`,
          incarnationId: `inc_receiver_${suffix}`,
        };
        coordinator.registerTask(
          {
            taskId: sender.taskId,
            incarnationId: sender.incarnationId,
            harness: "mock-sender",
          },
          owner,
        );
        coordinator.registerTask(
          {
            taskId: receiver.taskId,
            incarnationId: receiver.incarnationId,
            harness: product.harness,
            adapterRef: product.adapterRef,
          },
          owner,
        );
        coordinator.issueGrant(
          grantValue,
          {
            decisionId: `decision_${suffix}`,
            authenticationId: `authn_${suffix}`,
            decidedAt: "2026-08-20T08:00:00Z",
          },
          owner,
        );
        const message = envelope(suffix, product.harness);
        coordinator.submit(message, sender);
        coordinator.respond(sender.incarnationId, message.messageId, "accepted", 0, receiver);
        const prepared = coordinator.prepareContextAdmission(
          sender.incarnationId,
          message.messageId,
          1,
          receiver,
        );
        assert.deepEqual(prepared.envelope, message);
        assert.deepEqual(prepared.admission, {
          decision: "accepted",
          receiverIncarnationId: receiver.incarnationId,
          revision: 1,
        });
        const result = await product.deliver(prepared);
        assert.match(result.text, new RegExp(`Shared accepted suggestion for ${product.harness}`));
        assert.throws(
          () => coordinator.confirmContextAdmission(
            sender.incarnationId,
            message.messageId,
            1,
            prepared.admissionToken,
            { ...result.evidence, snapshotDigest: "sha256:wrong" },
            receiver,
          ),
          { code: "threadmesh_adapter_evidence_mismatch" },
        );
        const admitted = coordinator.confirmContextAdmission(
          sender.incarnationId,
          message.messageId,
          1,
          prepared.admissionToken,
          result.evidence,
          receiver,
        );
        assert.equal(admitted.delivery, "context-admitted");
        const admittedEvent = coordinator
          .auditEvents(sender.incarnationId, message.messageId, receiver)
          .find((event) => event.eventType === "context-admitted");
        assert.deepEqual(
          Object.keys(admittedEvent.detail.adapterEvidence).sort(),
          [...product.projectedKeys].sort(),
        );
      } finally {
        coordinator.close();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
