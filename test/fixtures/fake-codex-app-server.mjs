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

function storedTurns(threadId) {
  return readState().threads[threadId]?.turns ?? [];
}

function threadResponse(threadId, { includeTurns = false } = {}) {
  return {
    thread: {
      id: threadId,
      preview: "",
      ephemeral: true,
      modelProvider: "fake",
      status: { type: "notLoaded" },
      turns: includeTurns ? storedTurns(threadId) : [],
    },
    model: "fake-model",
    modelProvider: "fake",
    cwd: process.cwd(),
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "readOnly" },
  };
}

function persistTurn(turn, status = "inProgress") {
  const state = readState();
  const thread = state.threads[turn.threadId];
  if (!thread) return;
  thread.turns ??= [];
  const existing = thread.turns.find((entry) => entry.id === turn.turnId);
  const stored = {
    id: turn.turnId,
    status,
    items: [{
      id: `user-${turn.turnId}`,
      type: "userMessage",
      content: [{ type: "text", text: turn.prompt }],
      clientId: turn.clientUserMessageId ?? null,
    }],
    error: null,
  };
  if (existing) Object.assign(existing, stored);
  else thread.turns.push(stored);
  writeState(state);
}

function completeTurn(turn) {
  persistTurn(turn, "completed");
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
        completedAt: JSON.parse(process.env.FAKE_CODEX_COMPLETED_AT ?? "1787216400"),
        durationMs: JSON.parse(process.env.FAKE_CODEX_DURATION_MS ?? "7"),
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
      turns: [],
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

  if (message.method === "thread/read") {
    if (process.env.FAKE_CODEX_THREAD_READ_ERROR_CODE) {
      send({
        id: message.id,
        error: {
          code: Number(process.env.FAKE_CODEX_THREAD_READ_ERROR_CODE),
          message: "different application error",
        },
      });
      return;
    }
    if (process.env.FAKE_CODEX_THREAD_READ_ERROR === "1") {
      send({ id: message.id, error: { code: -32000, message: "storage unavailable" } });
      return;
    }
    if (!readState().threads[message.params.threadId]) {
      if (process.env.FAKE_CODEX_THREAD_READ_REAL_NOT_LOADED === "1") {
        const observedThreadId = process.env.FAKE_CODEX_THREAD_READ_WRONG_ID === "1"
          ? "00000000-0000-4000-8000-000000000000"
          : message.params.threadId;
        send({
          id: message.id,
          error: { code: -32600, message: `thread not loaded: ${observedThreadId}` },
        });
      } else if (process.env.FAKE_CODEX_THREAD_READ_REAL_NOT_FOUND === "1") {
        const suffix = process.env.FAKE_CODEX_THREAD_READ_NOT_FOUND_WITH_ID === "1"
          ? `: ${message.params.threadId}`
          : "";
        send({
          id: message.id,
          error: { code: -32600, message: `no rollout found for thread id${suffix}` },
        });
      } else {
        send({ id: message.id, error: { code: -32004, message: "unknown thread" } });
      }
      return;
    }
    if (process.env.FAKE_CODEX_THREAD_READ_MALFORMED === "1") {
      send({ id: message.id, result: { thread: { id: 17 } } });
      return;
    }
    send({
      id: message.id,
      result: threadResponse(message.params.threadId, {
        includeTurns: message.params.includeTurns === true,
      }),
    });
    return;
  }

  if (message.method === "thread/turns/list") {
    if (!readState().threads[message.params.threadId]) {
      send({ id: message.id, error: { code: -32004, message: "unknown thread" } });
      return;
    }
    let turns = [...storedTurns(message.params.threadId)].reverse();
    if (process.env.FAKE_CODEX_TURN_LIST_MISMATCH === "1") turns = turns.slice(1);
    const offset = message.params.cursor ? Number(message.params.cursor) : 0;
    const requested = Number.isInteger(message.params.limit) ? message.params.limit : 50;
    const forced = Number(process.env.FAKE_CODEX_TURN_PAGE_SIZE ?? requested);
    const limit = Math.max(1, Math.min(requested, Number.isFinite(forced) ? forced : requested));
    const data = turns.slice(offset, offset + limit);
    const nextOffset = offset + data.length;
    send({
      id: message.id,
      result: {
        data,
        nextCursor: nextOffset < turns.length ? String(nextOffset) : null,
        backwardsCursor: null,
      },
    });
    return;
  }

  if (message.method === "thread/items/list") {
    if (process.env.FAKE_CODEX_ITEMS_UNSUPPORTED === "1") {
      send({ id: message.id, error: { code: -32601, message: "thread/items/list is not supported yet" } });
      return;
    }
    const turn = storedTurns(message.params.threadId).find(
      (entry) => entry.id === message.params.turnId,
    );
    if (!turn) {
      send({ id: message.id, error: { code: -32004, message: "unknown turn" } });
      return;
    }
    send({
      id: message.id,
      result: { data: turn.items ?? [], nextCursor: null },
    });
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
      clientUserMessageId: message.params.clientUserMessageId ?? null,
    };
    persistTurn(pendingTurn);
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
    if (process.env.FAKE_CODEX_AUTONOMOUS_SKIP_SEND === "1") {
      pendingTurn.autonomousCompleted = true;
      completeTurn(pendingTurn);
      pendingTurn = null;
      return;
    }
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
          content: "Verified upstream artifact checksum: sha256:7b6f3d9a0c8e4f12a5d3b1c9e7f6082a4b6d8f0c2e4a6b8d0f1c3e5a7b9d2f4",
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
