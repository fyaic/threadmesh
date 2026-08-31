import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";

const SCHEMA_VERSION = 1;
const MAX_JOURNAL_BYTES = 1024 * 1024;
const FINAL_VERIFICATION_CHECKPOINT = "final-verification";
const JOURNAL_KEYS = Object.freeze([
  "schemaVersion", "scenarioId", "checkpoint", "replayBinding",
  "bundle", "bundleDigest", "recordDigest",
]);
const REPLAY_BINDING_KEYS = Object.freeze([
  "executionId", "messageId", "eventDigest", "actionDigest", "resultDigest",
  "expectedRevision",
]);

function journalError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function exactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
}

function validateIdentity(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240) {
    throw journalError("threadmesh_m52_recovery_journal_identity_invalid", label);
  }
  return value;
}

function assertPrivateDirectory(directory) {
  let stats;
  try {
    stats = fs.lstatSync(directory);
  } catch {
    throw journalError("threadmesh_m52_recovery_journal_parent_invalid");
  }
  if (
    !stats.isDirectory() || stats.isSymbolicLink() ||
    (stats.mode & 0o777) !== 0o700
  ) {
    throw journalError("threadmesh_m52_recovery_journal_parent_invalid");
  }
}

function validatedRecord(record) {
  if (!exactKeys(record, JOURNAL_KEYS) || record.schemaVersion !== SCHEMA_VERSION) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid");
  }
  validateIdentity(record.scenarioId, "scenarioId");
  validateIdentity(record.checkpoint, "checkpoint");
  if (record.checkpoint !== FINAL_VERIFICATION_CHECKPOINT) {
    throw journalError("threadmesh_m52_recovery_journal_checkpoint_invalid");
  }
  if (!record.bundle || typeof record.bundle !== "object" || Array.isArray(record.bundle)) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "bundle");
  }
  if (
    !record.replayBinding || typeof record.replayBinding !== "object" ||
    Array.isArray(record.replayBinding)
  ) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "replayBinding");
  }
  if (
    !exactKeys(record.replayBinding, REPLAY_BINDING_KEYS) ||
    !validateIdentity(record.replayBinding.executionId, "executionId") ||
    !validateIdentity(record.replayBinding.messageId, "messageId") ||
    !["eventDigest", "actionDigest", "resultDigest"].every((key) =>
      /^sha256:[a-f0-9]{64}$/u.test(record.replayBinding[key] ?? "")) ||
    !Number.isInteger(record.replayBinding.expectedRevision) ||
    record.replayBinding.expectedRevision < 0
  ) throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "replayBinding");
  if (
    !exactKeys(record.bundle, ["verification", "finalize"]) ||
    !exactKeys(record.bundle.verification, ["request", "response", "expectedTrustAnchor"]) ||
    !record.bundle.finalize || typeof record.bundle.finalize !== "object" ||
    Array.isArray(record.bundle.finalize)
  ) throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "bundle");
  const { recordDigest, ...body } = record;
  if (
    record.bundleDigest !== sha256Digest(record.bundle) ||
    recordDigest !== sha256Digest(body)
  ) {
    throw journalError("threadmesh_m52_recovery_journal_integrity_mismatch");
  }
  return record;
}

export function writeM52RecoveryJournal({
  filename,
  scenarioId,
  checkpoint,
  replayBinding,
  bundle,
}) {
  if (!path.isAbsolute(filename ?? "")) {
    throw journalError("threadmesh_m52_recovery_journal_path_invalid");
  }
  validateIdentity(scenarioId, "scenarioId");
  validateIdentity(checkpoint, "checkpoint");
  if (checkpoint !== FINAL_VERIFICATION_CHECKPOINT) {
    throw journalError("threadmesh_m52_recovery_journal_checkpoint_invalid");
  }
  if (!replayBinding || typeof replayBinding !== "object" || Array.isArray(replayBinding)) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "replayBinding");
  }
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "bundle");
  }
  const body = {
    schemaVersion: SCHEMA_VERSION,
    scenarioId,
    checkpoint,
    replayBinding,
    bundle,
    bundleDigest: sha256Digest(bundle),
  };
  const record = { ...body, recordDigest: sha256Digest(body) };
  validatedRecord(record);
  const serialized = `${canonicalJson(record)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_JOURNAL_BYTES) {
    throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "size");
  }
  const directory = path.dirname(filename);
  assertPrivateDirectory(directory);
  if (fs.existsSync(filename)) {
    const existing = readM52RecoveryJournal({
      filename,
      expectedScenarioId: scenarioId,
      expectedCheckpoint: checkpoint,
      expectedReplayBinding: replayBinding,
    });
    if (canonicalJson(existing.bundle) !== canonicalJson(bundle)) {
      throw journalError("threadmesh_m52_recovery_journal_conflict");
    }
    return {
      filename,
      checkpoint,
      bundleDigest: existing.bundleDigest,
      recordDigest: existing.recordDigest,
      replay: true,
    };
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
  return {
    filename,
    checkpoint,
    bundleDigest: record.bundleDigest,
    recordDigest: record.recordDigest,
    replay: false,
  };
}

export function readM52RecoveryJournal({
  filename,
  expectedScenarioId,
  expectedCheckpoint,
  expectedReplayBinding,
}) {
  if (!path.isAbsolute(filename ?? "")) {
    throw journalError("threadmesh_m52_recovery_journal_path_invalid");
  }
  assertPrivateDirectory(path.dirname(filename));
  let raw;
  let descriptor;
  try {
    const linkStats = fs.lstatSync(filename);
    if (
      linkStats.isSymbolicLink() || !linkStats.isFile() || linkStats.nlink !== 1 ||
      (linkStats.mode & 0o777) !== 0o600
    ) {
      throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "file");
    }
    descriptor = fs.openSync(
      filename,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
    );
    const stats = fs.fstatSync(descriptor);
    if (
      !stats.isFile() || stats.nlink !== 1 ||
      (stats.mode & 0o777) !== 0o600 || stats.size > MAX_JOURNAL_BYTES
    ) {
      throw journalError("threadmesh_m52_recovery_journal_shape_invalid", "file");
    }
    if (stats.size < 2) {
      throw journalError("threadmesh_m52_recovery_journal_truncated");
    }
    raw = fs.readFileSync(descriptor, "utf8");
  } catch (error) {
    if (error?.code?.startsWith?.("threadmesh_")) throw error;
    throw journalError("threadmesh_m52_recovery_journal_unavailable");
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    throw journalError("threadmesh_m52_recovery_journal_truncated");
  }
  validatedRecord(record);
  if (record.scenarioId !== expectedScenarioId) {
    throw journalError("threadmesh_m52_recovery_journal_scenario_mismatch");
  }
  if (record.checkpoint !== expectedCheckpoint) {
    throw journalError("threadmesh_m52_recovery_journal_checkpoint_mismatch");
  }
  if (canonicalJson(record.replayBinding) !== canonicalJson(expectedReplayBinding)) {
    throw journalError("threadmesh_m52_recovery_journal_replay_binding_mismatch");
  }
  return record;
}
