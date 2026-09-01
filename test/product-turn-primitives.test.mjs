import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  renderRegisteredPeerContext,
  renderRegisteredPeerOffer,
} from "../src/rendering/context-admission.mjs";
import { createCodexPersistedTurnObservation } from
  "../src/state/codex-turn-reconciliation.mjs";
import {
  CodexLiveAgentRuntime,
  REGISTERED_PEER_DECISION_TOOL,
  createAdmittedTurnBinding,
  createRecoveredDecisionCommit,
  createCompletedDecisionCommit,
} from "../src/validation/live-agent-scenario.mjs";

const SNAPSHOT = `sha256:${"a".repeat(64)}`;
const REF = Object.freeze({
  kind: "codex-app-server",
  threadId: "thread-product-primitives",
  snapshotDigest: SNAPSHOT,
  userAgent: "codex-test/0.145.0",
});
const BUSINESS_TOOL = Object.freeze({
  type: "function",
  name: "threadmesh_report_review_finding",
  description: "Report one bounded review finding.",
  inputSchema: Object.freeze({ type: "object", additionalProperties: false }),
});

function envelope(content = "RAW BUSINESS CONTENT MUST STAY HIDDEN") {
  return {
    specVersion: "0.0-draft",
    messageId: "msg_product-primitives",
    messageType: "suggestion",
    intent: "suggest",
    claimStatus: "sender-asserted",
    sender: {
      taskId: "task-source",
      incarnationId: "inc_source01",
      actorType: "agent",
      harness: "codex-app-server",
    },
    target: {
      taskId: "task-receiver",
      incarnationId: "inc_receiver01",
      harness: "codex-app-server",
    },
    relationshipId: "rel_product-primitives",
    content,
    reason: "A reviewed upstream artifact is ready for receiver evaluation.",
    delivery: { requestedMode: "checkpoint-offer", requiresDisposition: true },
    createdAt: "2026-09-01T09:00:00.000Z",
    expiresAt: "2026-09-01T09:10:00.000Z",
  };
}

function offer(overrides = {}) {
  return {
    cursor: 1,
    envelope: envelope(),
    disposition: {
      revision: 0,
      delivery: "durably-received",
      decision: "pending",
      outcome: "not-observed",
    },
    claim: null,
    ...overrides,
  };
}

function prepared(overrides = {}) {
  const value = {
    admissionToken: "admission-token-product-primitives",
    adapterRef: REF,
    envelope: envelope("The independently reviewed finding is case-sensitive."),
    admission: {
      decision: "accepted",
      receiverIncarnationId: "inc_receiver01",
      revision: 1,
    },
    revision: 1,
  };
  value.rendering = renderRegisteredPeerContext(value.envelope);
  return { ...value, ...overrides };
}

