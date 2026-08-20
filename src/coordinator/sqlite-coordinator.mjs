import { randomUUID } from "node:crypto";
import fs from "node:fs";

import Database from "better-sqlite3";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { assertProtocolObject, codedError } from "../protocol-validator.mjs";

const SAFE_DECISIONS = new Set(["accepted", "rejected", "deferred"]);

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

export class SqliteCoordinator {
  constructor({ filename = ":memory:", clock = Date.now } = {}) {
    this.clock = clock;
    this.db = new Database(filename);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.#migrate();
  }

  #migrate() {
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
  }

  registerTask(task, principal) {
    assertControlPlanePrincipal(principal);
    if (!task?.taskId || !task?.incarnationId || !task?.harness) {
      throw codedError("threadmesh_task_invalid");
    }

    const incarnation = this.db
      .prepare("SELECT task_id FROM tasks WHERE incarnation_id = ?")
      .get(task.incarnationId);
    if (incarnation && incarnation.task_id !== task.taskId) {
      throw codedError("threadmesh_incarnation_id_conflict", task.incarnationId);
    }

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
        task.adapterRef ? JSON.stringify(task.adapterRef) : null,
        nowIso(this.clock),
      );
    return { ...task };
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
    };
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

    const transaction = this.db.transaction(() => {
      for (const ref of [grant.source, grant.target]) {
        const task = this.db
          .prepare(
            `SELECT owner_kind, owner_principal_id FROM tasks
             WHERE task_id = ? AND incarnation_id = ?`,
          )
          .get(ref.taskId, ref.incarnationId);
        if (!task) throw codedError("threadmesh_task_not_registered", ref.taskId);
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

  revokeGrant(grantId, principal) {
    assertControlPlanePrincipal(principal);
    this.db.transaction(() => {
      const grant = this.db
        .prepare(
          `SELECT g.grant_json, t.owner_kind, t.owner_principal_id
           FROM grants g JOIN tasks t
             ON t.task_id = g.target_task_id
            AND t.incarnation_id = g.target_incarnation_id
           WHERE g.grant_id = ?`,
        )
        .get(grantId);
      if (!grant) throw codedError("threadmesh_grant_not_active", grantId);
      const issuer = JSON.parse(grant.grant_json).grantedBy;
      const isIssuer =
        issuer.actorType === principal.kind && issuer.actorId === principal.principalId;
      const isTargetOwner =
        grant.owner_kind === principal.kind &&
        grant.owner_principal_id === principal.principalId;
      if (principal.kind !== "policy" && !isIssuer && !isTargetOwner) {
        throw codedError("threadmesh_grant_revoke_not_authorized", grantId);
      }
      const result = this.db
        .prepare("UPDATE grants SET revoked_at = ? WHERE grant_id = ? AND revoked_at IS NULL")
        .run(nowIso(this.clock), grantId);
      if (result.changes !== 1) throw codedError("threadmesh_grant_not_active", grantId);
    }).immediate();
  }

  submit(envelope, principal) {
    assertProtocolObject("envelope", envelope);
    assertTaskPrincipal(
      principal,
      envelope.sender.taskId,
      envelope.sender.incarnationId,
    );
    if (envelope.sender.actorType !== "agent") {
      throw codedError("threadmesh_sender_actor_requires_control_plane");
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
    const rows = this.db
      .prepare(
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state, d.outcome_state
         FROM messages m JOIN dispositions d USING (sender_incarnation_id, message_id)
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
      })),
      nextCursor: rows.at(-1)?.sequence ?? afterCursor,
    };
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
