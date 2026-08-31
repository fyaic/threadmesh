import fs from "node:fs";

import { sha256Digest } from "../canonical-json.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import {
  createCodexPersistedTurnObservation,
  freezeCodexNativeTurnBaseline,
} from "../state/codex-turn-reconciliation.mjs";
import { writeM52LiveTurnJournal, readM52LiveTurnJournal } from "./m5-2-live-turn-journal.mjs";
import {
  atomicPrivateJson,
  observePersistentFakeCodexTurns,
  startPersistentFakeCodexTurn,
} from "./m5-2-persistent-fake-codex.mjs";

const owner = Object.freeze({ kind: "user", principalId: "m52_sigkill_owner" });

function actorPrincipal(config) {
  return {
    kind: "task",
    taskId: config.actor.taskId,
    incarnationId: config.actor.incarnationId,
  };
}

function coordinatorFor(config) {
  return new SqliteCoordinator({ filename: config.databaseFilename });
}

function start(config) {
  const coordinator = coordinatorFor(config);
  coordinator.registerTask({
    taskId: config.actor.taskId,
    incarnationId: config.actor.incarnationId,
    harness: "codex",
    state: "idle",
    adapterRef: {
      kind: "codex-app-server",
      threadId: config.actor.threadId,
      snapshotDigest: config.actor.snapshotDigest,
    },
  }, owner);
  let execution = coordinator.createTurnExecutionIntent({
    intentId: config.executionId,
    scenarioId: config.scenarioId,
    chainId: config.chainId,
    messageId: config.messageId,
    eventId: config.eventId,
    actor: config.actor,
    adapterIdempotencyKey: config.adapterIdempotencyKey,
    promptDigest: config.promptDigest,
    allowedTools: ["threadmesh_publish_artifact"],
  }, 0, actorPrincipal(config));
  execution = coordinator.markTurnExecutionStarted(
    execution.executionId,
    { expectedRevision: execution.revision },
    actorPrincipal(config),
  );

  const baselineObservation = createCodexPersistedTurnObservation({
    threadId: config.actor.threadId,
    snapshotDigest: config.actor.snapshotDigest,
    threadStatus: "idle",
    readTurns: [],
    listedTurns: [],
  });
  const baseline = freezeCodexNativeTurnBaseline(baselineObservation, {
    clientUserMessageId: config.adapterIdempotencyKey,
  });
  const journalProjection = writeM52LiveTurnJournal({
    filename: config.journalFilename,
    scenarioId: config.scenarioId,
    executionId: config.executionId,
    role: "sigkill-canary",
    phase: "native-start-observed-before-coordinator-bind",
    adapterRef: {
      kind: "codex-app-server",
      threadId: config.actor.threadId,
      snapshotDigest: config.actor.snapshotDigest,
    },
    adapterIdempotencyKey: config.adapterIdempotencyKey,
    baseline,
    resourceManifest: {
      resources: [{
        kind: "codex-thread",
        exactId: config.actor.threadId,
        identifierDigest: sha256Digest(config.actor.threadId),
        cleanupContext: {
          method: "codex-thread-delete",
          parameters: {
            command: process.execPath,
            args: [],
            cwd: config.privateDirectory,
            env: {},
          },
          parametersDigest: sha256Digest({
            command: process.execPath,
            args: [],
            cwd: config.privateDirectory,
            env: {},
          }),
        },
      }],
    },
  });
  const productState = startPersistentFakeCodexTurn({
    stateFilename: config.productStateFilename,
    transcriptFilename: config.transcriptFilename,
    threadId: config.actor.threadId,
    snapshotDigest: config.actor.snapshotDigest,
    turnId: config.turnId,
    clientUserMessageId: config.adapterIdempotencyKey,
  });
  const checkpointBody = {
    schemaVersion: 1,
    phase: "native-start-observed-before-coordinator-bind",
    manifestDigest: sha256Digest(config),
    executionIdDigest: sha256Digest(config.executionId),
    threadIdDigest: sha256Digest(config.actor.threadId),
    turnIdDigest: sha256Digest(config.turnId),
    databasePathDigest: sha256Digest(config.databaseFilename),
    journalPathDigest: sha256Digest(config.journalFilename),
    journalRecordDigest: journalProjection.recordDigest,
    productStateDigest: sha256Digest(productState),
    coordinatorState: execution.intent.state,
    coordinatorTurnBound: execution.intent.turnStart.turnId !== null,
  };
  const checkpoint = { ...checkpointBody, checkpointDigest: sha256Digest(checkpointBody) };
  atomicPrivateJson(config.checkpointFilename, checkpoint);
  process.stdout.write(`THREADMESH_SIGKILL_READY ${checkpoint.checkpointDigest}\n`);
  setInterval(() => {}, 60_000);
}

function recover(config) {
  const journal = readM52LiveTurnJournal({
    filename: config.journalFilename,
    expectedScenarioId: config.scenarioId,
    expectedExecutionId: config.executionId,
  });
  const coordinator = coordinatorFor(config);
  let execution = coordinator.getTurnExecution(config.executionId, actorPrincipal(config));
  if (execution.intent.state === "started") {
    execution = coordinator.markTurnExecutionOutcomeUnknown(
      config.executionId,
      {
        reasonCode: "threadmesh_native_turn_outcome_unknown",
        expectedRevision: execution.revision,
      },
      actorPrincipal(config),
    );
  }
  const observation = observePersistentFakeCodexTurns({
    stateFilename: config.productStateFilename,
    transcriptFilename: config.transcriptFilename,
  });
  execution = coordinator.reconcileCodexTerminalTurnExecution(
    config.executionId,
    {
      baseline: journal.baseline,
      observation,
      expectedRevision: execution.revision,
    },
    actorPrincipal(config),
  );
  coordinator.close();
  process.stdout.write(`THREADMESH_RECOVERY_COMPLETE ${sha256Digest({
    state: execution.intent.state,
    reconciliationDigest: execution.row.reconciliation_digest,
  })}\n`);
}

const configFilename = process.argv[3];
if (!configFilename || !fs.existsSync(configFilename)) {
  throw new Error("threadmesh_m52_sigkill_child_config_missing");
}
const config = JSON.parse(fs.readFileSync(configFilename, "utf8"));
if (process.argv[2] === "start") start(config);
else if (process.argv[2] === "recover") recover(config);
else throw new Error("threadmesh_m52_sigkill_child_mode_invalid");
