import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  StaticTokenAuthenticator,
  ThreadMeshJsonRpcBinding,
} from "../src/bindings/jsonrpc.mjs";
import {
  EventWatchingHarness,
  PullMailboxHarness,
  ThreadMeshJsonRpcClient,
} from "../src/client/jsonrpc-client.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";

const NOW = Date.parse("2026-08-20T09:00:00Z");
const taskA = { taskId: "task_rpc_a", incarnationId: "inc_rpc_task_a01" };
const taskB = { taskId: "task_rpc_b", incarnationId: "inc_rpc_task_b01" };

const credentials = [
  {
    token: "owner-secret",
    context: {
      specVersion: "0.0-draft",
      authenticationId: "authn_owner_local01",
      mechanism: "local-static-token",
      principal: { kind: "user", principalId: "owner" },
      authenticatedAt: "2026-08-20T08:00:00Z",
    },
  },
  {
    token: "task-a-secret",
    context: {
      specVersion: "0.0-draft",
      authenticationId: "authn_task_a_local01",
      mechanism: "local-static-token",
      principal: { kind: "task", ...taskA },
      authenticatedAt: "2026-08-20T08:00:00Z",
    },
  },
  {
    token: "task-b-secret",
    context: {
      specVersion: "0.0-draft",
      authenticationId: "authn_task_b_local01",
      mechanism: "local-static-token",
      principal: { kind: "task", ...taskB },
      authenticatedAt: "2026-08-20T08:00:00Z",
    },
  },
];

function transport(filename) {
  const coordinator = new SqliteCoordinator({ filename, clock: () => NOW });
  const binding = new ThreadMeshJsonRpcBinding({
    coordinator,
    authenticator: new StaticTokenAuthenticator(credentials),
    clock: () => NOW,
  });
  const send = (request, context) =>
    JSON.parse(
      JSON.stringify(
        binding.handle(JSON.parse(JSON.stringify(request)), context),
      ),
    );
  return {
    coordinator,
    owner: new ThreadMeshJsonRpcClient({
      send,
      authorization: "Bearer owner-secret",
      idPrefix: "owner",
    }),
    a: new ThreadMeshJsonRpcClient({
      send,
      authorization: "Bearer task-a-secret",
      idPrefix: "task-a",
    }),
    b: new ThreadMeshJsonRpcClient({
      send,
      authorization: "Bearer task-b-secret",
      idPrefix: "task-b",
    }),
    binding,
  };
}

function proposal() {
  return {
    specVersion: "0.0-draft",
    proposalId: "proposal_rpc_a_b01",
    source: taskA,
    target: taskB,
    relationshipType: "dependency",
    requestedIntents: ["suggest"],
    requestedDeliveryModes: ["checkpoint-offer"],
    requestedSummaryVisibility: "coordination",
    reason: "Task A depends on a result owned by Task B.",
    proposedBy: { actorType: "agent", task: taskA },
    createdAt: "2026-08-20T08:30:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
  };
}

function grantDraft() {
  return {
    specVersion: "0.0-draft",
    grantId: "grant_rpc_a_b01",
    grantVersion: 1,
    relationshipId: "rel_rpc_a_b01",
    relationshipType: "dependency",
    source: taskA,
    target: taskB,
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    summaryVisibility: "coordination",
    structuredGateResponses: false,
    createdAt: "2026-08-20T08:45:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
  };
}

function envelope(messageId = "msg_rpc_a_b01") {
  return {
    specVersion: "0.0-draft",
    messageId,
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "sender-asserted",
    sender: { ...taskA, actorType: "agent", harness: "mock-event" },
    target: { ...taskB, harness: "mock-pull" },
    relationshipId: "rel_rpc_a_b01",
    content: "The dependency result changed; verify revision 10.",
    reason: "The receiver may otherwise use a stale result.",
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: "2026-08-20T09:00:00Z",
    expiresAt: "2026-08-20T09:10:00Z",
  };
}

