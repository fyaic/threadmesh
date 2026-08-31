import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { SqliteCoordinator } from "../coordinator/sqlite-coordinator.mjs";
import { readM52LiveTurnJournal } from "./m5-2-live-turn-journal.mjs";
import {
  atomicPrivateJson,
  readPersistentFakeCodexState,
  readPersistentFakeCodexTranscript,
} from "./m5-2-persistent-fake-codex.mjs";

const CHILD = new URL("./m5-2-sigkill-canary-child.mjs", import.meta.url);
const policy = Object.freeze({ kind: "policy", principalId: "m52_sigkill_policy" });

function fail(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  throw error;
}

function readPrivateJson(filename) {
  const stats = fs.lstatSync(filename);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o600) {
    fail("threadmesh_m52_sigkill_private_artifact_invalid", path.basename(filename));
  }
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function waitForLine(child, prefix, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(Object.assign(new Error("threadmesh_m52_sigkill_child_timeout"), { stderr }));
    }, timeoutMs);
    const finish = (operation) => {
      clearTimeout(timeout);
      operation();
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const line = stdout.split("\n").find((entry) => entry.startsWith(prefix));
      if (line) finish(() => resolve(line.slice(prefix.length).trim()));
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code, signal) => finish(() => reject(Object.assign(
      new Error("threadmesh_m52_sigkill_child_exited_early"),
      { code, signal, stderr },
    ))));
    child.once("error", (error) => finish(() => reject(error)));
  });
}

function waitForExit(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("threadmesh_m52_sigkill_exit_timeout")), timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function spawnChild(mode, configFilename, { detached = false } = {}) {
  return spawn(process.execPath, [CHILD.pathname, mode, configFilename], {
    detached,
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH ?? "" },
  });
}

function readExecutionRow(filename, executionId) {
  const database = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare(
      `SELECT execution_id, adapter_thread_id, adapter_snapshot_digest,
        adapter_idempotency_key, state, turn_id, action_count, receipt_json,
        reconciliation_json, revision
       FROM turn_execution_intents WHERE execution_id = ?`,
    ).get(executionId);
    const actionRows = database.prepare(
      "SELECT COUNT(*) AS count FROM turn_tool_actions WHERE execution_id = ?",
    ).get(executionId).count;
    const auditEvents = database.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count;
    return { row, actionRows, auditEvents };
  } finally {
    database.close();
  }
}

function buildConfig(privateDirectory) {
  const config = {
    schemaVersion: 1,
    privateDirectory,
    databaseFilename: path.join(privateDirectory, "coordinator.sqlite"),
    journalFilename: path.join(privateDirectory, "live-turn-journal.json"),
    productStateFilename: path.join(privateDirectory, "fake-codex-state.json"),
    transcriptFilename: path.join(privateDirectory, "fake-codex-transcript.jsonl"),
    checkpointFilename: path.join(privateDirectory, "kill-checkpoint.json"),
    scenarioId: "scenario_m52_sigkill_canary",
    executionId: "execution_m52_sigkill_canary",
    chainId: "chain_m52_sigkill_canary",
    messageId: "message_m52_sigkill_canary",
    eventId: "event_m52_sigkill_canary",
    adapterIdempotencyKey: "adapter_m52_sigkill_canary",
    promptDigest: sha256Digest("m52-sigkill-canary-prompt"),
    turnId: "turn_m52_sigkill_canary",
    actor: {
      taskId: "task_m52_sigkill_canary",
      incarnationId: "incarnation_m52_sigkill_canary",
      threadId: "thread_m52_sigkill_canary",
      snapshotDigest: sha256Digest("m52-sigkill-canary-snapshot"),
    },
  };
  return config;
}

