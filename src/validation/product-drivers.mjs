import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AcpStdioAdapter } from "../adapters/acp-stdio.mjs";
import { CodexAppServerAdapter } from "../adapters/codex-app-server.mjs";
import { GeminiHeadlessAdapter } from "../adapters/gemini-headless.mjs";

export function acpProductDriver({ command, args, cwd, env = {} }) {
  const adapter = new AcpStdioAdapter();
  return async () => {
    const created = await adapter.createSession({ command, args, cwd, env });
    return {
      harness: "acp",
      productMetadata: {
        protocolVersion: created.protocolVersion,
        agentName: created.agentInfo?.name ?? null,
        agentVersion: created.agentInfo?.version ?? null,
      },
      adapterRef: {
        kind: "acp-session",
        sessionId: created.sessionId,
        snapshotDigest: created.snapshotDigest,
      },
      deliver: (prepared) => adapter.runAcceptedSuggestion({
        command,
        args,
        cwd,
        env,
        adapterRef: prepared.adapterRef,
        envelope: prepared.envelope,
        admission: prepared.admission,
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
    let created;
    try {
      const bootstrap = await adapter.startValidationThread({
        command,
        args,
        cwd,
        env,
        marker: bootstrapMarker,
        adapterIdempotencyKey: `idem_bootstrap_${randomUUID()}`,
      });
      created = bootstrap.adapterRef;
      if (bootstrap.text !== bootstrapMarker || bootstrap.truncated) {
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
      productMetadata: {
        userAgent: created.userAgent,
        model: created.model,
        modelProvider: created.modelProvider,
      },
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

export function geminiProductDriver({
  command,
  baseArgs,
  cwd,
  env = {},
  temporaryRoot = os.tmpdir(),
}) {
  const adapter = new GeminiHeadlessAdapter();
  return async () => {
    const isolatedHome = fs.mkdtempSync(path.join(temporaryRoot, "threadmesh-gemini-e2e-"));
    const driverEnv = { ...env, GEMINI_CLI_HOME: isolatedHome };
    try {
      const probe = await adapter.probe({ command, baseArgs, cwd, env: driverEnv, timeoutMs: 60_000 });
      const sessionId = randomUUID();
      return {
        harness: "gemini-headless",
        productMetadata: {
          version: probe.version,
          interface: probe.interface,
          approvalMode: probe.approvalMode,
          sandboxRequested: probe.sandboxRequested,
        },
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
          expectedSnapshotDigest: prepared.adapterRef.snapshotDigest,
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
