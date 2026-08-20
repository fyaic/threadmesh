import process from "node:process";

import { AcpStdioAdapter } from "../src/adapters/acp-stdio.mjs";

const command = process.env.KIMI_BIN ?? "/Users/veil/.kimi-code/bin/kimi";
const adapter = new AcpStdioAdapter();
const result = { command, probe: null, livePrompt: null };

try {
  result.probe = await adapter.probe({ command, args: ["acp"], cwd: process.cwd() });
  const live = await adapter.runPrompt({
    command,
    args: ["acp"],
    cwd: process.cwd(),
    promptText: "Reply with exactly KIMI_THREADMESH_LIVE_OK. Do not use tools.",
    timeoutMs: 60_000,
  });
  const exactSuccess =
    live.text.trim() === "KIMI_THREADMESH_LIVE_OK" &&
    live.truncated === false &&
    live.evidence.stopReason === "end_turn" &&
    live.evidence.permissionDeniedCount === 0;
  result.livePrompt = exactSuccess
    ? live
    : {
        state: "failed",
        code: "kimi_smoke_marker_mismatch",
        evidence: live.evidence,
      };
} catch (error) {
  const detail = error?.message ?? String(error);
  const quotaBlocked =
    error?.code === "acp_agent_quota_error" ||
    (/403/.test(detail) && /usage limit|billing cycle/i.test(detail));
  result.livePrompt = {
    state: quotaBlocked ? "blocked" : "failed",
    code: quotaBlocked ? "kimi_quota_exhausted" : (error?.code ?? "unknown_error"),
    detail,
  };
}

console.log(JSON.stringify(result, null, 2));
if (result.livePrompt.state === "blocked") process.exitCode = 2;
if (result.livePrompt.state === "failed") process.exitCode = 1;