function adapter({
  selection = "accepted",
  mode = "success",
  recoveryStatus = "interrupted",
} = {}) {
  const state = {
    nativeStarts: 0,
    observations: 0,
    callbackEffects: 0,
    prompt: null,
    dynamicTools: null,
    adapterIdempotencyKey: null,
    startedTurnId: "turn-product-primitives",
  };
  return {
    state,
    async createDynamicToolThread() { return REF; },
    async observePersistedTurns() {
      state.observations += 1;
      const turns = state.nativeStarts === 0 ? [] : [{
        id: state.startedTurnId,
        status: recoveryStatus,
        items: [{ type: "userMessage", clientId: state.adapterIdempotencyKey }],
      }];
      return createCodexPersistedTurnObservation({
        threadId: REF.threadId,
        snapshotDigest: SNAPSHOT,
        threadStatus: turns.length === 0 ? "idle" : "notLoaded",
        readTurns: turns,
        listedTurns: turns,
      });
    },
    async runAutonomousToolTurn(options) {
      state.nativeStarts += 1;
      state.prompt = options.prompt;
      state.dynamicTools = options.dynamicTools;
      state.adapterIdempotencyKey = options.adapterIdempotencyKey;
      await options.beforeTurnStart({
        threadId: REF.threadId,
        snapshotDigest: SNAPSHOT,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      const callbackTurnId = mode === "wrong-start-turn"
        ? "turn-wrong-start"
        : state.startedTurnId;
      await options.onTurnStarted({
        threadId: REF.threadId,
        turnId: callbackTurnId,
        snapshotDigest: SNAPSHOT,
        adapterIdempotencyKey: options.adapterIdempotencyKey,
      });
      if (mode === "terminal") {
        throw Object.assign(new Error("transport failed after start"), {
          code: "codex_app_server_exited",
        });
      }
      const calls = [];
      if (mode !== "missing-tool") {
        const isDecision = options.dynamicTools.length === 1 &&
          options.dynamicTools[0].name === "threadmesh_decide_offer";
        const metadata = {
          threadId: REF.threadId,
          turnId: callbackTurnId,
          callId: "call-product-primitives",
          ordinal: 0,
          tool: isDecision ? "threadmesh_decide_offer" : options.dynamicTools[0].name,
          arguments: isDecision ? {
            messageId: mode === "wrong-message" ? "msg-wrong" : envelope().messageId,
            decision: selection,
          } : {},
          argumentsDigest: sha256Digest(isDecision ? {
            messageId: mode === "wrong-message" ? "msg-wrong" : envelope().messageId,
            decision: selection,
          } : {}),
        };
        try {
          await options.beforeToolCall(metadata);
          const output = await options.onToolCall(metadata);
          state.callbackEffects += 1;
          const completed = {
            ...metadata,
            outputDigest: sha256Digest(output),
            resultStatus: "completed",
          };
          delete completed.arguments;
          await options.afterToolCall(completed);
          calls.push(completed);
        } catch (error) {
          throw error;
        }
      }
      const evidenceTurnId = mode === "wrong-result-turn"
        ? "turn-wrong-result"
        : callbackTurnId;
      const returnedCalls = mode === "tampered-final-call" && calls.length === 1
        ? [{ ...calls[0], outputDigest: sha256Digest("tampered") }]
        : calls;
      return {
        state: "completed",
        text: "done",
        truncated: false,
        receipt: {
          adapterOperationId: evidenceTurnId,
          acceptedAt: "2026-09-01T09:00:01.000Z",
          evidenceRefs: [
            `codex-app-server://thread/${REF.threadId}/turn/${evidenceTurnId}`,
          ],
        },
        evidence: {
          threadId: REF.threadId,
          turnId: evidenceTurnId,
          turnStatus: "completed",
          completedAt: "2026-09-01T09:00:01.000Z",
          snapshotDigest: SNAPSHOT,
        },
        toolCalls: returnedCalls,
        nonThreadMeshToolCalls: 0,
      };
    },
  };
}

async function fixture(t, adapterValue, suffix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `threadmesh-product-${suffix}-`));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runtime = new CodexLiveAgentRuntime({ command: "/fake/codex", adapter: adapterValue });
  const ref = await runtime.createRole({
    role: "r",
    cwd: "/private/reviewer",
    tools: [REGISTERED_PEER_DECISION_TOOL],
    phaseTools: {
      decision: [REGISTERED_PEER_DECISION_TOOL],
      review: [BUSINESS_TOOL],
    },
    protectedPhases: {
      decision: "receiver-decision",
      review: "admitted-tool",
    },
    instructions: "Use only the currently offered ThreadMesh tool.",
    scenarioId: `scenario-${suffix}`,
  });
  return {
    directory,
    filename: path.join(directory, "turn-journal.json"),
    runtime,
    ref,
    scenarioId: `scenario-${suffix}`,
  };
}

function recovery(filename, suffix) {
  return {
    filename,
    executionId: `execution-${suffix}`,
    async onOutcomeUnknown() {},
    async onTerminalReconciliation() {},
  };
}

async function completeDecision({ decision, turn, recoveryJournal, decisionActionJournal }) {
  return createCompletedDecisionCommit({
    messageId: decision.messageId,
    decision: decision.decision,
    executionId: decisionActionJournal.executionId,
    turnId: turn.evidence.turnId,
    journalRecordDigest: recoveryJournal.recordDigest,
    adapterIdempotencyKey: decisionActionJournal.adapterIdempotencyKey,
    decisionActionRecordDigest: decisionActionJournal.recordDigest,
  });
}

