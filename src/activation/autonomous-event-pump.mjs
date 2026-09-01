import { randomUUID } from "node:crypto";

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

function publicSelectionRecord(dispatch, routeData) {
  return Object.freeze({
    ...dispatch.selectionRecord,
    handlerConfigDigest: sha256Digest(routeData),
    recordDigest: dispatch.selectionDigest,
  });
}

/**
 * A bounded, next-only dispatcher over coordinator-owned durable attention events.
 * Receiver policy is registered once before start; callers cannot dispatch phases.
 */
export class AutonomousEventPump {
  constructor({
    coordinator, runtime, scenarioId, chainId, recoveryDirectory, maxEvents = 16,
    ownerId = `pump-owner-${randomUUID()}`, leaseMs = 30_000,
    faultInjector = async () => {},
  }) {
    if (!coordinator || !runtime || typeof scenarioId !== "string" ||
        typeof chainId !== "string" || typeof recoveryDirectory !== "string" ||
        !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 1_000 ||
        typeof ownerId !== "string" || ownerId.length < 1 ||
        !Number.isInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000 ||
        typeof faultInjector !== "function") {
      throw coded("threadmesh_event_pump_input_invalid");
    }
    this.coordinator = coordinator;
    this.runtime = runtime;
    this.scenarioId = scenarioId;
    this.chainId = chainId;
    this.recoveryDirectory = recoveryDirectory;
    this.maxEvents = maxEvents;
    this.ownerId = ownerId;
    this.leaseMs = leaseMs;
    this.faultInjector = faultInjector;
    PUMP_REGISTRY.set(this, { entries: [], projection: null, digest: null });
    this.started = false;
    this.running = false;
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
        routes.some((route) => !route?.grant ||
          typeof route.handlerId !== "string" || route.handlerId.length < 1 ||
          typeof route.eventType !== "string" ||
          !Array.isArray(route.subscribedEventTypes) || !route.businessTool ||
          typeof route.onBusinessToolCall !== "function" ||
          typeof route.onLifecyclePublication !== "function" ||
          (route.afterAdmissionPrepared !== undefined &&
            typeof route.afterAdmissionPrepared !== "function"))) {
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
      handlerId: route.handlerId,
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
        afterAdmissionPrepared: routes[index].afterAdmissionPrepared ?? (async () => null),
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
    const pumpIdentityDigest = sha256Digest({
      version: 1,
      scenarioId: this.scenarioId,
      chainId: this.chainId,
      registryDigest: registry.digest,
    });
    Object.defineProperties(this, {
      registrations: {
        value: registry.projection, enumerable: true, writable: false, configurable: false,
      },
      registryDigest: {
        value: registry.digest, enumerable: true, writable: false, configurable: false,
      },
      pumpIdentityDigest: {
        value: pumpIdentityDigest, enumerable: true, writable: false, configurable: false,
      },
    });
    Object.freeze(entries);
    return this;
  }