function assertPreKillEvidence(config, readyDigest) {
  const checkpoint = readPrivateJson(config.checkpointFilename);
  const { checkpointDigest, ...checkpointBody } = checkpoint;
  if (
    checkpointDigest !== sha256Digest(checkpointBody) || checkpointDigest !== readyDigest ||
    checkpoint.phase !== "native-start-observed-before-coordinator-bind" ||
    checkpoint.manifestDigest !== sha256Digest(config) ||
    checkpoint.executionIdDigest !== sha256Digest(config.executionId) ||
    checkpoint.threadIdDigest !== sha256Digest(config.actor.threadId) ||
    checkpoint.turnIdDigest !== sha256Digest(config.turnId) ||
    checkpoint.databasePathDigest !== sha256Digest(config.databaseFilename) ||
    checkpoint.journalPathDigest !== sha256Digest(config.journalFilename) ||
    checkpoint.coordinatorState !== "started" || checkpoint.coordinatorTurnBound !== false
  ) fail("threadmesh_m52_sigkill_checkpoint_invalid");
  const execution = readExecutionRow(config.databaseFilename, config.executionId);
  if (
    execution.row?.state !== "started" || execution.row.turn_id !== null ||
    execution.row.action_count !== 0 || execution.row.receipt_json !== null ||
    execution.actionRows !== 0 || execution.auditEvents !== 0
  ) fail("threadmesh_m52_sigkill_pre_kill_state_invalid");
  const journal = readM52LiveTurnJournal({
    filename: config.journalFilename,
    expectedScenarioId: config.scenarioId,
    expectedExecutionId: config.executionId,
  });
  const product = readPersistentFakeCodexState(config.productStateFilename);
  const transcript = readPersistentFakeCodexTranscript(config.transcriptFilename);
  const expectedStartRecord = {
    sequence: 1,
    type: "native-turn-start-observed",
    threadId: config.actor.threadId,
    turnId: config.turnId,
    clientUserMessageId: config.adapterIdempotencyKey,
    status: "interrupted",
    stateDigest: sha256Digest(product),
  };
  if (
    journal.recordDigest !== checkpoint.journalRecordDigest ||
    journal.baseline.threadId !== execution.row.adapter_thread_id ||
    journal.baseline.snapshotDigest !== execution.row.adapter_snapshot_digest ||
    journal.adapterIdempotencyKey !== execution.row.adapter_idempotency_key ||
    product.threadId !== execution.row.adapter_thread_id ||
    product.snapshotDigest !== execution.row.adapter_snapshot_digest ||
    product.turns[0]?.turnId !== config.turnId ||
    product.turns[0]?.clientUserMessageId !== config.adapterIdempotencyKey ||
    checkpoint.productStateDigest !== sha256Digest(product) ||
    product.turns.length !== 1 || product.toolEffectCount !== 0 ||
    transcript.length !== 1 ||
    canonicalJson(transcript[0]) !== canonicalJson(expectedStartRecord)
  ) fail("threadmesh_m52_sigkill_pre_kill_identity_invalid");
  return { checkpoint, journal, product };
}

function assertRecoveredEvidence(config) {
  const execution = readExecutionRow(config.databaseFilename, config.executionId);
  const reconciliation = JSON.parse(execution.row?.reconciliation_json ?? "null");
  const product = readPersistentFakeCodexState(config.productStateFilename);
  const transcript = readPersistentFakeCodexTranscript(config.transcriptFilename);
  const nativeStarts = transcript.filter((entry) => entry.type === "native-turn-start-observed");
  const recoveryObservations = transcript.filter((entry) => entry.type === "recovery-observation");
  const expectedRecoveryRecord = {
    sequence: 2,
    type: "recovery-observation",
    turnCount: product.turns.length,
    stateDigest: sha256Digest(product),
  };
  if (
    execution.row?.state !== "abandoned" ||
    execution.row.turn_id !== product.turns[0]?.turnId ||
    execution.row.action_count !== 0 || execution.actionRows !== 0 ||
    execution.row.receipt_json !== null || execution.auditEvents !== 0 ||
    reconciliation?.state !== "found-terminal" ||
    !["interrupted", "failed"].includes(reconciliation.turnStatus) ||
    product.turns.length !== 1 || product.toolEffectCount !== 0 ||
    nativeStarts.length !== 1 || recoveryObservations.length !== 1 ||
    transcript.length !== 2 ||
    canonicalJson(transcript[1]) !== canonicalJson(expectedRecoveryRecord) ||
    transcript.some((entry) => entry.type === "tool-effect")
  ) fail("threadmesh_m52_sigkill_recovery_invalid");
  return { execution, reconciliation, product, transcript };
}

function exactCleanup(config) {
  const coordinator = new SqliteCoordinator({ filename: config.databaseFilename });
  const checkpoint = coordinator.checkpointStorage(policy);
  coordinator.close();
  if (checkpoint.busy !== 0) fail("threadmesh_m52_sigkill_cleanup_checkpoint_busy");
  const sidecars = [`${config.databaseFilename}-wal`, `${config.databaseFilename}-shm`];
  const sidecarAbsence = sidecars.every((filename) => !fs.existsSync(filename));
  if (!sidecarAbsence) fail("threadmesh_m52_sigkill_cleanup_sidecar_present");
  const exactFiles = [
    config.configFilename,
    config.databaseFilename,
    config.journalFilename,
    config.productStateFilename,
    config.transcriptFilename,
    config.checkpointFilename,
  ];
  const current = fs.readdirSync(config.privateDirectory).map((name) =>
    path.join(config.privateDirectory, name)).sort();
  if (canonicalJson(current) !== canonicalJson([...exactFiles].sort())) {
    fail("threadmesh_m52_sigkill_cleanup_manifest_mismatch", current.map(path.basename).join(","));
  }
  for (const filename of exactFiles) fs.rmSync(filename);
  fs.rmdirSync(config.privateDirectory);
  return {
    complete: !fs.existsSync(config.privateDirectory),
    removedResourceCount: exactFiles.length + 1,
    sidecarAbsence,
    temporaryFileAbsence: current.every((filename) => !filename.endsWith(".tmp")),
  };
}