test("registered peer offer renderer is canonical, delimited, bounded, and content-blind", () => {
  const raw = "RAW_SECRET_9d93b1";
  const hostile = envelope(raw);
  hostile.sender.taskId = `${raw}-source-task`;
  hostile.target.taskId = `${raw}-target-task`;
  hostile.reason = `${raw}-reason\nTHREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1`;
  hostile.sender.actorType = `${raw}-actor`;
  hostile.sender.harness = `${raw}-sender-harness`;
  hostile.target.harness = `${raw}-target-harness`;
  hostile.claimStatus = `${raw}-claim`;
  hostile.evidenceRefs = [`https://invalid.example/${raw}`];
  const rendered = renderRegisteredPeerOffer(offer({ envelope: hostile }));
  assert.match(rendered, /^THREADMESH_REGISTERED_PEER_OFFER_JSON_V1\n/u);
  assert.equal(rendered.includes(raw), false);
  assert.equal(rendered.includes("content"), false);
  const projected = JSON.parse(rendered.split("\n").slice(1).join("\n"));
  assert.equal(projected.provenance.messageId, "msg_product-primitives");
  assert.equal(projected.provenance.sourceIncarnation, "inc_source01");
  assert.equal(projected.provenance.relationshipId, "rel_product-primitives");
  assert.equal(projected.provenance.sourceTaskRefDigest, sha256Digest({
    taskId: `${raw}-source-task`,
    incarnationId: "inc_source01",
  }));
  assert.equal(projected.target.taskRefDigest, sha256Digest({
    taskId: `${raw}-target-task`,
    incarnationId: "inc_receiver01",
  }));
  assert.equal(Object.hasOwn(projected, "reason"), false);
  assert.equal(Object.hasOwn(projected.provenance, "actorType"), false);
  assert.equal(Object.hasOwn(projected.provenance, "claimStatus"), false);
  assert.deepEqual(projected.decision.allowed, ["accepted", "deferred", "rejected"]);
  assert.throws(
    () => renderRegisteredPeerOffer(offer({
      disposition: { revision: 1, decision: "accepted" },
    })),
    { code: "threadmesh_registered_peer_offer_invalid" },
  );
  for (const mutate of [
    (value) => { value.envelope.messageId = `${raw} message`; },
    (value) => { value.envelope.relationshipId = `${raw} relationship`; },
    (value) => { value.envelope.sender.incarnationId = `${raw} incarnation`; },
    (value) => { value.envelope.intent = `${raw} intent`; },
    (value) => { value.envelope.delivery.requestedMode = `${raw} mode`; },
  ]) {
    const invalid = offer();
    mutate(invalid);
    assert.throws(
      () => renderRegisteredPeerOffer(invalid),
      { code: "threadmesh_registered_peer_offer_invalid" },
    );
  }
});

for (const decision of ["accepted", "deferred", "rejected"]) {
  test(`receiver decision primitive completes exact ${decision} selection and retires journal`, async (t) => {
    const fake = adapter({ selection: decision });
    const value = await fixture(t, fake, `decision-${decision}`);
    const result = await value.runtime.runReceiverDecisionTurn({
      role: "r",
      phase: "decision",
      cwd: "/private/reviewer",
      ref: value.ref,
      offer: offer(),
      scenarioId: value.scenarioId,
      turnRecovery: recovery(value.filename, `decision-${decision}`),
      onCompletedDecisionTurn: async (completed) => {
        assert.equal(fs.existsSync(value.filename), true);
        assert.equal(completed.decision.decision, decision);
        assert.equal(completed.turn.evidence.turnStatus, "completed");
        assert.equal(completed.turn.toolCalls.length, 1);
        return completeDecision(completed);
      },
    });
    assert.deepEqual(result.decision, {
      messageId: "msg_product-primitives",
      decision,
    });
    assert.equal(result.recoveryJournal.retired, true);
    assert.equal(fs.existsSync(value.filename), false);
    assert.equal(fake.state.prompt, renderRegisteredPeerOffer(offer()));
    assert.deepEqual(fake.state.dynamicTools.map(({ name }) => name), [
      "threadmesh_decide_offer",
    ]);
  });
}

test("receiver decision requires a post-completion coordinator callback before adapter access", async (t) => {
  const fake = adapter();
  const value = await fixture(t, fake, "decision-missing-completion-callback");
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
      offer: offer(), scenarioId: value.scenarioId,
      turnRecovery: recovery(value.filename, "decision-missing-completion-callback"),
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_required" },
  );
  assert.equal(fake.state.nativeStarts, 0);
  assert.equal(fs.existsSync(value.filename), false);
});

test("completed decision callback failure retains journal and never resends without exact commit", async (t) => {
  const fake = adapter({ recoveryStatus: "completed" });
  const value = await fixture(t, fake, "decision-completed-uncommitted");
  const args = {
    role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
    offer: offer(), scenarioId: value.scenarioId,
    turnRecovery: recovery(value.filename, "decision-completed-uncommitted"),
    async onCompletedDecisionTurn({ turn }) {
      assert.equal(turn.evidence.turnStatus, "completed");
      assert.equal(fs.existsSync(value.filename), true);
      throw new Error("crash before coordinator commit");
    },
  };
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn(args),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  assert.equal(fake.state.nativeStarts, 1);
  assert.equal(fs.existsSync(value.filename), true);

  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      ...args,
      onCompletedDecisionTurn: completeDecision,
      async recoverCompletedDecision() { return null; },
    }),
    { code: "threadmesh_live_receiver_decision_completed_recovery_unresolved" },
  );
  assert.equal(fake.state.nativeStarts, 1);
  assert.equal(fs.existsSync(value.filename), true);
});

