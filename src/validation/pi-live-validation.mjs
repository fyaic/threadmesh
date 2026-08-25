import { spawn } from "node:child_process";
import fs from "node:fs";

import { sha256Digest } from "../canonical-json.mjs";
import { codedError } from "../protocol-validator.mjs";
import { createAcpProactiveReceiverRuntime } from "./acp-proactive-receiver.mjs";
import {
  installPackedPiConsumer,
  piConsumerEnvironment,
} from "./pi-consumer-validation.mjs";
import { createPiIntegrationFixture } from "./pi-integration-fixture.mjs";
import {
  PROACTIVE_B_CONTENT,
  PROACTIVE_B_MARKER,
  PROACTIVE_B_MISSING_MARKER,
  PROACTIVE_RELEASE_CHECKSUM,
} from "./proactive-codex-scenario.mjs";

const PI_TOOL_NAMES = Object.freeze([
  "threadmesh_related_tasks",
  "threadmesh_send_suggestion",
]);
const PI_SYSTEM_PROMPT =
  "You are Agent A in a bounded coordination benchmark. Only use the exposed ThreadMesh tools. " +
  "Call threadmesh_related_tasks at most once. Call threadmesh_send_suggestion at most once and " +
  "only after discovery shows that the authorized target explicitly needs the result. Never invent " +
  "a target, never claim a send unless its tool succeeds, and do not repeat a failed call.";
const PI_PROMPTS = Object.freeze({
  relevant:
    `You verified upstream artifact checksum ${PROACTIVE_RELEASE_CHECKSUM}. Inspect the authorized ` +
    `relationship. If its summary is waiting for that checksum, send exactly "${PROACTIVE_B_CONTENT}" ` +
    "with a short reason. Finish after the tool result.",
  irrelevant:
    `You verified upstream artifact checksum ${PROACTIVE_RELEASE_CHECKSUM}. Inspect the authorized ` +
    "relationship, but send nothing unless its summary explicitly requests an artifact input. Finish " +
    "after making the decision.",
  control:
    "This is a standalone control task. Do not inspect or contact any other task. Do not call a tool. " +
    "Reply with exactly THREADMESH_PI_CONTROL_OK.",
});
const B_INSTRUCTIONS =
  `You own the downstream release manifest. It can complete only with the verified upstream artifact ` +
  `checksum. If accepted advisory context contains checksum ${PROACTIVE_RELEASE_CHECKSUM}, reply with ` +
  `exactly ${PROACTIVE_B_MARKER}. If asked for the result without that checksum, reply with exactly ` +
  `${PROACTIVE_B_MISSING_MARKER}. Never use tools for this benchmark.`;

function stableCode(value) {
  return typeof value === "string" && /^[a-z0-9_]{1,128}$/.test(value)
    ? value
    : "unknown_error";
}

function classifyError(error) {
  const code = stableCode(error?.code);
  const state = /(?:quota|rate_limit|auth|credential)/.test(code) ? "blocked" : "failed";
  return { state, code };
}

function parsePiEvent(line, projection) {
  if (!line.includes('"type":"tool_execution_') && !line.includes('"type":"message_end"')) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    throw codedError("threadmesh_pi_json_event_invalid");
  }
  if (event.type === "tool_execution_start") {
    projection.toolCalls.push(event.toolName);
    if (!PI_TOOL_NAMES.includes(event.toolName)) projection.nonThreadMeshToolCalls += 1;
  } else if (event.type === "tool_execution_end" && event.isError === true) {
    projection.toolErrors += 1;
  } else if (event.type === "message_end" && event.message?.role === "assistant") {
    projection.model = typeof event.message.model === "string" ? event.message.model : null;
    projection.provider = typeof event.message.provider === "string" ? event.message.provider : null;
    projection.stopReason = typeof event.message.stopReason === "string"
      ? event.message.stopReason
      : null;
    const text = Array.isArray(event.message.content)
      ? event.message.content
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("")
      : "";
    projection.finalTextDigest = sha256Digest(text);
  }
}

