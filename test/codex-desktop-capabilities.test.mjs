import test from "node:test";
import assert from "node:assert/strict";
import { probeCodexDesktopEndpoint } from "../src/integrations/codex-desktop-capabilities.mjs";
import { codexDesktopCaller, codexCallerMatchesHook } from "../src/integrations/codex-desktop-identity.mjs";

test("passive default-endpoint preflight never starts a daemon or touches chats", async () => {
  const calls = [];
  const result = await probeCodexDesktopEndpoint({ executable: "/native/codex" }, async (_, args, options) => {
    calls.push(args);
    assert.equal(options.timeout, 5000);
    assert.equal(options.maxBuffer, 65536);
    return args[0] === "--version" ? { code: 0, stdout: "codex-cli 0.153.1\n" }
      : { code: 1, stderr: "failed to connect /private/user/app-server-control.sock: No such file or directory (os error 2)" };
  });
  assert.deepEqual(calls, [["--version"], ["app-server", "daemon", "version"]]);
  assert.equal(result.reason, "public_control_socket_missing");
  assert.equal(result.desktopOwnerVerified, false);
  assert.equal(result.readyForDirectedDelivery, false);
  assert.doesNotMatch(JSON.stringify(result), /private\/user/);
});

test("a reachable server version is not desktop owner proof", async () => {
  const result = await probeCodexDesktopEndpoint({ executable: "/native/codex" }, async (_, args) => ({
    code: 0, stdout: args[0] === "--version" ? "codex-cli 0.153.1" : JSON.stringify({
      appServerVersion: "0.153.1", pid: 1234, socketPath: "/private/other-server.sock", status: "version",
    }),
  }));
  assert.equal(result.endpointReachable, true);
  assert.equal(result.appServerVersion, "0.153.1");
  assert.equal(result.desktopOwnerVerified, false);
  assert.equal(result.readyForDirectedDelivery, false);
  assert.doesNotMatch(JSON.stringify(result), /1234|other-server/);
});

test("probe fails boundedly on timeout, unsupported CLI, malformed output and invalid executable", async () => {
  for (const [reply, reason] of [
    [{ code: 1, killed: true }, "public_endpoint_probe_timed_out"],
    [{ code: 2, stderr: "unrecognized subcommand 'daemon'" }, "public_daemon_command_unavailable"],
    [{ code: 0, stdout: "not JSON" }, "invalid_native_probe_response"],
    [{ code: 0, stdout: '{"appServerVersion":"secret metadata"}' }, "invalid_native_probe_response"],
  ]) {
    const result = await probeCodexDesktopEndpoint({ executable: "/native/codex" }, async (_, args) =>
      args[0] === "--version" ? { code: 0, stdout: "codex-cli 0.153.1" } : reply);
    assert.equal(result.reason, reason);
  }
  await assert.rejects(probeCodexDesktopEndpoint({ executable: "codex" }), /absolute/);
  await assert.rejects(probeCodexDesktopEndpoint({ executable: "/native/codex", timeoutMs: 60000 }), /timeout/);
});

test("native caller comes from host request metadata, not tool arguments", () => {
  assert.equal(codexDesktopCaller({ params: { arguments: { threadId: "forged", session_id: "forged" } } }), null);
  const caller = codexDesktopCaller({ params: { arguments: { threadId: "forged" }, _meta: {
    threadId: "thread_native", "x-codex-turn-metadata": {
      thread_id: "thread_native", session_id: "runtime_session", turn_id: "turn_native", private_field: "ignored",
    },
  } } });
  assert.equal(caller.nativeThreadId, "thread_native");
  assert.equal(caller.authenticated, false);
  assert.equal(caller.sharingAuthorized, false);
  assert.equal(codexCallerMatchesHook(caller, { hook_event_name: "PreToolUse", session_id: "runtime_session" }), true);
  assert.equal(codexCallerMatchesHook(caller, { hook_event_name: "PreToolUse", session_id: "thread_native" }), false);
  assert.doesNotMatch(JSON.stringify(caller), /ignored|forged/);
});

test("metadata drift never falls back to a global latest session or caller arguments", () => {
  assert.throws(() => codexDesktopCaller({ params: { _meta: { threadId: "a", "x-codex-turn-metadata": { thread_id: "b" } } } }), /Conflicting/);
  assert.throws(() => codexDesktopCaller({ params: { _meta: { threadId: "a", "x-codex-turn-metadata": '{"session_id":"s"}' } } }), /object/);
  assert.throws(() => codexDesktopCaller({ params: { _meta: { threadId: "../private" } } }), /identity/);
  const caller = codexDesktopCaller({ params: { _meta: { threadId: "a" } } });
  assert.equal(caller.nativeSessionId, null);
  assert.equal(codexCallerMatchesHook(caller, { hook_event_name: "SessionStart", session_id: "a" }), false);
});