test("decision completion receipt must bind the privately staged exact selection", async (t) => {
  const fake = adapter({ selection: "accepted" });
  const value = await fixture(t, fake, "decision-receipt-mismatch");
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
      offer: offer(), scenarioId: value.scenarioId,
      turnRecovery: recovery(value.filename, "decision-receipt-mismatch"),
      async onCompletedDecisionTurn({ turn, recoveryJournal, decisionActionJournal }) {
        return createCompletedDecisionCommit({
          messageId: "msg_product-primitives",
          decision: "rejected",
          executionId: decisionActionJournal.executionId,
          journalRecordDigest: recoveryJournal.recordDigest,
          adapterIdempotencyKey: decisionActionJournal.adapterIdempotencyKey,
          turnId: turn.evidence.turnId,
          decisionActionRecordDigest: decisionActionJournal.recordDigest,
        });
      },
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  assert.equal(fs.existsSync(value.filename), true);
  assert.equal(fs.existsSync(`${value.filename}.decision-action`), true);
});

test("decision action journal rejects symlink, hardlink, conflict, and tampering", async (t) => {
  for (const attack of ["symlink", "hardlink", "conflict"]) {
    await t.test(attack, async (t2) => {
      const fake = adapter();
      const value = await fixture(t2, fake, `decision-action-${attack}`);
      const companion = `${value.filename}.decision-action`;
      const foreign = path.join(value.directory, `${attack}-foreign`);
      fs.writeFileSync(foreign, "foreign\n", { mode: 0o600 });
      if (attack === "symlink") fs.symlinkSync(foreign, companion);
      else if (attack === "hardlink") fs.linkSync(foreign, companion);
      else fs.writeFileSync(companion, "{}\n", { mode: 0o600 });
      await assert.rejects(
        () => value.runtime.runReceiverDecisionTurn({
          role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
          offer: offer(), scenarioId: value.scenarioId,
          turnRecovery: recovery(value.filename, `decision-action-${attack}`),
          onCompletedDecisionTurn: completeDecision,
        }),
        (error) => error?.code?.startsWith("threadmesh_") === true,
      );
    });
  }

  const fake = adapter({ recoveryStatus: "completed" });
  const value = await fixture(t, fake, "decision-action-tamper");
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
      offer: offer(), scenarioId: value.scenarioId,
      turnRecovery: recovery(value.filename, "decision-action-tamper"),
      async onCompletedDecisionTurn() { throw new Error("retain"); },
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  const companion = `${value.filename}.decision-action`;
  const tampered = JSON.parse(fs.readFileSync(companion, "utf8"));
  tampered.arguments.decision = "rejected";
  fs.writeFileSync(companion, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
      offer: offer(), scenarioId: value.scenarioId,
      turnRecovery: recovery(value.filename, "decision-action-tamper"),
      onCompletedDecisionTurn: completeDecision,
      async recoverCompletedDecision() { return null; },
    }),
    { code: "threadmesh_live_receiver_decision_completed_recovery_unresolved" },
  );
});

test("commit-success then retire crash recovers exact binding idempotently and retires", async (t) => {
  const fake = adapter({ recoveryStatus: "completed" });
  const value = await fixture(t, fake, "decision-committed-before-retire");
  let committedDecision = null;
  const base = {
    role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
    offer: offer(), scenarioId: value.scenarioId,
    turnRecovery: recovery(value.filename, "decision-committed-before-retire"),
  };
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      ...base,
      async onCompletedDecisionTurn({ decision }) {
        committedDecision = decision.decision;
        throw new Error("response lost after durable coordinator commit");
      },
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  assert.equal(committedDecision, "accepted");
  assert.equal(fs.existsSync(value.filename), true);

  const recovered = await value.runtime.runReceiverDecisionTurn({
    ...base,
    onCompletedDecisionTurn: completeDecision,
    async recoverCompletedDecision({
      messageId, decision, executionId, adapterIdempotencyKey, journal, observedTurn,
      decisionAction,
    }) {
      assert.equal(committedDecision, "accepted");
      assert.equal(decision, committedDecision);
      assert.equal(fs.existsSync(value.filename), true);
      return createRecoveredDecisionCommit({
        messageId,
        decision: committedDecision,
        executionId,
        journalRecordDigest: journal.recordDigest,
        adapterIdempotencyKey,
        turnId: observedTurn.turnId,
        decisionActionRecordDigest: decisionAction.recordDigest,
      });
    },
  });
  assert.equal(recovered.state, "recovered");
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.decision, {
    messageId: "msg_product-primitives",
    decision: "accepted",
  });
  assert.equal(recovered.recoveryJournal.retired, true);
  assert.equal(fake.state.nativeStarts, 1);
  assert.equal(fs.existsSync(value.filename), false);
});

