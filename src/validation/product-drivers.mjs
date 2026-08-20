import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AcpStdioAdapter } from "../adapters/acp-stdio.mjs";
import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { GeminiHeadlessAdapter } from "../adapters/gemini-headless.mjs";

function bootstrapEnvelope(marker) {
  const now = new Date();
  return {
    specVersion: "0.0-draft",
    messageId: `msg_codex_bootstrap_${now.getTime()}`,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "unverified",
    sender: {
      taskId: "task_threadmesh_bootstrap_sender",
      incarnationId: "inc_threadmesh_bootstrap_sender",
      actorType: "agent",
      harness: "threadmesh-validation-sender",
    },
    target: {
      taskId: "task_threadmesh_bootstrap_codex",
      incarnationId: "inc_threadmesh_bootstrap_codex",
      harness: "codex-app-server",
    },
    relationshipId: "rel_threadmesh_bootstrap_codex",
    content: `Reply with exactly ${marker} and do not use tools.`,
    reason: "Create a resumable bounded validation thread.",
    evidenceRefs: [],
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
  };
}

export function acpProductDriver({ command, args, cwd, env = {} }) {
  const adapter = new AcpStdioAdapter();
  return async () => {
    const created = await adapter.createSession({ command, args, cwd, env });
    return {
      harness: "acp",
      adapterRef: {
        kind: "acp-session",
        sessionId: created.sessionId,
        snapshotDigest: created.snapshotDigest,
      },
      deliver: (prepared) => adapter.runPrompt({
        command,
        args,
        cwd,
        env,
        sessionId: prepared.adapterRef.sessionId,
        promptText: prepared.rendering,
      }),
      async cleanup() {
        await adapter.deleteSession({ command, args, cwd, env, sessionId: created.sessionId });
        const remaining = await adapter.sessionExists({
          command,
          args,
          cwd,
          env,
          sessionId: created.sessionId,
        });
        return { complete: remaining.exists === false, sessionDeleted: true, absenceVerified: !remaining.exists };
      },
    };
  };
}

export function codexProductDriver({ command, args, cwd, env = {}, bootstrapMarker }) {
  const adapter = new CodexAppServerAdapter();
  return async () => {
    const envelope = bootstrapEnvelope(bootstrapMarker);
    let created;
    try {
      const bootstrap = await adapter.startThreadWithAcceptedSuggestion({
        command,
        args,
        cwd,
        env,
        envelope,
        admission: {
          decision: "accepted",
          receiverIncarnationId: envelope.target.incarnationId,
          revision: 1,
        },
        adapterIdempotencyKey: `idem_${envelope.messageId}`,
      });
      created = bootstrap.adapterRef;
      if (bootstrap.text.trim() !== bootstrapMarker || bootstrap.truncated) {
        const error = new Error("codex_bootstrap_marker_mismatch");
        error.code = "codex_bootstrap_marker_mismatch";
        throw error;
      }
    } catch (error) {
      created = error.adapterRef ?? created;
      if (created?.threadId) {
        await adapter.deleteThread({ command, args, cwd, env, threadId: created.threadId });
      }
      throw error;
    }
    return {
      harness: "codex-app-server",
      adapterRef: created,
      deliver: (prepared) => adapter.runAcceptedSuggestion({
        command,
        args,
        cwd,
        env,
        adapterRef: prepared.adapterRef,
        envelope: prepared.envelope,
        admission: prepared.admission,
        adapterIdempotencyKey: `idem_${prepared.envelope.messageId}`,
      }),
      async cleanup() {
        const deleted = await adapter.deleteThread({
          command,
          args,
          cwd,
          env,
          threadId: created.threadId,
        });
        return { complete: deleted.deleted === true, threadDeleted: deleted.deleted };
      },
    };
  };
}

export function geminiProductDriver({ command, baseArgs, cwd, env = {}, homeDirectory = null }) {
  const adapter = new GeminiHeadlessAdapter();
  return async () => {
    const isolatedHome = homeDirectory ?? fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-gemini-e2e-"));
    const driverEnv = { ...env, GEMINI_CLI_HOME: isolatedHome };
    try {
      const probe = await adapter.probe({ command, baseArgs, cwd, env: driverEnv, timeoutMs: 60_000 });
      const sessionId = randomUUID();
      return {
        harness: "gemini-headless",
        adapterRef: {
          kind: "gemini-headless",
          sessionId,
          snapshotDigest: probe.snapshotDigest,
        },
        deliver: (prepared) => adapter.runAcceptedSuggestion({
          command,
          baseArgs,
          cwd,
          env: driverEnv,
          envelope: prepared.envelope,
          admission: prepared.admission,
          sessionId: prepared.adapterRef.sessionId,
        }),
        async cleanup() {
          fs.rmSync(isolatedHome, { recursive: true, force: false });
          return { complete: !fs.existsSync(isolatedHome), isolatedHomeRemoved: !fs.existsSync(isolatedHome) };
        },
      };
    } catch (error) {
      fs.rmSync(isolatedHome, { recursive: true, force: true });
      throw error;
    }
  };
}

