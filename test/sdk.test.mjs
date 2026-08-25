import assert from "node:assert/strict";
import test from "node:test";

import {
  StaticTokenAuthenticator,
  ThreadMeshJsonRpcBinding,
} from "../src/bindings/jsonrpc.mjs";
import { SqliteCoordinator } from "../src/coordinator/sqlite-coordinator.mjs";
import {
  createThreadMeshClient,
  ThreadMeshClientError,
} from "../src/sdk/index.mjs";

const NOW = Date.parse("2026-08-25T03:00:00Z");
const SOURCE = {
  taskId: "task_sdk_source",
  incarnationId: "inc_sdk_source01",
  harness: "external-example",
};
const TARGET = {
  taskId: "task_sdk_target",
  incarnationId: "inc_sdk_target01",
  harness: "external-example",
};
const RELATIONSHIP_ID = "rel_sdk_dependency01";

const credentials = [
  ["owner-token", "authn_sdk_owner01", { kind: "user", principalId: "owner" }],
  ["source-token", "authn_sdk_source01", {
    kind: "task",
    taskId: SOURCE.taskId,
    incarnationId: SOURCE.incarnationId,
  }],
  ["target-token", "authn_sdk_target01", {
    kind: "task",
    taskId: TARGET.taskId,
    incarnationId: TARGET.incarnationId,
  }],
].map(([token, authenticationId, principal]) => ({
  token,
  context: {
    specVersion: "0.0-draft",
    authenticationId,
    mechanism: "local-static-token",
    principal,
    authenticatedAt: "2026-08-25T02:59:00Z",
  },
}));

function createFixture() {
  const coordinator = new SqliteCoordinator({ filename: ":memory:", clock: () => NOW });
  const binding = new ThreadMeshJsonRpcBinding({
    coordinator,
    authenticator: new StaticTokenAuthenticator(credentials),
    clock: () => NOW,
  });
  const createClient = (token, idPrefix) => createThreadMeshClient({
    authorization: `Bearer ${token}`,
    idPrefix,
    clock: () => NOW,
    send: async (request, context) => structuredClone(
      binding.handle(structuredClone(request), context),
    ),
  });
  return {
    binding,
    coordinator,
    owner: createClient("owner-token", "owner"),
    source: createClient("source-token", "source"),
    target: createClient("target-token", "target"),
  };
}

function installRelationship(binding) {
  const response = binding.handle({
    jsonrpc: "2.0",
    id: "setup-grant",
    method: "relationships.grant",
    params: {
      grant: {
        specVersion: "0.0-draft",
        grantId: "grant_sdk_dependency01",
        grantVersion: 1,
        relationshipId: RELATIONSHIP_ID,
        relationshipType: "dependency",
        source: SOURCE,
        target: TARGET,
        allowedIntents: ["suggest"],
        allowedDeliveryModes: ["checkpoint-offer"],
        summaryVisibility: "coordination",
        structuredGateResponses: false,
        createdAt: "2026-08-25T03:00:00Z",
        expiresAt: "2026-08-25T04:00:00Z",
      },
      decision: { decisionId: "decision_sdk_dependency01" },
      idempotencyKey: "idem_sdk_relationship_grant01",
    },
  }, { authorization: "Bearer owner-token" });
  assert.equal(response.error, undefined);
}

test("minimal SDK runs register, discover, suggest, poll, and decide end to end", async () => {
  const api = createFixture();
  try {
    const registeredSource = await api.owner.registerTask({ ...SOURCE, state: "running" });
    await api.owner.registerTask({ ...TARGET, state: "waiting" });
    assert.equal(registeredSource.operationReplay, false);
    assert.equal((await api.owner.registerTask({ ...SOURCE, state: "running" })).operationReplay, true);
    installRelationship(api.binding);

    await api.target.publishSummary({
      specVersion: "0.0-draft",
      summaryId: "sum_sdk_target01",
      summaryVersion: 1,
      task: TARGET,
      projection: {
        relationshipId: RELATIONSHIP_ID,
        grantId: "grant_sdk_dependency01",
        grantVersion: 1,
        summaryVisibility: "coordination",
      },
      state: "waiting",
      blockerHint: "Waiting for the verified upstream artifact checksum.",
      coordination: {
        intents: ["suggest"],
        deliveryModes: ["checkpoint-offer"],
      },
      sensitivity: "relationship-scoped",
      audience: {
        visibility: "relationship-scoped",
        relationshipIds: [RELATIONSHIP_ID],
      },
      updatedAt: "2026-08-25T03:00:00Z",
    });

    const related = await api.source.discoverRelated({
      task: TARGET,
      relationshipId: RELATIONSHIP_ID,
    });
    assert.equal(related.summaryId, "sum_sdk_target01");
    assert.deepEqual(related.coordination.intents, ["suggest"]);

    const sent = await api.source.sendSuggestion({
      messageId: "msg_sdk_dependency01",
      from: SOURCE,
      to: TARGET,
      relationshipId: RELATIONSHIP_ID,
      content: "The verified upstream checksum is sha256:abc123.",
      reason: "The receiver declared this artifact as a dependency.",
    });
    assert.equal(sent.operationReplay, false);
    assert.equal(sent.disposition.decision, "pending");

    const page = await api.target.pollMailbox({ receiver: TARGET });
    assert.equal(page.messages.length, 1);
    assert.equal(
      page.messages[0].envelope.content,
      "The verified upstream checksum is sha256:abc123.",
    );

    const decided = await api.target.decide({
      message: page.messages[0],
      decision: "accepted",
    });
    assert.equal(decided.disposition.decision, "accepted");
    assert.equal(decided.disposition.decisionReasonCode, "accepted");
    assert.equal((await api.target.pollMailbox({ receiver: TARGET })).messages.length, 0);

    await api.source.sendSuggestion({
      messageId: "msg_sdk_deferred01",
      from: SOURCE,
      to: TARGET,
      relationshipId: RELATIONSHIP_ID,
      content: "A second bounded dependency update is available.",
      reason: "Exercise receiver deferral and later acceptance.",
    });
    const deferredPage = await api.target.pollMailbox({ receiver: TARGET });
    await api.target.decide({
      message: deferredPage.messages[0],
      decision: "deferred",
    });
    const reconsideredPage = await api.target.pollMailbox({ receiver: TARGET });
    assert.equal(reconsideredPage.messages[0].claim.state, "acknowledged");
    const reconsidered = await api.target.decide({
      message: reconsideredPage.messages[0],
      decision: "accepted",
    });
    assert.equal(reconsidered.claim, null);
    assert.equal(reconsidered.disposition.decision, "accepted");
  } finally {
    api.coordinator.close();
  }
});

test("minimal SDK fails closed on invalid bounds and preserves stable remote codes", async () => {
  const api = createFixture();
  try {
    await assert.rejects(
      api.source.sendSuggestion({
        messageId: "msg_sdk_too_long01",
        from: SOURCE,
        to: TARGET,
        relationshipId: RELATIONSHIP_ID,
        content: "x",
        reason: "x",
        ttlMs: 30 * 60 * 1000 + 1,
      }),
      { code: "threadmesh_client_suggestion_invalid" },
    );
    await assert.rejects(
      api.source.discoverRelated({ task: TARGET, relationshipId: RELATIONSHIP_ID }),
      (error) => {
        assert.ok(error instanceof ThreadMeshClientError);
        assert.equal(error.code, "threadmesh_task_summary_not_found");
        assert.equal(error.rpcCode, -32004);
        return true;
      },
    );
  } finally {
    api.coordinator.close();
  }
});