test("retire crash after base journal removal recovers from exact completed action", async (t) => {
  const fake = adapter({ recoveryStatus: "completed" });
  const value = await fixture(t, fake, "decision-orphan-action-recovery");
  const base = {
    role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
    offer: offer(), scenarioId: value.scenarioId,
    turnRecovery: recovery(value.filename, "decision-orphan-action-recovery"),
  };
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      ...base,
      async onCompletedDecisionTurn() { throw new Error("committed response lost"); },
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  fs.unlinkSync(value.filename);
  const recovered = await value.runtime.runReceiverDecisionTurn({
    ...base,
    onCompletedDecisionTurn: completeDecision,
    async recoverCompletedDecision({
      messageId, decision, executionId, adapterIdempotencyKey, journal, observedTurn,
      decisionAction,
    }) {
      return createRecoveredDecisionCommit({
        messageId, decision, executionId, adapterIdempotencyKey,
        journalRecordDigest: journal.recordDigest,
        turnId: observedTurn.turnId,
        decisionActionRecordDigest: decisionAction.recordDigest,
      });
    },
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.decision.decision, "accepted");
  assert.equal(fs.existsSync(`${value.filename}.decision-action`), false);
  assert.equal(fake.state.nativeStarts, 1);
});

test("decision recovery cannot substitute a different coordinator decision", async (t) => {
  const fake = adapter({ selection: "accepted", recoveryStatus: "completed" });
  const value = await fixture(t, fake, "decision-recovery-selection-mismatch");
  const base = {
    role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
    offer: offer(), scenarioId: value.scenarioId,
    turnRecovery: recovery(value.filename, "decision-recovery-selection-mismatch"),
  };
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      ...base, async onCompletedDecisionTurn() { throw new Error("retain"); },
    }),
    { code: "threadmesh_live_receiver_decision_completion_callback_failed" },
  );
  await assert.rejects(
    () => value.runtime.runReceiverDecisionTurn({
      ...base,
      onCompletedDecisionTurn: completeDecision,
      async recoverCompletedDecision({
        messageId, executionId, adapterIdempotencyKey, journal, observedTurn,
        decisionAction,
      }) {
        return createRecoveredDecisionCommit({
          messageId, decision: "rejected", executionId, adapterIdempotencyKey,
          journalRecordDigest: journal.recordDigest,
          turnId: observedTurn.turnId,
          decisionActionRecordDigest: decisionAction.recordDigest,
        });
      },
    }),
    { code: "threadmesh_live_receiver_decision_completed_recovery_unresolved" },
  );
  assert.equal(fs.existsSync(value.filename), true);
  assert.equal(fake.state.nativeStarts, 1);
});

test("receiver decision fails closed on missing or wrong-message model selection", async (t) => {
  for (const mode of ["missing-tool", "wrong-message"]) {
    await t.test(mode, async (t2) => {
      const fake = adapter({ mode });
      const value = await fixture(t2, fake, `decision-${mode}`);
      await assert.rejects(
        () => value.runtime.runReceiverDecisionTurn({
          role: "r", phase: "decision", cwd: "/private/reviewer", ref: value.ref,
          offer: offer(), scenarioId: value.scenarioId,
          turnRecovery: recovery(value.filename, `decision-${mode}`),
          onCompletedDecisionTurn: completeDecision,
        }),
        (error) => error?.code?.startsWith("threadmesh_") === true,
      );
      assert.equal(fs.existsSync(value.filename), true);
    });
  }
});

