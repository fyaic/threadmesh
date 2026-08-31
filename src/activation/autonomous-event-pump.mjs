import { sha256Digest } from "../canonical-json.mjs";
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
    this.registrations = [];
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
    if (this.registrations.some((entry) =>
      entry.receiver.taskId === receiver.taskId &&
      entry.receiver.incarnationId === receiver.incarnationId)) {
      throw coded("threadmesh_event_pump_registration_conflict");
    }
    this.registrations.push(Object.freeze({ ...registration, routes: Object.freeze([...routes]) }));
    return this;
  }

  start() {
    if (this.started || this.registrations.length < 1) {
      throw coded("threadmesh_event_pump_start_invalid");
    }
    this.started = true;
    Object.freeze(this.registrations);
    return this;
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
    for (const registration of this.registrations) {
      const cursorState = this.coordinator.getAttentionCursor(
        taskRef(registration.receiver), registration.principal,
      );
      const page = this.coordinator.readAttentionEvents(
        taskRef(registration.receiver),
        { afterCursor: cursorState.cursor.committedCursor, limit: 1 },
        registration.principal,
      );
      const event = page.events[0];
      if (event && !this.settledEventIds.has(event.eventId)) {
        candidates.push({ registration, cursorState, event });
      }
    }
    candidates.sort((left, right) => left.event.cursor - right.event.cursor ||
      left.registration.receiver.taskId.localeCompare(right.registration.receiver.taskId));
    return candidates[0] ?? null;
  }

  async drainOnce() {
    if (!this.started) throw coded("threadmesh_event_pump_not_started");
    if (this.running) throw coded("threadmesh_event_pump_concurrent_drain");
    this.running = true;
    try {
      const candidate = this.#nextCandidate();
      if (!candidate) return Object.freeze({ state: "idle" });
      const { registration, cursorState, event: observed } = candidate;
      const pending = this.coordinator.listPending(
        taskRef(registration.receiver), {}, registration.principal,
      ).messages.find((entry) => entry.envelope.messageId === observed.messageId);
      if (!pending || pending.envelope.sender.incarnationId !== observed.senderIncarnationId) {
        throw coded("threadmesh_event_pump_next_event_mismatch");
      }
      const routeRegistration = registration.routes.find((route) =>
        route.grant.relationshipId === pending.envelope.relationshipId);
      if (!routeRegistration) throw coded("threadmesh_event_pump_route_missing");
      const lifecycleEvent = eventFromEnvelope(pending.envelope, routeRegistration.eventType);
      const routeProjection = evaluateAttentionRoute({
        event: lifecycleEvent,
        receiverTask: taskRef(registration.receiver),
        subscribedEventTypes: routeRegistration.subscribedEventTypes,
        seenMessageIds: [],
        grant: routeRegistration.grant,
        currentGrant: routeRegistration.grant,
        sourceTask: routeRegistration.sourceTask,
        targetTask: routeRegistration.targetTask,
        now: routeRegistration.now,
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
        businessPhase: routeRegistration.businessPhase,
        decisionPhase: routeRegistration.decisionPhase ?? "receiver-decision",
        businessTool: routeRegistration.businessTool,
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
        });
      }
      processed += 1;
    }
    if (this.#nextCandidate()) throw coded("threadmesh_event_pump_limit_reached");
    const dispatches = this.selectionRecords.filter(
      ({ kind }) => kind === "coordinator-activation",
    ).length;
    return Object.freeze({
      state: "idle", processed, dispatches,
      skips: this.selectionRecords.length - dispatches,
      selectionRecordCount: this.selectionRecords.length,
      selectionHeadDigest: this.selectionHeadDigest,
      selectionChainValid: this.verifySelectionChain(),
    });
  }
}

export function createAutonomousEventPump(options) {
  return new AutonomousEventPump(options);
}
