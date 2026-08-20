import { randomUUID } from "node:crypto";
import fs from "node:fs";

import Database from "better-sqlite3";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import {
  assertProtocolObject,
  codedError,
  grantAuthorizationDigest,
} from "../protocol-validator.mjs";

const SAFE_DECISIONS = new Set(["accepted", "rejected", "deferred"]);
export const SQLITE_SCHEMA_VERSION = 1;
export const SQLITE_SCHEMA_NAME = "threadmesh-coordinator-baseline";
export const SQLITE_SCHEMA_MANIFEST = Object.freeze({
  tables: {
    tasks: [
      "task_id", "incarnation_id", "harness", "state", "owner_kind",
      "owner_principal_id", "adapter_ref_json", "created_at",
    ],
    task_metadata: ["task_id", "incarnation_id", "revision", "retired_at"],
    relationship_proposals: [
      "proposal_id", "proposal_digest", "source_task_id",
      "source_incarnation_id", "target_task_id", "target_incarnation_id",
      "proposal_json", "status", "created_at",
    ],
    task_summaries: [
      "summary_id", "task_id", "incarnation_id", "relationship_id",
      "grant_id", "grant_version", "summary_version", "summary_json",
      "updated_at",
    ],
    grants: [
      "grant_id", "grant_version", "relationship_id", "source_task_id",
      "source_incarnation_id", "target_task_id", "target_incarnation_id",
      "allowed_intents_json", "allowed_modes_json", "expires_at",
      "revoked_at", "grant_json",
    ],
    messages: [
      "sequence", "sender_incarnation_id", "message_id", "target_task_id",
      "target_incarnation_id", "relationship_id", "grant_id",
      "grant_version", "envelope_digest", "envelope_json", "expires_at",
      "created_at",
    ],
    dispositions: [
      "sender_incarnation_id", "message_id", "revision", "delivery_state",
      "decision_state", "outcome_state", "updated_at",
    ],
    admission_claims: [
      "sender_incarnation_id", "message_id", "nonce", "admission_token",
      "expected_revision", "grant_id", "grant_version", "adapter_ref_json",
      "adapter_ref_digest", "state", "claimed_at", "completed_at",
    ],
    adapter_submissions: [
      "sender_incarnation_id", "message_id", "submission_id",
      "expected_revision", "envelope_digest", "adapter_ref_digest",
      "adapter_idempotency_key", "state", "prepared_at",
      "attempt_started_at", "receipt_json", "reconciliation_json",
      "updated_at",
    ],
    mailbox_claims: [
      "sender_incarnation_id", "message_id", "receiver_task_id",
      "receiver_incarnation_id", "claim_token", "expected_revision", "state",
      "claimed_at", "expires_at", "acknowledged_at",
    ],
    operation_replays: [
      "authentication_id", "method", "idempotency_key", "request_digest",
      "result_json", "completed_at",
    ],
    audit_events: [
      "sequence", "event_id", "sender_incarnation_id", "message_id",
      "event_type", "revision", "detail_json", "occurred_at",
    ],
  },
  indexes: ["tasks_global_incarnation", "grants_relationship_version"],
});
export const SQLITE_SCHEMA_CHECKSUM = sha256Digest({
  version: SQLITE_SCHEMA_VERSION,
  name: SQLITE_SCHEMA_NAME,
  manifest: SQLITE_SCHEMA_MANIFEST,
});

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function assertControlPlanePrincipal(principal) {
  if (
    !principal ||
    !["user", "policy"].includes(principal.kind) ||
    typeof principal.principalId !== "string" ||
    principal.principalId.length === 0
  ) {
    throw codedError("threadmesh_control_plane_authority_required");
  }
}

function assertTaskPrincipal(principal, taskId, incarnationId) {
  if (
    !principal ||
    principal.kind !== "task" ||
    principal.taskId !== taskId ||
    principal.incarnationId !== incarnationId
  ) {
    throw codedError("threadmesh_authenticated_principal_mismatch");
  }
}

function isTaskPrincipal(principal, taskId, incarnationId) {
  return (
    principal?.kind === "task" &&
    principal.taskId === taskId &&
    principal.incarnationId === incarnationId
  );
}

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    envelope: row.envelope_json ? JSON.parse(row.envelope_json) : undefined,
  };
}

export function createEffectiveGrant(draft, decision, principal) {
  assertControlPlanePrincipal(principal);
  if (!decision?.decisionId || !decision?.decidedAt || !decision?.authenticationId) {
    throw codedError("threadmesh_grant_decision_invalid");
  }
  const actor = { actorType: principal.kind, actorId: principal.principalId };
  const grant = {
    ...draft,
    createdAt: decision.decidedAt,
    grantedBy: actor,
    authorization: {
      authority: principal.kind === "policy" ? "policy" : "owner",
      authenticationId: decision.authenticationId,
      decisionId: decision.decisionId,
      ...(decision.proposalId ? { proposalId: decision.proposalId } : {}),
      decidedAt: decision.decidedAt,
      principal: actor,
      integrity: { algorithm: "sha-256", digest: "sha256:" + "0".repeat(64) },
    },
  };
  grant.authorization.integrity.digest = grantAuthorizationDigest(grant);
  return grant;
}

