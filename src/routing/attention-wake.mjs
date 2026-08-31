import { LIFECYCLE_EVENT_TYPES } from "./lifecycle-events.mjs";
import { codedError } from "../protocol-validator.mjs";

/** Bounded defaults for cursor reconciliation after a best-effort wake hint. */
export const ATTENTION_WAKE_LIMITS = Object.freeze({
  pageLimit: 50,
  maxPages: 4,
  maxEvents: 100,
  seenMessages: 256,
});

export const ATTENTION_WAKE_REASON_CODES = Object.freeze({
  RECONCILED: "attention-wake-reconciled",
  HANDLED: "attention-wake-handled",
  IDLE: "attention-wake-idle",
  EVENT_BUDGET_EXHAUSTED: "attention-wake-event-budget-exhausted",
  PAGE_BUDGET_EXHAUSTED: "attention-wake-page-budget-exhausted",
  STALE_HINT: "attention-wake-stale-hint",
});

const LIFECYCLE_EVENT_TYPE_SET = new Set(Object.values(LIFECYCLE_EVENT_TYPES));

function wakeError(detail) {
  return codedError("threadmesh_attention_wake_invalid", detail);
}

function assertBoundedInteger(value, label, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw wakeError(`${label} must be an integer between 1 and ${maximum}`);
  }
}

function assertCursor(value, label) {
  if (!Number.isInteger(value) || value < 0) throw wakeError(`${label} must be a non-negative integer`);
}

function eventIdentity(event) {
  if (typeof event.senderIncarnationId !== "string" || event.senderIncarnationId.length === 0) {
    throw wakeError("event.senderIncarnationId must be a non-empty string");
  }
  if (typeof event.messageId !== "string" || event.messageId.length === 0) {
    throw wakeError("event.messageId must be a non-empty string");
  }
  return `${event.senderIncarnationId}:${event.messageId}`;
}

function assertPage(page, afterCursor, limit) {
  if (!page || !Array.isArray(page.events) || !Number.isInteger(page.nextCursor)) {
    throw wakeError("readPage must return events and nextCursor");
  }
  if (page.events.length > limit) throw wakeError("readPage exceeded requested limit");
  let cursor = afterCursor;
  for (const event of page.events) {
    if (!event || !Number.isInteger(event.cursor) || event.cursor <= cursor) {
      throw wakeError("readPage returned a stale or unordered cursor");
    }
    if (typeof event.eventType !== "string" || event.eventType.length === 0) {
      throw wakeError("event.eventType must be a non-empty string");
    }
    cursor = event.cursor;
  }
  if (page.nextCursor !== cursor) {
    throw wakeError("readPage nextCursor must equal its final durable event cursor");
  }
}

function normalizeWake(wake, cursor) {
  if (wake === undefined || wake === null) return "absent";
  if (!wake || typeof wake !== "object" || Array.isArray(wake)) {
    throw wakeError("wake must be an object when supplied");
  }
  for (const key of Object.keys(wake)) {
    if (key !== "cursor") throw wakeError(`wake has unknown field: ${key}`);
  }
  assertCursor(wake.cursor, "wake.cursor");
  return wake.cursor <= cursor ? "stale" : "current";
}

function compactSeenMessages(seenMessages) {
  while (seenMessages.size > ATTENTION_WAKE_LIMITS.seenMessages) {
    seenMessages.delete(seenMessages.values().next().value);
  }
}

function stableHandlerResult(result) {
  if (result === undefined) {
    return Object.freeze({ state: "handled", reasonCode: ATTENTION_WAKE_REASON_CODES.HANDLED });
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw wakeError("handleEvent result must be an object when supplied");
  }
  const allowed = new Set(["state", "reasonCode"]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) throw wakeError(`handleEvent result has unknown field: ${key}`);
  }
  if (typeof result.state !== "string" || result.state.length === 0 || typeof result.reasonCode !== "string" || result.reasonCode.length === 0) {
    throw wakeError("handleEvent result requires state and reasonCode strings");
  }
  return Object.freeze({ state: result.state, reasonCode: result.reasonCode });
}

/**
 * Cursor consumer for attention-router lifecycle events. A wake is only a
 * best-effort hint: `readPage` is the durable source of truth and callers can
 * call reconcile after a dropped wake or process restart. The helper never
 * sleeps, retries, opens a model turn, or reads a mailbox directly.
 */