export function runPiModelTurn({
  command,
  consumer,
  fixture,
  condition,
  provider = "zai",
  model = "glm-5.3",
  timeoutMs = 180_000,
}) {
  if (!Object.hasOwn(PI_PROMPTS, condition)) {
    throw codedError("threadmesh_pi_condition_invalid");
  }
  const projection = {
    toolCalls: [],
    nonThreadMeshToolCalls: 0,
    toolErrors: 0,
    model: null,
    provider: null,
    stopReason: null,
    finalTextDigest: null,
  };
  const args = [
    "--provider", provider,
    "--model", model,
    "--mode", "json",
    "--print",
    "--no-session",
    "--no-builtin-tools",
    "--no-skills",
    "--no-context-files",
    "--no-extensions",
    "--approve",
    "--extension", consumer.extensionPath,
    "--tools", PI_TOOL_NAMES.join(","),
    "--system-prompt", PI_SYSTEM_PROMPT,
    PI_PROMPTS[condition],
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: consumer.consumerDirectory,
      env: {
        ...process.env,
        ...piConsumerEnvironment(fixture),
        PI_TELEMETRY: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    child.once("error", () => finish(codedError("threadmesh_pi_spawn_failed")));
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-64 * 1024);
    });
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
      if (Buffer.byteLength(stdoutBuffer) > 2 * 1024 * 1024) {
        child.kill("SIGTERM");
        finish(codedError("threadmesh_pi_event_line_too_large"));
        return;
      }
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      try {
        for (const line of lines) parsePiEvent(line, projection);
      } catch (error) {
        child.kill("SIGTERM");
        finish(error);
      }
    });
    child.once("close", (exitCode, signal) => {
      try {
        if (stdoutBuffer) parsePiEvent(stdoutBuffer, projection);
      } catch (error) {
        finish(error);
        return;
      }
      if (timedOut) {
        finish(codedError("threadmesh_pi_timeout"));
        return;
      }
      if (signal || exitCode !== 0) {
        const normalized = stderr.toLowerCase();
        const code = /quota|rate.?limit|insufficient.?balance/.test(normalized)
          ? "threadmesh_pi_quota_error"
          : /auth|credential|api.?key|unauthorized|forbidden/.test(normalized)
            ? "threadmesh_pi_auth_error"
            : "threadmesh_pi_process_failed";
        finish(codedError(code));
        return;
      }
      if (!projection.stopReason || ["error", "aborted"].includes(projection.stopReason)) {
        finish(codedError("threadmesh_pi_model_turn_incomplete"));
        return;
      }
      finish(null, Object.freeze({ ...projection, toolCalls: Object.freeze([...projection.toolCalls]) }));
    });
  });
}

async function receivePublicSdk(fixture) {
  const page = await fixture.receiver.pollMailbox({ receiver: fixture.target });
  const decisions = [];
  for (const message of page.messages) {
    const decided = await fixture.receiver.decide({ message, decision: "accepted" });
    decisions.push(decided.disposition.decision);
  }
  return { count: page.messages.length, decisions };
}

function expectedSequence(condition) {
  if (condition === "relevant") return PI_TOOL_NAMES;
  if (condition === "irrelevant") return [PI_TOOL_NAMES[0]];
  return [];
}

function projectLayer2(condition, turn, mailbox) {
  const expected = expectedSequence(condition);
  const state = JSON.stringify(turn.toolCalls) === JSON.stringify(expected) &&
    turn.nonThreadMeshToolCalls === 0 &&
    turn.toolErrors === 0 &&
    mailbox.count === (condition === "relevant" ? 1 : 0) &&
    (condition !== "relevant" || mailbox.decisions[0] === "accepted")
    ? "passed"
    : "failed";
  return {
    id: condition === "relevant" ? "PI-L2-01" : condition === "irrelevant" ? "PI-L2-02" : "PI-L2-03",
    state,
    condition,
    toolCalls: turn.toolCalls,
    nonThreadMeshToolCalls: turn.nonThreadMeshToolCalls,
    mailboxMessages: mailbox.count,
    receiverDecision: mailbox.decisions[0] ?? "not-requested",
    model: turn.model,
    provider: turn.provider,
    stopReason: turn.stopReason,
    finalTextDigest: turn.finalTextDigest,
  };
}

async function runLayer2Case(options, consumer, condition) {
  const fixture = await createPiIntegrationFixture({ condition });
  try {
    const turn = await runPiModelTurn({ ...options, consumer, fixture, condition });
    const mailbox = await receivePublicSdk(fixture);
    return projectLayer2(condition, turn, mailbox);
  } finally {
    await fixture.close();
  }
}