function bootstrap(api) {
  api.owner.call("tasks.register", {
    task: { ...taskA, harness: "mock-event", state: "running" },
    idempotencyKey: "idem_register_rpc_a",
  });
  api.owner.call("tasks.register", {
    task: { ...taskB, harness: "mock-pull", state: "idle" },
    idempotencyKey: "idem_register_rpc_b",
  });
  api.a.call("relationships.propose", {
    proposal: proposal(),
    idempotencyKey: "idem_proposal_rpc_a_b",
  });
  return api.owner.call("relationships.grant", {
    grant: grantDraft(),
    decision: {
      decisionId: "decision_rpc_a_b01",
      proposalId: "proposal_rpc_a_b01",
    },
    idempotencyKey: "idem_grant_rpc_a_b",
  });
}

test("runs two mock harness profiles through JSON-RPC and survives restart", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-rpc-"));
  const filename = path.join(directory, "coordinator.sqlite");
  let api = transport(filename);
  try {
    const granted = bootstrap(api);
    assert.equal(granted.operationReplay, false);
    assert.equal(granted.value.authorization.principal.actorId, "owner");
    assert.match(granted.value.authorization.integrity.digest, /^sha256:[a-f0-9]{64}$/);

    api.a.call("messages.send", {
      envelope: envelope(),
      idempotencyKey: "idem_send_rpc_a_b01",
    });
    api.coordinator.close();

    api = transport(filename);
    const replay = api.owner.call("relationships.grant", {
      grant: grantDraft(),
      decision: {
        decisionId: "decision_rpc_a_b01",
        proposalId: "proposal_rpc_a_b01",
      },
      idempotencyKey: "idem_grant_rpc_a_b",
    });
    assert.equal(replay.operationReplay, true);

    const pull = new PullMailboxHarness(api.b, taskB);
    const handled = pull.acceptNext();
    assert.equal(handled.page.messages.length, 1);
    assert.equal(handled.accepted.value.decision, "accepted");

    const event = new EventWatchingHarness(api.a, taskA);
    const observed = event.observe();
    assert.deepEqual(
      observed.events.map((item) => item.eventType),
      ["message-durably-received", "mailbox-claimed", "receiver-decided"],
    );
    assert.equal(event.disposition(taskA.incarnationId, "msg_rpc_a_b01").decision, "accepted");
  } finally {
    api.coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects payload principal injection and cross-task impersonation", () => {
  const api = transport(":memory:");
  try {
    bootstrap(api);
    const injected = api.binding.handle(
      {
        jsonrpc: "2.0",
        id: "inject-1",
        method: "messages.send",
        params: {
          envelope: envelope(),
          idempotencyKey: "idem_injected_rpc",
          principal: { kind: "task", ...taskA },
        },
      },
      { authorization: "Bearer task-a-secret" },
    );
    assert.equal(injected.error.data.threadmeshCode, "threadmesh_jsonrpc_invalid");
    const responseAsRequest = api.binding.handle(
      {
        jsonrpc: "2.0",
        id: "response-injection-1",
        result: { method: "tasks.get", value: {} },
      },
      { authorization: "Bearer task-a-secret" },
    );
    assert.equal(
      responseAsRequest.error.data.threadmeshCode,
      "threadmesh_jsonrpc_invalid",
    );

    assert.throws(
      () => api.owner.call("tasks.register", {
        task: { ...taskA, harness: "conflicting-harness", state: "running" },
        idempotencyKey: "idem_register_rpc_a",
      }),
      { code: "threadmesh_idempotency_conflict" },
    );

    assert.throws(
      () => api.b.call("messages.send", {
        envelope: envelope("msg_rpc_spoof01"),
        idempotencyKey: "idem_spoof_rpc",
      }),
      { code: "threadmesh_authenticated_principal_mismatch" },
    );
    assert.throws(
      () => api.a.call("relationships.grant", {
        grant: { ...grantDraft(), grantId: "grant_self_issued01" },
        decision: { decisionId: "decision_self_issued01" },
        idempotencyKey: "idem_self_issued_grant",
      }),
      { code: "threadmesh_control_plane_authority_required" },
    );

    const userEnvelope = envelope("msg_rpc_user01");
    userEnvelope.sender = {
      ...userEnvelope.sender,
      actorType: "user",
      actorId: "owner",
    };
    const userSend = api.owner.call("messages.send", {
      envelope: userEnvelope,
      idempotencyKey: "idem_send_rpc_user",
    });
    assert.equal(userSend.value.replay, false);

    const missingAuth = api.binding.handle(
      {
        jsonrpc: "2.0",
        id: "auth-1",
        method: "tasks.get",
        params: { task: taskA },
      },
      {},
    );
    assert.equal(missingAuth.error.code, -32001);
  } finally {
    api.coordinator.close();
  }
});

