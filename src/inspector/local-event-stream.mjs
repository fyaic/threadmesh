import { codedError } from "../protocol-validator.mjs";

function assertPage(page, afterCursor) {
  if (!page || !Array.isArray(page.events) || !Number.isInteger(page.nextCursor)) {
    throw codedError("threadmesh_event_stream_page_invalid");
  }
  let previous = afterCursor;
  for (const event of page.events) {
    if (!Number.isInteger(event.cursor) || event.cursor <= previous) {
      throw codedError("threadmesh_event_stream_order_invalid");
    }
    previous = event.cursor;
  }
  if (page.nextCursor < previous) {
    throw codedError("threadmesh_event_stream_cursor_invalid");
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(codedError("threadmesh_event_stream_cancelled"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(codedError("threadmesh_event_stream_cancelled"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Local cursor stream over any authenticated tasks.wait-compatible reader.
 * The checkpoint is caller-owned and can be supplied to a new instance after
 * process or coordinator restart.
 */
export class LocalTaskEventStream {
  constructor({ readPage, afterCursor = 0, pollIntervalMs = 25 } = {}) {
    if (
      typeof readPage !== "function" ||
      !Number.isInteger(afterCursor) ||
      afterCursor < 0 ||
      !Number.isInteger(pollIntervalMs) ||
      pollIntervalMs < 1
    ) {
      throw codedError("threadmesh_event_stream_configuration_invalid");
    }
    this.readPage = readPage;
    this.cursor = afterCursor;
    this.pollIntervalMs = pollIntervalMs;
  }

  checkpoint() {
    return this.cursor;
  }

  async next({ timeoutMs = 1_000, limit = 100, signal } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0) {
      throw codedError("threadmesh_event_stream_timeout_invalid");
    }
    const deadline = Date.now() + timeoutMs;
    while (true) {
      if (signal?.aborted) {
        throw codedError("threadmesh_event_stream_cancelled");
      }
      const page = await this.readPage({
        afterCursor: this.cursor,
        limit,
      });
      assertPage(page, this.cursor);
      if (page.events.length > 0) {
        this.cursor = page.nextCursor;
        return {
          events: page.events,
          nextCursor: this.cursor,
          timedOut: false,
        };
      }
      if (Date.now() >= deadline) {
        return { events: [], nextCursor: this.cursor, timedOut: true };
      }
      await delay(Math.min(this.pollIntervalMs, Math.max(1, deadline - Date.now())), signal);
    }
  }
}