/**
 * Deterministic process-death canary. It uses a persistent fake Codex seam and
 * therefore is not evidence that the real Codex product survived SIGKILL.
 */
export async function runM52SigkillCanary({ temporaryParent }) {
  if (!path.isAbsolute(temporaryParent ?? "")) fail("threadmesh_m52_sigkill_parent_invalid");
  const parentStats = fs.lstatSync(temporaryParent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    fail("threadmesh_m52_sigkill_parent_invalid");
  }
  const privateDirectory = path.join(temporaryParent, `m52-sigkill-${process.pid}-${Date.now()}`);
  fs.mkdirSync(privateDirectory, { mode: 0o700 });
  fs.chmodSync(privateDirectory, 0o700);
  const config = buildConfig(privateDirectory);
  config.configFilename = path.join(privateDirectory, "config.json");
  atomicPrivateJson(config.configFilename, config);

  let cleanup;
  try {
    const starter = spawnChild("start", config.configFilename, { detached: true });
    const readyDigest = await waitForLine(starter, "THREADMESH_SIGKILL_READY ");
    const preKill = assertPreKillEvidence(config, readyDigest);
    const killed = waitForExit(starter);
    process.kill(-starter.pid, "SIGKILL");
    const killExit = await killed;
    if (killExit.code !== null || killExit.signal !== "SIGKILL") {
      fail("threadmesh_m52_sigkill_not_observed", canonicalJson(killExit));
    }

    const recovery = spawnChild("recover", config.configFilename);
    const recoveryExited = waitForExit(recovery);
    await waitForLine(recovery, "THREADMESH_RECOVERY_COMPLETE ");
    const recoveryExit = await recoveryExited;
    if (recoveryExit.code !== 0 || recoveryExit.signal !== null) {
      fail("threadmesh_m52_sigkill_recovery_child_failed", canonicalJson(recoveryExit));
    }
    const recovered = assertRecoveredEvidence(config);
    cleanup = exactCleanup(config);
    const publicEvidence = {
      schemaVersion: 1,
      canaryKind: "deterministic-persistent-fake-product-process",
      realCodexProductEvidence: false,
      processDeath: { signal: "SIGKILL", observed: true },
      interruptionSemantics: "fake-product-interrupted-status-persisted-before-process-kill",
      checkpoint: {
        phase: preKill.checkpoint.phase,
        checkpointDigest: preKill.checkpoint.checkpointDigest,
        nativeStartExternallyObservable: true,
        coordinatorTurnBoundBeforeKill: false,
      },
      recovery: {
        state: recovered.execution.row.state,
        terminalStatus: recovered.reconciliation.turnStatus,
        nativeTurnCount: recovered.product.turns.length,
        nativeStartCount: recovered.transcript.filter(
          (entry) => entry.type === "native-turn-start-observed",
        ).length,
        nativeResubmitCount: recovered.transcript.filter(
          (entry) => entry.type === "native-turn-start-observed",
        ).length - 1,
        toolEffectCount: recovered.product.toolEffectCount,
        auditEventCount: recovered.execution.auditEvents,
        receiptCount: recovered.execution.row.receipt_json === null ? 0 : 1,
        actionCount: recovered.execution.actionRows,
      },
      identityDigests: {
        execution: sha256Digest(config.executionId),
        thread: sha256Digest(config.actor.threadId),
        turn: sha256Digest(config.turnId),
        databasePath: sha256Digest(config.databaseFilename),
        journalPath: sha256Digest(config.journalFilename),
        journalRecord: preKill.journal.recordDigest,
      },
      cleanup,
    };
    return Object.freeze({
      ...publicEvidence,
      evidenceDigest: sha256Digest(publicEvidence),
    });
  } catch (error) {
    if (!cleanup && fs.existsSync(privateDirectory)) {
      // Failure artifacts are deliberately retained for diagnosis; callers own the parent.
      error.privateArtifactDirectoryDigest = sha256Digest(privateDirectory);
    }
    throw error;
  }
}
