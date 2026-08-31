import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENTION_SNAPSHOT_LIMITS,
  projectAttentionSnapshot,
  renderAttentionSnapshot,
} from "../src/inspector/attention-snapshot.mjs";

function input(overrides = {}) {
  return {
    sessions: [
      { sessionId: "review", workstream: "review", status: "waiting", taskId: "task_review" },
      { sessionId: "implement", workstream: "implementation", status: "completed", taskId: "task_implement" },
    ],
    dependencies: [
      {
        dependencyId: "implementation-reviewed",
        fromSessionId: "implement",
        toSessionId: "review",
        status: "satisfied",
      },
    ],
    events: [
      {
        eventId: "event-completed",
        dependencyId: "implementation-reviewed",
        eventType: "completed",
        payloadSummary: "Implementation evidence is ready for the dependent review.",
        source: {
          taskId: "task_implement",
          incarnationId: "inc_implement_1",
          harness: "codex",
          actorType: "agent",
        },
        provenance: { authorship: "peer-authored", claimStatus: "evidence-referenced" },
        occurredAt: "2026-08-31T09:00:00.000Z",
      },
    ],
    routes: [
      {
        routeId: "route-completed",
        dependencyId: "implementation-reviewed",
        eventId: "event-completed",
        state: "offered",
        reasonCode: "attention-offer-authorized",
        receiverDisposition: {
          delivery: "checkpoint-offered",
          decision: "accepted",
          decisionReasonCode: "accepted",
          outcome: "externally-verified",
        },
        verificationState: "externally-verified",
        dependencyEffect: {
          state: "satisfied",
          reasonCode: "dependency-satisfied-verified",
          unlock: true,
        },
      },
    ],
    ...overrides,
  };
}

test("projects session, lifecycle, route, disposition, verification, and dependency state", () => {
  const snapshot = projectAttentionSnapshot(input());
  assert.deepEqual(snapshot.sessions.map(({ sessionId }) => sessionId), ["implement", "review"]);
  assert.equal(snapshot.dependencies[0].status, "satisfied");
  assert.deepEqual(snapshot.dependencies[0].recentEvent, {
    eventId: "event-completed",
    dependencyId: "implementation-reviewed",
    eventType: "completed",
    payloadSummary: "Implementation evidence is ready for the dependent review.",
    source: {
      taskId: "task_implement",
      incarnationId: "inc_implement_1",
      harness: "codex",
      actorType: "agent",
    },
    provenance: { authorship: "peer-authored", claimStatus: "evidence-referenced" },
    occurredAt: "2026-08-31T09:00:00.000Z",
  });
  assert.deepEqual(snapshot.dependencies[0].route, {
    routeId: "route-completed",
    eventId: "event-completed",
    state: "offered",
    reasonCode: "attention-offer-authorized",
  });
  assert.equal(snapshot.dependencies[0].receiverDisposition.decision, "accepted");
  assert.equal(snapshot.dependencies[0].verificationState, "externally-verified");
  assert.deepEqual(snapshot.dependencies[0].dependencyEffect, {
    state: "satisfied",
    reasonCode: "dependency-satisfied-verified",
    unlock: true,
  });
  assert.equal(snapshot.dependencies[0].recoveryHint, null);
  assert.deepEqual(snapshot.truncation, { sessions: 0, dependencies: 0, events: 0, routes: 0 });
});

