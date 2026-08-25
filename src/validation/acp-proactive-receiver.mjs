import { AcpStdioAdapter } from "../adapters/acp-stdio.mjs";

export function createAcpProactiveReceiverRuntime({
  command,
  args = ["acp"],
  cwd,
  env = {},
  baselineEnv = env,
  receiverEnv = env,
  cleanupEnv = env,
  adapter = new AcpStdioAdapter(),
  timeoutMs = 180_000,
  productId = "codex-proactive-acp",
}) {
  let metadata = null;

  return {
    harness: "acp",
    productId,
    adapterKind: "acp-session",
    evidenceKeys: ["kind", "sessionId", "snapshotDigest", "stopReason"],

    async startBaseline({ marker, instructions }) {
      const created = await adapter.createSession({ command, args, cwd, env: baselineEnv });
      const adapterRef = {
        kind: "acp-session",
        sessionId: created.sessionId,
        snapshotDigest: created.snapshotDigest,
      };
      metadata = {
        protocolVersion: created.protocolVersion,
        agentName: created.agentInfo?.name ?? null,
        agentVersion: created.agentInfo?.version ?? null,
      };
      try {
        const turn = await adapter.runPrompt({
          command,
          args,
          cwd,
          env: baselineEnv,
          sessionId: adapterRef.sessionId,
          expectedSnapshotDigest: adapterRef.snapshotDigest,
          promptText:
            `${instructions}\n\nEstablish the downstream baseline now. ` +
            `Reply with exactly ${marker}. Do not use tools.`,
          timeoutMs,
        });
        return { ...turn, adapterRef };
      } catch (error) {
        error.adapterRef = adapterRef;
        throw error;
      }
    },

    deliver({ prepared }) {
      return adapter.runAcceptedSuggestion({
        command,
        args,
        cwd,
        env: receiverEnv,
        adapterRef: prepared.adapterRef,
        envelope: prepared.envelope,
        admission: prepared.admission,
        timeoutMs,
      });
    },

    async cleanup(adapterRef) {
      const deleted = await adapter.deleteSession({
        command,
        args,
        cwd,
        env: cleanupEnv,
        sessionId: adapterRef.sessionId,
      });
      const remaining = await adapter.sessionExists({
        command,
        args,
        cwd,
        env: cleanupEnv,
        sessionId: adapterRef.sessionId,
      });
      const absenceVerified = remaining.exists === false;
      return {
        complete: deleted.deleted === true && absenceVerified,
        public: {
          bSessionDeleted: deleted.deleted === true,
          bAbsenceVerified: absenceVerified,
        },
      };
    },

    productMetadata() {
      return metadata;
    },
  };
}