test("protected decision and admitted phases reject raw caller prompts before adapter access", async (t) => {
  const fake = adapter();
  const value = await fixture(t, fake, "protected-raw-bypass");
  value.runtime.roles.get("r").protectedPhases = null;
  for (const [phase, tool] of [
    ["decision", REGISTERED_PEER_DECISION_TOOL],
    ["review", BUSINESS_TOOL],
  ]) {
    await assert.rejects(
      () => value.runtime.runTurn({
        role: "r",
        phase,
        cwd: "/private/reviewer",
        ref: value.ref,
        prompt: "CALLER CONTROLLED RAW PROMPT",
        onToolCall: async () => ({}),
        scenarioId: value.scenarioId,
        allowedToolNames: [tool.name],
        turnRecovery: recovery(
          path.join(value.directory, `${phase}-raw-journal.json`),
          `${phase}-raw`,
        ),
      }),
      { code: "threadmesh_live_protected_phase_requires_wrapper" },
    );
  }
  assert.equal(fake.state.nativeStarts, 0);
  assert.equal(fake.state.observations, 0);
});

test("receiver decision forbids commit callbacks and a later turn failure cannot reach commit", async (t) => {
  const forbiddenAdapter = adapter();
  const forbidden = await fixture(t, forbiddenAdapter, "decision-forbidden-commit");
  await assert.rejects(
    () => forbidden.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: forbidden.ref,
      offer: offer(), scenarioId: forbidden.scenarioId,
      turnRecovery: recovery(forbidden.filename, "decision-forbidden-commit"),
      onCompletedDecisionTurn: completeDecision,
      async onDecision() { throw new Error("must never run"); },
    }),
    { code: "threadmesh_live_receiver_decision_commit_callback_forbidden" },
  );
  assert.equal(forbiddenAdapter.state.nativeStarts, 0);

  let prematureEffects = 0;
  for (const callbackName of ["beforeToolCall", "afterToolCall"]) {
    await assert.rejects(
      () => forbidden.runtime.runReceiverDecisionTurn({
        role: "r", phase: "decision", cwd: "/private/reviewer", ref: forbidden.ref,
        offer: offer(), scenarioId: forbidden.scenarioId,
        turnRecovery: recovery(
          path.join(forbidden.directory, `${callbackName}-journal.json`),
          `decision-forbidden-${callbackName}`,
        ),
        onCompletedDecisionTurn: completeDecision,
        [callbackName]: async () => { prematureEffects += 1; },
      }),
      { code: "threadmesh_live_receiver_decision_tool_callback_forbidden" },
    );
  }
  assert.equal(prematureEffects, 0);
  assert.equal(forbiddenAdapter.state.nativeStarts, 0);

  const failingAdapter = adapter({ mode: "wrong-result-turn" });
  const failing = await fixture(t, failingAdapter, "decision-post-tool-failure");
  let externalCommits = 0;
  try {
    const result = await failing.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: failing.ref,
      offer: offer(), scenarioId: failing.scenarioId,
      turnRecovery: recovery(failing.filename, "decision-post-tool-failure"),
      onCompletedDecisionTurn: async (completed) => {
        externalCommits += 1;
        return completeDecision(completed);
      },
    });
    assert.equal(result.decision.decision, "accepted");
  } catch (error) {
    assert.equal(error.code, "threadmesh_live_product_turn_result_invalid");
  }
  assert.equal(externalCommits, 0);
  assert.equal(fs.existsSync(failing.filename), true);
});

test("decision and admitted wrappers reject adapter tool-call correlation drift", async (t) => {
  const decisionAdapter = adapter({ mode: "tampered-final-call" });
  const decision = await fixture(t, decisionAdapter, "decision-call-correlation");
  await assert.rejects(
    () => decision.runtime.runReceiverDecisionTurn({
      role: "r", phase: "decision", cwd: "/private/reviewer", ref: decision.ref,
      offer: offer(), scenarioId: decision.scenarioId,
      turnRecovery: recovery(decision.filename, "decision-call-correlation"),
      onCompletedDecisionTurn: completeDecision,
    }),
    { code: "threadmesh_live_product_tool_correlation_invalid" },
  );
  assert.equal(fs.existsSync(decision.filename), true);

  const admittedAdapter = adapter({ mode: "tampered-final-call" });
  const admitted = await fixture(t, admittedAdapter, "admitted-call-correlation");
  const admission = prepared();
  let confirmations = 0;
  await assert.rejects(
    () => admitted.runtime.runAdmittedToolTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref: admitted.ref,
      prepared: admission, admissionBinding: createAdmittedTurnBinding(admission),
      scenarioId: admitted.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
      turnRecovery: recovery(admitted.filename, "admitted-call-correlation"),
      async onToolCall() { return { finding: true }; },
      async onAdmissionReceipt() { confirmations += 1; return {}; },
    }),
    { code: "threadmesh_codex_live_context_terminal_reconciled" },
  );
  assert.equal(confirmations, 0);
  assert.equal(fs.existsSync(admitted.filename), true);
});

