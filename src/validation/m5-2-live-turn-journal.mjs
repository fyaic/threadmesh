import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { validateCodexNativeTurnBaseline } from "../state/codex-turn-reconciliation.mjs";

const SCHEMA_VERSION = 1;
const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;
const RECORD_KEYS = Object.freeze([
  "schemaVersion", "scenarioId", "executionId", "role", "phase",
  "adapterRef", "adapterIdempotencyKey", "baseline", "resourceManifest",
  "recordDigest",
]);
const ADAPTER_REF_KEYS = Object.freeze(["kind", "threadId", "snapshotDigest"]);

function journalError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
}

function identity(value, label) {
  if (
    typeof value !== "string" || value.length < 1 || value.length > 512 ||
    /[\r\n\0]/u.test(value)
  ) throw journalError("threadmesh_m52_live_turn_journal_identity_invalid", label);
  return value;
}

function digest(value, label) {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value ?? "")) {
    throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", label);
  }
  return value;
}

function assertPrivateDirectory(directory) {
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch {
    throw journalError("threadmesh_m52_live_turn_journal_parent_invalid");
  }
  if (
    !stats.isDirectory() || stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o700
  ) throw journalError("threadmesh_m52_live_turn_journal_parent_invalid");
}

function assertAdapterRef(value) {
  if (
    !exactKeys(value, ADAPTER_REF_KEYS) || value.kind !== "codex-app-server"
  ) throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "adapterRef");
  identity(value.threadId, "adapterRef.threadId");
  digest(value.snapshotDigest, "adapterRef.snapshotDigest");
}

function assertResourceManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "resourceManifest");
  }
  if (!exactKeys(value, ["resources"]) || !Array.isArray(value.resources) ||
      value.resources.length > 100) {
    throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "resourceManifest");
  }
  for (const resource of value.resources) {
    if (
      !exactKeys(resource, ["kind", "exactId", "identifierDigest", "cleanupContext"]) ||
      resource.kind !== "codex-thread"
    ) throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "resource");
    identity(resource.exactId, "resource.exactId");
    if (resource.identifierDigest !== sha256Digest(resource.exactId)) {
      throw journalError("threadmesh_m52_live_turn_journal_integrity_mismatch", "resource");
    }
    const context = resource.cleanupContext;
    if (
      !exactKeys(context, ["method", "parameters", "parametersDigest"]) ||
      context.method !== "codex-thread-delete" ||
      !exactKeys(context.parameters, ["command", "args", "cwd", "env"]) ||
      !path.isAbsolute(context.parameters.command ?? "") ||
      !path.isAbsolute(context.parameters.cwd ?? "") ||
      !Array.isArray(context.parameters.args) ||
      context.parameters.args.some((arg) => typeof arg !== "string") ||
      !context.parameters.env || typeof context.parameters.env !== "object" ||
      Array.isArray(context.parameters.env) ||
      Object.entries(context.parameters.env).some(([key, entry]) =>
        !/^[A-Z_][A-Z0-9_]{0,127}$/u.test(key) || typeof entry !== "string") ||
      Buffer.byteLength(canonicalJson(context.parameters)) > 16 * 1024 ||
      context.parametersDigest !== sha256Digest(context.parameters)
    ) throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "cleanupContext");
  }
}

function validatedRecord(record) {
  if (!exactKeys(record, RECORD_KEYS) || record.schemaVersion !== SCHEMA_VERSION) {
    throw journalError("threadmesh_m52_live_turn_journal_shape_invalid");
  }
  identity(record.scenarioId, "scenarioId");
  identity(record.executionId, "executionId");
  identity(record.role, "role");
  identity(record.phase, "phase");
  identity(record.adapterIdempotencyKey, "adapterIdempotencyKey");
  assertAdapterRef(record.adapterRef);
  assertResourceManifest(record.resourceManifest);
  if (
    record.resourceManifest.resources.length !== 1 ||
    record.resourceManifest.resources[0].exactId !== record.adapterRef.threadId
  ) throw journalError("threadmesh_m52_live_turn_journal_integrity_mismatch", "resource binding");
  const rebuiltBaseline = validateCodexNativeTurnBaseline(record.baseline);
  if (
    rebuiltBaseline.clientUserMessageId !== record.adapterIdempotencyKey ||
    record.baseline.threadId !== record.adapterRef.threadId ||
    record.baseline.snapshotDigest !== record.adapterRef.snapshotDigest
  ) throw journalError("threadmesh_m52_live_turn_journal_integrity_mismatch", "baseline");
  const { recordDigest, ...body } = record;
  if (recordDigest !== sha256Digest(body)) {
    throw journalError("threadmesh_m52_live_turn_journal_integrity_mismatch", "record");
  }
  return record;
}