test("rejects raw content, secrets, and absolute paths even in trusted records", () => {
  assert.throws(
    () => projectAttentionSnapshot(input({ events: [{ ...input().events[0], content: "do not display" }] })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
  assert.throws(
    () => projectAttentionSnapshot(input({ sessions: [{ ...input().sessions[0], token: "secret" }] })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
  assert.throws(
    () => projectAttentionSnapshot(input({ sessions: [{ ...input().sessions[0], taskId: "/private/task" }] })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
});

test("bounds records and strings with deterministic truncation", () => {
  const sessions = Array.from({ length: ATTENTION_SNAPSHOT_LIMITS.sessions + 2 }, (_, index) => ({
    sessionId: `session-${String(index).padStart(2, "0")}`,
    workstream: "w".repeat(ATTENTION_SNAPSHOT_LIMITS.string + 10),
    status: "active",
  }));
  const events = Array.from({ length: ATTENTION_SNAPSHOT_LIMITS.events + 2 }, (_, index) => ({
    ...input().events[0],
    eventId: `event-${String(index).padStart(2, "0")}`,
    occurredAt: `2026-08-31T09:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const routes = Array.from({ length: ATTENTION_SNAPSHOT_LIMITS.routes + 2 }, (_, index) => ({
    ...input().routes[0],
    routeId: `route-${String(index).padStart(2, "0")}`,
    eventId: `event-${String(index).padStart(2, "0")}`,
  }));
  const snapshot = projectAttentionSnapshot(input({ sessions, events, routes }));
  assert.equal(snapshot.sessions.length, ATTENTION_SNAPSHOT_LIMITS.sessions);
  assert.equal(snapshot.sessions[0].sessionId, "session-00");
  assert.equal(snapshot.sessions[0].workstream.length, ATTENTION_SNAPSHOT_LIMITS.string);
  assert.match(snapshot.sessions[0].workstream, /…$/);
  assert.deepEqual(snapshot.truncation, { sessions: 2, dependencies: 0, events: 2, routes: 2 });
});

test("rejects invalid linkage and unsupported lifecycle route values", () => {
  assert.throws(
    () => projectAttentionSnapshot(input({ events: [{ ...input().events[0], dependencyId: "missing" }] })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
  assert.throws(
    () => projectAttentionSnapshot(input({ routes: [{ ...input().routes[0], reasonCode: "made-up" }] })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
});

test("rejects an unlock unless the dependency is satisfied, accepted, and externally verified", () => {
  assert.throws(
    () => projectAttentionSnapshot(input({
      dependencies: [{ ...input().dependencies[0], status: "eligible" }],
    })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
  assert.throws(
    () => projectAttentionSnapshot(input({
      routes: [{
        ...input().routes[0],
        verificationState: "effect-observed",
      }],
    })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
  assert.throws(
    () => projectAttentionSnapshot(input({
      routes: [{
        ...input().routes[0],
        receiverDisposition: {
          ...input().routes[0].receiverDisposition,
          decision: "deferred",
          decisionReasonCode: "receiver-deferred",
        },
      }],
    })),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
});

test("renderer rejects forged projected snapshots before rendering", () => {
  const forged = structuredClone(projectAttentionSnapshot(input()));
  forged.dependencies[0].recentEvent.source.taskId = "/private/repository";
  assert.throws(
    () => renderAttentionSnapshot(forged),
    { code: "threadmesh_attention_snapshot_invalid" },
  );

  const extraField = structuredClone(projectAttentionSnapshot(input()));
  extraField.dependencies[0].recentEvent.unchecked = "not allowed";
  assert.throws(
    () => renderAttentionSnapshot(extraField),
    { code: "threadmesh_attention_snapshot_invalid" },
  );

  const inconsistent = structuredClone(projectAttentionSnapshot(input()));
  inconsistent.dependencies[0].status = "waiting";
  assert.throws(
    () => renderAttentionSnapshot(inconsistent),
    { code: "threadmesh_attention_snapshot_invalid" },
  );
});

test("renders the same bounded snapshot identically on every call", () => {
  const blocked = input({
    dependencies: [{ ...input().dependencies[0], status: "blocked" }],
    routes: [{
      ...input().routes[0],
      receiverDisposition: {
        delivery: "adapter-submitted",
        decision: "accepted",
        outcome: "outcome-unknown",
      },
      verificationState: "not-observed",
      dependencyEffect: {
        state: "not-satisfied",
        reasonCode: "dependency-external-verification-required",
        unlock: false,
      },
    }],
  });
  const snapshot = projectAttentionSnapshot(blocked);
  const first = renderAttentionSnapshot(snapshot);
  assert.equal(renderAttentionSnapshot(snapshot), first);
  assert.equal(
    first,
    "ThreadMesh attention snapshot\n" +
      "Sessions:\n" +
      "- implementation (implement): completed\n" +
      "- review (review): waiting\n" +
      "Dependencies:\n" +
      "- implementation-reviewed: implement -> review [blocked]\n" +
      "  event: completed from task_implement (peer-authored/evidence-referenced)\n" +
      "  summary: Implementation evidence is ready for the dependent review.\n" +
      "  route: offered (attention-offer-authorized)\n" +
      "  receiver: adapter-submitted; accepted; outcome-unknown\n" +
      "  verification: not-observed\n" +
      "  effect: not-satisfied (dependency-external-verification-required)\n" +
      "  recovery: Reconcile the external submission before retrying or changing dependency state.\n" +
      "Truncated: sessions=0, dependencies=0, events=0, routes=0\n",
  );
});