test("admitted tool turn uses exact prepared rendering, binds receipt, and retires only after confirm", async (t) => {
  const fake = adapter();
  const value = await fixture(t, fake, "admitted-success");
  const admission = prepared();
  const callbacks = [];
  const result = await value.runtime.runAdmittedToolTurn({
    role: "r",
    phase: "review",
    cwd: "/private/reviewer",
    ref: value.ref,
    prepared: admission,
    admissionBinding: createAdmittedTurnBinding(admission),
    scenarioId: value.scenarioId,
    allowedToolNames: [BUSINESS_TOOL.name],
    turnRecovery: recovery(value.filename, "admitted-success"),
    async beforeTurnStart() { callbacks.push("started-intent"); },
    async onTurnStarted() { callbacks.push("native-bound"); },
    async beforeToolCall() { callbacks.push("tool-selected"); },
    async onToolCall() { callbacks.push("tool-effect"); return { finding: true }; },
    async afterToolCall() { callbacks.push("tool-completed"); },
    async onAdmissionReceipt({ prepared: received, receipt, evidence }) {
      callbacks.push("admission-confirmed");
      assert.equal(received, admission);
      assert.equal(receipt.adapterOperationId, evidence.turnId);
      assert.equal(fs.existsSync(value.filename), true);
      return { delivery: "context-admitted" };
    },
  });
  assert.equal(fake.state.prompt, admission.rendering);
  assert.deepEqual(fake.state.dynamicTools.map(({ name }) => name), [BUSINESS_TOOL.name]);
  assert.deepEqual(callbacks, [
    "started-intent", "native-bound", "tool-selected", "tool-effect",
    "tool-completed", "admission-confirmed",
  ]);
  assert.deepEqual(result.admissionConfirmation, { delivery: "context-admitted" });
  assert.equal(result.recoveryJournal.retired, true);
  assert.equal(fs.existsSync(value.filename), false);
});

test("admitted tool turn rejects altered prepared data, wrong binding, and non-accepted admission pre-start", async (t) => {
  const cases = [
    ["altered-rendering", (value) => ({
      prepared: { ...value, rendering: `${value.rendering}\naltered` },
      binding: createAdmittedTurnBinding(value),
    })],
    ["wrong-token", (value) => ({
      prepared: { ...value, admissionToken: "wrong-token" },
      binding: createAdmittedTurnBinding(value),
    })],
    ["wrong-message", (value) => ({
      prepared: { ...value, envelope: { ...value.envelope, messageId: "msg-wrong" } },
      binding: createAdmittedTurnBinding(value),
    })],
    ["wrong-revision", (value) => ({
      prepared: { ...value, revision: 2, admission: { ...value.admission, revision: 2 } },
      binding: createAdmittedTurnBinding(value),
    })],
    ["deferred", (value) => {
      const changed = { ...value, admission: { ...value.admission, decision: "deferred" } };
      return { prepared: changed, binding: createAdmittedTurnBinding(changed) };
    }],
    ["rejected", (value) => {
      const changed = { ...value, admission: { ...value.admission, decision: "rejected" } };
      return { prepared: changed, binding: createAdmittedTurnBinding(changed) };
    }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async (t2) => {
      const fake = adapter();
      const fixtureValue = await fixture(t2, fake, `admitted-${name}`);
      const original = prepared();
      const changed = mutate(original);
      await assert.rejects(
        () => fixtureValue.runtime.runAdmittedToolTurn({
          role: "r", phase: "review", cwd: "/private/reviewer", ref: fixtureValue.ref,
          prepared: changed.prepared, admissionBinding: changed.binding,
          scenarioId: fixtureValue.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
          turnRecovery: recovery(fixtureValue.filename, `admitted-${name}`),
          async onToolCall() { return {}; },
          async onAdmissionReceipt() { return {}; },
        }),
        (error) => error?.code?.startsWith("threadmesh_") === true,
      );
      assert.equal(fake.state.nativeStarts, 0);
    });
  }
});