function assertPrivateFile(filename) {
  const linkStats = fs.lstatSync(filename);
  if (
    linkStats.isSymbolicLink() || !linkStats.isFile() || linkStats.nlink !== 1 ||
    (linkStats.mode & 0o777) !== 0o600
  ) throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "file");
}

export function writeM52LiveTurnJournal({
  filename,
  scenarioId,
  executionId,
  role,
  phase,
  adapterRef,
  adapterIdempotencyKey,
  baseline,
  resourceManifest = { resources: [] },
}) {
  if (!path.isAbsolute(filename ?? "")) {
    throw journalError("threadmesh_m52_live_turn_journal_path_invalid");
  }
  const body = {
    schemaVersion: SCHEMA_VERSION,
    scenarioId,
    executionId,
    role,
    phase,
    adapterRef: {
      kind: adapterRef?.kind,
      threadId: adapterRef?.threadId,
      snapshotDigest: adapterRef?.snapshotDigest,
    },
    adapterIdempotencyKey,
    baseline,
    resourceManifest,
  };
  const record = { ...body, recordDigest: sha256Digest(body) };
  validatedRecord(record);
  const serialized = `${canonicalJson(record)}\n`;
  if (Buffer.byteLength(serialized) > MAX_JOURNAL_BYTES) {
    throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "size");
  }
  const directory = path.dirname(filename);
  assertPrivateDirectory(directory);
  if (fs.existsSync(filename)) {
    const existing = readM52LiveTurnJournal({
      filename, expectedScenarioId: scenarioId, expectedExecutionId: executionId,
    });
    if (canonicalJson(existing) !== canonicalJson(record)) {
      throw journalError("threadmesh_m52_live_turn_journal_conflict");
    }
    return { ...projectM52LiveTurnJournal(existing), replay: true };
  }
  const temporary = path.join(
    directory,
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, serialized, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filename);
    const directoryDescriptor = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
    throw error;
  }
  return { ...projectM52LiveTurnJournal(record), replay: false };
}

export function readM52LiveTurnJournal({
  filename,
  expectedScenarioId,
  expectedExecutionId,
}) {
  if (!path.isAbsolute(filename ?? "")) {
    throw journalError("threadmesh_m52_live_turn_journal_path_invalid");
  }
  assertPrivateDirectory(path.dirname(filename));
  let descriptor;
  let raw;
  try {
    assertPrivateFile(filename);
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const stats = fs.fstatSync(descriptor);
    if (
      !stats.isFile() || stats.nlink !== 1 || (stats.mode & 0o777) !== 0o600 ||
      stats.size < 2 || stats.size > MAX_JOURNAL_BYTES
    ) throw journalError("threadmesh_m52_live_turn_journal_shape_invalid", "file");
    raw = fs.readFileSync(descriptor, "utf8");
  } catch (error) {
    if (error?.code?.startsWith?.("threadmesh_")) throw error;
    throw journalError("threadmesh_m52_live_turn_journal_unavailable");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw journalError("threadmesh_m52_live_turn_journal_truncated");
  }
  validatedRecord(record);
  if (record.scenarioId !== expectedScenarioId) {
    throw journalError("threadmesh_m52_live_turn_journal_scenario_mismatch");
  }
  if (record.executionId !== expectedExecutionId) {
    throw journalError("threadmesh_m52_live_turn_journal_execution_mismatch");
  }
  return record;
}

export function projectM52LiveTurnJournal(record) {
  validatedRecord(record);
  return Object.freeze({
    recordDigest: record.recordDigest,
    baselineDigest: record.baseline.baselineDigest,
    observationDigest: record.baseline.observationDigest,
    baselineTurnCount: record.baseline.turns.length,
    resourceCount: record.resourceManifest.resources.length,
  });
}
