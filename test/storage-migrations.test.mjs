import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import {
  SQLITE_SCHEMA_MIGRATIONS,
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

test("records ordered immutable migrations for a fresh database", () => {
  const temporary = temporaryDatabase();
  const coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  try {
    assert.deepEqual(coordinator.storageInfo(), {
      schemaVersion: SQLITE_SCHEMA_VERSION,
      migrations: SQLITE_SCHEMA_MIGRATIONS.map((migration) => ({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        appliedAt: "2026-08-20T09:00:00.000Z",
      })),
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

test("upgrades a version-one database through all append-only migrations", () => {
  const temporary = temporaryDatabase();
  let coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  let database = new Database(temporary.filename);
  database.exec(`
    ALTER TABLE task_metadata DROP COLUMN run_id;
    ALTER TABLE task_metadata DROP COLUMN objective_version;
    ALTER TABLE task_metadata DROP COLUMN checkpoint;
    ALTER TABLE dispositions DROP COLUMN decision_reason_code;
    ALTER TABLE dispositions DROP COLUMN delivery_failure_reason;
    ALTER TABLE tasks DROP COLUMN adapter_ref_purged_at;
    ALTER TABLE relationship_proposals DROP COLUMN content_purged_at;
    ALTER TABLE task_summaries DROP COLUMN content_purged_at;
    ALTER TABLE messages DROP COLUMN content_purged_at;
    ALTER TABLE messages DROP COLUMN claim_status;
    ALTER TABLE admission_claims DROP COLUMN adapter_ref_purged_at;
    ALTER TABLE audit_events DROP COLUMN detail_purged_at;
    DELETE FROM schema_migrations WHERE version >= 2;
    PRAGMA user_version = 1;
  `);
  const v1Checksum = database
    .prepare("SELECT checksum FROM schema_migrations WHERE version = 1")
    .pluck()
    .get();
  database.close();

  coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(
      database.pragma("user_version", { simple: true }),
      SQLITE_SCHEMA_VERSION,
    );
    assert.equal(
      database.prepare("SELECT checksum FROM schema_migrations WHERE version = 1").pluck().get(),
      v1Checksum,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get(),
      SQLITE_SCHEMA_VERSION,
    );
  } finally {
    database.close();
    temporary.cleanup();
  }
});

test("upgrades version two without rewriting its migration checksum", () => {
  const temporary = temporaryDatabase();
  let coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  let database = new Database(temporary.filename);
  const v2Checksum = database
    .prepare("SELECT checksum FROM schema_migrations WHERE version = 2")
    .pluck()
    .get();
  database.exec(`
    ALTER TABLE tasks DROP COLUMN adapter_ref_purged_at;
    ALTER TABLE relationship_proposals DROP COLUMN content_purged_at;
    ALTER TABLE task_summaries DROP COLUMN content_purged_at;
    ALTER TABLE messages DROP COLUMN content_purged_at;
    ALTER TABLE messages DROP COLUMN claim_status;
    ALTER TABLE admission_claims DROP COLUMN adapter_ref_purged_at;
    ALTER TABLE audit_events DROP COLUMN detail_purged_at;
    DELETE FROM schema_migrations WHERE version = 3;
    PRAGMA user_version = 2;
  `);
  database.close();

  coordinator = new SqliteCoordinator({
    filename: temporary.filename,
    clock: () => NOW,
  });
  coordinator.close();
  database = new Database(temporary.filename, { readonly: true });
  try {
    assert.equal(database.pragma("user_version", { simple: true }), 3);
    assert.equal(
      database.prepare("SELECT checksum FROM schema_migrations WHERE version = 2").pluck().get(),
      v2Checksum,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get(),
      3,
    );
    assert.equal(
      database.prepare("SELECT name FROM pragma_table_info('messages') WHERE name = 'content_purged_at'").pluck().get(),
      "content_purged_at",
    );
  } finally {
    database.close();
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