  #assertRegistry() {
    const registry = PUMP_REGISTRY.get(this);
    const expectedPumpIdentityDigest = sha256Digest({
      version: 1,
      scenarioId: this.scenarioId,
      chainId: this.chainId,
      registryDigest: registry.digest,
    });
    if (sha256Digest(registry.projection) !== registry.digest ||
        this.registrations !== registry.projection || this.registryDigest !== registry.digest ||
        this.pumpIdentityDigest !== expectedPumpIdentityDigest) {
      throw coded("threadmesh_event_pump_registry_tampered");
    }
  }

  #durabilityProjection() {
    let recordCount = 0;
    for (const registration of PUMP_REGISTRY.get(this).entries) {
      const verified = this.coordinator.verifyEventPumpDispatchRecords(
        taskRef(registration.receiver), registration.principal,
      );
      if (verified.valid !== true || verified.scope !== "durable-per-dispatch") {
        throw coded("threadmesh_event_pump_durable_verification_failed");
      }
      recordCount += verified.recordCount;
    }
    return Object.freeze({
      durablePerDispatchRecordsValid: true,
      durablePerDispatchRecordCount: recordCount,
      selectionChainValid: null,
      selectionChainScope: "global-chain-not-implemented",
    });
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
        const durableDispatch = this.coordinator.getEventPumpDispatch(
          taskRef(registration.receiver),
          {
            eventCursor: event.cursor,
            eventId: event.eventId,
            pumpIdentityDigest: this.pumpIdentityDigest,
          },
          registration.principal,
        );
        const target = { registration, cursorState, event, durableDispatch };
        const completedBound = cursorState.activeClaim?.eventId === event.eventId &&
          cursorState.activeClaim?.state === "completed-bound";
        if (durableDispatch?.state === "published" ||
            (!durableDispatch && completedBound)) blocked.push(target);
        else candidates.push({
          ...target,
          publicationPending: durableDispatch?.state === "completed-bound",
        });
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
      if (candidate.durableDispatch?.state === "skipped") {
        const skipped = this.coordinator.advanceAttentionCursor(
          taskRef(registration.receiver),
          {
            eventCursor: observed.cursor,
            eventId: observed.eventId,
            classificationDigest: candidate.durableDispatch.routeDigest,
            expectedRevision: cursorState.cursor.revision,
          },
          registration.principal,
        );
        return Object.freeze({ state: "recovered-skip", skipped });
      }
      const authority = this.coordinator.getEventPumpRouteAuthority(
        taskRef(registration.receiver),
        {
          eventCursor: observed.cursor,
          eventId: observed.eventId,
        },
        registration.principal,
      );
      if (authority.envelope.sender.incarnationId !== observed.senderIncarnationId ||
          authority.envelope.messageId !== observed.messageId) {
        throw coded("threadmesh_event_pump_next_event_mismatch");
      }
      const routeRegistration = registration.routes.find(({ data }) =>
        data.relationshipId === authority.envelope.relationshipId);
      if (!routeRegistration) throw coded("threadmesh_event_pump_route_missing");
      const routeData = routeRegistration.data;
      const lifecycleEvent = eventFromEnvelope(authority.envelope, routeData.eventType);
      const routeProjection = evaluateAttentionRoute({
        event: lifecycleEvent,
        receiverTask: taskRef(registration.receiver),
        subscribedEventTypes: routeData.subscribedEventTypes,
        seenMessageIds: [],
        grant: authority.grant,
        currentGrant: authority.grant,
        sourceTask: authority.sourceTask,
        targetTask: authority.targetTask,
        now: this.coordinator.clock(),
      });
      const routeDigest = sha256Digest(routeProjection);
      await this.faultInjector("pre-record", { observed, routeProjection });
      const recoveringPublication = candidate.publicationPending === true;
      const claimed = recoveringPublication
        ? { acquired: false, dispatch: candidate.durableDispatch }
        : this.coordinator.claimEventPumpDispatch(
          taskRef(registration.receiver),
          {
            eventCursor: observed.cursor,
            eventId: observed.eventId,
            eventDigest: authority.event.eventDigest,
            registryDigest: this.registryDigest,
            scenarioId: this.scenarioId,
            chainId: this.chainId,
            pumpIdentityDigest: this.pumpIdentityDigest,
            handlerId: routeData.handlerId,
            routeDigest,
            ownerId: this.ownerId,
            leaseMs: this.leaseMs,
          },
          registration.principal,
        );
      if (recoveringPublication) {
        if (cursorState.activeClaim?.eventId !== observed.eventId ||
            cursorState.activeClaim?.state !== "completed-bound" ||
            claimed.dispatch.handlerId !== routeData.handlerId ||
            claimed.dispatch.routeDigest !== routeDigest) {
          throw coded("threadmesh_event_pump_publication_recovery_binding_invalid");
        }
      } else {
        if (!claimed.acquired) {
          return Object.freeze({ state: "blocked-durable-lease", dispatch: claimed.dispatch });
        }
        await this.faultInjector("post-record-pre-turn", {
          observed, routeProjection, dispatch: claimed.dispatch,
        });
      }
      if (routeProjection.state !== "offered") {
        if (recoveringPublication) {
          throw coded("threadmesh_event_pump_publication_recovery_route_invalid");
        }
        const settled = this.coordinator.settleEventPumpDispatch(
          claimed.dispatch.dispatchId,
          {
            ownerId: this.ownerId,
            leaseEpoch: claimed.dispatch.leaseEpoch,
            pumpIdentityDigest: this.pumpIdentityDigest,
            outcome: "skipped",
          },
          registration.principal,
        );
        const skipped = this.coordinator.advanceAttentionCursor(
          taskRef(registration.receiver),
          {
            eventCursor: observed.cursor,
            eventId: observed.eventId,
            classificationDigest: routeDigest,
            expectedRevision: cursorState.cursor.revision,
          },
          registration.principal,
        );
        this.skips += 1;
        const selectionRecord = publicSelectionRecord(settled.dispatch, routeData);
        this.selectionRecords.push(selectionRecord);
        this.selectionHeadDigest = settled.dispatch.selectionDigest;
        return Object.freeze({
          state: "skipped", routeProjection, skipped,
          selectionRecord,
        });
      }
      const admissionAuthority = this.coordinator.getEventPumpRouteAuthority(
        taskRef(registration.receiver),
        {
          eventCursor: observed.cursor,
          eventId: observed.eventId,
          relationshipId: routeData.relationshipId,
        },
        registration.principal,
      );
      if (admissionAuthority.authorityDigest !== authority.authorityDigest) {
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
        afterAdmissionPrepared: routeRegistration.afterAdmissionPrepared,
      });
      if (recoveringPublication && activation.replay !== true) {
        throw coded("threadmesh_event_pump_publication_recovery_started_turn");
      }
      let settled;
      if (recoveringPublication) {
        settled = { dispatch: claimed.dispatch, replay: true };
      } else {
        await this.faultInjector("post-turn-pre-settle", {
          observed, routeProjection, activation, dispatch: claimed.dispatch,
        });
        settled = this.coordinator.settleEventPumpDispatch(
          claimed.dispatch.dispatchId,
          {
            ownerId: this.ownerId,
            leaseEpoch: claimed.dispatch.leaseEpoch,
            pumpIdentityDigest: this.pumpIdentityDigest,
            outcome: "completed-bound",
            turnExecutionId: activation.businessExecutionId ?? activation.decisionExecutionId,
          },
          registration.principal,
        );
      }
      await this.faultInjector("post-settle-pre-publication", {
        observed, routeProjection, activation, dispatch: settled.dispatch,
      });
      await routeRegistration.onLifecyclePublication({
        coordinator: this.coordinator,
        activation,
        lifecycleEvent,
        routeProjection,
      });
      const published = this.coordinator.completeEventPumpPublication(
        settled.dispatch.dispatchId,
        {
          pumpIdentityDigest: this.pumpIdentityDigest,
          handlerId: routeData.handlerId,
        },
        registration.principal,
      );
      this.dispatches += 1;
      const selectionRecord = publicSelectionRecord(published.dispatch, routeData);
      this.selectionRecords.push(selectionRecord);
      this.selectionHeadDigest = published.dispatch.selectionDigest;
      return Object.freeze({
        state: recoveringPublication ? "recovered-publication" : "dispatched",
        activation, routeProjection,
        selectionRecord,
      });
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
          ({ outcome }) => outcome === "completed-bound",
        ).length;
        const skips = this.selectionRecords.length - dispatches;
        return Object.freeze({
          state: "idle", processed, dispatches, skips,
          selectionRecordCount: this.selectionRecords.length,
          selectionHeadDigest: this.selectionHeadDigest,
          ...this.#durabilityProjection(),
        });
      }
      if (["blocked-completed-bound", "blocked-durable-lease"].includes(result.state)) {
        const dispatches = this.selectionRecords.filter(
          ({ outcome }) => outcome === "completed-bound",
        ).length;
        return Object.freeze({
          ...result,
          processed,
          dispatches,
          skips: this.selectionRecords.length - dispatches,
          selectionRecordCount: this.selectionRecords.length,
          selectionHeadDigest: this.selectionHeadDigest,
          ...this.#durabilityProjection(),
        });
      }
      processed += 1;
    }
    const remaining = this.#nextCandidate();
    if (remaining?.blocked) {
      const dispatches = this.selectionRecords.filter(
        ({ outcome }) => outcome === "completed-bound",
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
        ...this.#durabilityProjection(),
      });
    }
    if (remaining) throw coded("threadmesh_event_pump_limit_reached");
    const dispatches = this.selectionRecords.filter(
      ({ outcome }) => outcome === "completed-bound",
    ).length;
    return Object.freeze({
      state: "idle", processed, dispatches,
      skips: this.selectionRecords.length - dispatches,
      selectionRecordCount: this.selectionRecords.length,
      selectionHeadDigest: this.selectionHeadDigest,
      ...this.#durabilityProjection(),
    });
  }
}

export function createAutonomousEventPump(options) {
  return new AutonomousEventPump(options);
}
