import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRelationshipPolicy } from "../src/policy/relationship-policy.mjs";

const now = Date.parse("2026-08-20T09:00:00Z");
const source = { taskId: "task_source", incarnationId: "inc_source01" };
const target = { taskId: "task_target", incarnationId: "inc_target01" };

function envelope(overrides = {}) {
  return {
    sender: { ...source },
    target: { ...target },
    relationshipId: "rel_source_target",
    intent: "suggest",
    delivery: { requestedMode: "checkpoint-offer" },
    ...overrides,
  };
}

function grant(overrides = {}) {
  return {
    grantId: "grant_source_target",
    grantVersion: 1,
    relationshipId: "rel_source_target",
    relationshipType: "peer",
    source: { ...source },
    target: { ...target },
    allowedIntents: ["suggest"],
    allowedDeliveryModes: ["checkpoint-offer"],
    structuredGateResponses: false,
    expiresAt: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  const effective = overrides.grant === undefined ? grant() : overrides.grant;
  return evaluateRelationshipPolicy({
    envelope: envelope(),
    grant: effective,
    currentGrant: effective,
    sourceTask: { ...source, retiredAt: null },
    targetTask: {
      ...target,
      retiredAt: null,
      runId: "run_target01",
      objectiveVersion: 3,
      checkpoint: "checkpoint-3",
    },
    now,
    ...overrides,
  });
}

test("allows an explicitly granted advisory relationship", () => {
  assert.deepEqual(evaluate(), {
    decision: "allow",
    reasonCode: "accepted",
    publicErrorCode: null,
    internalReasonCode: "grant-authorized",
    grantId: "grant_source_target",
    grantVersion: 1,
  });
});

test("default-denies missing grants without disclosing relationship state", () => {
  const missing = evaluate({ grant: null, currentGrant: null });
  const revokedGrant = grant({ revokedAt: "2026-08-20T08:30:00Z" });
  const revoked = evaluate({ grant: revokedGrant, currentGrant: revokedGrant });
  assert.equal(missing.publicErrorCode, "threadmesh_policy_denied");
  assert.equal(revoked.publicErrorCode, "threadmesh_policy_denied");
  assert.equal(missing.reasonCode, "policy-denied");
  assert.equal(revoked.reasonCode, "policy-denied");
  assert.equal(missing.internalReasonCode, "grant-missing");
  assert.equal(revoked.internalReasonCode, "grant-revoked");
});

test("detects stale incarnations without converting them to a new task", () => {
  const stale = evaluate({
    targetTask: { ...target, retiredAt: "2026-08-20T08:45:00Z" },
  });
  assert.equal(stale.decision, "deny");
  assert.equal(stale.reasonCode, "stale-incarnation");
  assert.equal(stale.publicErrorCode, "threadmesh_policy_denied");
});

test("denies state-changing peer authority even if a malformed grant claims it", () => {
  const peerSteer = grant({
    allowedIntents: ["steer"],
    allowedDeliveryModes: ["active-steer"],
  });
  const denied = evaluate({
    envelope: envelope({
      intent: "steer",
      freshness: { expectedObjectiveVersion: 3 },
      delivery: { requestedMode: "active-steer" },
    }),
    grant: peerSteer,
    currentGrant: peerSteer,
  });
  assert.equal(denied.internalReasonCode, "relationship-authority-insufficient");
  assert.equal(denied.publicErrorCode, "threadmesh_policy_denied");
});

test("allows state-changing authority only on an explicit elevated grant", () => {
  const supervisor = grant({
    relationshipType: "supervisor",
    allowedIntents: ["steer"],
    allowedDeliveryModes: ["active-steer"],
  });
  const allowed = evaluate({
    envelope: envelope({
      intent: "steer",
      freshness: { expectedObjectiveVersion: 3 },
      delivery: { requestedMode: "active-steer" },
    }),
    grant: supervisor,
    currentGrant: supervisor,
  });
  assert.equal(allowed.decision, "allow");
});

test("rejects stale run, objective, and checkpoint snapshots", () => {
  const supervisor = grant({
    relationshipType: "supervisor",
    allowedIntents: ["steer"],
    allowedDeliveryModes: ["active-steer"],
  });
  const base = {
    grant: supervisor,
    currentGrant: supervisor,
  };
  assert.equal(
    evaluate({
      ...base,
      envelope: envelope({
        intent: "steer",
        freshness: { expectedRunId: "run_old" },
        delivery: { requestedMode: "active-steer" },
      }),
    }).internalReasonCode,
    "stale-run",
  );
  assert.equal(
    evaluate({
      ...base,
      envelope: envelope({
        intent: "steer",
        freshness: { expectedObjectiveVersion: 2 },
        delivery: { requestedMode: "active-steer" },
      }),
    }).internalReasonCode,
    "stale-objective",
  );
  assert.equal(
    evaluate({
      ...base,
      envelope: envelope({
        intent: "steer",
        freshness: {
          expectedObjectiveVersion: 3,
          expectedCheckpoint: "checkpoint-old",
        },
        delivery: { requestedMode: "active-steer" },
      }),
    }).internalReasonCode,
    "stale-checkpoint",
  );
});

test("denies superseded grants and structured gates fail closed", () => {
  const old = grant();
  const current = grant({ grantId: "grant_source_target_v2", grantVersion: 2 });
  assert.equal(
    evaluate({ grant: old, currentGrant: current }).internalReasonCode,
    "grant-superseded",
  );
  const structured = grant({ structuredGateResponses: true });
  assert.equal(
    evaluate({ grant: structured, currentGrant: structured }).internalReasonCode,
    "structured-gate-unsupported",
  );
});
