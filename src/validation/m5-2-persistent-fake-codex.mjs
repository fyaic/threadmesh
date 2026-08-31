import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { createCodexPersistedTurnObservation } from "../state/codex-turn-reconciliation.mjs";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function assertPrivateDirectory(directory) {
  const stats = fs.lstatSync(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o700) {
    fail("threadmesh_m52_sigkill_fake_parent_invalid");
  }
}

function atomicPrivateJson(filename, value) {
  const directory = path.dirname(filename);
  assertPrivateDirectory(directory);
  const temporary = path.join(
    directory,
    `.${path.basename(filename)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const descriptor = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, `${canonicalJson(value)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, filename);
  const directoryDescriptor = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(directoryDescriptor);
  } finally {
    fs.closeSync(directoryDescriptor);
  }
}

function appendPrivateRecord(filename, value) {
  const directory = path.dirname(filename);
  assertPrivateDirectory(directory);
  const exists = fs.existsSync(filename);
  let records = [];
  if (exists) {
    const linkStats = fs.lstatSync(filename);
    if (
      !linkStats.isFile() || linkStats.isSymbolicLink() || linkStats.nlink !== 1 ||
      (linkStats.mode & 0o777) !== 0o600
    ) fail("threadmesh_m52_sigkill_fake_transcript_invalid");
    records = fs.readFileSync(filename, "utf8").trim().split("\n")
      .filter(Boolean).map(JSON.parse);
  }
  if (
    value?.sequence !== records.length + 1 ||
    records.some((record, index) => record.sequence !== index + 1) ||
    records.some((record) => record.type === value.type)
  ) fail("threadmesh_m52_sigkill_fake_transcript_conflict");
  const flags = exists
    ? fs.constants.O_WRONLY | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW ?? 0)
    : fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0);
  const descriptor = fs.openSync(filename, flags, 0o600);
  try {
    const stats = fs.fstatSync(descriptor);
    if (!stats.isFile() || stats.nlink !== 1 || (stats.mode & 0o777) !== 0o600) {
      fail("threadmesh_m52_sigkill_fake_transcript_invalid");
    }
    fs.writeFileSync(descriptor, `${canonicalJson(value)}\n`, "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function validatedState(value) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    value.schemaVersion !== 1 || value.product !== "persistent-fake-codex" ||
    typeof value.threadId !== "string" || typeof value.snapshotDigest !== "string" ||
    !Array.isArray(value.turns) || !Number.isInteger(value.toolEffectCount)
  ) fail("threadmesh_m52_sigkill_fake_state_invalid");
  for (const turn of value.turns) {
    if (
      typeof turn?.turnId !== "string" || turn.status !== "interrupted" ||
      typeof turn.clientUserMessageId !== "string"
    ) fail("threadmesh_m52_sigkill_fake_state_invalid");
  }
  return value;
}

export function readPersistentFakeCodexState(filename) {
  assertPrivateDirectory(path.dirname(filename));
  const stats = fs.lstatSync(filename);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o600) {
    fail("threadmesh_m52_sigkill_fake_state_invalid");
  }
  return validatedState(JSON.parse(fs.readFileSync(filename, "utf8")));
}

export function startPersistentFakeCodexTurn({
  stateFilename,
  transcriptFilename,
  threadId,
  snapshotDigest,
  turnId,
  clientUserMessageId,
}) {
  if (fs.existsSync(stateFilename)) {
    fail("threadmesh_m52_sigkill_fake_native_resubmit");
  }
  const state = {
    schemaVersion: 1,
    product: "persistent-fake-codex",
    threadId,
    snapshotDigest,
    turns: [{ turnId, status: "interrupted", clientUserMessageId }],
    toolEffectCount: 0,
  };
  validatedState(state);
  atomicPrivateJson(stateFilename, state);
  appendPrivateRecord(transcriptFilename, {
    sequence: 1,
    type: "native-turn-start-observed",
    threadId,
    turnId,
    clientUserMessageId,
    status: "interrupted",
    stateDigest: sha256Digest(state),
  });
  return state;
}

export function observePersistentFakeCodexTurns({ stateFilename, transcriptFilename }) {
  const state = readPersistentFakeCodexState(stateFilename);
  appendPrivateRecord(transcriptFilename, {
    sequence: 2,
    type: "recovery-observation",
    turnCount: state.turns.length,
    stateDigest: sha256Digest(state),
  });
  const turns = state.turns.map((turn) => ({
    id: turn.turnId,
    status: turn.status,
    items: [{ type: "userMessage", clientId: turn.clientUserMessageId }],
  }));
  return createCodexPersistedTurnObservation({
    threadId: state.threadId,
    snapshotDigest: state.snapshotDigest,
    threadStatus: "notLoaded",
    readTurns: turns,
    listedTurns: turns,
  });
}

export function readPersistentFakeCodexTranscript(filename) {
  const stats = fs.lstatSync(filename);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o600) {
    fail("threadmesh_m52_sigkill_fake_transcript_invalid");
  }
  return fs.readFileSync(filename, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
}

export { atomicPrivateJson };
