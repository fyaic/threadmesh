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
  MOCK_HARNESS_PROFILES,
  PullMailboxHarness,
  ThreadMeshJsonRpcClient,
} from "../src/client/jsonrpc-client.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";
import { assertProtocolObject } from "../src/protocol-validator.mjs";

const NOW = Date.parse("2026-08-20T09:00:00Z");
const A = { taskId: "task_conformance_a", incarnationId: "inc_conformance_a01" };
const B = { taskId: "task_conformance_b", incarnationId: "inc_conformance_b01" };
const ADVISORY = {
  relationshipId: "rel_conformance_advisory",
  grantId: "grant_conformance_advisory",
};
const CONTROL = {
  relationshipId: "rel_conformance_control",
  grantId: "grant_conformance_control",
};

const credentials = [
  ["owner-token", "authn_conformance_owner01", { kind: "user", principalId: "owner" }],
  ["task-a-token", "authn_conformance_task_a01", { kind: "task", ...A }],
  ["task-b-token", "authn_conformance_task_b01", { kind: "task", ...B }],
].map(([token, authenticationId, principal]) => ({
  token,
  context: {
    specVersion: "0.0-draft",
    authenticationId,
    mechanism: "local-static-token",
    principal,
    authenticatedAt: "2026-08-20T08:00:00Z",
  },
}));

function createApi(filename) {
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
  const client = (authorization, idPrefix) => new ThreadMeshJsonRpcClient({
    send,
    authorization: `Bearer ${authorization}`,
    idPrefix,
  });
  return {
    coordinator,
    binding,
    owner: client("owner-token", "owner"),
    a: client("task-a-token", "task-a"),
    b: client("task-b-token", "task-b"),
  };
}

function grant({ relationshipId, grantId, stateChanging = false }) {
  return {
    specVersion: "0.0-draft",
    grantId,
    grantVersion: 1,
    relationshipId,
    relationshipType: stateChanging ? "supervisor" : "peer",
    source: A,
    target: B,
    allowedIntents: stateChanging
      ? ["steer", "interrupt"]
      : ["notify", "suggest"],
    allowedDeliveryModes: stateChanging
      ? ["active-steer", "interrupt-request"]
      : ["side-channel", "checkpoint-offer"],
    summaryVisibility: stateChanging ? "none" : "coordination",
    structuredGateResponses: false,
    createdAt: "2026-08-20T09:00:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
  };
}

function envelope(messageId, intent, options = {}) {
  const mode = {
    notify: "side-channel",
    suggest: "checkpoint-offer",
    steer: "active-steer",
    interrupt: "interrupt-request",
  }[intent];
  const stateChanging = ["steer", "interrupt"].includes(intent);
  return {
    specVersion: "0.0-draft",
    messageId,
    messageType: stateChanging ? "action-request" : intent === "notify"
      ? "state-update"
      : "suggestion",
    intent,
    claimStatus: "sender-asserted",
    sender: {
      ...A,
      actorType: "agent",
      harness: MOCK_HARNESS_PROFILES.eventWatcher.harness.name,
    },
    target: {
      ...B,
      harness: MOCK_HARNESS_PROFILES.pullMailbox.harness.name,
    },
    relationshipId: stateChanging
      ? CONTROL.relationshipId
      : ADVISORY.relationshipId,
    content: `${intent} conformance payload for ${messageId}`,
    reason: "Exercise one deterministic conformance transition.",
    ...(stateChanging
      ? {
          freshness: options.freshness ?? {
            expectedRunId: "run_conformance_b01",
            expectedObjectiveVersion: 4,
            expectedCheckpoint: "checkpoint-conformance-b-4",
          },
        }
      : {}),
    delivery: { requestedMode: mode, requiresDisposition: true },
    createdAt: "2026-08-20T09:00:00Z",
    expiresAt: "2026-08-20T09:30:00Z",
  };
}

function bootstrap(api) {
  api.owner.call("tasks.register", {
    task: {
      ...A,
      harness: MOCK_HARNESS_PROFILES.eventWatcher.harness.name,
      state: "running",
    },
    idempotencyKey: "idem_conformance_register_a",
  });
  api.owner.call("tasks.register", {
    task: {
      ...B,
      harness: MOCK_HARNESS_PROFILES.pullMailbox.harness.name,
      state: "running",
      runtime: {
        runId: "run_conformance_b01",
        objectiveVersion: 4,
        checkpoint: "checkpoint-conformance-b-4",
      },
    },
    idempotencyKey: "idem_conformance_register_b",
  });
  for (const definition of [
    grant({ ...ADVISORY }),
    grant({ ...CONTROL, stateChanging: true }),
  ]) {
    api.owner.call("relationships.grant", {
      grant: definition,
      decision: { decisionId: `decision_${definition.relationshipId}` },
      idempotencyKey: `idem_${definition.grantId}`,
    });
  }
  api.b.call("tasks.publishSummary", {
    summary: {
      specVersion: "0.0-draft",
      summaryId: "sum_conformance_b01",
      summaryVersion: 1,
      task: {
        ...B,
        harness: MOCK_HARNESS_PROFILES.pullMailbox.harness.name,
      },
      projection: {
        relationshipId: ADVISORY.relationshipId,
        grantId: ADVISORY.grantId,
        grantVersion: 1,
        summaryVisibility: "coordination",
      },
      state: "running",
      blockerHint: "Waiting at conformance checkpoint four.",
      coordination: {
        intents: ["notify", "suggest"],
        deliveryModes: ["side-channel", "checkpoint-offer"],
      },
      sensitivity: "relationship-scoped",
      audience: {
        visibility: "relationship-scoped",
        relationshipIds: [ADVISORY.relationshipId],
      },
      updatedAt: "2026-08-20T09:00:00Z",
    },
    expectedPreviousVersion: null,
    idempotencyKey: "idem_conformance_summary_b01",
  });
}

