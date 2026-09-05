import path from "node:path";

// Native results and durable delivery are distinct from an attempted/reserved send.
export function nativeSendOutcomes(rows) {
  return rows.flatMap(row => {
    const event = row.event;
    let result, failed;
    if (event.type === "tool_execution_end" && event.toolName === "threadmesh_send") {
      result = event.result;
      failed = !!(event.isError || result?.isError);
    } else if (event.type === "item.completed" && event.item?.type === "mcp_tool_call" &&
      event.item.server === "threadmesh" && event.item.tool === "threadmesh_send") {
      result = event.item.result;
      failed = !!(event.item.error || result?.isError || event.item.status === "failed");
    } else return [];
    let payload;
    for (const item of result?.content ?? []) {
      if (item.type !== "text") continue;
      try { payload = JSON.parse(item.text); if (payload?.queued === true) break; } catch { /* Not a JSON result. */ }
    }
    return [{ session: row.session, elapsedMs: row.elapsedMs, failed,
      queued: !failed && payload?.queued === true,
      ...(typeof payload?.messageId === "string" ? { messageId: payload.messageId } : {}) }];
  });
}

export function deliveredSends(workspace, sender, receiver) {
  // workspace_sends is a budget reservation; require the actual stored envelope too.
  return workspace.db.prepare(`SELECT s.message_id, s.sent_at, d.delivery_state
    FROM workspace_sends s JOIN messages m ON m.message_id=s.message_id
    JOIN dispositions d ON d.message_id=m.message_id AND d.sender_incarnation_id=m.sender_incarnation_id
    WHERE s.source=? AND s.target=? AND d.delivery_state NOT IN ('failed', 'expired')
    ORDER BY s.sent_at`).all(sender, receiver);
}

export function receiverContinuation(rows, receiver, afterMs) {
  const start = rows.findIndex(row => row.session === receiver && row.event.type === "agent_start" && row.elapsedMs > afterMs);
  if (start < 0) return null;
  const end = rows.slice(start + 1).find(row => row.session === receiver && row.event.type === "agent_end");
  return end ? { startedMs: rows[start].elapsedMs, completedMs: end.elapsedMs } : null;
}

export function receiverArtifactWrites(rows, receiver, cwd, artifact, afterMs) {
  const target = path.resolve(artifact);
  return rows.flatMap((row, index) => {
    const event = row.event;
    if (row.session !== receiver || row.elapsedMs <= afterMs || event.type !== "tool_execution_start" ||
      !["write", "edit"].includes(event.toolName) || typeof event.args?.path !== "string" ||
      path.resolve(cwd, event.args.path) !== target || !event.toolCallId) return [];
    const end = rows.slice(index + 1).find(candidate => candidate.session === receiver &&
      candidate.event.type === "tool_execution_end" && candidate.event.toolCallId === event.toolCallId);
    if (!end || end.event.isError || end.event.result?.isError) return [];
    return [{ tool: event.toolName, startedMs: row.elapsedMs, completedMs: end.elapsedMs }];
  });
}
