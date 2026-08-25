import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  StaticTokenAuthenticator,
  ThreadMeshJsonRpcBinding,
} from "../bindings/jsonrpc.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { codedError } from "../protocol-validator.mjs";
import { createThreadMeshClient } from "../sdk/index.mjs";

const SUMMARY_HINTS = Object.freeze({
  relevant: "Waiting for the verified upstream artifact checksum.",
  irrelevant: "Owns release-note typography; no artifact input is requested.",
  control: "Standalone task; cross-task input is not requested.",
});

function token() {
  return randomBytes(24).toString("base64url");
}

function suffix() {
  return randomBytes(8).toString("hex");
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function jsonRpcServer(binding) {
  return http.createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/jsonrpc") {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) request.destroy();
    });
    request.on("end", () => {
      try {
        const result = binding.handle(JSON.parse(body), {
          authorization: request.headers.authorization,
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
      } catch {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid_request" }));
      }
    });
  });
}

function client(endpoint, bearerToken, idPrefix, clock) {
  return createThreadMeshClient({
    authorization: `Bearer ${bearerToken}`,
    idPrefix,
    clock,
    send: async (request, { authorization }) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw codedError("threadmesh_pi_fixture_transport_failed");
      return response.json();
    },
  });
}

export async function createPiIntegrationFixture({
  condition = "relevant",
  targetHarness = "sdk-receiver",
  targetAdapterRef = null,
  clock = Date.now,
} = {}) {
  if (!Object.hasOwn(SUMMARY_HINTS, condition)) {
    throw codedError("threadmesh_pi_condition_invalid");
  }
  const runSuffix = suffix();
  const now = clock();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-pi-fixture-"));
  const ownerToken = token();
  const senderToken = token();
  const receiverToken = token();
  const ownerPrincipal = { kind: "user", principalId: `owner_pi_${runSuffix}` };
  const source = {
    taskId: `task_pi_source_${runSuffix}`,
    incarnationId: `inc_pi_source_${runSuffix}`,
    harness: "pi-extension",
  };
  const target = {
    taskId: `task_pi_target_${runSuffix}`,
    incarnationId: `inc_pi_target_${runSuffix}`,
    harness: targetHarness,
  };
  const senderPrincipal = {
    kind: "task",
    taskId: source.taskId,
    incarnationId: source.incarnationId,
  };
  const receiverPrincipal = {
    kind: "task",
    taskId: target.taskId,
    incarnationId: target.incarnationId,
  };
  const relationshipId = `rel_pi_${runSuffix}`;
  const grantId = `grant_pi_${runSuffix}`;
  const coordinator = new SqliteCoordinator({
    filename: path.join(directory, "coordinator.sqlite"),
    clock,
  });
  const authenticator = new StaticTokenAuthenticator([
    {
      token: ownerToken,
      context: {
        specVersion: "0.0-draft",
        authenticationId: `authn_pi_owner_${runSuffix}`,
        mechanism: "local-static-token",
        principal: ownerPrincipal,
        authenticatedAt: new Date(now).toISOString(),
      },
    },
    {
      token: senderToken,
      context: {
        specVersion: "0.0-draft",
        authenticationId: `authn_pi_sender_${runSuffix}`,
        mechanism: "local-static-token",
        principal: senderPrincipal,
        authenticatedAt: new Date(now).toISOString(),
      },
    },
    {
      token: receiverToken,
      context: {
        specVersion: "0.0-draft",
        authenticationId: `authn_pi_receiver_${runSuffix}`,
        mechanism: "local-static-token",
        principal: receiverPrincipal,
        authenticatedAt: new Date(now).toISOString(),
      },
    },
  ]);
  const binding = new ThreadMeshJsonRpcBinding({ coordinator, authenticator, clock });
  const server = jsonRpcServer(binding);
  let closed = false;

  try {
    await listen(server);
    const address = server.address();
    const endpoint = `http://127.0.0.1:${address.port}/jsonrpc`;
    const owner = client(endpoint, ownerToken, "pi-owner", clock);
    const receiver = client(endpoint, receiverToken, "pi-receiver", clock);
    await owner.registerTask({ ...source, state: "running" });
    await owner.registerTask({
      ...target,
      state: condition === "relevant" ? "waiting" : "running",
      ...(targetAdapterRef ? { adapterRef: targetAdapterRef } : {}),
    });
    const grantResponse = binding.handle({
      jsonrpc: "2.0",
      id: "pi-grant",
      method: "relationships.grant",
      params: {
        grant: {
          specVersion: "0.0-draft",
          grantId,
          grantVersion: 1,
          relationshipId,
          relationshipType: "dependency",
          source,
          target,
          allowedIntents: ["suggest"],
          allowedDeliveryModes: ["checkpoint-offer"],
          summaryVisibility: "coordination",
          structuredGateResponses: false,
          createdAt: new Date(now - 60_000).toISOString(),
          expiresAt: new Date(now + 60 * 60_000).toISOString(),
        },
        decision: { decisionId: `decision_pi_${runSuffix}` },
        idempotencyKey: `idem_pi_grant_${runSuffix}`,
      },
    }, { authorization: `Bearer ${ownerToken}` });
    if (grantResponse.error) throw codedError(grantResponse.error.data.threadmeshCode);
    await receiver.publishSummary({
      specVersion: "0.0-draft",
      summaryId: `sum_pi_${runSuffix}`,
      summaryVersion: 1,
      task: target,
      projection: {
        relationshipId,
        grantId,
        grantVersion: 1,
        summaryVisibility: "coordination",
      },
      state: condition === "relevant" ? "waiting" : "running",
      blockerHint: SUMMARY_HINTS[condition],
      coordination: {
        intents: ["suggest"],
        deliveryModes: ["checkpoint-offer"],
      },
      sensitivity: "relationship-scoped",
      audience: {
        visibility: "relationship-scoped",
        relationshipIds: [relationshipId],
      },
      updatedAt: new Date(now).toISOString(),
    });

    return {
      condition,
      coordinator,
      endpoint,
      senderToken,
      receiver,
      receiverPrincipal,
      source,
      target,
      relationshipId,
      directory,
      async close() {
        if (closed) return;
        closed = true;
        await closeServer(server);
        coordinator.close();
        fs.rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (server.listening) await closeServer(server);
    coordinator.close();
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