function send(api, value) {
  return api.a.call("messages.send", {
    envelope: value,
    idempotencyKey: `idem_send_${value.messageId}`,
  });
}

function assertAudit(watcher, messageId, expected) {
  const events = watcher.audit(A.incarnationId, messageId);
  assert.deepEqual(events.map((event) => event.eventType), expected);
  for (let index = 1; index < events.length; index += 1) {
    assert.ok(events[index].revision >= events[index - 1].revision);
  }
}

test("runs the deterministic two-profile M1 conformance matrix and cleans up", () => {
  for (const profile of Object.values(MOCK_HARNESS_PROFILES)) {
    assert.equal(assertProtocolObject("capabilities", profile), profile);
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-conformance-"));
  const filename = path.join(directory, "coordinator.sqlite");
  const api = createApi(filename);
  const watcher = new EventWatchingHarness(api.a, A);
  const mailbox = new PullMailboxHarness(api.b, B);
  try {
    bootstrap(api);

    const related = watcher.summary(B, ADVISORY.relationshipId);
    assert.equal(related.summaryId, "sum_conformance_b01");
    assert.throws(
      () => watcher.summary(B, CONTROL.relationshipId),
      { code: "threadmesh_task_summary_not_found" },
    );
    const globalList = api.binding.handle(
      { jsonrpc: "2.0", id: "list-all", method: "tasks.list", params: {} },
      { authorization: "Bearer task-a-token" },
    );
    assert.equal(globalList.error.data.threadmeshCode, "threadmesh_jsonrpc_invalid");

    const notification = envelope("msg_conformance_notify01", "notify");
    const firstNotification = send(api, notification);
    const replayedNotification = send(api, notification);
    assert.equal(firstNotification.operationReplay, false);
    assert.equal(replayedNotification.operationReplay, true);
    const sideChannel = mailbox.sideChannelNext();
    assert.equal(sideChannel.message.envelope.messageId, notification.messageId);
    assert.equal(sideChannel.modelVisible, false);
    const notificationSnapshot = watcher.inspect(
      A.incarnationId,
      notification.messageId,
    );
    assert.equal(notificationSnapshot.adapterSubmission, null);
    assert.equal(notificationSnapshot.disposition.delivery, "durably-received");
    assertAudit(watcher, notification.messageId, ["message-durably-received"]);
    let cursor = sideChannel.message.cursor;

    const suggestionDecisions = ["accepted", "rejected", "deferred"];
    for (const decision of suggestionDecisions) {
      const message = envelope(`msg_conformance_${decision}01`, "suggest");
      send(api, message);
      const handled = mailbox.decideNext(decision, { afterCursor: cursor });
      assert.equal(handled.page.messages[0].envelope.messageId, message.messageId);
      assert.equal(handled.decision.value.decision, decision);
      cursor = handled.page.messages[0].cursor;
      assertAudit(watcher, message.messageId, [
        "message-durably-received",
        "mailbox-claimed",
        "receiver-decided",
      ]);
      const rendered = watcher.inspect(A.incarnationId, message.messageId);
      assert.equal(rendered.provenance.authorship, "peer-authored");
      assert.equal(rendered.provenance.source.harness, "mock-event-watcher");
      assert.equal(rendered.provenance.target.harness, "mock-pull-mailbox");
      assert.equal(rendered.disposition.decision, decision);
    }

    for (const intent of ["steer", "interrupt"]) {
      const stale = envelope(`msg_conformance_stale_${intent}01`, intent, {
        freshness: {
          expectedRunId: "run_conformance_b01",
          expectedObjectiveVersion: 3,
        },
      });
      assert.throws(() => send(api, stale), { code: "threadmesh_policy_denied" });

      const unsupported = envelope(`msg_conformance_unsupported_${intent}01`, intent);
      send(api, unsupported);
      const page = mailbox.next({ afterCursor: cursor, limit: 20 });
      const pending = page.messages.find(
        (item) => item.envelope.messageId === unsupported.messageId,
      );
      assert.ok(pending);
      const result = mailbox.respond(pending, "unsupported", "unsupported-intent");
      assert.equal(result.value.decision, "unsupported");
      cursor = Math.max(cursor, ...page.messages.map((item) => item.cursor));
      assertAudit(watcher, unsupported.messageId, [
        "message-durably-received",
        "receiver-decided",
      ]);
    }

    const queued = envelope("msg_conformance_revoke01", "steer");
    send(api, queued);
    const revoked = api.owner.call("relationships.revoke", {
      grantId: CONTROL.grantId,
      expectedGrantVersion: 1,
      idempotencyKey: "idem_conformance_revoke_control",
    });
    assert.equal(revoked.value.invalidatedMessages, 1);
    assert.equal(
      watcher.disposition(A.incarnationId, queued.messageId).decision,
      "revoked",
    );
    assertAudit(watcher, queued.messageId, [
      "message-durably-received",
      "authorization-revoked",
    ]);
    assert.equal(
      mailbox.next({ afterCursor: cursor, limit: 100 }).messages.some(
        (item) => item.envelope.messageId === queued.messageId,
      ),
      false,
    );
  } finally {
    api.coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
    assert.equal(fs.existsSync(directory), false);
  }
});