test("admitted tool turn fails closed on wrong ref and wrong native turn", async (t) => {
  const wrongRefAdapter = adapter();
  const wrongRefFixture = await fixture(t, wrongRefAdapter, "admitted-wrong-ref");
  const admission = prepared();
  await assert.rejects(
    () => wrongRefFixture.runtime.runAdmittedToolTurn({
      role: "r", phase: "review", cwd: "/private/reviewer",
      ref: { ...wrongRefFixture.ref, threadId: "thread-wrong" },
      prepared: admission, admissionBinding: createAdmittedTurnBinding(admission),
      scenarioId: wrongRefFixture.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
      turnRecovery: recovery(wrongRefFixture.filename, "admitted-wrong-ref"),
      async onToolCall() { return {}; }, async onAdmissionReceipt() { return {}; },
    }),
    { code: "threadmesh_live_scenario_role_ref_mismatch" },
  );
  assert.equal(wrongRefAdapter.state.nativeStarts, 0);

  const wrongTurnAdapter = adapter({ mode: "wrong-result-turn" });
  const wrongTurnFixture = await fixture(t, wrongTurnAdapter, "admitted-wrong-turn");
  await assert.rejects(
    () => wrongTurnFixture.runtime.runAdmittedToolTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref: wrongTurnFixture.ref,
      prepared: admission, admissionBinding: createAdmittedTurnBinding(admission),
      scenarioId: wrongTurnFixture.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
      turnRecovery: recovery(wrongTurnFixture.filename, "admitted-wrong-turn"),
      async onToolCall() { return {}; }, async onAdmissionReceipt() { return {}; },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_terminal_reconciled",
  );
  assert.equal(fs.existsSync(wrongTurnFixture.filename), true);
});

test("admitted terminal failure leaves journal and an existing journal reconciles without resend", async (t) => {
  const fake = adapter({ mode: "terminal" });
  const value = await fixture(t, fake, "admitted-recovery");
  const admission = prepared();
  const args = {
    role: "r",
    phase: "review",
    cwd: "/private/reviewer",
    ref: value.ref,
    prepared: admission,
    admissionBinding: createAdmittedTurnBinding(admission),
    scenarioId: value.scenarioId,
    allowedToolNames: [BUSINESS_TOOL.name],
    turnRecovery: recovery(value.filename, "admitted-recovery"),
    async onToolCall() { return {}; },
    async onAdmissionReceipt() { return {}; },
  };
  await assert.rejects(
    () => value.runtime.runAdmittedToolTurn(args),
    { code: "threadmesh_codex_live_context_terminal_reconciled" },
  );
  assert.equal(fs.existsSync(value.filename), true);
  assert.equal(fake.state.nativeStarts, 1);
  await assert.rejects(
    () => value.runtime.runAdmittedToolTurn(args),
    { code: "threadmesh_codex_live_context_terminal_reconciled" },
  );
  assert.equal(fake.state.nativeStarts, 1);
  assert.equal(fs.existsSync(value.filename), true);
});

test("admitted ambiguous reconciliation retains only the bounded origin code", async (t) => {
  const fake = adapter({ mode: "terminal", recoveryStatus: "completed" });
  const value = await fixture(t, fake, "admitted-ambiguous-origin");
  const admission = prepared();
  await assert.rejects(
    () => value.runtime.runAdmittedToolTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref: value.ref,
      prepared: admission, admissionBinding: createAdmittedTurnBinding(admission),
      scenarioId: value.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
      turnRecovery: recovery(value.filename, "admitted-ambiguous-origin"),
      async onToolCall() { return {}; }, async onAdmissionReceipt() { return {}; },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_reconciliation_ambiguous" &&
      error?.originCode === "codex_app_server_exited" &&
      error?.recovery?.reasonCode === "codex-native-turn-completed-observation-only" &&
      !Object.hasOwn(error, "cause"),
  );
  assert.equal(fake.state.nativeStarts, 1);
  assert.equal(fs.existsSync(value.filename), true);
});

test("admitted ambiguous reconciliation normalizes an unsafe origin code", async (t) => {
  const fake = adapter({ mode: "terminal", recoveryStatus: "completed" });
  const original = fake.runAutonomousToolTurn.bind(fake);
  fake.runAutonomousToolTurn = async (options) => {
    try { return await original(options); } catch (error) {
      error.code = `unsafe\n${"x".repeat(256)}`;
      throw error;
    }
  };
  const value = await fixture(t, fake, "admitted-unsafe-origin");
  const admission = prepared();
  await assert.rejects(
    () => value.runtime.runAdmittedToolTurn({
      role: "r", phase: "review", cwd: "/private/reviewer", ref: value.ref,
      prepared: admission, admissionBinding: createAdmittedTurnBinding(admission),
      scenarioId: value.scenarioId, allowedToolNames: [BUSINESS_TOOL.name],
      turnRecovery: recovery(value.filename, "admitted-unsafe-origin"),
      async onToolCall() { return {}; }, async onAdmissionReceipt() { return {}; },
    }),
    (error) => error?.code === "threadmesh_codex_live_context_reconciliation_ambiguous" &&
      error?.originCode === "Error",
  );
});