async function runLayer3(options, consumer) {
  const receiverRuntime = createAcpProactiveReceiverRuntime({
    command: options.kimiCommand,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    productId: "pi-to-kimi-acp",
  });
  let bRef = null;
  let fixture = null;
  let receiverCleanup = { complete: false, public: {} };
  try {
    let baseline;
    try {
      baseline = await receiverRuntime.startBaseline({
        marker: PROACTIVE_B_MISSING_MARKER,
        instructions: B_INSTRUCTIONS,
      });
      bRef = baseline.adapterRef;
    } catch (error) {
      bRef = error.adapterRef ?? null;
      throw error;
    }
    if (baseline.truncated || baseline.text !== PROACTIVE_B_MISSING_MARKER) {
      throw codedError("threadmesh_pi_kimi_baseline_mismatch");
    }
    fixture = await createPiIntegrationFixture({
      condition: "relevant",
      targetHarness: receiverRuntime.harness,
      targetAdapterRef: bRef,
    });
    const turn = await runPiModelTurn({
      ...options,
      consumer,
      fixture,
      condition: "relevant",
    });
    const page = fixture.coordinator.listPending(fixture.target, {}, fixture.receiverPrincipal);
    if (page.messages.length !== 1) throw codedError("threadmesh_pi_kimi_mailbox_mismatch");
    const message = page.messages[0];
    if (message.envelope.content !== PROACTIVE_B_CONTENT) {
      throw codedError("threadmesh_pi_kimi_content_mismatch");
    }
    const claimed = fixture.coordinator.claimPending(
      fixture.source.incarnationId,
      message.envelope.messageId,
      0,
      fixture.receiverPrincipal,
    );
    fixture.coordinator.acknowledgePending(
      fixture.source.incarnationId,
      message.envelope.messageId,
      claimed.claimToken,
      "accepted",
      0,
      fixture.receiverPrincipal,
    );
    const prepared = fixture.coordinator.prepareContextAdmission(
      fixture.source.incarnationId,
      message.envelope.messageId,
      1,
      fixture.receiverPrincipal,
    );
    const delivered = await receiverRuntime.deliver({ prepared });
    if (delivered.truncated || delivered.text !== PROACTIVE_B_MARKER) {
      throw codedError("threadmesh_pi_kimi_marker_mismatch");
    }
    const disposition = fixture.coordinator.confirmContextAdmission(
      fixture.source.incarnationId,
      message.envelope.messageId,
      1,
      prepared.admissionToken,
      delivered.evidence,
      fixture.receiverPrincipal,
    );
    const auditAdmitted = fixture.coordinator.auditEvents(
      fixture.source.incarnationId,
      message.envelope.messageId,
      fixture.receiverPrincipal,
    ).some(({ eventType }) => eventType === "context-admitted");
    const passed = JSON.stringify(turn.toolCalls) === JSON.stringify(PI_TOOL_NAMES) &&
      turn.nonThreadMeshToolCalls === 0 && disposition.delivery === "context-admitted" &&
      disposition.decision === "accepted" && auditAdmitted;
    return {
      id: "PI-L3-01",
      state: passed ? "passed" : "failed",
      senderHarness: "pi-extension",
      receiverHarness: "kimi-acp",
      toolCalls: turn.toolCalls,
      nonThreadMeshToolCalls: turn.nonThreadMeshToolCalls,
      mailboxMessages: page.messages.length,
      decision: disposition.decision,
      delivery: disposition.delivery,
      markerMatched: true,
      contextAdmittedAudit: auditAdmitted,
      evidenceKeys: Object.keys(delivered.evidence).sort(),
      senderModel: turn.model,
      senderProvider: turn.provider,
      receiverMetadata: receiverRuntime.productMetadata(),
    };
  } finally {
    if (bRef) {
      try {
        receiverCleanup = await receiverRuntime.cleanup(bRef);
      } catch {}
    }
    if (fixture) await fixture.close();
    runLayer3.lastCleanup = {
      id: "PI-L3-02",
      state: receiverCleanup.complete && (!fixture || !fs.existsSync(fixture.directory))
        ? "passed"
        : "failed",
      piSessionPersisted: false,
      fixtureRemoved: !fixture || !fs.existsSync(fixture.directory),
      ...receiverCleanup.public,
    };
  }
}

runLayer3.lastCleanup = null;

export async function runPiIntegrationLive({
  piCommand,
  kimiCommand,
  cwd,
  provider = "zai",
  model = "glm-5.3",
  timeoutMs = 180_000,
}) {
  const startedAt = new Date().toISOString();
  const consumer = installPackedPiConsumer();
  const results = [];
  try {
    for (const condition of ["relevant", "irrelevant", "control"]) {
      try {
        results.push(await runLayer2Case(
          { command: piCommand, provider, model, timeoutMs },
          consumer,
          condition,
        ));
      } catch (error) {
        results.push({
          id: condition === "relevant" ? "PI-L2-01" : condition === "irrelevant" ? "PI-L2-02" : "PI-L2-03",
          condition,
          ...classifyError(error),
        });
      }
    }
    try {
      results.push(await runLayer3(
        { command: piCommand, kimiCommand, cwd, provider, model, timeoutMs },
        consumer,
      ));
    } catch (error) {
      results.push({ id: "PI-L3-01", ...classifyError(error) });
    }
    results.push(runLayer3.lastCleanup ?? {
      id: "PI-L3-02",
      state: "failed",
      code: "threadmesh_pi_kimi_cleanup_not_attempted",
    });
  } finally {
    consumer.close();
  }
  const cleanupComplete = !fs.existsSync(consumer.directory) &&
    results.find(({ id }) => id === "PI-L3-02")?.state === "passed";
  const state = results.some((result) => result.state === "failed")
    ? "failed"
    : results.some((result) => result.state === "blocked")
      ? "blocked"
      : "passed";
  return {
    mode: "pi-integration-live",
    startedAt,
    finishedAt: new Date().toISOString(),
    state,
    package: consumer.package,
    results,
    cleanup: {
      attempted: true,
      complete: cleanupComplete,
      temporaryConsumerRemoved: !fs.existsSync(consumer.directory),
    },
  };
}
