import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Readable, Writable } from "node:stream";

import * as acp from "@agentclientprotocol/sdk";

const sessions = new Set();
const sentinels = new Map();
const loadedSessions = new Set();
const stateFile = process.env.FAKE_ACP_STATE_FILE;

function readState() {
  if (!stateFile || !fs.existsSync(stateFile)) return {};
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
}
const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin),
);

const app = acp
  .agent({ name: "threadmesh-fake-agent" })
  .onRequest(acp.methods.agent.initialize, ({ params }) => ({
    protocolVersion: Math.min(params.protocolVersion, acp.PROTOCOL_VERSION),
    agentCapabilities: {
      loadSession: true,
      promptCapabilities: { image: false, audio: false },
      sessionCapabilities: { list: {}, delete: {} },
    },
    authMethods: [],
    agentInfo: { name: "threadmesh-fake-agent", version: "1.0.0" },
  }))
  .onRequest(acp.methods.agent.session.new, () => {
    const sessionId = `fake-${randomUUID()}`;
    const sentinel = `sentinel-${randomUUID()}`;
    sessions.add(sessionId);
    sentinels.set(sessionId, sentinel);
    const state = readState();
    state[sessionId] = { sentinel };
    writeState(state);
    return { sessionId, _meta: { sentinel } };
  })
  .onRequest(acp.methods.agent.session.load, async ({ params, client }) => {
    const record = readState()[params.sessionId];
    if (!record) throw new Error("unknown persisted session");
    sessions.add(params.sessionId);
    sentinels.set(params.sessionId, record.sentinel);
    loadedSessions.add(params.sessionId);
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `REPLAY:${record.sentinel}:` },
      },
    });
    return {};
  })
  .onRequest(acp.methods.agent.session.list, () => ({
    sessions: Object.keys(readState()).map((sessionId) => ({
      sessionId,
      cwd: process.cwd(),
    })),
  }))
  .onRequest(acp.methods.agent.session.delete, ({ params }) => {
    const state = readState();
    if (!state[params.sessionId]) throw new Error("unknown persisted session");
    delete state[params.sessionId];
    writeState(state);
    sessions.delete(params.sessionId);
    sentinels.delete(params.sessionId);
    loadedSessions.delete(params.sessionId);
    return {};
  })
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    if (!sessions.has(params.sessionId)) throw new Error("unknown session");
    if (process.env.FAKE_ACP_QUOTA === "1") {
      // A generic Error is intentionally redacted to "Internal error" by the
      // SDK. Carry the fixture's quota signal in JSON-RPC, not a racy stderr log.
      throw new acp.RequestError(-32000, "billing cycle quota exhausted");
    }
    if (process.env.FAKE_ACP_HANG === "1") {
      process.on("SIGTERM", () => {});
      await new Promise(() => {});
    }
    let permissionPrefix = "";
    if (process.env.FAKE_ACP_PERMISSION === "1") {
      const response = await client.request(acp.methods.client.session.requestPermission, {
        sessionId: params.sessionId,
        toolCall: { toolCallId: "fake-tool-1", title: "Fake sensitive operation" },
        options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
      });
      permissionPrefix = response.outcome.outcome === "cancelled" ? "PERMISSION_CANCELLED:" : "";
    }
    if (process.env.FAKE_ACP_EXACT_MARKER) {
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: process.env.FAKE_ACP_EXACT_MARKER },
        },
      });
      return { stopReason: "end_turn" };
    }
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: `FAKE_ACP:${
            loadedSessions.has(params.sessionId)
              ? `RESTORED:${sentinels.get(params.sessionId)}:`
              : ""
          }${permissionPrefix}`,
        },
      },
    });
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: params.prompt[0]?.text ?? "" },
      },
    });
    return { stopReason: "end_turn" };
  });

const connection = app.connect(stream);
await connection.closed;
