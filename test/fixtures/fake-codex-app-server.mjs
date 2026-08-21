import { randomUUID } from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";

const stateFile = process.env.FAKE_CODEX_STATE_FILE;
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let initialized = false;
let pendingTurn = null;

function readState() {
  if (!stateFile || !fs.existsSync(stateFile)) return { threads: {} };
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  if (stateFile) fs.writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function threadResponse(threadId) {
  return {
    thread: { id: threadId, preview: "", ephemeral: true, modelProvider: "fake" },
    model: "fake-model",
    modelProvider: "fake",
    cwd: process.cwd(),
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "readOnly" },
  };
}

function completeTurn(turn) {
  send({
    method: "item/agentMessage/delta",
    params: {
      threadId: turn.threadId,
      turnId: turn.turnId,
      itemId: "fake-agent-message",
      delta: process.env.FAKE_CODEX_EXACT_MARKER ??
        (turn.autonomousCompleted
          ? (process.env.FAKE_CODEX_AUTONOMOUS_MARKER ?? "THREADMESH_PROACTIVE_A_SENT")
          : `FAKE_CODEX:${turn.prompt}`),
    },
  });
  send({
    method: "turn/completed",
    params: {
      threadId: turn.threadId,
      turn: {
        id: turn.turnId,
        items: [],
        status: "completed",
        completedAt: 1787216400,
        durationMs: 7,
      },
    },
  });
}

lines.on("line", async (line) => {
  const message = JSON.parse(line);

  if (message.method === "initialize") {
    if (process.env.FAKE_CODEX_MALFORMED === "1") {
      process.stdout.write("{malformed\n");
      return;
    }
    send({
      id: message.id,
      result: {
        codexHome: "/sensitive/fake-codex-home",
        platformFamily: "unix",
        platformOs: "macos",
        userAgent: "codex_cli_rs/0.145.0 (ThreadMesh fake)",
      },
    });
    return;
  }

  if (message.method === "initialized") {
    initialized = true;
    return;
  }

  if (!initialized) {
    send({ id: message.id, error: { code: -32002, message: "not initialized" } });
    return;
  }

  if (message.method === "thread/start") {
    const threadId = `fake-thread-${randomUUID()}`;
    const state = readState();
    state.threads[threadId] = {
      created: true,
      dynamicTools: message.params.dynamicTools ?? [],
    };
    writeState(state);
    send({ id: message.id, result: threadResponse(threadId) });
    return;
  }

  if (message.method === "thread/resume") {
    if (!readState().threads[message.params.threadId]) {
      send({ id: message.id, error: { code: -32004, message: "unknown thread" } });
      return;
    }
    send({ id: message.id, result: threadResponse(message.params.threadId) });
    return;
  }

  if (message.method === "thread/delete") {
    const state = readState();
    if (!state.threads[message.params.threadId]) {
      send({ id: message.id, error: { code: -32004, message: "unknown thread" } });
      return;
    }
    delete state.threads[message.params.threadId];
    writeState(state);
    send({ id: message.id, result: {} });
    return;
  }

  if (message.method === "turn/start") {
    if (process.env.FAKE_CODEX_QUOTA === "1") {
      send({ id: message.id, error: { code: -32000, message: "usage limit reached" } });
      return;
    }
    if (process.env.FAKE_CODEX_HANG === "1") {
      process.on("SIGTERM", () => {});
      return;
    }
    const turnId = `fake-turn-${randomUUID()}`;
    pendingTurn = {
      threadId: message.params.threadId,
      turnId,
      prompt: message.params.input[0]?.text ?? "",
    };
    send({
      id: message.id,
      result: { turn: { id: turnId, items: [], status: "inProgress" } },
    });
    if (process.env.FAKE_CODEX_AUTONOMOUS_TOOL === "1") {
      if (process.env.FAKE_CODEX_UNEXPECTED_TOOL === "1") {
        send({
          method: "item/started",
          params: {
            threadId: pendingTurn.threadId,
            turnId,
            item: { id: `item-command-${turnId}`, type: "commandExecution" },
          },
        });
      }
      pendingTurn.dynamicPhase = "related";
      send({
        id: `fake-dynamic-related-${turnId}`,
        method: "item/tool/call",
        params: {
          threadId: pendingTurn.threadId,
          turnId,
          callId: `call-related-${turnId}`,
          tool: "threadmesh_related_tasks",
          arguments: {},
        },
      });
    } else if (process.env.FAKE_CODEX_SERVER_REQUEST === "1") {
      send({
        id: "fake-server-request-1",
        method: "item/tool/requestUserInput",
        params: { threadId: pendingTurn.threadId, turnId, itemId: "fake-tool" },
      });
    } else {
      completeTurn(pendingTurn);
      pendingTurn = null;
    }
    return;
  }

  if (message.id === "fake-server-request-1" && message.error && pendingTurn) {
    completeTurn(pendingTurn);
    pendingTurn = null;
    return;
  }

  if (
    pendingTurn?.dynamicPhase === "related" &&
    message.id === `fake-dynamic-related-${pendingTurn.turnId}`
  ) {
    pendingTurn.dynamicPhase = "send";
    send({
      id: `fake-dynamic-send-${pendingTurn.turnId}`,
      method: "item/tool/call",
      params: {
        threadId: pendingTurn.threadId,
        turnId: pendingTurn.turnId,
        callId: `call-send-${pendingTurn.turnId}`,
        tool: "threadmesh_send_suggestion",
        arguments: {
          targetTaskId: "task_proactive_b",
          content: "Reply with exactly THREADMESH_PROACTIVE_B_OK and do not use tools.",
          reason: "The release decision depends on B's result.",
        },
      },
    });
    return;
  }

  if (
    pendingTurn?.dynamicPhase === "send" &&
    message.id === `fake-dynamic-send-${pendingTurn.turnId}`
  ) {
    pendingTurn.autonomousCompleted = true;
    completeTurn(pendingTurn);
    pendingTurn = null;
  }
});