test("quarantines revoked queued content on the public mailbox path", () => {
  const api = transport(":memory:");
  try {
    bootstrap(api);
    api.a.call("messages.send", {
      envelope: envelope("msg_rpc_revoked01"),
      idempotencyKey: "idem_send_rpc_revoked",
    });
    api.owner.call("relationships.revoke", {
      grantId: "grant_rpc_a_b01",
      expectedGrantVersion: 1,
      idempotencyKey: "idem_revoke_rpc_a_b",
    });
    const page = api.b.call("mailbox.listPending", {
      receiver: taskB,
      afterCursor: 0,
      limit: 10,
    });
    assert.equal(page.messages.length, 0);
    assert.throws(
      () => api.b.call("mailbox.claim", {
        senderIncarnationId: taskA.incarnationId,
        messageId: "msg_rpc_revoked01",
        expectedRevision: 0,
        idempotencyKey: "idem_claim_rpc_revoked",
      }),
      { code: "threadmesh_grant_not_active" },
    );
  } finally {
    api.coordinator.close();
  }
});

test("binds attach, summary projection, and incarnation rotation with CAS", () => {
  const api = transport(":memory:");
  try {
    bootstrap(api);
    const attached = api.b.call("tasks.attach", {
      task: taskB,
      adapterRef: { kind: "mock-pull", endpoint: "local://receiver-b" },
      expectedRevision: 0,
      idempotencyKey: "idem_attach_rpc_b",
    });
    assert.equal(attached.value.revision, 1);
    assert.equal(attached.value.adapterRef.kind, "mock-pull");
    assert.throws(
      () => api.b.call("tasks.attach", {
        task: taskB,
        adapterRef: { kind: "mock-pull", endpoint: "local://stale" },
        expectedRevision: 0,
        idempotencyKey: "idem_attach_rpc_b_stale",
      }),
      { code: "threadmesh_revision_conflict" },
    );

    const summary = {
      specVersion: "0.0-draft",
      summaryId: "sum_rpc_task_b01",
      summaryVersion: 1,
      task: { ...taskB, harness: "mock-pull" },
      projection: {
        relationshipId: "rel_rpc_a_b01",
        grantId: "grant_rpc_a_b01",
        grantVersion: 1,
        summaryVisibility: "coordination",
      },
      state: "idle",
      blockerHint: "Waiting for Task A to consume revision 10.",
      coordination: {
        intents: ["suggest"],
        deliveryModes: ["checkpoint-offer"],
      },
      sensitivity: "relationship-scoped",
      audience: {
        visibility: "relationship-scoped",
        relationshipIds: ["rel_rpc_a_b01"],
      },
      updatedAt: "2026-08-20T09:00:00Z",
    };
    api.b.call("tasks.publishSummary", {
      summary,
      expectedPreviousVersion: null,
      idempotencyKey: "idem_publish_summary_b01",
    });
    assert.equal(
      api.a.call("tasks.getSummary", {
        task: taskB,
        relationshipId: "rel_rpc_a_b01",
      }).summaryId,
      "sum_rpc_task_b01",
    );

    const rotated = api.owner.call("tasks.rotateIncarnation", {
      previous: taskB,
      next: {
        taskId: taskB.taskId,
        incarnationId: "inc_rpc_task_b02",
        harness: "mock-pull-v2",
        state: "idle",
      },
      expectedRevision: 1,
      idempotencyKey: "idem_rotate_rpc_b02",
    });
    assert.equal(rotated.value.previous.revision, 2);
    assert.equal(rotated.value.current.incarnationId, "inc_rpc_task_b02");
    assert.throws(
      () => api.a.call("tasks.getSummary", {
        task: taskB,
        relationshipId: "rel_rpc_a_b01",
      }),
      { code: "threadmesh_task_retired" },
    );
    assert.throws(
      () => api.b.call("mailbox.listPending", {
        receiver: taskB,
        afterCursor: 0,
        limit: 10,
      }),
      { code: "threadmesh_task_retired" },
    );
  } finally {
    api.coordinator.close();
  }
});
