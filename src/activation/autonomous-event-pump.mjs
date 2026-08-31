import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { evaluateAttentionRoute } from "../routing/lifecycle-events.mjs";
import { runCoordinatorActivation } from "./coordinator-activation-driver.mjs";

function coded(code, detail = "") {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function taskRef(value) {
  return { taskId: value.taskId, incarnationId: value.incarnationId };
}

const PUMP_REGISTRY = new WeakMap();

function copy(value) {
  return JSON.parse(canonicalJson(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function currentTaskSnapshot(coordinator, ref) {
  const row = coordinator.db.prepare(
    `SELECT t.task_id AS taskId, t.incarnation_id AS incarnationId,
            m.retired_at AS retiredAt, m.run_id AS runId,
            m.objective_version AS objectiveVersion, m.checkpoint AS checkpoint
     FROM tasks t JOIN task_metadata m USING (task_id, incarnation_id)
     WHERE t.task_id = ? AND t.incarnation_id = ?`,
  ).get(ref.taskId, ref.incarnationId);
  if (!row || row.retiredAt) throw coded("threadmesh_event_pump_task_snapshot_invalid");
  return deepFreeze({
    taskId: row.taskId,
    incarnationId: row.incarnationId,
    ...(row.runId === null ? {} : { runId: row.runId }),
    ...(row.objectiveVersion === null ? {} : { objectiveVersion: row.objectiveVersion }),
    ...(row.checkpoint === null ? {} : { checkpoint: row.checkpoint }),
  });
}

function currentGrantSnapshot(coordinator, envelope, relationshipId) {
  const row = coordinator.db.prepare(
    `SELECT * FROM grants WHERE relationship_id = ?
       AND source_task_id = ? AND source_incarnation_id = ?
       AND target_task_id = ? AND target_incarnation_id = ?
     ORDER BY grant_version DESC LIMIT 1`,
  ).get(
    relationshipId,
    envelope.sender.taskId,
    envelope.sender.incarnationId,
    envelope.target.taskId,
    envelope.target.incarnationId,
  );
  let grant;
  try { grant = row ? JSON.parse(row.grant_json) : null; } catch {
    throw coded("threadmesh_event_pump_grant_snapshot_invalid");
  }
  const bound = coordinator.db.prepare(
    `SELECT grant_id AS grantId, grant_version AS grantVersion
     FROM messages WHERE sender_incarnation_id = ? AND message_id = ?`,
  ).get(envelope.sender.incarnationId, envelope.messageId);
  if (!row || !grant || !bound || row.revoked_at ||
      row.relationship_id !== relationshipId ||
      bound.grantId !== row.grant_id || bound.grantVersion !== row.grant_version ||
      grant.grantId !== row.grant_id || grant.grantVersion !== row.grant_version ||
      grant.relationshipId !== relationshipId ||
      grant.source?.taskId !== row.source_task_id ||
      grant.source?.incarnationId !== row.source_incarnation_id ||
      grant.target?.taskId !== row.target_task_id ||
      grant.target?.incarnationId !== row.target_incarnation_id) {
    throw coded("threadmesh_event_pump_grant_snapshot_invalid");
  }
  return deepFreeze(copy(grant));
}

function eventFromEnvelope(envelope, eventType) {
  const prefix = `ThreadMesh lifecycle event: ${eventType}\n\n`;
  if (!envelope?.content?.startsWith(prefix)) {
    throw coded("threadmesh_event_pump_envelope_mismatch");
  }
  return {
    eventType,
    messageId: envelope.messageId,
    sender: { ...envelope.sender },
    target: { ...envelope.target },
    relationshipId: envelope.relationshipId,
    content: envelope.content.slice(prefix.length),
    reason: envelope.reason,
    ...(envelope.evidenceRefs ? { evidenceRefs: [...envelope.evidenceRefs] } : {}),
    freshness: { ...envelope.freshness },
    ...(envelope.causality ? { causality: { ...envelope.causality } } : {}),
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt,
  };
}

/**
 * A bounded, next-only dispatcher over coordinator-owned durable attention events.
 * Receiver policy is registered once before start; callers cannot dispatch phases.
 */
export class AutonomousEventPump {
  constructor({ coordinator, runtime, scenarioId, chainId, recoveryDirectory, maxEvents = 16 }) {
    if (!coordinator || !runtime || typeof scenarioId !== "string" ||
        typeof chainId !== "string" || typeof recoveryDirectory !== "string" ||
        !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 1_000) {
      throw coded("threadmesh_event_pump_input_invalid");
    }
    this.coordinator = coordinator;
    this.runtime = runtime;
    this.scenarioId = scenarioId;
    this.chainId = chainId;
    this.recoveryDirectory = recoveryDirectory;
    this.maxEvents = maxEvents;
    PUMP_REGISTRY.set(this, { entries: [], projection: null, digest: null });
    this.started = false;
    this.running = false;
    this.settledEventIds = new Set();
    this.dispatches = 0;
    this.skips = 0;
    this.selectionRecords = [];
    this.selectionHeadDigest = null;
  }

  registerReceiver(registration) {
    if (this.started) throw coded("threadmesh_event_pump_registration_closed");
    const { receiver, principal, role, cwd, ref, routes } = registration ?? {};
    if (!receiver || !principal || typeof role !== "string" || typeof cwd !== "string" ||
        !ref || !Array.isArray(routes) || routes.length < 1 ||
        routes.some((route) => !route?.grant || typeof route.eventType !== "string" ||
          !Array.isArray(route.subscribedEventTypes) || !route.businessTool ||
          typeof route.onBusinessToolCall !== "function" ||
          typeof route.onLifecyclePublication !== "function")) {
      throw coded("threadmesh_event_pump_registration_invalid");
    }
    const entries = PUMP_REGISTRY.get(this).entries;
    if (entries.some((entry) =>
      entry.receiver.taskId === receiver.taskId &&
      entry.receiver.incarnationId === receiver.incarnationId)) {
      throw coded("threadmesh_event_pump_registration_conflict");
    }
    const sealedReceiver = deepFreeze(copy(receiver));
    const sealedPrincipal = deepFreeze(copy(principal));
    const sealedRef = deepFreeze(copy(ref));
    const sealedRoutes = routes.map((route) => deepFreeze({
      eventType: route.eventType,
      subscribedEventTypes: copy(route.subscribedEventTypes),
      relationshipId: route.grant.relationshipId,
      businessPhase: route.businessPhase,
      decisionPhase: route.decisionPhase ?? "receiver-decision",
      businessTool: copy(route.businessTool),
    }));
    entries.push(Object.freeze({
      receiver: sealedReceiver,
      principal: sealedPrincipal,
      role,
      cwd,
      ref: sealedRef,
      routes: sealedRoutes.map((route, index) => Object.freeze({
        data: route,
        onBusinessToolCall: routes[index].onBusinessToolCall,
        onLifecyclePublication: routes[index].onLifecyclePublication,
      })),
    }));
    return this;
  }

  start() {
    const registry = PUMP_REGISTRY.get(this);
    const entries = registry.entries;
    if (this.started || entries.length < 1) {
      throw coded("threadmesh_event_pump_start_invalid");
    }
    this.started = true;
    registry.projection = deepFreeze(entries.map((entry) => ({
      receiver: entry.receiver,
      principal: entry.principal,
      role: entry.role,
      cwd: entry.cwd,
      refDigest: sha256Digest(entry.ref),
      routes: entry.routes.map(({ data }) => data),
    })));
    registry.digest = sha256Digest(registry.projection);
    Object.defineProperties(this, {
      registrations: {
        value: registry.projection, enumerable: true, writable: false, configurable: false,
      },
      registryDigest: {
        value: registry.digest, enumerable: true, writable: false, configurable: false,
      },
    });
    Object.freeze(entries);
    return this;
  }

  #assertRegistry() {
    const registry = PUMP_REGISTRY.get(this);
    if (sha256Digest(registry.projection) !== registry.digest ||
        this.registrations !== registry.projection || this.registryDigest !== registry.digest) {
      throw coded("threadmesh_event_pump_registry_tampered");
    }
  }

  #recordSelection(kind, registration, observed, routeProjection) {
    const body = {
      sequence: this.selectionRecords.length + 1,
      previousDigest: this.selectionHeadDigest,
      kind,
      receiverDigest: sha256Digest(taskRef(registration.receiver)),
      eventDigest: sha256Digest({
        cursor: observed.cursor,
        eventId: observed.eventId,
        messageId: observed.messageId,
        senderIncarnationId: observed.senderIncarnationId,
      }),
      routeDigest: sha256Digest(routeProjection),
    };
    const record = Object.freeze({ ...body, recordDigest: sha256Digest(body) });
    this.selectionRecords.push(record);
    this.selectionHeadDigest = record.recordDigest;
    return record;
  }

  verifySelectionChain() {
    let head = null;
    for (const [index, record] of this.selectionRecords.entries()) {
      const { recordDigest, ...body } = record;
      if (body.sequence !== index + 1 || body.previousDigest !== head ||
          sha256Digest(body) !== recordDigest) return false;
      head = recordDigest;
    }
    return head === this.selectionHeadDigest;
  }

  #nextCandidate() {
    const candidates = [];
    const blocked = [];
    for (const registration of PUMP_REGISTRY.get(this).entries) {
      const cursorState = this.coordinator.getAttentionCursor(
        taskRef(registration.receiver), registration.principal,
      );
      const page = this.coordinator.readAttentionEvents(
        taskRef(registration.receiver),
        { afterCursor: cursorState.cursor.committedCursor, limit: 1 },
        registration.principal,
      );
      const event = page.events[0];
      if (event) {
        const target = { registration, cursorState, event };
        const completedBound = cursorState.activeClaim?.eventId === event.eventId &&
          cursorState.activeClaim?.state === "completed-bound";
        if (this.settledEventIds.has(event.eventId) || completedBound) blocked.push(target);
        else candidates.push(target);
      }
    }
    candidates.sort((left, right) => left.event.cursor - right.event.cursor ||
      left.registration.receiver.taskId.localeCompare(right.registration.receiver.taskId));
    if (candidates[0]) return { ...candidates[0], blocked: false };
    blocked.sort((left, right) => left.event.cursor - right.event.cursor ||
      left.registration.receiver.taskId.localeCompare(right.registration.receiver.taskId));
    return blocked[0] ? { ...blocked[0], blocked: true } : null;
  }

  async drainOnce() {
    if (!this.started) throw coded("threadmesh_event_pump_not_started");
    if (this.running) throw coded("threadmesh_event_pump_concurrent_drain");
    this.running = true;
    try {
      this.#assertRegistry();
      const candidate = this.#nextCandidate();
      if (!candidate) return Object.freeze({ state: "idle" });
      if (candidate.blocked) {
        return Object.freeze({
          state: "blocked-completed-bound",
          awaitingPromotion: true,
          receiverDigest: sha256Digest(taskRef(candidate.registration.receiver)),
          eventDigest: sha256Digest({
            cursor: candidate.event.cursor,
            eventId: candidate.event.eventId,
            messageId: candidate.event.messageId,
          }),
        });
      }
      const { registration, cursorState, event: observed } = candidate;
      const pending = this.coordinator.listPending(
        taskRef(registration.receiver), {}, registration.principal,
      ).messages.find((entry) => entry.envelope.messageId === observed.messageId);
      if (!pending || pending.envelope.sender.incarnationId !== observed.senderIncarnationId) {
        throw coded("threadmesh_event_pump_next_event_mismatch");
      }
      const routeRegistration = registration.routes.find(({ data }) =>
        data.relationshipId === pending.envelope.relationshipId);
      if (!routeRegistration) throw coded("threadmesh_event_pump_route_missing");
      const routeData = routeRegistration.data;
      const lifecycleEvent = eventFromEnvelope(pending.envelope, routeData.eventType);
      const grant = currentGrantSnapshot(
        this.coordinator, pending.envelope, routeData.relationshipId,
      );
      const routeProjection = evaluateAttentionRoute({
        event: lifecycleEvent,
        receiverTask: taskRef(registration.receiver),
        subscribedEventTypes: routeData.subscribedEventTypes,
        seenMessageIds: [],
        grant,
        currentGrant: grant,
        sourceTask: currentTaskSnapshot(this.coordinator, pending.envelope.sender),
        targetTask: currentTaskSnapshot(this.coordinator, pending.envelope.target),
        now: this.coordinator.clock(),
      });
      if (routeProjection.state !== "offered") {
        const skipped = this.coordinator.advanceAttentionCursor(
          taskRef(registration.receiver),
          {
            eventCursor: observed.cursor,
            eventId: observed.eventId,
            classificationDigest: sha256Digest(routeProjection),
            expectedRevision: cursorState.cursor.revision,
          },
          registration.principal,
        );
        this.settledEventIds.add(observed.eventId);
        this.skips += 1;
        const selectionRecord = this.#recordSelection(
          "durable-route-skip", registration, observed, routeProjection,
        );
        return Object.freeze({ state: "skipped", routeProjection, skipped, selectionRecord });
      }
      const admissionGrant = currentGrantSnapshot(
        this.coordinator, pending.envelope, routeData.relationshipId,
      );
      if (sha256Digest(admissionGrant) !== sha256Digest(grant)) {
        throw coded("threadmesh_event_pump_grant_changed_before_admission");
      }
      const activation = await runCoordinatorActivation({
        coordinator: this.coordinator,
        runtime: this.runtime,
        receiver: registration.receiver,
        principal: registration.principal,
        role: registration.role,
        cwd: registration.cwd,
        ref: registration.ref,
        routeProjection,
        scenarioId: this.scenarioId,
        chainId: this.chainId,
        recoveryDirectory: this.recoveryDirectory,
        businessPhase: routeData.businessPhase,
        decisionPhase: routeData.decisionPhase,
        businessTool: routeData.businessTool,
        onBusinessToolCall: routeRegistration.onBusinessToolCall,
      });
      await routeRegistration.onLifecyclePublication({
        coordinator: this.coordinator,
        activation,
        lifecycleEvent,
        routeProjection,
      });
      this.settledEventIds.add(observed.eventId);
      this.dispatches += 1;
      const selectionRecord = this.#recordSelection(
        "coordinator-activation", registration, observed, routeProjection,
      );
      return Object.freeze({ state: "dispatched", activation, routeProjection, selectionRecord });
    } finally {
      this.running = false;
    }
  }

  async runUntilIdle() {
    if (!this.started) this.start();
    let processed = 0;
    while (processed < this.maxEvents) {
      const result = await this.drainOnce();
      if (result.state === "idle") {
        const dispatches = this.selectionRecords.filter(
          ({ kind }) => kind === "coordinator-activation",
        ).length;
        const skips = this.selectionRecords.length - dispatches;
        return Object.freeze({
          state: "idle", processed, dispatches, skips,
          selectionRecordCount: this.selectionRecords.length,
          selectionHeadDigest: this.selectionHeadDigest,
          selectionChainValid: this.verifySelectionChain(),
          selectionChainScope: "in-process-self-checked",
        });
      }
      if (result.state === "blocked-completed-bound") {
        const dispatches = this.selectionRecords.filter(
          ({ kind }) => kind === "coordinator-activation",
        ).length;
        return Object.freeze({
          ...result,
          processed,
          dispatches,
          skips: this.selectionRecords.length - dispatches,
          selectionRecordCount: this.selectionRecords.length,
          selectionHeadDigest: this.selectionHeadDigest,
          selectionChainValid: this.verifySelectionChain(),
          selectionChainScope: "in-process-self-checked",
        });
      }
      processed += 1;
    }
    const remaining = this.#nextCandidate();
    if (remaining?.blocked) {
      const dispatches = this.selectionRecords.filter(
        ({ kind }) => kind === "coordinator-activation",
      ).length;
      return Object.freeze({
        state: "blocked-completed-bound",
        awaitingPromotion: true,
        processed,
        dispatches,
        skips: this.selectionRecords.length - dispatches,
        receiverDigest: sha256Digest(taskRef(remaining.registration.receiver)),
        eventDigest: sha256Digest({
          cursor: remaining.event.cursor,
          eventId: remaining.event.eventId,
          messageId: remaining.event.messageId,
        }),
        selectionRecordCount: this.selectionRecords.length,
        selectionHeadDigest: this.selectionHeadDigest,
        selectionChainValid: this.verifySelectionChain(),
        selectionChainScope: "in-process-self-checked",
      });
    }
    if (remaining) throw coded("threadmesh_event_pump_limit_reached");
    const dispatches = this.selectionRecords.filter(
      ({ kind }) => kind === "coordinator-activation",
    ).length;
    return Object.freeze({
      state: "idle", processed, dispatches,
      skips: this.selectionRecords.length - dispatches,
      selectionRecordCount: this.selectionRecords.length,
      selectionHeadDigest: this.selectionHeadDigest,
      selectionChainValid: this.verifySelectionChain(),
      selectionChainScope: "in-process-self-checked",
    });
  }
}

export function createAutonomousEventPump(options) {
  return new AutonomousEventPump(options);
}