export class AttentionWakeCursorConsumer {
  constructor({
    readPage,
    handleEvent,
    isRelevant = (event) => LIFECYCLE_EVENT_TYPE_SET.has(event.eventType),
    afterCursor = 0,
    pageLimit = ATTENTION_WAKE_LIMITS.pageLimit,
    maxPages = ATTENTION_WAKE_LIMITS.maxPages,
    maxEvents = ATTENTION_WAKE_LIMITS.maxEvents,
  } = {}) {
    if (typeof readPage !== "function" || typeof handleEvent !== "function" || typeof isRelevant !== "function") {
      throw wakeError("readPage, handleEvent, and isRelevant must be functions");
    }
    assertCursor(afterCursor, "afterCursor");
    assertBoundedInteger(pageLimit, "pageLimit", ATTENTION_WAKE_LIMITS.pageLimit);
    assertBoundedInteger(maxPages, "maxPages", ATTENTION_WAKE_LIMITS.maxPages);
    assertBoundedInteger(maxEvents, "maxEvents", ATTENTION_WAKE_LIMITS.maxEvents);
    this.readPage = readPage;
    this.handleEvent = handleEvent;
    this.isRelevant = isRelevant;
    this.cursor = afterCursor;
    this.pageLimit = pageLimit;
    this.maxPages = maxPages;
    this.maxEvents = maxEvents;
    this.seenMessages = new Set();
  }

  checkpoint() {
    return this.cursor;
  }

  /**
   * Consume at most `maxPages` / `maxEvents` from the durable event stream.
   * The returned checkpoint is caller-owned durable recovery state.
   */
  async reconcile({ wake } = {}) {
    const wakeDisposition = normalizeWake(wake, this.cursor);
    const startCursor = this.cursor;
    const handled = [];
    let eventsRead = 0;
    let irrelevant = 0;
    let duplicates = 0;
    let pages = 0;
    let terminal = "idle";

    while (pages < this.maxPages && eventsRead < this.maxEvents) {
      const limit = Math.min(this.pageLimit, this.maxEvents - eventsRead);
      const page = await this.readPage({ afterCursor: this.cursor, limit });
      assertPage(page, this.cursor, limit);
      pages += 1;
      if (page.events.length === 0) {
        terminal = "idle";
        break;
      }
      for (const event of page.events) {
        eventsRead += 1;
        if (!this.isRelevant(event)) {
          this.cursor = event.cursor;
          irrelevant += 1;
          continue;
        }
        const identity = eventIdentity(event);
        if (this.seenMessages.has(identity)) {
          this.cursor = event.cursor;
          duplicates += 1;
          continue;
        }
        const result = stableHandlerResult(await this.handleEvent(event));
        // Commit the durable checkpoint and dedupe marker only after the
        // handler succeeds. A thrown handler leaves this event replayable.
        this.seenMessages.add(identity);
        compactSeenMessages(this.seenMessages);
        this.cursor = event.cursor;
        handled.push(Object.freeze({
          cursor: event.cursor,
          messageId: event.messageId,
          result,
        }));
      }
      if (eventsRead >= this.maxEvents) {
        terminal = "event-budget";
        break;
      }
      if (pages >= this.maxPages) {
        terminal = "page-budget";
        break;
      }
      // A short durable page proves that no further currently persisted events
      // were returned. A future wake (or explicit reconcile) starts at cursor.
      if (page.events.length < limit) {
        terminal = "reconciled";
        break;
      }
    }

    const reasonCode =
      terminal === "event-budget"
        ? ATTENTION_WAKE_REASON_CODES.EVENT_BUDGET_EXHAUSTED
        : terminal === "page-budget"
          ? ATTENTION_WAKE_REASON_CODES.PAGE_BUDGET_EXHAUSTED
          : eventsRead === 0 && wakeDisposition === "stale"
            ? ATTENTION_WAKE_REASON_CODES.STALE_HINT
            : eventsRead === 0
              ? ATTENTION_WAKE_REASON_CODES.IDLE
              : ATTENTION_WAKE_REASON_CODES.RECONCILED;
    return Object.freeze({
      state: terminal === "event-budget" || terminal === "page-budget" ? "budget-exhausted" : eventsRead === 0 ? "idle" : "reconciled",
      reasonCode,
      wakeDisposition,
      afterCursor: startCursor,
      nextCursor: this.cursor,
      pages,
      eventsRead,
      handled: Object.freeze(handled),
      duplicates,
      irrelevant,
    });
  }
}
