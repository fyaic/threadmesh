import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  SQLITE_SCHEMA_CHECKSUM,
  SQLITE_SCHEMA_NAME,
  SQLITE_SCHEMA_VERSION,
  SqliteCoordinator,
} from "../src/coordinator/sqlite-coordinator.mjs";

const NOW = Date.parse("2026-08-20T09:00:00Z");

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-migration-"));
  return {
    directory,
    filename: path.join(directory, "coordinator.sqlite"),
    cleanup() {
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("records one immutable baseline migration for a fresh database", () => {
  const temporary = temporaryDatabase();
  const coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  try {
    assert.deepEqual(coordinator.storageInfo(), {
      schemaVersion: SQLITE_SCHEMA_VERSION,
      migrations: [
        {
          version: SQLITE_SCHEMA_VERSION,
          name: SQLITE_SCHEMA_NAME,
          checksum: SQLITE_SCHEMA_CHECKSUM,
          appliedAt: "2026-08-20T09:00:00.000Z",
        },
      ],
      pragmas: {
        journalMode: "wal",
        synchronous: 2,
        busyTimeout: 5000,
        foreignKeys: 1,
        secureDelete: 2,
      },
    });
  } finally {
    coordinator.close();
    temporary.cleanup();
  }
});

test("adopts a version-zero prototype database without deleting unrelated data", () => {
  const temporary = temporaryDatabase();
  let database = new Database(temporary.filename);
  database.exec("CREATE TABLE legacy_marker (value TEXT NOT NULL); INSERT INTO legacy_marker VALUES ('kept');");
  database.close();

  const coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(database.pragma("user_version", { simple: true }), SQLITE_SCHEMA_VERSION);
    assert.equal(database.prepare("SELECT value FROM legacy_marker").pluck().get(), "kept");
  } finally {
    database.close();
    temporary.cleanup();
  }
});

test("rejects a database created by a newer coordinator without modifying it", () => {
  const temporary = temporaryDatabase();
  let database = new Database(temporary.filename);
  database.pragma(`user_version = ${SQLITE_SCHEMA_VERSION + 1}`);
  database.close();
  assert.throws(
    () => new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW }),
    { code: "threadmesh_storage_version_unsupported" },
  );
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(
      database.pragma("user_version", { simple: true }),
      SQLITE_SCHEMA_VERSION + 1,
    );
  } finally {
    database.close();
    temporary.cleanup();
  }
});

test("rolls back the entire migration when legacy schema adoption fails", () => {
  const temporary = temporaryDatabase();
  let database = new Database(temporary.filename);
  database.exec("CREATE TABLE tasks (incompatible TEXT NOT NULL);");
  database.close();
  assert.throws(
    () => new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW }),
  );
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(database.pragma("user_version", { simple: true }), 0);
    const migrationTable = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get();
    assert.equal(migrationTable, undefined);
  } finally {
    database.close();
    temporary.cleanup();
  }
});

test("rejects a modified migration checksum", () => {
  const temporary = temporaryDatabase();
  let coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  const database = new Database(temporary.filename);
  database.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?").run(
    `sha256:${"0".repeat(64)}`,
    SQLITE_SCHEMA_VERSION,
  );
  database.close();
  assert.throws(
    () => new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW }),
    { code: "threadmesh_storage_migration_checksum_mismatch" },
  );
  temporary.cleanup();
});

test("rejects structural drift even when version and checksum still match", () => {
  const temporary = temporaryDatabase();
  const coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  const database = new Database(temporary.filename);
  database.exec("DROP INDEX tasks_global_incarnation;");
  database.close();
  assert.throws(
    () => new SqliteCoordinator({ filename: temporary.filename, clock: () => NOW }),
    { code: "threadmesh_storage_schema_incompatible" },
  );
  temporary.cleanup();
});
