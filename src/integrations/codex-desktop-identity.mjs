const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);

/**
 * Project only Codex's request-level metadata, never model tool arguments.
 * Source-backed for 0.153.1; a foreign MCP client can forge metadata, so this
 * is correlation on a host-owned connection, not authentication or consent.
 */
export function codexDesktopCaller(request) {
  const meta = request?.params?._meta;
  if (!object(meta) || meta.threadId === undefined) return null;
  if (!identifier(meta.threadId)) throw new Error("Invalid Codex native thread identity");
  const nested = meta["x-codex-turn-metadata"];
  if (nested !== undefined && !object(nested)) throw new Error("Invalid Codex turn metadata object");
  if (nested?.thread_id !== undefined && nested.thread_id !== meta.threadId) {
    throw new Error("Conflicting Codex native thread identities");
  }
  for (const key of ["session_id", "turn_id"]) {
    if (nested?.[key] !== undefined && !identifier(nested[key])) throw new Error(`Invalid Codex ${key}`);
  }
  return { nativeThreadId: meta.threadId, nativeSessionId: nested?.session_id ?? null,
    nativeTurnId: nested?.turn_id ?? null, provenance: "codex-request-metadata",
    authenticated: false, sharingAuthorized: false };
}

/** SessionId is a runtime identity; do not equate it to the persisted ThreadId. */
export function codexCallerMatchesHook(caller, hook) {
  if (!caller || !object(hook) || !identifier(hook.session_id) ||
      !["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"].includes(hook.hook_event_name)) return false;
  return caller.nativeSessionId !== null && caller.nativeSessionId === hook.session_id;
}
