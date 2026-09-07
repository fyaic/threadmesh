import { sessionFingerprint } from "./probe.mjs";

// Source-observed vendor metadata, not a portable or authenticated contract.
// Deliberately never inspect tool arguments or a shared "last active" identity.
export function inspectIdentity(meta) {
  const codex = meta?.threadId !== undefined || meta?.["x-codex-turn-metadata"] !== undefined;
  const zcode = meta?.session_id !== undefined || meta?.["com.zcode/request-context"] !== undefined;
  const result = { authenticated: false, source: codex && zcode ? "ambiguous" : codex
    ? "codex-vendor-metadata" : zcode ? "zcode-vendor-metadata" : "unrecognized" };
  const unknown = (reason) => ({ ...result, status: "unknown", reason });
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return unknown("missing_metadata");
  if (codex && zcode) return unknown("mixed_host_metadata");
  if (codex) {
    const nested = meta["x-codex-turn-metadata"];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return unknown("missing_session_metadata");
    try { [meta.threadId, nested.thread_id, nested.session_id].forEach(sessionFingerprint); }
    catch { return unknown("invalid_identity"); }
    if (meta.threadId !== nested.thread_id) return unknown("conflicting_thread_identity");
    // SessionId belongs to the runtime; ThreadId identifies the conversation.
    return { ...result, status: "observed", fields: "thread_ids_agree",
      sessionFingerprint: sessionFingerprint(nested.session_id),
      threadFingerprint: sessionFingerprint(meta.threadId) };
  }
  const direct = meta.session_id;
  const nested = meta["com.zcode/request-context"]?.session_id;
  const values = [direct, nested].filter(value => value !== undefined);
  if (!values.length) return unknown("missing_identity");
  try {
    values.forEach(sessionFingerprint);
  } catch {
    return unknown("invalid_identity");
  }
  if (values.length === 2 && direct !== nested) return unknown("conflicting_identity");
  return { ...result, status: "observed", sessionFingerprint: sessionFingerprint(values[0]),
    fields: values.length === 2 ? "both_agree" : direct !== undefined ? "direct_only" : "nested_only" };
}