export class SqliteCoordinator {
  constructor({ filename = ":memory:", clock = Date.now } = {}) {
    this.clock = clock;
    this.db = new Database(filename);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("secure_delete = FAST");
    this.db.pragma("foreign_keys = ON");
    try {
      this.#migrate();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  #migrate() {
    const version = this.db.pragma("user_version", { simple: true });
    if (version > SQLITE_SCHEMA_VERSION) {
      throw codedError(
        "threadmesh_storage_version_unsupported",
        `${version} > ${SQLITE_SCHEMA_VERSION}`,
      );
    }
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);
      const recorded = this.db
        .prepare("SELECT * FROM schema_migrations WHERE version = ?")
        .get(SQLITE_SCHEMA_VERSION);
      if (recorded && recorded.checksum !== SQLITE_SCHEMA_CHECKSUM) {
        throw codedError("threadmesh_storage_migration_checksum_mismatch");
      }
      if (version < SQLITE_SCHEMA_VERSION || !recorded) {
        this.#initializeSchema();
        this.#assertSchemaCompatible();
        this.db
          .prepare(
            `INSERT INTO schema_migrations (version, name, checksum, applied_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(version) DO NOTHING`,
          )
          .run(
            SQLITE_SCHEMA_VERSION,
            SQLITE_SCHEMA_NAME,
            SQLITE_SCHEMA_CHECKSUM,
            nowIso(this.clock),
          );
        this.db.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
      } else {
        this.#assertSchemaCompatible();
      }
    }).immediate();
  }

  #initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        harness TEXT NOT NULL,
        state TEXT NOT NULL,
        owner_kind TEXT NOT NULL,
        owner_principal_id TEXT NOT NULL,
        adapter_ref_json TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (task_id, incarnation_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS tasks_global_incarnation
        ON tasks (incarnation_id);

      CREATE TABLE IF NOT EXISTS task_metadata (
        task_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        retired_at TEXT,
        PRIMARY KEY (task_id, incarnation_id),
        FOREIGN KEY (task_id, incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE TABLE IF NOT EXISTS relationship_proposals (
        proposal_id TEXT PRIMARY KEY,
        proposal_digest TEXT NOT NULL,
        source_task_id TEXT NOT NULL,
        source_incarnation_id TEXT NOT NULL,
        target_task_id TEXT NOT NULL,
        target_incarnation_id TEXT NOT NULL,
        proposal_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_summaries (
        summary_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        relationship_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        grant_version INTEGER NOT NULL,
        summary_version INTEGER NOT NULL,
        summary_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (task_id, incarnation_id, relationship_id)
      );

      CREATE TABLE IF NOT EXISTS grants (
        grant_id TEXT PRIMARY KEY,
        grant_version INTEGER NOT NULL,
        relationship_id TEXT NOT NULL,
        source_task_id TEXT NOT NULL,
        source_incarnation_id TEXT NOT NULL,
        target_task_id TEXT NOT NULL,
        target_incarnation_id TEXT NOT NULL,
        allowed_intents_json TEXT NOT NULL,
        allowed_modes_json TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        grant_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        target_task_id TEXT NOT NULL,
        target_incarnation_id TEXT NOT NULL,
        relationship_id TEXT NOT NULL,
        grant_id TEXT NOT NULL,
        grant_version INTEGER NOT NULL,
        envelope_digest TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS dispositions (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        delivery_state TEXT NOT NULL,
        decision_state TEXT NOT NULL,
        outcome_state TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS admission_claims (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        admission_token TEXT NOT NULL UNIQUE,
        expected_revision INTEGER NOT NULL,
        grant_id TEXT NOT NULL,
        grant_version INTEGER NOT NULL,
        adapter_ref_json TEXT NOT NULL,
        adapter_ref_digest TEXT NOT NULL,
        state TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS adapter_submissions (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        submission_id TEXT NOT NULL UNIQUE,
        expected_revision INTEGER NOT NULL,
        envelope_digest TEXT NOT NULL,
        adapter_ref_digest TEXT NOT NULL,
        adapter_idempotency_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        attempt_started_at TEXT,
        receipt_json TEXT,
        reconciliation_json TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS mailbox_claims (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        receiver_task_id TEXT NOT NULL,
        receiver_incarnation_id TEXT NOT NULL,
        claim_token TEXT NOT NULL UNIQUE,
        expected_revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        acknowledged_at TEXT,
        PRIMARY KEY (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS operation_replays (
        authentication_id TEXT NOT NULL,
        method TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        result_json TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        PRIMARY KEY (authentication_id, method, idempotency_key)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        revision INTEGER NOT NULL,
        detail_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS grants_relationship_version
        ON grants (
          relationship_id, source_task_id, source_incarnation_id,
          target_task_id, target_incarnation_id, grant_version
        );
    `);
    this.db.exec(`
      INSERT OR IGNORE INTO task_metadata (task_id, incarnation_id, revision)
      SELECT task_id, incarnation_id, 0 FROM tasks;
    `);
  }

  #assertSchemaCompatible() {
    for (const [table, expectedColumns] of Object.entries(SQLITE_SCHEMA_MANIFEST.tables)) {
      const actualColumns = new Set(
        this.db
          .prepare("SELECT name FROM pragma_table_info(?)")
          .all(table)
          .map((row) => row.name),
      );
      const missing = expectedColumns.filter((column) => !actualColumns.has(column));
      if (missing.length > 0) {
        throw codedError(
          "threadmesh_storage_schema_incompatible",
          `${table} missing ${missing.join(",")}`,
        );
      }
    }
    const indexes = new Set(
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((row) => row.name),
    );
    const missingIndexes = SQLITE_SCHEMA_MANIFEST.indexes.filter(
      (index) => !indexes.has(index),
    );
    if (missingIndexes.length > 0) {
      throw codedError(
        "threadmesh_storage_schema_incompatible",
        `indexes missing ${missingIndexes.join(",")}`,
      );
    }
  }

  storageInfo() {
    return {
      schemaVersion: this.db.pragma("user_version", { simple: true }),
      migrations: this.db
        .prepare(
          "SELECT version, name, checksum, applied_at AS appliedAt FROM schema_migrations ORDER BY version",
        )
        .all(),
      pragmas: {
        journalMode: this.db.pragma("journal_mode", { simple: true }),
        synchronous: this.db.pragma("synchronous", { simple: true }),
        busyTimeout: this.db.pragma("busy_timeout", { simple: true }),
        foreignKeys: this.db.pragma("foreign_keys", { simple: true }),
        secureDelete: this.db.pragma("secure_delete", { simple: true }),
      },
    };
  }

  registerTask(task, principal) {
    assertControlPlanePrincipal(principal);
    if (!task?.taskId || !task?.incarnationId || !task?.harness) {
      throw codedError("threadmesh_task_invalid");
    }

    const incarnation = this.db
      .prepare("SELECT * FROM tasks WHERE incarnation_id = ?")
      .get(task.incarnationId);
    if (incarnation && incarnation.task_id !== task.taskId) {
      throw codedError("threadmesh_incarnation_id_conflict", task.incarnationId);
    }
    if (incarnation) {
      const same =
        incarnation.owner_kind === principal.kind &&
        incarnation.owner_principal_id === principal.principalId &&
        incarnation.harness === task.harness &&
        incarnation.state === (task.state ?? "idle") &&
        canonicalJson(
          incarnation.adapter_ref_json ? JSON.parse(incarnation.adapter_ref_json) : null,
        ) === canonicalJson(task.adapterRef ?? null);
      if (!same) throw codedError("threadmesh_idempotency_conflict", task.incarnationId);
      return { ...task, revision: this.#taskMetadata(task).revision, replay: true };
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO tasks (
             task_id, incarnation_id, harness, state,
             owner_kind, owner_principal_id, adapter_ref_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          task.taskId,
          task.incarnationId,
          task.harness,
          task.state ?? "idle",
          principal.kind,
          principal.principalId,
          task.adapterRef ? canonicalJson(task.adapterRef) : null,
          nowIso(this.clock),
        );
      this.db
        .prepare(
          `INSERT INTO task_metadata (task_id, incarnation_id, revision)
           VALUES (?, ?, 0)`,
        )
        .run(task.taskId, task.incarnationId);
    }).immediate();
    return { ...task, revision: 0, replay: false };
  }

  executeIdempotent(authenticationId, method, idempotencyKey, params, operation) {
    if (!authenticationId || !method || !idempotencyKey) {
      throw codedError("threadmesh_idempotency_scope_invalid");
    }
    const requestDigest = sha256Digest(params);
    return this.db.transaction(() => {
      const existing = this.db
        .prepare(
          `SELECT request_digest, result_json FROM operation_replays
           WHERE authentication_id = ? AND method = ? AND idempotency_key = ?`,
        )
        .get(authenticationId, method, idempotencyKey);
      if (existing) {
        if (existing.request_digest !== requestDigest) {
          throw codedError("threadmesh_idempotency_conflict", idempotencyKey);
        }
        return { replay: true, value: JSON.parse(existing.result_json) };
      }
      const value = operation();
      this.db
        .prepare(
          `INSERT INTO operation_replays (
             authentication_id, method, idempotency_key,
             request_digest, result_json, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          authenticationId,
          method,
          idempotencyKey,
          requestDigest,
          canonicalJson(value),
          nowIso(this.clock),
        );
      return { replay: false, value };
    }).immediate();
  }

  getTask(taskRef, principal) {
    const task = this.db
      .prepare(
        `SELECT task_id, incarnation_id, harness, state,
                owner_kind, owner_principal_id, adapter_ref_json
         FROM tasks WHERE task_id = ? AND incarnation_id = ?`,
      )
      .get(taskRef.taskId, taskRef.incarnationId);
    if (!task) throw codedError("threadmesh_task_not_registered", taskRef.taskId);
    const isOwner =
      principal?.kind === task.owner_kind &&
      principal?.principalId === task.owner_principal_id;
    if (
      !isOwner &&
      principal?.kind !== "policy" &&
      !isTaskPrincipal(principal, task.task_id, task.incarnation_id)
    ) {
      throw codedError("threadmesh_task_not_authorized", task.task_id);
    }
    return {
      taskId: task.task_id,
      incarnationId: task.incarnation_id,
      harness: task.harness,
      state: task.state,
      adapterRef: task.adapter_ref_json ? JSON.parse(task.adapter_ref_json) : null,
      revision: this.#taskMetadata(taskRef).revision,
    };
  }

  attachTask(taskRef, adapterRef, expectedRevision, principal) {
    return this.db.transaction(() => {
      const task = this.#taskRecord(taskRef);
      this.#assertTaskOwnerOrSelf(task, principal);
      const metadata = this.#taskMetadata(taskRef);
      if (metadata.retired_at) throw codedError("threadmesh_task_retired");
      if (metadata.revision !== expectedRevision) {
        throw codedError("threadmesh_revision_conflict");
      }
      const result = this.db
        .prepare(
          `UPDATE task_metadata SET revision = revision + 1
           WHERE task_id = ? AND incarnation_id = ? AND revision = ?`,
        )
        .run(taskRef.taskId, taskRef.incarnationId, expectedRevision);
      if (result.changes !== 1) throw codedError("threadmesh_revision_conflict");
      this.db
        .prepare(
          `UPDATE tasks SET adapter_ref_json = ?
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .run(canonicalJson(adapterRef), taskRef.taskId, taskRef.incarnationId);
      return this.getTask(taskRef, principal);
    }).immediate();
  }

  rotateTaskIncarnation(previous, next, expectedRevision, principal) {
    assertControlPlanePrincipal(principal);
    return this.db.transaction(() => {
      const current = this.#taskRecord(previous);
      if (
        principal.kind !== "policy" &&
        (current.owner_kind !== principal.kind ||
          current.owner_principal_id !== principal.principalId)
      ) {
        throw codedError("threadmesh_task_not_authorized", previous.taskId);
      }
      const metadata = this.#taskMetadata(previous);
      if (metadata.retired_at) throw codedError("threadmesh_task_retired");
      if (metadata.revision !== expectedRevision) {
        throw codedError("threadmesh_revision_conflict");
      }
      if (next.taskId !== previous.taskId) {
        throw codedError("threadmesh_task_rotation_id_mismatch");
      }
      const conflict = this.db
        .prepare("SELECT task_id FROM tasks WHERE incarnation_id = ?")
        .get(next.incarnationId);
      if (conflict) {
        throw codedError("threadmesh_incarnation_id_conflict", next.incarnationId);
      }
      const at = nowIso(this.clock);
      this.db
        .prepare(
          `UPDATE tasks SET state = 'archived'
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .run(previous.taskId, previous.incarnationId);
      const retired = this.db
        .prepare(
          `UPDATE task_metadata SET revision = revision + 1, retired_at = ?
           WHERE task_id = ? AND incarnation_id = ? AND revision = ?`,
        )
        .run(at, previous.taskId, previous.incarnationId, expectedRevision);
      if (retired.changes !== 1) throw codedError("threadmesh_revision_conflict");
      this.db
        .prepare(
          `INSERT INTO tasks (
             task_id, incarnation_id, harness, state, owner_kind,
             owner_principal_id, adapter_ref_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          next.taskId,
          next.incarnationId,
          next.harness ?? current.harness,
          next.state ?? "idle",
          current.owner_kind,
          current.owner_principal_id,
          next.adapterRef ? canonicalJson(next.adapterRef) : null,
          at,
        );
      this.db
        .prepare(
          `INSERT INTO task_metadata (task_id, incarnation_id, revision)
           VALUES (?, ?, 0)`,
        )
        .run(next.taskId, next.incarnationId);
      return {
        previous: { ...previous, revision: expectedRevision + 1, retiredAt: at },
        current: { ...next, revision: 0 },
      };
    }).immediate();
  }

  proposeRelationship(proposal, principal) {
    assertProtocolObject("relationship-proposal", proposal);
    assertTaskPrincipal(
      principal,
      proposal.source.taskId,
      proposal.source.incarnationId,
    );
    if (Date.parse(proposal.expiresAt) <= this.clock()) {
      throw codedError("threadmesh_relationship_proposal_expired");
    }
    this.#assertTaskActive(proposal.source);
    this.#assertTaskActive(proposal.target);
    const digest = sha256Digest(proposal);
    const existing = this.db
      .prepare(
        `SELECT proposal_digest, proposal_json, status
         FROM relationship_proposals WHERE proposal_id = ?`,
      )
      .get(proposal.proposalId);
    if (existing) {
      if (existing.proposal_digest !== digest) {
        throw codedError("threadmesh_idempotency_conflict", proposal.proposalId);
      }
      return {
        replay: true,
        proposal: JSON.parse(existing.proposal_json),
        status: existing.status,
      };
    }
    this.db
      .prepare(
        `INSERT INTO relationship_proposals (
           proposal_id, proposal_digest, source_task_id,
           source_incarnation_id, target_task_id, target_incarnation_id,
           proposal_json, status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        proposal.proposalId,
        digest,
        proposal.source.taskId,
        proposal.source.incarnationId,
        proposal.target.taskId,
        proposal.target.incarnationId,
        canonicalJson(proposal),
        proposal.createdAt,
      );
    return { replay: false, proposal, status: "pending" };
  }

  publishTaskSummary(summary, expectedPreviousVersion, principal) {
    assertProtocolObject("task-summary", summary);
    return this.db.transaction(() => {
      const task = this.#taskRecord(summary.task);
      this.#assertTaskOwnerOrSelf(task, principal);
      const grant = this.#grantForProjection(summary.projection);
      this.#assertSummaryProjection(summary, grant);
      const existing = this.db
        .prepare(
          `SELECT summary_id, summary_version FROM task_summaries
           WHERE task_id = ? AND incarnation_id = ? AND relationship_id = ?`,
        )
        .get(
          summary.task.taskId,
          summary.task.incarnationId,
          summary.projection.relationshipId,
        );
      if (existing) {
        if (
          expectedPreviousVersion !== existing.summary_version ||
          summary.summaryVersion <= existing.summary_version ||
          summary.summaryId !== existing.summary_id
        ) {
          throw codedError("threadmesh_revision_conflict");
        }
        this.db
          .prepare(
            `UPDATE task_summaries SET grant_id = ?, grant_version = ?,
               summary_version = ?, summary_json = ?, updated_at = ?
             WHERE summary_id = ? AND summary_version = ?`,
          )
          .run(
            summary.projection.grantId,
            summary.projection.grantVersion,
            summary.summaryVersion,
            canonicalJson(summary),
            summary.updatedAt,
            summary.summaryId,
            expectedPreviousVersion,
          );
      } else {
        if (expectedPreviousVersion !== null && expectedPreviousVersion !== undefined) {
          throw codedError("threadmesh_revision_conflict");
        }
        this.db
          .prepare(
            `INSERT INTO task_summaries (
               summary_id, task_id, incarnation_id, relationship_id,
               grant_id, grant_version, summary_version, summary_json, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            summary.summaryId,
            summary.task.taskId,
            summary.task.incarnationId,
            summary.projection.relationshipId,
            summary.projection.grantId,
            summary.projection.grantVersion,
            summary.summaryVersion,
            canonicalJson(summary),
            summary.updatedAt,
          );
      }
      return summary;
    }).immediate();
  }

  getTaskSummary(taskRef, relationshipId, principal) {
    const row = this.db
      .prepare(
        `SELECT * FROM task_summaries
         WHERE task_id = ? AND incarnation_id = ? AND relationship_id = ?`,
      )
      .get(taskRef.taskId, taskRef.incarnationId, relationshipId);
    if (!row) throw codedError("threadmesh_task_summary_not_found");
    const summary = JSON.parse(row.summary_json);
    const grant = this.#grantForProjection(summary.projection);
    this.#assertSummaryProjection(summary, grant);
    assertTaskPrincipal(
      principal,
      grant.source_task_id,
      grant.source_incarnation_id,
    );
    return summary;
  }

  issueGrant(draft, decision, principal) {
    if (decision?.proposalId) {
      const row = this.db
        .prepare(
          `SELECT proposal_json, status FROM relationship_proposals
           WHERE proposal_id = ?`,
        )
        .get(decision.proposalId);
      if (!row || row.status !== "pending") {
        throw codedError("threadmesh_relationship_proposal_not_pending");
      }
      const proposal = JSON.parse(row.proposal_json);
      if (Date.parse(proposal.expiresAt) <= this.clock()) {
        throw codedError("threadmesh_relationship_proposal_expired");
      }
      const expected = {
        relationshipType: proposal.relationshipType,
        source: proposal.source,
        target: proposal.target,
        allowedIntents: proposal.requestedIntents,
        allowedDeliveryModes: proposal.requestedDeliveryModes,
        summaryVisibility: proposal.requestedSummaryVisibility,
      };
      for (const [key, value] of Object.entries(expected)) {
        if (canonicalJson(draft[key]) !== canonicalJson(value)) {
          throw codedError("threadmesh_grant_proposal_mismatch", key);
        }
      }
    }
    const grant = createEffectiveGrant(draft, decision, principal);
    const installed = this.installGrant(grant, principal);
    if (decision?.proposalId) {
      this.db
        .prepare(
          `UPDATE relationship_proposals SET status = 'approved'
           WHERE proposal_id = ? AND status = 'pending'`,
        )
        .run(decision.proposalId);
    }
    return installed;
  }

  installGrant(grant, principal) {
    assertControlPlanePrincipal(principal);
    assertProtocolObject("grant", grant);
    if (
      !["user", "policy"].includes(grant.grantedBy.actorType) ||
      grant.grantedBy.actorType !== principal.kind ||
      typeof grant.grantedBy.actorId !== "string" ||
      grant.grantedBy.actorId.length === 0 ||
      grant.grantedBy.actorId !== principal.principalId
    ) {
      throw codedError("threadmesh_grant_issuer_invalid");
    }
    if (
      grant.authorization.authority !==
        (principal.kind === "policy" ? "policy" : "owner") ||
      grant.authorization.principal.actorType !== principal.kind ||
      grant.authorization.principal.actorId !== principal.principalId ||
      grant.authorization.integrity.digest !==
        grantAuthorizationDigest(grant)
    ) {
      throw codedError("threadmesh_grant_authorization_invalid");
    }

    const existingId = this.db
      .prepare("SELECT grant_json FROM grants WHERE grant_id = ?")
      .get(grant.grantId);
    if (existingId) {
      if (canonicalJson(JSON.parse(existingId.grant_json)) !== canonicalJson(grant)) {
        throw codedError("threadmesh_idempotency_conflict", grant.grantId);
      }
      return grant;
    }
    const existingVersion = this.db
      .prepare(
        `SELECT grant_id FROM grants WHERE relationship_id = ?
           AND source_task_id = ? AND source_incarnation_id = ?
           AND target_task_id = ? AND target_incarnation_id = ?
           AND grant_version = ?`,
      )
      .get(
        grant.relationshipId,
        grant.source.taskId,
        grant.source.incarnationId,
        grant.target.taskId,
        grant.target.incarnationId,
        grant.grantVersion,
      );
    if (existingVersion) throw codedError("threadmesh_revision_conflict");

    const transaction = this.db.transaction(() => {
      for (const ref of [grant.source, grant.target]) {
        const task = this.db
          .prepare(
            `SELECT t.owner_kind, t.owner_principal_id, m.retired_at
             FROM tasks t JOIN task_metadata m USING (task_id, incarnation_id)
             WHERE t.task_id = ? AND t.incarnation_id = ?`,
          )
          .get(ref.taskId, ref.incarnationId);
        if (!task) throw codedError("threadmesh_task_not_registered", ref.taskId);
        if (task.retired_at) throw codedError("threadmesh_task_retired", ref.taskId);
        if (
          principal.kind !== "policy" &&
          (task.owner_kind !== principal.kind ||
            task.owner_principal_id !== principal.principalId)
        ) {
          throw codedError("threadmesh_grant_scope_not_authorized", ref.taskId);
        }
      }

      this.db
        .prepare(
          `INSERT INTO grants (
             grant_id, grant_version, relationship_id,
             source_task_id, source_incarnation_id,
             target_task_id, target_incarnation_id,
             allowed_intents_json, allowed_modes_json,
             expires_at, revoked_at, grant_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          grant.grantId,
          grant.grantVersion,
          grant.relationshipId,
          grant.source.taskId,
          grant.source.incarnationId,
          grant.target.taskId,
          grant.target.incarnationId,
          JSON.stringify(grant.allowedIntents),
          JSON.stringify(grant.allowedDeliveryModes),
          grant.expiresAt ?? null,
          grant.revokedAt ?? null,
          JSON.stringify(grant),
        );
    });
    transaction();
    return grant;
  }

  revokeGrant(grantId, expectedGrantVersionOrPrincipal, maybePrincipal) {
    const expectedGrantVersion =
      typeof expectedGrantVersionOrPrincipal === "number"
        ? expectedGrantVersionOrPrincipal
        : null;
    const principal = maybePrincipal ?? expectedGrantVersionOrPrincipal;
    assertControlPlanePrincipal(principal);
    return this.db.transaction(() => {
      const grant = this.db
        .prepare(
          `SELECT g.grant_json, g.grant_version, g.revoked_at,
                  t.owner_kind, t.owner_principal_id
           FROM grants g JOIN tasks t
             ON t.task_id = g.target_task_id
            AND t.incarnation_id = g.target_incarnation_id
           WHERE g.grant_id = ?`,
        )
        .get(grantId);
      if (!grant) throw codedError("threadmesh_grant_not_active", grantId);
      if (
        expectedGrantVersion !== null &&
        grant.grant_version !== expectedGrantVersion
      ) {
        throw codedError("threadmesh_revision_conflict");
      }
      const issuer = JSON.parse(grant.grant_json).grantedBy;
      const isIssuer =
        issuer.actorType === principal.kind && issuer.actorId === principal.principalId;
      const isTargetOwner =
        grant.owner_kind === principal.kind &&
        grant.owner_principal_id === principal.principalId;
      if (principal.kind !== "policy" && !isIssuer && !isTargetOwner) {
        throw codedError("threadmesh_grant_revoke_not_authorized", grantId);
      }
      if (grant.revoked_at) {
        return {
          grantId,
          grantVersion: grant.grant_version,
          revokedAt: grant.revoked_at,
          replay: true,
        };
      }
      const revokedAt = nowIso(this.clock);
      const result = this.db
        .prepare("UPDATE grants SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL")
        .run(revokedAt, grantId);
      if (result.changes !== 1) throw codedError("threadmesh_grant_not_active", grantId);
      return {
        grantId,
        grantVersion: grant.grant_version,
        revokedAt,
        replay: false,
      };
    }).immediate();
  }

  submit(envelope, principal) {
    assertProtocolObject("envelope", envelope);
    if (principal?.kind === "task") {
      assertTaskPrincipal(
        principal,
        envelope.sender.taskId,
        envelope.sender.incarnationId,
      );
      if (envelope.sender.actorType !== "agent") {
        throw codedError("threadmesh_sender_actor_requires_control_plane");
      }
    } else {
      assertControlPlanePrincipal(principal);
      if (
        envelope.sender.actorType !== principal.kind ||
        envelope.sender.actorId !== principal.principalId
      ) {
        throw codedError("threadmesh_authenticated_principal_mismatch");
      }
      const senderTask = this.db
        .prepare(
          `SELECT owner_kind, owner_principal_id FROM tasks
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .get(envelope.sender.taskId, envelope.sender.incarnationId);
      if (!senderTask) {
        throw codedError("threadmesh_task_not_registered", envelope.sender.taskId);
      }
      if (
        principal.kind !== "policy" &&
        (senderTask.owner_kind !== principal.kind ||
          senderTask.owner_principal_id !== principal.principalId)
      ) {
        throw codedError("threadmesh_task_not_authorized", envelope.sender.taskId);
      }
    }
    const digest = sha256Digest(envelope);
    return this.db.transaction(() => {
      const existing = this.db
        .prepare(
          `SELECT m.*, d.revision, d.delivery_state, d.decision_state, d.outcome_state
           FROM messages m JOIN dispositions d USING (sender_incarnation_id, message_id)
           WHERE m.sender_incarnation_id = ? AND m.message_id = ?`,
        )
        .get(envelope.sender.incarnationId, envelope.messageId);
      if (existing) {
        if (existing.envelope_digest !== digest) {
          throw codedError("threadmesh_idempotency_conflict", envelope.messageId);
        }
        return {
          replay: true,
          message: parseRow(existing),
          disposition: this.#disposition(existing),
        };
      }

      if (Date.parse(envelope.expiresAt) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }

      const grant = this.#activeGrantFor(envelope);
      const at = nowIso(this.clock);
      this.db
        .prepare(
          `INSERT INTO messages (
             sender_incarnation_id, message_id, target_task_id,
             target_incarnation_id, relationship_id, grant_id, grant_version,
             envelope_digest, envelope_json, expires_at, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          envelope.sender.incarnationId,
          envelope.messageId,
          envelope.target.taskId,
          envelope.target.incarnationId,
          envelope.relationshipId,
          grant.grant_id,
          grant.grant_version,
          digest,
          JSON.stringify(envelope),
          envelope.expiresAt,
          envelope.createdAt,
        );
      this.db
        .prepare(
          `INSERT INTO dispositions (
             sender_incarnation_id, message_id, revision, delivery_state,
             decision_state, outcome_state, updated_at
           ) VALUES (?, ?, 0, 'durably-received', 'pending', 'not-observed', ?)`,
        )
        .run(envelope.sender.incarnationId, envelope.messageId, at);
      this.#audit(envelope.sender.incarnationId, envelope.messageId, "message-durably-received", 0, {
        envelopeDigest: digest,
        grantId: grant.grant_id,
        grantVersion: grant.grant_version,
      });
      return {
        replay: false,
        envelopeDigest: digest,
        disposition: this.#getDisposition(envelope.sender.incarnationId, envelope.messageId),
      };
    }).immediate();
  }

  listPending(target, { afterCursor = 0, limit = 50 } = {}, principal) {
    assertTaskPrincipal(principal, target.taskId, target.incarnationId);
    this.#assertTaskActive(target);
    const rows = this.db
      .prepare(
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state, d.outcome_state,
                c.state AS claim_state, c.expires_at AS claim_expires_at
         FROM messages m JOIN dispositions d USING (sender_incarnation_id, message_id)
         LEFT JOIN mailbox_claims c USING (sender_incarnation_id, message_id)
         WHERE m.target_task_id = ? AND m.target_incarnation_id = ?
           AND m.sequence > ? AND d.decision_state IN ('pending', 'deferred')
         ORDER BY m.sequence ASC LIMIT ?`,
      )
      .all(target.taskId, target.incarnationId, afterCursor, Math.min(limit, 100));
    const visibleRows = rows.filter((row) => {
      if (Date.parse(row.expires_at) <= this.clock()) return false;
      try {
        this.#assertCurrentAuthorization(row);
        return true;
      } catch {
        return false;
      }
    });
    return {
      messages: visibleRows.map((row) => ({
        cursor: row.sequence,
        envelope: JSON.parse(row.envelope_json),
        disposition: this.#disposition(row),
        claim: row.claim_state
          ? { state: row.claim_state, expiresAt: row.claim_expires_at }
          : null,
      })),
      nextCursor: rows.at(-1)?.sequence ?? afterCursor,
    };
  }

  claimPending(senderIncarnationId, messageId, expectedRevision, principal) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      this.#assertCurrentAuthorization(row);
      if (Date.parse(row.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      if (
        row.revision !== expectedRevision ||
        !["pending", "deferred"].includes(row.decision_state)
      ) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      const existing = this.db
        .prepare(
          `SELECT * FROM mailbox_claims
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (existing && existing.state === "claimed" && Date.parse(existing.expires_at) > this.clock()) {
        return {
          replay: true,
          claimToken: existing.claim_token,
          expectedRevision: existing.expected_revision,
          expiresAt: existing.expires_at,
        };
      }
      if (existing?.state === "acknowledged") {
        throw codedError("threadmesh_mailbox_already_acknowledged");
      }
      const claimedAt = nowIso(this.clock);
      const expiresAt = new Date(
        Math.min(Date.parse(row.expires_at), this.clock() + 60_000),
      ).toISOString();
      const claimToken = sha256Digest({
        senderIncarnationId,
        messageId,
        expectedRevision,
        receiverTaskId: row.target_task_id,
        receiverIncarnationId: row.target_incarnation_id,
        nonce: randomUUID(),
      });
      this.db
        .prepare(
          `INSERT INTO mailbox_claims (
             sender_incarnation_id, message_id, receiver_task_id,
             receiver_incarnation_id, claim_token, expected_revision,
             state, claimed_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'claimed', ?, ?)
           ON CONFLICT(sender_incarnation_id, message_id) DO UPDATE SET
             claim_token = excluded.claim_token,
             expected_revision = excluded.expected_revision,
             state = 'claimed', claimed_at = excluded.claimed_at,
             expires_at = excluded.expires_at, acknowledged_at = NULL`,
        )
        .run(
          senderIncarnationId,
          messageId,
          row.target_task_id,
          row.target_incarnation_id,
          claimToken,
          expectedRevision,
          claimedAt,
          expiresAt,
        );
      this.#audit(senderIncarnationId, messageId, "mailbox-claimed", expectedRevision, {
        claimTokenDigest: sha256Digest(claimToken),
        expiresAt,
      });
      return { replay: false, claimToken, expectedRevision, expiresAt };
    }).immediate();
  }

  acknowledgePending(
    senderIncarnationId,
    messageId,
    claimToken,
    decision,
    expectedRevision,
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.db
        .prepare(
          `SELECT * FROM mailbox_claims
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (
        !claim ||
        claim.state !== "claimed" ||
        claim.claim_token !== claimToken ||
        claim.expected_revision !== expectedRevision
      ) {
        throw codedError("threadmesh_mailbox_claim_invalid");
      }
      assertTaskPrincipal(
        principal,
        claim.receiver_task_id,
        claim.receiver_incarnation_id,
      );
      if (Date.parse(claim.expires_at) <= this.clock()) {
        throw codedError("threadmesh_mailbox_claim_expired");
      }
      const disposition = this.respond(
        senderIncarnationId,
        messageId,
        decision,
        expectedRevision,
        principal,
      );
      const result = this.db
        .prepare(
          `UPDATE mailbox_claims SET state = 'acknowledged', acknowledged_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND claim_token = ? AND state = 'claimed'`,
        )
        .run(nowIso(this.clock), senderIncarnationId, messageId, claimToken);
      if (result.changes !== 1) throw codedError("threadmesh_mailbox_claim_invalid");
      return disposition;
    }).immediate();
  }

  respond(senderIncarnationId, messageId, decision, expectedRevision, principal) {
    if (!SAFE_DECISIONS.has(decision)) {
      throw codedError("threadmesh_decision_unsupported", decision);
    }
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      this.#assertCurrentAuthorization(row);
      if (Date.parse(row.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      const result = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1, decision_state = ?, updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
             AND decision_state IN ('pending', 'deferred')`,
        )
        .run(decision, nowIso(this.clock), senderIncarnationId, messageId, expectedRevision);
      if (result.changes !== 1) throw codedError("threadmesh_revision_conflict");
      const updated = this.#getDisposition(senderIncarnationId, messageId);
      this.#audit(senderIncarnationId, messageId, "receiver-decided", updated.revision, {
        decision,
      });
      return updated;
    }).immediate();
  }

  prepareContextAdmission(senderIncarnationId, messageId, expectedRevision, principal) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      this.#assertContextAdmissionState(row, expectedRevision);
      const existing = this.db
        .prepare(
          `SELECT state FROM admission_claims
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (existing) throw codedError("threadmesh_context_admission_in_flight", existing.state);

      const task = this.db
        .prepare(
          `SELECT adapter_ref_json FROM tasks
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .get(row.target_task_id, row.target_incarnation_id);
      if (!task?.adapter_ref_json) {
        throw codedError("threadmesh_target_adapter_not_bound");
      }
      const adapterRef = JSON.parse(task.adapter_ref_json);
      if (
        adapterRef.kind !== "acp-session" ||
        typeof adapterRef.sessionId !== "string" ||
        typeof adapterRef.snapshotDigest !== "string"
      ) {
        throw codedError("threadmesh_target_adapter_ref_invalid");
      }
      const nonce = randomUUID();
      const adapterRefDigest = sha256Digest(adapterRef);
      const admissionToken = this.#admissionToken(
        row,
        expectedRevision,
        nonce,
        adapterRefDigest,
      );
      this.db
        .prepare(
          `INSERT INTO admission_claims (
             sender_incarnation_id, message_id, nonce, admission_token,
             expected_revision, grant_id, grant_version,
             adapter_ref_json, adapter_ref_digest, state, claimed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in-flight', ?)`,
        )
        .run(
          senderIncarnationId,
          messageId,
          nonce,
          admissionToken,
          expectedRevision,
          row.grant_id,
          row.grant_version,
          canonicalJson(adapterRef),
          adapterRefDigest,
          nowIso(this.clock),
        );
      this.#audit(
        senderIncarnationId,
        messageId,
        "context-admission-claimed",
        expectedRevision,
        { admissionToken, adapterRefDigest, grantId: row.grant_id, grantVersion: row.grant_version },
      );
      const envelope = JSON.parse(row.envelope_json);
      return {
        admissionToken,
        adapterRef,
        revision: expectedRevision,
        rendering: `THREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1\n${canonicalJson({
          type: "threadmesh.peer-suggestion",
          authority: "untrusted-peer",
          provenance: {
            messageId: envelope.messageId,
            sourceTask: envelope.sender.taskId,
            sourceIncarnation: envelope.sender.incarnationId,
            relationshipId: envelope.relationshipId,
            actorType: envelope.sender.actorType,
            claimStatus: envelope.claimStatus,
          },
          reason: envelope.reason,
          content: envelope.content,
        })}`,
      };
    }).immediate();
  }

  confirmContextAdmission(
    senderIncarnationId,
    messageId,
    expectedRevision,
    admissionToken,
    adapterEvidence,
    principal,
  ) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      const claim = this.db
        .prepare(
          `SELECT * FROM admission_claims
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (
        !claim ||
        claim.state !== "in-flight" ||
        claim.expected_revision !== expectedRevision ||
        claim.admission_token !== admissionToken
      ) {
        throw codedError("threadmesh_context_admission_token_invalid");
      }
      if (
        row.revision !== expectedRevision ||
        row.decision_state !== "accepted" ||
        !["durably-received", "checkpoint-offered"].includes(row.delivery_state)
      ) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      const adapterRef = JSON.parse(claim.adapter_ref_json);
      if (
        adapterEvidence?.sessionId !== adapterRef.sessionId ||
        adapterEvidence?.snapshotDigest !== adapterRef.snapshotDigest ||
        adapterEvidence?.stopReason !== "end_turn"
      ) {
        throw codedError("threadmesh_adapter_evidence_mismatch");
      }
      const result = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1,
             delivery_state = 'context-admitted', updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
             AND decision_state = 'accepted'
             AND delivery_state IN ('durably-received', 'checkpoint-offered')`,
        )
        .run(nowIso(this.clock), senderIncarnationId, messageId, expectedRevision);
      if (result.changes !== 1) throw codedError("threadmesh_revision_or_state_conflict");
      const claimResult = this.db
        .prepare(
          `UPDATE admission_claims SET state = 'completed', completed_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND admission_token = ? AND state = 'in-flight'`,
        )
        .run(nowIso(this.clock), senderIncarnationId, messageId, admissionToken);
      if (claimResult.changes !== 1) {
        throw codedError("threadmesh_context_admission_token_invalid");
      }
      const disposition = this.#getDisposition(senderIncarnationId, messageId);
      this.#audit(senderIncarnationId, messageId, "context-admitted", disposition.revision, {
        admissionToken,
        adapterEvidence: adapterEvidence ?? null,
      });
      return disposition;
    }).immediate();
  }

  prepareAdapterSubmission(senderIncarnationId, messageId, expectedRevision, principal) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      this.#assertCurrentAuthorization(row);
      if (Date.parse(row.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      this.#assertAdapterSubmissionState(row, expectedRevision);
      const existing = this.db
        .prepare(
          `SELECT * FROM adapter_submissions
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (existing && existing.state !== "confirmed-not-submitted") {
        if (existing.state === "prepared" && existing.expected_revision === expectedRevision) {
          return { replay: true, submission: this.#adapterSubmission(existing, row) };
        }
        throw codedError("threadmesh_adapter_submission_in_flight", existing.state);
      }

      const task = this.db
        .prepare(
          `SELECT adapter_ref_json FROM tasks
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .get(row.target_task_id, row.target_incarnation_id);
      if (!task?.adapter_ref_json) throw codedError("threadmesh_target_adapter_not_bound");
      const adapterRefDigest = sha256Digest(JSON.parse(task.adapter_ref_json));
      const at = nowIso(this.clock);
      const submissionId = `sub_${randomUUID()}`;
      const adapterIdempotencyKey = `adp_${randomUUID()}`;
      if (existing) {
        this.db
          .prepare(
            `DELETE FROM adapter_submissions
             WHERE sender_incarnation_id = ? AND message_id = ?
               AND state = 'confirmed-not-submitted'`,
          )
          .run(senderIncarnationId, messageId);
      }
      this.db
        .prepare(
          `INSERT INTO adapter_submissions (
             sender_incarnation_id, message_id, submission_id,
             expected_revision, envelope_digest, adapter_ref_digest,
             adapter_idempotency_key, state, prepared_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'prepared', ?, ?)`,
        )
        .run(
          senderIncarnationId,
          messageId,
          submissionId,
          expectedRevision,
          row.envelope_digest,
          adapterRefDigest,
          adapterIdempotencyKey,
          at,
          at,
        );
      const submission = this.db
        .prepare("SELECT * FROM adapter_submissions WHERE submission_id = ?")
        .get(submissionId);
      this.#audit(senderIncarnationId, messageId, "adapter-submission-prepared", expectedRevision, {
        submissionId,
        adapterIdempotencyKey,
        envelopeDigest: row.envelope_digest,
        adapterRefDigest,
      });
      return { replay: false, submission: this.#adapterSubmission(submission, row) };
    }).immediate();
  }

  beginAdapterSubmission(submissionId, expectedRevision, principal) {
    return this.db.transaction(() => {
      const { submission, message } = this.#submissionWithMessage(submissionId);
      assertTaskPrincipal(principal, message.target_task_id, message.target_incarnation_id);
      this.#assertCurrentAuthorization(message);
      if (Date.parse(message.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      this.#assertAdapterSubmissionState(message, expectedRevision);
      if (submission.expected_revision !== expectedRevision) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      if (submission.state === "outcome-unknown") {
        return { replay: true, submission: this.#adapterSubmission(submission, message) };
      }
      const at = nowIso(this.clock);
      const result = this.db
        .prepare(
          `UPDATE adapter_submissions
           SET state = 'outcome-unknown', attempt_started_at = ?, updated_at = ?
           WHERE submission_id = ? AND state = 'prepared' AND expected_revision = ?`,
        )
        .run(at, at, submissionId, expectedRevision);
      if (result.changes !== 1) throw codedError("threadmesh_adapter_submission_state_conflict");
      const updated = this.db
        .prepare("SELECT * FROM adapter_submissions WHERE submission_id = ?")
        .get(submissionId);
      this.#audit(message.sender_incarnation_id, message.message_id, "adapter-attempt-started", expectedRevision, {
        submissionId,
        adapterIdempotencyKey: submission.adapter_idempotency_key,
      });
      return { replay: false, submission: this.#adapterSubmission(updated, message) };
    }).immediate();
  }

  recordAdapterReceipt(submissionId, expectedRevision, receipt, principal) {
    if (
      !receipt ||
      typeof receipt.adapterOperationId !== "string" ||
      receipt.adapterOperationId.length === 0 ||
      !Number.isFinite(Date.parse(receipt.acceptedAt))
    ) {
      throw codedError("threadmesh_adapter_receipt_invalid");
    }
    return this.db.transaction(() => {
      const { submission, message } = this.#submissionWithMessage(submissionId);
      assertTaskPrincipal(principal, message.target_task_id, message.target_incarnation_id);
      if (submission.state === "receipt-recorded") {
        if (canonicalJson(JSON.parse(submission.receipt_json)) !== canonicalJson(receipt)) {
          throw codedError("threadmesh_adapter_receipt_conflict");
        }
        return {
          replay: true,
          submission: this.#adapterSubmission(submission, message),
          disposition: this.#disposition(message),
        };
      }
      this.#assertAdapterSubmissionState(message, expectedRevision);
      if (
        submission.state !== "outcome-unknown" ||
        submission.expected_revision !== expectedRevision
      ) {
        throw codedError("threadmesh_adapter_submission_state_conflict");
      }
      const at = nowIso(this.clock);
      const dispositionResult = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1,
             delivery_state = 'adapter-submitted', updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
             AND decision_state = 'accepted'
             AND delivery_state IN ('durably-received', 'receiver-notified',
               'checkpoint-offered', 'context-admitted')`,
        )
        .run(at, message.sender_incarnation_id, message.message_id, expectedRevision);
      if (dispositionResult.changes !== 1) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      const submissionResult = this.db
        .prepare(
          `UPDATE adapter_submissions SET state = 'receipt-recorded',
             receipt_json = ?, updated_at = ?
           WHERE submission_id = ? AND state = 'outcome-unknown'`,
        )
        .run(canonicalJson(receipt), at, submissionId);
      if (submissionResult.changes !== 1) {
        throw codedError("threadmesh_adapter_submission_state_conflict");
      }
      const updatedMessage = this.#message(message.sender_incarnation_id, message.message_id);
      const updated = this.db
        .prepare("SELECT * FROM adapter_submissions WHERE submission_id = ?")
        .get(submissionId);
      this.#audit(message.sender_incarnation_id, message.message_id, "adapter-receipt-recorded", updatedMessage.revision, {
        submissionId,
        adapterOperationId: receipt.adapterOperationId,
      });
      return {
        replay: false,
        submission: this.#adapterSubmission(updated, updatedMessage),
        disposition: this.#disposition(updatedMessage),
      };
    }).immediate();
  }

  reconcileAdapterSubmission(submissionId, expectedRevision, reconciliation, principal) {
    const resolution = reconciliation?.resolution;
    if (!["confirmed-submitted", "confirmed-not-submitted", "manual-required"].includes(resolution)) {
      throw codedError("threadmesh_adapter_reconciliation_invalid");
    }
    if (!Array.isArray(reconciliation.evidenceRefs) || reconciliation.evidenceRefs.length === 0) {
      throw codedError("threadmesh_adapter_reconciliation_evidence_required");
    }
    if (resolution === "confirmed-submitted") {
      return this.recordAdapterReceipt(
        submissionId,
        expectedRevision,
        {
          ...reconciliation.receipt,
          evidenceRefs:
            reconciliation.receipt?.evidenceRefs ?? reconciliation.evidenceRefs,
        },
        principal,
      );
    }
    return this.db.transaction(() => {
      const { submission, message } = this.#submissionWithMessage(submissionId);
      assertTaskPrincipal(principal, message.target_task_id, message.target_incarnation_id);
      if (
        submission.state !== "outcome-unknown" ||
        submission.expected_revision !== expectedRevision ||
        message.revision !== expectedRevision
      ) {
        throw codedError("threadmesh_adapter_submission_state_conflict");
      }
      const at = nowIso(this.clock);
      const state = resolution === "confirmed-not-submitted"
        ? "confirmed-not-submitted"
        : "manual-reconciliation";
      const record = {
        resolution,
        reconciledAt: at,
        reconciledBy: {
          actorType: "agent",
          task: { taskId: principal.taskId, incarnationId: principal.incarnationId },
        },
        evidenceRefs: reconciliation.evidenceRefs,
      };
      const result = this.db
        .prepare(
          `UPDATE adapter_submissions SET state = ?, reconciliation_json = ?, updated_at = ?
           WHERE submission_id = ? AND state = 'outcome-unknown'`,
        )
        .run(state, canonicalJson(record), at, submissionId);
      if (result.changes !== 1) throw codedError("threadmesh_adapter_submission_state_conflict");
      const updated = this.db
        .prepare("SELECT * FROM adapter_submissions WHERE submission_id = ?")
        .get(submissionId);
      this.#audit(message.sender_incarnation_id, message.message_id, "adapter-submission-reconciled", expectedRevision, {
        submissionId,
        resolution,
        evidenceRefs: reconciliation.evidenceRefs,
      });
      return { replay: false, submission: this.#adapterSubmission(updated, message) };
    }).immediate();
  }

  getAdapterSubmission(submissionId, principal) {
    const { submission, message } = this.#submissionWithMessage(submissionId);
    const envelope = JSON.parse(message.envelope_json);
    if (
      !isTaskPrincipal(principal, envelope.sender.taskId, envelope.sender.incarnationId) &&
      !isTaskPrincipal(principal, envelope.target.taskId, envelope.target.incarnationId)
    ) {
      throw codedError("threadmesh_adapter_submission_not_authorized");
    }
    return this.#adapterSubmission(submission, message);
  }

  expireDueMessages({ limit = 100 } = {}, principal) {
    assertControlPlanePrincipal(principal);
    const boundedLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));
    return this.db.transaction(() => {
      const at = nowIso(this.clock);
      const candidates = this.db
        .prepare(
          `SELECT m.sender_incarnation_id, m.message_id,
                  d.revision, d.delivery_state, d.decision_state
           FROM messages m
           JOIN dispositions d USING (sender_incarnation_id, message_id)
           JOIN tasks source_task
             ON source_task.incarnation_id = m.sender_incarnation_id
           JOIN tasks target_task
             ON target_task.task_id = m.target_task_id
            AND target_task.incarnation_id = m.target_incarnation_id
           WHERE m.expires_at <= ?
             AND (? = 'policy' OR (
               source_task.owner_kind = ? AND source_task.owner_principal_id = ?
               AND target_task.owner_kind = ? AND target_task.owner_principal_id = ?
             ))
             AND d.delivery_state NOT IN ('adapter-submitted', 'failed', 'expired')
             AND NOT EXISTS (
               SELECT 1 FROM admission_claims a
               WHERE a.sender_incarnation_id = m.sender_incarnation_id
                 AND a.message_id = m.message_id AND a.state = 'in-flight'
             )
             AND NOT EXISTS (
               SELECT 1 FROM adapter_submissions s
               WHERE s.sender_incarnation_id = m.sender_incarnation_id
                 AND s.message_id = m.message_id AND s.state = 'outcome-unknown'
             )
           ORDER BY m.sequence ASC LIMIT ?`,
        )
        .all(
          at,
          principal.kind,
          principal.kind,
          principal.principalId,
          principal.kind,
          principal.principalId,
          boundedLimit + 1,
        );
      const selected = candidates.slice(0, boundedLimit);
      const expired = [];
      for (const candidate of selected) {
        const decision = ["pending", "deferred"].includes(candidate.decision_state)
          ? "expired"
          : candidate.decision_state;
        const result = this.db
          .prepare(
            `UPDATE dispositions SET revision = revision + 1,
               delivery_state = 'expired', decision_state = ?, updated_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
               AND delivery_state NOT IN ('adapter-submitted', 'failed', 'expired')`,
          )
          .run(
            decision,
            at,
            candidate.sender_incarnation_id,
            candidate.message_id,
            candidate.revision,
          );
        if (result.changes !== 1) continue;
        const revision = candidate.revision + 1;
        this.#audit(
          candidate.sender_incarnation_id,
          candidate.message_id,
          "message-expired",
          revision,
          {
            expiredAt: at,
            previousDelivery: candidate.delivery_state,
            previousDecision: candidate.decision_state,
          },
        );
        expired.push({
          senderIncarnationId: candidate.sender_incarnation_id,
          messageId: candidate.message_id,
          revision,
        });
      }
      return { expiredAt: at, expired, hasMore: candidates.length > boundedLimit };
    }).immediate();
  }

  getDisposition(senderIncarnationId, messageId, principal) {
    const message = this.#message(senderIncarnationId, messageId);
    const envelope = JSON.parse(message.envelope_json);
    if (
      !isTaskPrincipal(principal, envelope.sender.taskId, envelope.sender.incarnationId) &&
      !isTaskPrincipal(principal, envelope.target.taskId, envelope.target.incarnationId)
    ) {
      throw codedError("threadmesh_disposition_not_authorized");
    }
    return this.#getDisposition(senderIncarnationId, messageId);
  }

  #getDisposition(senderIncarnationId, messageId) {
    const row = this.db
      .prepare(
        "SELECT * FROM dispositions WHERE sender_incarnation_id = ? AND message_id = ?",
      )
      .get(senderIncarnationId, messageId);
    if (!row) throw codedError("threadmesh_message_not_found", messageId);
    return this.#disposition(row);
  }

  auditEvents(senderIncarnationId, messageId, principal) {
    const message = this.#message(senderIncarnationId, messageId);
    const envelope = JSON.parse(message.envelope_json);
    if (
      !isTaskPrincipal(principal, envelope.sender.taskId, envelope.sender.incarnationId) &&
      !isTaskPrincipal(principal, envelope.target.taskId, envelope.target.incarnationId)
    ) {
      throw codedError("threadmesh_audit_not_authorized");
    }
    return this.db
      .prepare(
        `SELECT event_id AS eventId, event_type AS eventType, revision,
                detail_json AS detailJson, occurred_at AS occurredAt
         FROM audit_events WHERE sender_incarnation_id = ? AND message_id = ?
         ORDER BY sequence ASC`,
      )
      .all(senderIncarnationId, messageId)
      .map((event) => ({ ...event, detail: JSON.parse(event.detailJson) }));
  }

  waitTask(taskRef, { afterCursor = 0, limit = 50 } = {}, principal) {
    assertTaskPrincipal(principal, taskRef.taskId, taskRef.incarnationId);
    const rows = this.db
      .prepare(
        `SELECT a.sequence AS cursor, a.event_id AS eventId,
                a.event_type AS eventType, a.revision,
                a.detail_json AS detailJson, a.occurred_at AS occurredAt,
                a.sender_incarnation_id AS senderIncarnationId,
                a.message_id AS messageId
         FROM audit_events a
         JOIN messages m USING (sender_incarnation_id, message_id)
         WHERE a.sequence > ? AND (
           (m.sender_incarnation_id = ?) OR
           (m.target_task_id = ? AND m.target_incarnation_id = ?)
         )
         ORDER BY a.sequence ASC LIMIT ?`,
      )
      .all(
        afterCursor,
        taskRef.incarnationId,
        taskRef.taskId,
        taskRef.incarnationId,
        Math.min(limit, 100),
      );
    return {
      events: rows.map((event) => ({
        ...event,
        detail: JSON.parse(event.detailJson),
      })),
      nextCursor: rows.at(-1)?.cursor ?? afterCursor,
      timedOut: rows.length === 0,
    };
  }

  #taskRecord(taskRef) {
    const task = this.db
      .prepare(
        `SELECT * FROM tasks WHERE task_id = ? AND incarnation_id = ?`,
      )
      .get(taskRef.taskId, taskRef.incarnationId);
    if (!task) throw codedError("threadmesh_task_not_registered", taskRef.taskId);
    return task;
  }

  #taskMetadata(taskRef) {
    const metadata = this.db
      .prepare(
        `SELECT revision, retired_at FROM task_metadata
         WHERE task_id = ? AND incarnation_id = ?`,
      )
      .get(taskRef.taskId, taskRef.incarnationId);
    if (!metadata) {
      throw codedError("threadmesh_task_metadata_missing", taskRef.taskId);
    }
    return metadata;
  }

  #assertTaskOwnerOrSelf(task, principal) {
    const isOwner =
      principal?.kind === task.owner_kind &&
      principal?.principalId === task.owner_principal_id;
    if (
      !isOwner &&
      principal?.kind !== "policy" &&
      !isTaskPrincipal(principal, task.task_id, task.incarnation_id)
    ) {
      throw codedError("threadmesh_task_not_authorized", task.task_id);
    }
  }

  #assertTaskActive(taskRef) {
    const task = this.#taskRecord(taskRef);
    if (this.#taskMetadata(taskRef).retired_at) {
      throw codedError("threadmesh_task_retired", taskRef.taskId);
    }
    return task;
  }

  #grantForProjection(projection) {
    const grant = this.db
      .prepare("SELECT * FROM grants WHERE grant_id = ? AND grant_version = ?")
      .get(projection.grantId, projection.grantVersion);
    if (!grant || grant.relationship_id !== projection.relationshipId) {
      throw codedError("threadmesh_grant_not_active");
    }
    if (grant.revoked_at) throw codedError("threadmesh_grant_not_active");
    this.#assertTaskActive({
      taskId: grant.source_task_id,
      incarnationId: grant.source_incarnation_id,
    });
    this.#assertTaskActive({
      taskId: grant.target_task_id,
      incarnationId: grant.target_incarnation_id,
    });
    if (grant.expires_at && Date.parse(grant.expires_at) <= this.clock()) {
      throw codedError("threadmesh_grant_expired");
    }
    const current = this.db
      .prepare(
        `SELECT grant_id, grant_version, revoked_at FROM grants
         WHERE relationship_id = ? AND source_task_id = ?
           AND source_incarnation_id = ? AND target_task_id = ?
           AND target_incarnation_id = ?
         ORDER BY grant_version DESC LIMIT 1`,
      )
      .get(
        grant.relationship_id,
        grant.source_task_id,
        grant.source_incarnation_id,
        grant.target_task_id,
        grant.target_incarnation_id,
      );
    if (
      !current ||
      current.revoked_at ||
      current.grant_id !== grant.grant_id ||
      current.grant_version !== grant.grant_version
    ) {
      throw codedError("threadmesh_grant_version_changed");
    }
    return grant;
  }

  #assertSummaryProjection(summary, grant) {
    const effective = JSON.parse(grant.grant_json);
    if (
      grant.target_task_id !== summary.task.taskId ||
      grant.target_incarnation_id !== summary.task.incarnationId ||
      effective.summaryVisibility === "none" ||
      effective.summaryVisibility !== summary.projection.summaryVisibility
    ) {
      throw codedError("threadmesh_task_summary_projection_not_authorized");
    }
  }

  #activeGrantFor(envelope) {
    const grant = this.db
      .prepare(
        `SELECT * FROM grants WHERE relationship_id = ?
           AND source_task_id = ? AND source_incarnation_id = ?
           AND target_task_id = ? AND target_incarnation_id = ?
         ORDER BY grant_version DESC LIMIT 1`,
      )
      .get(
        envelope.relationshipId,
        envelope.sender.taskId,
        envelope.sender.incarnationId,
        envelope.target.taskId,
        envelope.target.incarnationId,
      );
    if (!grant) throw codedError("threadmesh_grant_not_active");
    if (grant.revoked_at) throw codedError("threadmesh_grant_not_active");
    this.#assertTaskActive(envelope.sender);
    this.#assertTaskActive(envelope.target);
    if (grant.expires_at && Date.parse(grant.expires_at) <= this.clock()) {
      throw codedError("threadmesh_grant_expired");
    }
    if (!JSON.parse(grant.allowed_intents_json).includes(envelope.intent)) {
      throw codedError("threadmesh_intent_not_allowed", envelope.intent);
    }
    if (!JSON.parse(grant.allowed_modes_json).includes(envelope.delivery.requestedMode)) {
      throw codedError("threadmesh_delivery_mode_not_allowed", envelope.delivery.requestedMode);
    }
    return grant;
  }

  #assertCurrentAuthorization(row) {
    const envelope = JSON.parse(row.envelope_json);
    const grant = this.#activeGrantFor(envelope);
    if (grant.grant_id !== row.grant_id || grant.grant_version !== row.grant_version) {
      throw codedError("threadmesh_grant_version_changed");
    }
  }

  #assertContextAdmissionState(row, expectedRevision) {
    this.#assertCurrentAuthorization(row);
    if (Date.parse(row.expires_at) <= this.clock()) {
      throw codedError("threadmesh_message_expired");
    }
    const envelope = JSON.parse(row.envelope_json);
    if (envelope.intent !== "suggest") {
      throw codedError("threadmesh_context_admission_intent_unsupported", envelope.intent);
    }
    if (
      row.revision !== expectedRevision ||
      row.decision_state !== "accepted" ||
      !["durably-received", "checkpoint-offered"].includes(row.delivery_state)
    ) {
      throw codedError("threadmesh_revision_or_state_conflict");
    }
  }

  #admissionToken(row, expectedRevision, nonce, adapterRefDigest) {
    return sha256Digest({
      senderIncarnationId: row.sender_incarnation_id,
      messageId: row.message_id,
      expectedRevision,
      envelopeDigest: row.envelope_digest,
      grantId: row.grant_id,
      grantVersion: row.grant_version,
      nonce,
      adapterRefDigest,
    });
  }

  #assertAdapterSubmissionState(row, expectedRevision) {
    if (
      row.revision !== expectedRevision ||
      row.decision_state !== "accepted" ||
      !["durably-received", "receiver-notified", "checkpoint-offered", "context-admitted"].includes(
        row.delivery_state,
      )
    ) {
      throw codedError("threadmesh_revision_or_state_conflict");
    }
  }

  #submissionWithMessage(submissionId) {
    const submission = this.db
      .prepare("SELECT * FROM adapter_submissions WHERE submission_id = ?")
      .get(submissionId);
    if (!submission) throw codedError("threadmesh_adapter_submission_not_found", submissionId);
    return {
      submission,
      message: this.#message(submission.sender_incarnation_id, submission.message_id),
    };
  }

  #adapterSubmission(row, message) {
    return assertProtocolObject("adapter-submission", {
      specVersion: "0.0-draft",
      submissionId: row.submission_id,
      messageId: row.message_id,
      senderIncarnationId: row.sender_incarnation_id,
      receiver: {
        taskId: message.target_task_id,
        incarnationId: message.target_incarnation_id,
      },
      envelopeDigest: row.envelope_digest,
      adapterRefDigest: row.adapter_ref_digest,
      adapterIdempotencyKey: row.adapter_idempotency_key,
      expectedDispositionRevision: row.expected_revision,
      state: row.state,
      preparedAt: row.prepared_at,
      ...(row.attempt_started_at ? { attemptStartedAt: row.attempt_started_at } : {}),
      ...(row.receipt_json ? { receipt: JSON.parse(row.receipt_json) } : {}),
      ...(row.reconciliation_json
        ? { reconciliation: JSON.parse(row.reconciliation_json) }
        : {}),
      updatedAt: row.updated_at,
    });
  }

  #message(senderIncarnationId, messageId) {
    const row = this.db
      .prepare(
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state, d.outcome_state
         FROM messages m JOIN dispositions d USING (sender_incarnation_id, message_id)
         WHERE m.sender_incarnation_id = ? AND m.message_id = ?`,
      )
      .get(senderIncarnationId, messageId);
    if (!row) throw codedError("threadmesh_message_not_found", messageId);
    return row;
  }

  #disposition(row) {
    return {
      revision: row.revision,
      delivery: row.delivery_state,
      decision: row.decision_state,
      outcome: row.outcome_state,
    };
  }

  #audit(senderIncarnationId, messageId, eventType, revision, detail) {
    this.db
      .prepare(
        `INSERT INTO audit_events (
           event_id, sender_incarnation_id, message_id, event_type,
           revision, detail_json, occurred_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `evt_${randomUUID()}`,
        senderIncarnationId,
        messageId,
        eventType,
        revision,
        JSON.stringify(detail),
        nowIso(this.clock),
      );
  }

  close() {
    this.db.close();
  }
}
