import { randomUUID } from "node:crypto";
import fs from "node:fs";

import Database from "better-sqlite3";

import {
  projectCodexTerminalTurnReconciliation,
} from "../state/codex-turn-reconciliation.mjs";
import { canonicalJson, sha256Digest } from "../canonical-json.mjs";
import { renderRegisteredPeerContext } from "../rendering/context-admission.mjs";
import {
  assertProtocolObject,
  codedError,
  grantAuthorizationDigest,
  verifyExternallyVerifiedDisposition,
} from "../protocol-validator.mjs";
import {
  assertLifecycleEvent,
  evaluateDependencyEffect,
  projectLifecycleEventToEnvelope,
} from "../routing/lifecycle-events.mjs";
import {
  evaluateRelationshipPolicy,
  isStateChangingIntent,
} from "../policy/relationship-policy.mjs";
import {
  isDecisionReasonAllowed,
  isDispositionTransitionAllowed,
} from "../state/disposition-transitions.mjs";
import {
  appendGitEvidenceRecord as appendPureGitEvidenceRecord,
  appendIndependentVerificationRecord as appendPureIndependentVerificationRecord,
  createGitEvidenceRequirement as createPureGitEvidenceRequirement,
  validateGitEvidenceChain,
} from "../state/git-evidence-chain.mjs";
import {
  abandonDurableTurnIntent,
  bindCompletedTurnIntent,
  bindStartedTurnOperation,
  completeModelSelectedToolAction,
  createProposedDurableTurnIntent,
  markTurnOutcomeUnknown,
  promoteDurableTurnIntent,
  reconcileUnknownDurableTurnIntent,
  recordModelSelectedToolAction,
  startDurableTurnIntent,
  validateDurableTurnIntent,
} from "../state/durable-turn-intent.mjs";

const DEFAULT_DECISION_REASONS = Object.freeze({
  accepted: "accepted",
  rejected: "receiver-rejected",
  deferred: "receiver-deferred",
  stale: "stale-objective",
  expired: "expired",
  unsupported: "unsupported-intent",
  revoked: "revoked",
});
const PURGED_TEXT = "Content purged by the ThreadMesh retention policy.";
const GIT_EVIDENCE_STAGE_TOOL = Object.freeze({
  implementation: "threadmesh_publish_artifact",
  "review-failed": "threadmesh_report_review_finding",
  fix: "threadmesh_publish_dependency",
});
const FINAL_GIT_EVIDENCE_TOOL = "threadmesh_verify_exact_chain";
const LIFECYCLE_PUBLICATION_TOOLS = Object.freeze({
  threadmesh_publish_artifact: Object.freeze({
    eventType: "artifact-ready", materialKeys: Object.freeze(["commitSha"]),
  }),
  threadmesh_report_review_finding: Object.freeze({
    eventType: "review-failed", materialKeys: Object.freeze(["findingDigest"]),
  }),
  threadmesh_publish_dependency: Object.freeze({
    eventType: "artifact-ready", materialKeys: Object.freeze(["commitSha"]),
  }),
  threadmesh_verify_exact_chain: Object.freeze({
    eventType: "dependency-satisfied",
    materialKeys: Object.freeze([
      "chainId", "expectedEvidenceChainHead", "expectedEvidenceChainRevision",
    ]),
  }),
});
const ATTENTION_OFFER_ROUTE_KEYS = Object.freeze([
  "state", "reasonCode", "eventType", "messageId", "offer", "envelope",
  "grantId", "grantVersion",
]);

function hasExactKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
}

function boundedLifecycleActionEventBody(event) {
  return {
    eventType: event.eventType,
    messageId: event.messageId,
    target: { ...event.target },
    relationshipId: event.relationshipId,
    content: event.content,
    reason: event.reason,
    evidenceRefs: [...(event.evidenceRefs ?? [])],
    freshness: { ...event.freshness },
    causality: event.causality ? { ...event.causality } : null,
  };
}

export function gitEvidenceVerificationResultDigest({
  request,
  response,
  expectedTrustAnchor,
}) {
  return sha256Digest({ request, response, expectedTrustAnchor });
}

export const SQLITE_SCHEMA_VERSION = 8;
export const SQLITE_SCHEMA_NAME = "threadmesh-exact-lifecycle-binding";
const SQLITE_SCHEMA_V7_NAME = "threadmesh-trusted-evidence-unlock";
const SQLITE_SCHEMA_V6_NAME = "threadmesh-durable-turn-intents";
const SQLITE_SCHEMA_V4_NAME = "threadmesh-durable-dependency-state";
const SQLITE_SCHEMA_V5_NAME = "threadmesh-git-evidence-state";
const SQLITE_SCHEMA_V2_MANIFEST = Object.freeze({
  tables: {
    tasks: [
      "task_id", "incarnation_id", "harness", "state", "owner_kind",
      "owner_principal_id", "adapter_ref_json", "created_at",
    ],
    task_metadata: [
      "task_id", "incarnation_id", "revision", "retired_at", "run_id",
      "objective_version", "checkpoint",
    ],
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
      "decision_state", "decision_reason_code", "delivery_failure_reason",
      "outcome_state", "updated_at",
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
const SQLITE_SCHEMA_V1_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V2_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V2_MANIFEST.tables,
    task_metadata: Object.freeze([
      "task_id", "incarnation_id", "revision", "retired_at",
    ]),
    dispositions: Object.freeze([
      "sender_incarnation_id", "message_id", "revision", "delivery_state",
      "decision_state", "outcome_state", "updated_at",
    ]),
  }),
});
const SQLITE_SCHEMA_V3_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V2_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V2_MANIFEST.tables,
    tasks: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.tasks,
      "adapter_ref_purged_at",
    ]),
    relationship_proposals: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.relationship_proposals,
      "content_purged_at",
    ]),
    task_summaries: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.task_summaries,
      "content_purged_at",
    ]),
    messages: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.messages,
      "content_purged_at",
      "claim_status",
    ]),
    admission_claims: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.admission_claims,
      "adapter_ref_purged_at",
    ]),
    audit_events: Object.freeze([
      ...SQLITE_SCHEMA_V2_MANIFEST.tables.audit_events,
      "detail_purged_at",
    ]),
  }),
});
const SQLITE_SCHEMA_V4_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V3_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V3_MANIFEST.tables,
    dependency_edges: Object.freeze([
      "dependency_id", "version", "prerequisite_task_id",
      "prerequisite_incarnation_id", "dependent_task_id",
      "dependent_incarnation_id", "relationship_id",
      "expected_event_type", "authority_kind", "authority_principal_id",
      "freshness_json", "edge_json", "status", "created_at",
      "expires_at", "revoked_at",
    ]),
    dependency_satisfactions: Object.freeze([
      "dependency_id", "edge_version", "sender_incarnation_id",
      "message_id", "event_json", "disposition_json",
      "disposition_digest", "satisfied_at",
    ]),
  }),
  indexes: Object.freeze([
    ...SQLITE_SCHEMA_V3_MANIFEST.indexes,
    "dependency_edges_current_version",
  ]),
});
const SQLITE_SCHEMA_V5_EVIDENCE_CONSTRAINTS = Object.freeze({
  tables: Object.freeze({
    git_evidence_requirements: Object.freeze({
      columns: Object.freeze([
        "chain_id|TEXT|1||1",
        "requirement_digest|TEXT|1||0",
        "requirement_json|TEXT|1||0",
        "authority_kind|TEXT|1||0",
        "authority_principal_id|TEXT|1||0",
        "implementer_task_id|TEXT|1||0",
        "implementer_incarnation_id|TEXT|1||0",
        "implementer_adapter_ref_digest|TEXT|1||0",
        "implementer_task_revision|INTEGER|1||0",
        "reviewer_task_id|TEXT|1||0",
        "reviewer_incarnation_id|TEXT|1||0",
        "reviewer_adapter_ref_digest|TEXT|1||0",
        "reviewer_task_revision|INTEGER|1||0",
        "verifier_task_id|TEXT|1||0",
        "verifier_incarnation_id|TEXT|1||0",
        "verifier_adapter_ref_digest|TEXT|1||0",
        "verifier_task_revision|INTEGER|1||0",
        "record_count|INTEGER|1|0|0",
        "head_record_digest|TEXT|0||0",
        "revision|INTEGER|1|0|0",
        "binding_digest|TEXT|1||0",
        "created_at|TEXT|1||0",
      ]),
      unique: Object.freeze(["chain_id", "requirement_digest"]),
      foreignKeys: Object.freeze([
        "implementer_task_id->tasks.task_id,implementer_incarnation_id->tasks.incarnation_id",
        "reviewer_task_id->tasks.task_id,reviewer_incarnation_id->tasks.incarnation_id",
        "verifier_task_id->tasks.task_id,verifier_incarnation_id->tasks.incarnation_id",
      ]),
    }),
    git_evidence_records: Object.freeze({
      columns: Object.freeze([
        "chain_id|TEXT|1||1",
        "sequence|INTEGER|1||2",
        "stage|TEXT|1||0",
        "actor_task_id|TEXT|1||0",
        "actor_incarnation_id|TEXT|1||0",
        "previous_record_digest|TEXT|0||0",
        "record_digest|TEXT|1||0",
        "record_json|TEXT|1||0",
        "created_at|TEXT|1||0",
      ]),
      unique: Object.freeze(["chain_id,record_digest", "chain_id,sequence"]),
      foreignKeys: Object.freeze([
        "actor_task_id->tasks.task_id,actor_incarnation_id->tasks.incarnation_id",
        "chain_id->git_evidence_requirements.chain_id",
      ]),
    }),
  }),
  indexes: Object.freeze({
    git_evidence_records_chain_sequence: Object.freeze({
      table: "git_evidence_records",
      unique: 0,
      partial: 0,
      columns: Object.freeze(["chain_id", "sequence"]),
    }),
  }),
});
const SQLITE_SCHEMA_V5_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V4_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V4_MANIFEST.tables,
    git_evidence_requirements: Object.freeze([
      "chain_id", "requirement_digest", "requirement_json",
      "authority_kind", "authority_principal_id",
      "implementer_task_id", "implementer_incarnation_id",
      "implementer_adapter_ref_digest", "implementer_task_revision",
      "reviewer_task_id", "reviewer_incarnation_id",
      "reviewer_adapter_ref_digest", "reviewer_task_revision",
      "verifier_task_id", "verifier_incarnation_id",
      "verifier_adapter_ref_digest", "verifier_task_revision",
      "record_count", "head_record_digest", "revision",
      "binding_digest", "created_at",
    ]),
    git_evidence_records: Object.freeze([
      "chain_id", "sequence", "stage", "actor_task_id",
      "actor_incarnation_id", "previous_record_digest", "record_digest",
      "record_json", "created_at",
    ]),
  }),
  indexes: Object.freeze([
    ...SQLITE_SCHEMA_V4_MANIFEST.indexes,
    "git_evidence_records_chain_sequence",
  ]),
  constraints: SQLITE_SCHEMA_V5_EVIDENCE_CONSTRAINTS,
});
const SQLITE_SCHEMA_V6_CONSTRAINTS = Object.freeze({
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V5_EVIDENCE_CONSTRAINTS.tables,
    turn_execution_intents: Object.freeze({
      columns: Object.freeze([
        "execution_id|TEXT|1||1",
        "task_id|TEXT|1||0",
        "incarnation_id|TEXT|1||0",
        "adapter_kind|TEXT|1||0",
        "adapter_thread_id|TEXT|1||0",
        "adapter_snapshot_digest|TEXT|1||0",
        "adapter_ref_digest|TEXT|1||0",
        "task_revision|INTEGER|1||0",
        "adapter_idempotency_key|TEXT|1||0",
        "tool_allowlist_json|TEXT|1||0",
        "tool_allowlist_digest|TEXT|1||0",
        "prompt_digest|TEXT|1||0",
        "intent_digest|TEXT|1||0",
        "intent_json|TEXT|1||0",
        "scenario_id|TEXT|0||0",
        "chain_id|TEXT|0||0",
        "message_id|TEXT|0||0",
        "state|TEXT|1||0",
        "turn_id|TEXT|0||0",
        "action_count|INTEGER|1|0|0",
        "action_head_digest|TEXT|0||0",
        "receipt_json|TEXT|0||0",
        "receipt_digest|TEXT|0||0",
        "reconciliation_json|TEXT|0||0",
        "reconciliation_digest|TEXT|0||0",
        "revision|INTEGER|1|0|0",
        "created_at|TEXT|1||0",
        "started_at|TEXT|0||0",
        "completed_at|TEXT|0||0",
        "updated_at|TEXT|1||0",
      ]),
      unique: Object.freeze(["adapter_idempotency_key", "execution_id"]),
      foreignKeys: Object.freeze([
        "task_id->tasks.task_id,incarnation_id->tasks.incarnation_id",
      ]),
    }),
    turn_tool_actions: Object.freeze({
      columns: Object.freeze([
        "execution_id|TEXT|1||1",
        "ordinal|INTEGER|1||2",
        "turn_id|TEXT|1||0",
        "call_id|TEXT|1||0",
        "tool_name|TEXT|1||0",
        "args_json|TEXT|1||0",
        "args_digest|TEXT|1||0",
        "selection_digest|TEXT|1||0",
        "result_digest|TEXT|0||0",
        "result_status|TEXT|0||0",
        "previous_action_digest|TEXT|0||0",
        "action_digest|TEXT|0||0",
        "observed_at|TEXT|1||0",
        "result_completed_at|TEXT|0||0",
      ]),
      unique: Object.freeze([
        "execution_id,call_id",
        "execution_id,ordinal",
        "execution_id,selection_digest",
      ]),
      foreignKeys: Object.freeze([
        "execution_id->turn_execution_intents.execution_id",
      ]),
    }),
    attention_receiver_cursors: Object.freeze({
      columns: Object.freeze([
        "receiver_task_id|TEXT|1||1",
        "receiver_incarnation_id|TEXT|1||2",
        "committed_cursor|INTEGER|1|0|0",
        "commit_count|INTEGER|1|0|0",
        "commit_head_digest|TEXT|0||0",
        "revision|INTEGER|1|0|0",
        "active_claim_epoch|TEXT|0||0",
        "active_event_cursor|INTEGER|0||0",
        "updated_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "receiver_task_id,receiver_incarnation_id",
      ]),
      foreignKeys: Object.freeze([
        "receiver_task_id->tasks.task_id,receiver_incarnation_id->tasks.incarnation_id",
      ]),
    }),
    attention_cursor_commits: Object.freeze({
      columns: Object.freeze([
        "receiver_task_id|TEXT|1||1",
        "receiver_incarnation_id|TEXT|1||2",
        "sequence|INTEGER|1||3",
        "from_cursor|INTEGER|1||0",
        "to_cursor|INTEGER|1||0",
        "kind|TEXT|1||0",
        "source_id|TEXT|1||0",
        "event_digest|TEXT|1||0",
        "classification_digest|TEXT|0||0",
        "previous_commit_digest|TEXT|0||0",
        "commit_digest|TEXT|1||0",
        "committed_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "receiver_task_id,receiver_incarnation_id,commit_digest",
        "receiver_task_id,receiver_incarnation_id,sequence",
        "receiver_task_id,receiver_incarnation_id,source_id",
      ]),
      foreignKeys: Object.freeze([
        "receiver_task_id->attention_receiver_cursors.receiver_task_id,receiver_incarnation_id->attention_receiver_cursors.receiver_incarnation_id",
      ]),
    }),
    attention_handler_claims: Object.freeze({
      columns: Object.freeze([
        "claim_epoch|TEXT|1||1",
        "receiver_task_id|TEXT|1||0",
        "receiver_incarnation_id|TEXT|1||0",
        "event_cursor|INTEGER|1||0",
        "event_id|TEXT|1||0",
        "sender_incarnation_id|TEXT|1||0",
        "message_id|TEXT|1||0",
        "event_digest|TEXT|1||0",
        "state|TEXT|1||0",
        "turn_execution_id|TEXT|0||0",
        "revision|INTEGER|1|0|0",
        "claimed_at|TEXT|1||0",
        "completed_at|TEXT|0||0",
        "updated_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "claim_epoch",
        "receiver_task_id,receiver_incarnation_id,event_cursor",
        "receiver_task_id,receiver_incarnation_id,event_id",
      ]),
      foreignKeys: Object.freeze([
        "receiver_task_id->tasks.task_id,receiver_incarnation_id->tasks.incarnation_id",
        "turn_execution_id->turn_execution_intents.execution_id",
      ]),
    }),
  }),
  indexes: Object.freeze({
    ...SQLITE_SCHEMA_V5_EVIDENCE_CONSTRAINTS.indexes,
    turn_execution_intents_task_state: Object.freeze({
      table: "turn_execution_intents",
      unique: 0,
      partial: 0,
      columns: Object.freeze(["task_id", "incarnation_id", "state"]),
    }),
    turn_tool_actions_execution_ordinal: Object.freeze({
      table: "turn_tool_actions",
      unique: 0,
      partial: 0,
      columns: Object.freeze(["execution_id", "ordinal"]),
    }),
    attention_handler_claims_receiver_cursor: Object.freeze({
      table: "attention_handler_claims",
      unique: 0,
      partial: 0,
      columns: Object.freeze([
        "receiver_task_id", "receiver_incarnation_id", "event_cursor",
      ]),
    }),
    attention_cursor_commits_receiver_sequence: Object.freeze({
      table: "attention_cursor_commits",
      unique: 0,
      partial: 0,
      columns: Object.freeze([
        "receiver_task_id", "receiver_incarnation_id", "sequence",
      ]),
    }),
  }),
});
const SQLITE_SCHEMA_V6_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V5_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V5_MANIFEST.tables,
    turn_execution_intents: Object.freeze([
      "execution_id", "task_id", "incarnation_id", "adapter_kind",
      "adapter_thread_id", "adapter_snapshot_digest", "adapter_ref_digest",
      "task_revision", "adapter_idempotency_key", "tool_allowlist_json",
      "tool_allowlist_digest", "prompt_digest", "intent_digest",
      "intent_json",
      "scenario_id", "chain_id",
      "message_id", "state", "turn_id", "action_count",
      "action_head_digest", "receipt_json", "receipt_digest",
      "reconciliation_json", "reconciliation_digest", "revision",
      "created_at", "started_at", "completed_at", "updated_at",
    ]),
    turn_tool_actions: Object.freeze([
      "execution_id", "ordinal", "turn_id", "call_id", "tool_name",
      "args_json", "args_digest", "selection_digest", "result_digest",
      "result_status", "previous_action_digest", "action_digest",
      "observed_at", "result_completed_at",
    ]),
    attention_receiver_cursors: Object.freeze([
      "receiver_task_id", "receiver_incarnation_id", "committed_cursor",
      "commit_count", "commit_head_digest", "revision", "active_claim_epoch",
      "active_event_cursor", "updated_at",
    ]),
    attention_cursor_commits: Object.freeze([
      "receiver_task_id", "receiver_incarnation_id", "sequence",
      "from_cursor", "to_cursor", "kind", "source_id", "event_digest",
      "classification_digest", "previous_commit_digest", "commit_digest",
      "committed_at",
    ]),
    attention_handler_claims: Object.freeze([
      "claim_epoch", "receiver_task_id", "receiver_incarnation_id",
      "event_cursor", "event_id", "sender_incarnation_id", "message_id",
      "event_digest", "state", "turn_execution_id", "revision",
      "claimed_at", "completed_at", "updated_at",
    ]),
  }),
  indexes: Object.freeze([
    ...SQLITE_SCHEMA_V5_MANIFEST.indexes,
    "turn_execution_intents_task_state",
    "turn_tool_actions_execution_ordinal",
    "attention_handler_claims_receiver_cursor",
    "attention_cursor_commits_receiver_sequence",
  ]),
  constraints: SQLITE_SCHEMA_V6_CONSTRAINTS,
});
const SQLITE_SCHEMA_V7_CONSTRAINTS = Object.freeze({
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V6_CONSTRAINTS.tables,
    git_evidence_dependency_bindings: Object.freeze({
      columns: Object.freeze([
        "chain_id|TEXT|1||1",
        "dependency_id|TEXT|1||0",
        "edge_version|INTEGER|1||0",
        "requirement_digest|TEXT|1||0",
        "verifier_task_id|TEXT|1||0",
        "verifier_incarnation_id|TEXT|1||0",
        "dependent_task_id|TEXT|1||0",
        "dependent_incarnation_id|TEXT|1||0",
        "binding_digest|TEXT|1||0",
        "created_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "binding_digest", "chain_id", "dependency_id",
      ]),
      foreignKeys: Object.freeze([
        "chain_id->git_evidence_requirements.chain_id",
        "dependency_id->dependency_edges.dependency_id,edge_version->dependency_edges.version",
        "dependent_task_id->tasks.task_id,dependent_incarnation_id->tasks.incarnation_id",
        "verifier_task_id->tasks.task_id,verifier_incarnation_id->tasks.incarnation_id",
      ]),
    }),
    git_evidence_dependency_finalizations: Object.freeze({
      columns: Object.freeze([
        "chain_id|TEXT|1||1",
        "execution_id|TEXT|1||0",
        "action_ordinal|INTEGER|1||0",
        "action_digest|TEXT|1||0",
        "result_digest|TEXT|1||0",
        "final_record_digest|TEXT|1||0",
        "dependency_id|TEXT|1||0",
        "edge_version|INTEGER|1||0",
        "sender_incarnation_id|TEXT|1||0",
        "message_id|TEXT|1||0",
        "event_digest|TEXT|1||0",
        "disposition_digest|TEXT|1||0",
        "effect_digest|TEXT|1||0",
        "binding_digest|TEXT|1||0",
        "finalized_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "binding_digest", "chain_id", "dependency_id", "execution_id",
        "sender_incarnation_id,message_id",
      ]),
      foreignKeys: Object.freeze([
        "chain_id->git_evidence_dependency_bindings.chain_id",
        "chain_id->git_evidence_records.chain_id,final_record_digest->git_evidence_records.record_digest",
        "dependency_id->dependency_satisfactions.dependency_id",
        "execution_id->turn_execution_intents.execution_id",
        "execution_id->turn_tool_actions.execution_id,action_ordinal->turn_tool_actions.ordinal",
        "sender_incarnation_id->messages.sender_incarnation_id,message_id->messages.message_id",
      ]),
    }),
  }),
  indexes: SQLITE_SCHEMA_V6_CONSTRAINTS.indexes,
});
const SQLITE_SCHEMA_V7_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V6_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V6_MANIFEST.tables,
    git_evidence_dependency_bindings: Object.freeze([
      "chain_id", "dependency_id", "edge_version", "requirement_digest",
      "verifier_task_id", "verifier_incarnation_id", "dependent_task_id",
      "dependent_incarnation_id", "binding_digest", "created_at",
    ]),
    git_evidence_dependency_finalizations: Object.freeze([
      "chain_id", "execution_id", "action_ordinal", "action_digest",
      "result_digest", "final_record_digest", "dependency_id",
      "edge_version", "sender_incarnation_id", "message_id",
      "event_digest", "disposition_digest", "effect_digest",
      "binding_digest", "finalized_at",
    ]),
  }),
  constraints: SQLITE_SCHEMA_V7_CONSTRAINTS,
});
const SQLITE_SCHEMA_V8_CONSTRAINTS = Object.freeze({
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V7_CONSTRAINTS.tables,
    lifecycle_action_publications: Object.freeze({
      columns: Object.freeze([
        "execution_id|TEXT|1||1", "action_ordinal|INTEGER|1||2",
        "action_digest|TEXT|1||0", "sender_incarnation_id|TEXT|1||0",
        "message_id|TEXT|1||0", "event_json|TEXT|1||0",
        "event_digest|TEXT|1||0", "envelope_digest|TEXT|1||0",
        "publication_digest|TEXT|1||0", "published_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "execution_id,action_ordinal", "publication_digest",
        "sender_incarnation_id,message_id",
      ]),
      foreignKeys: Object.freeze([
        "execution_id->turn_tool_actions.execution_id,action_ordinal->turn_tool_actions.ordinal",
        "sender_incarnation_id->messages.sender_incarnation_id,message_id->messages.message_id",
      ]),
    }),
    attention_route_decision_bindings: Object.freeze({
      columns: Object.freeze([
        "claim_epoch|TEXT|1||1", "route_projection_json|TEXT|1||0",
        "route_projection_digest|TEXT|1||0",
        "receiver_decision_execution_id|TEXT|1||0",
        "decision_action_ordinal|INTEGER|1||0", "decision_action_digest|TEXT|1||0",
        "decision_projection_json|TEXT|1||0", "decision_projection_digest|TEXT|1||0",
        "mailbox_claim_token_digest|TEXT|1||0", "binding_digest|TEXT|1||0",
        "committed_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "binding_digest", "claim_epoch", "receiver_decision_execution_id",
      ]),
      foreignKeys: Object.freeze([
        "claim_epoch->attention_handler_claims.claim_epoch",
        "receiver_decision_execution_id->turn_execution_intents.execution_id",
        "receiver_decision_execution_id->turn_tool_actions.execution_id,decision_action_ordinal->turn_tool_actions.ordinal",
      ]),
    }),
    context_admission_turn_bindings: Object.freeze({
      columns: Object.freeze([
        "sender_incarnation_id|TEXT|1||1", "message_id|TEXT|1||2",
        "execution_id|TEXT|1||0", "turn_id|TEXT|1||0",
        "expected_revision|INTEGER|1||0", "admission_token_digest|TEXT|1||0",
        "adapter_ref_digest|TEXT|1||0", "completed_binding_digest|TEXT|1||0",
        "turn_receipt_digest|TEXT|1||0", "adapter_evidence_digest|TEXT|1||0",
        "binding_digest|TEXT|1||0", "confirmed_at|TEXT|1||0",
      ]),
      unique: Object.freeze([
        "binding_digest", "execution_id", "sender_incarnation_id,message_id",
      ]),
      foreignKeys: Object.freeze([
        "sender_incarnation_id->admission_claims.sender_incarnation_id,message_id->admission_claims.message_id",
        "execution_id->turn_execution_intents.execution_id",
      ]),
    }),
  }),
  indexes: SQLITE_SCHEMA_V7_CONSTRAINTS.indexes,
});
export const SQLITE_SCHEMA_MANIFEST = Object.freeze({
  ...SQLITE_SCHEMA_V7_MANIFEST,
  tables: Object.freeze({
    ...SQLITE_SCHEMA_V7_MANIFEST.tables,
    lifecycle_action_publications: Object.freeze([
      "execution_id", "action_ordinal", "action_digest",
      "sender_incarnation_id", "message_id", "event_json", "event_digest",
      "envelope_digest", "publication_digest", "published_at",
    ]),
    attention_route_decision_bindings: Object.freeze([
      "claim_epoch", "route_projection_json", "route_projection_digest",
      "receiver_decision_execution_id", "decision_action_ordinal",
      "decision_action_digest", "decision_projection_json",
      "decision_projection_digest", "mailbox_claim_token_digest",
      "binding_digest", "committed_at",
    ]),
    context_admission_turn_bindings: Object.freeze([
      "sender_incarnation_id", "message_id", "execution_id", "turn_id",
      "expected_revision", "admission_token_digest",
      "adapter_ref_digest", "completed_binding_digest", "turn_receipt_digest",
      "adapter_evidence_digest", "binding_digest", "confirmed_at",
    ]),
  }),
  constraints: SQLITE_SCHEMA_V8_CONSTRAINTS,
});
export const SQLITE_SCHEMA_MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: "threadmesh-coordinator-baseline",
    manifest: SQLITE_SCHEMA_V1_MANIFEST,
  }),
  Object.freeze({
    version: 2,
    name: "threadmesh-dispatcher-state",
    manifest: SQLITE_SCHEMA_V2_MANIFEST,
  }),
  Object.freeze({
    version: 3,
    name: "threadmesh-retention-state",
    manifest: SQLITE_SCHEMA_V3_MANIFEST,
  }),
  Object.freeze({
    version: 4,
    name: SQLITE_SCHEMA_V4_NAME,
    manifest: SQLITE_SCHEMA_V4_MANIFEST,
  }),
  Object.freeze({
    version: 5,
    name: SQLITE_SCHEMA_V5_NAME,
    manifest: SQLITE_SCHEMA_V5_MANIFEST,
  }),
  Object.freeze({
    version: 6,
    name: SQLITE_SCHEMA_V6_NAME,
    manifest: SQLITE_SCHEMA_V6_MANIFEST,
  }),
  Object.freeze({
    version: 7,
    name: SQLITE_SCHEMA_V7_NAME,
    manifest: SQLITE_SCHEMA_V7_MANIFEST,
  }),
  Object.freeze({
    version: 8,
    name: SQLITE_SCHEMA_NAME,
    manifest: SQLITE_SCHEMA_MANIFEST,
  }),
].map((migration) => Object.freeze({
  ...migration,
  checksum: sha256Digest({
    version: migration.version,
    name: migration.name,
    manifest: migration.manifest,
  }),
})));
export const SQLITE_SCHEMA_CHECKSUM = sha256Digest({
  version: SQLITE_SCHEMA_VERSION,
  name: SQLITE_SCHEMA_NAME,
  manifest: SQLITE_SCHEMA_MANIFEST,
});

function nowIso(clock) {
  return new Date(clock()).toISOString();
}

function assertContextAdapterRef(adapterRef) {
  const commonValid =
    adapterRef &&
    typeof adapterRef === "object" &&
    typeof adapterRef.snapshotDigest === "string";
  const kindValid =
    (adapterRef?.kind === "acp-session" && typeof adapterRef.sessionId === "string") ||
    (adapterRef?.kind === "codex-app-server" && typeof adapterRef.threadId === "string") ||
    (adapterRef?.kind === "gemini-headless" && typeof adapterRef.sessionId === "string");
  if (!commonValid || !kindValid) {
    throw codedError("threadmesh_target_adapter_ref_invalid");
  }
  return adapterRef;
}

function projectContextAdapterEvidence(adapterRef, adapterEvidence) {
  let projection;
  if (adapterRef.kind === "acp-session") {
    projection = {
      kind: adapterRef.kind,
      sessionId: adapterEvidence?.sessionId,
      snapshotDigest: adapterEvidence?.snapshotDigest,
      stopReason: adapterEvidence?.stopReason,
    };
    if (
      projection.sessionId !== adapterRef.sessionId ||
      projection.snapshotDigest !== adapterRef.snapshotDigest ||
      projection.stopReason !== "end_turn"
    ) {
      throw codedError("threadmesh_adapter_evidence_mismatch");
    }
    return projection;
  }
  if (adapterRef.kind === "codex-app-server") {
    projection = {
      kind: adapterRef.kind,
      threadId: adapterEvidence?.threadId,
      turnId: adapterEvidence?.turnId,
      turnStatus: adapterEvidence?.turnStatus,
      snapshotDigest: adapterEvidence?.snapshotDigest,
    };
    if (
      projection.threadId !== adapterRef.threadId ||
      typeof projection.turnId !== "string" ||
      projection.turnStatus !== "completed" ||
      projection.snapshotDigest !== adapterRef.snapshotDigest
    ) {
      throw codedError("threadmesh_adapter_evidence_mismatch");
    }
    return projection;
  }
  if (adapterRef.kind === "gemini-headless") {
    projection = {
      kind: adapterRef.kind,
      sessionId: adapterEvidence?.sessionId,
      snapshotDigest: adapterEvidence?.snapshotDigest,
      exitCode: adapterEvidence?.exitCode,
      toolUseCount: adapterEvidence?.toolUseCount,
      resultStatus: adapterEvidence?.resultStatus,
    };
    if (
      projection.sessionId !== adapterRef.sessionId ||
      projection.snapshotDigest !== adapterRef.snapshotDigest ||
      projection.exitCode !== 0 ||
      projection.toolUseCount !== 0 ||
      projection.resultStatus !== "success"
    ) {
      throw codedError("threadmesh_adapter_evidence_mismatch");
    }
    return projection;
  }
  throw codedError("threadmesh_target_adapter_ref_invalid");
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

function assertPolicyPrincipal(principal) {
  if (
    principal?.kind !== "policy" ||
    typeof principal.principalId !== "string" ||
    principal.principalId.length === 0
  ) {
    throw codedError("threadmesh_policy_authority_required");
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

const DEPENDENCY_EDGE_KEYS = new Set([
  "dependencyId",
  "version",
  "edgeType",
  "prerequisite",
  "dependent",
  "relationshipId",
  "expectedEventType",
  "freshness",
  "createdAt",
  "expiresAt",
]);

function assertDependencyTaskRef(value, field) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !["taskId", "incarnationId"].includes(key)) ||
    typeof value.taskId !== "string" ||
    value.taskId.length === 0 ||
    value.taskId.length > 200 ||
    typeof value.incarnationId !== "string" ||
    value.incarnationId.length === 0 ||
    value.incarnationId.length > 200
  ) {
    throw codedError("threadmesh_dependency_edge_invalid", field);
  }
}

function assertDependencyFreshness(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !["expectedRunId", "expectedObjectiveVersion", "expectedCheckpoint"].includes(key),
    ) ||
    (value.expectedRunId !== undefined &&
      (typeof value.expectedRunId !== "string" || value.expectedRunId.length === 0)) ||
    (value.expectedObjectiveVersion !== undefined &&
      (!Number.isInteger(value.expectedObjectiveVersion) ||
        value.expectedObjectiveVersion < 0)) ||
    (value.expectedCheckpoint !== undefined &&
      (typeof value.expectedCheckpoint !== "string" ||
        value.expectedCheckpoint.length === 0))
  ) {
    throw codedError("threadmesh_dependency_edge_invalid", "freshness");
  }
}

function normalizeDependencyEdge(edge, clock) {
  if (
    !edge ||
    typeof edge !== "object" ||
    Array.isArray(edge) ||
    Object.keys(edge).some((key) => !DEPENDENCY_EDGE_KEYS.has(key)) ||
    typeof edge.dependencyId !== "string" ||
    edge.dependencyId.length === 0 ||
    edge.dependencyId.length > 200 ||
    !Number.isInteger(edge.version) ||
    edge.version < 1 ||
    edge.edgeType !== "dependency" ||
    edge.expectedEventType !== "dependency-satisfied" ||
    (edge.relationshipId !== undefined &&
      (typeof edge.relationshipId !== "string" || edge.relationshipId.length === 0))
  ) {
    throw codedError("threadmesh_dependency_edge_invalid");
  }
  assertDependencyTaskRef(edge.prerequisite, "prerequisite");
  assertDependencyTaskRef(edge.dependent, "dependent");
  if (
    edge.prerequisite.taskId === edge.dependent.taskId &&
    edge.prerequisite.incarnationId === edge.dependent.incarnationId
  ) {
    throw codedError("threadmesh_dependency_edge_invalid", "self dependency");
  }
  const createdAt = edge.createdAt ?? new Date(clock()).toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw codedError("threadmesh_dependency_edge_invalid", "createdAt");
  }
  if (
    edge.expiresAt !== undefined &&
    (!Number.isFinite(Date.parse(edge.expiresAt)) ||
      Date.parse(edge.expiresAt) <= Date.parse(createdAt))
  ) {
    throw codedError("threadmesh_dependency_edge_invalid", "expiresAt");
  }
  const freshness = edge.freshness ?? {};
  assertDependencyFreshness(freshness);
  return Object.freeze({
    dependencyId: edge.dependencyId,
    version: edge.version,
    edgeType: "dependency",
    prerequisite: { ...edge.prerequisite },
    dependent: { ...edge.dependent },
    ...(edge.relationshipId ? { relationshipId: edge.relationshipId } : {}),
    expectedEventType: edge.expectedEventType,
    freshness: { ...freshness },
    createdAt,
    ...(edge.expiresAt ? { expiresAt: edge.expiresAt } : {}),
  });
}

function sameTaskRef(left, right) {
  return (
    left?.taskId === right?.taskId &&
    left?.incarnationId === right?.incarnationId
  );
}

function freezeVerificationTrustAnchors(trustAnchors) {
  if (
    !Array.isArray(trustAnchors) ||
    trustAnchors.length > 64 ||
    trustAnchors.some(
      (anchor) =>
        !anchor ||
        typeof anchor !== "object" ||
        Array.isArray(anchor) ||
        Object.keys(anchor).some(
          (key) =>
            ![
              "keyId",
              "algorithm",
              "actorId",
              "trustDomain",
              "policyId",
              "publicKeyPem",
            ].includes(key),
        ) ||
        typeof anchor.keyId !== "string" ||
        anchor.algorithm !== "ed25519" ||
        typeof anchor.actorId !== "string" ||
        typeof anchor.trustDomain !== "string" ||
        typeof anchor.policyId !== "string" ||
        typeof anchor.publicKeyPem !== "string" ||
        anchor.publicKeyPem.includes("PRIVATE KEY"),
    ) ||
    new Set(trustAnchors.map((anchor) => anchor.keyId)).size !== trustAnchors.length
  ) {
    throw codedError("threadmesh_verification_trust_anchor_invalid");
  }
  return Object.freeze(
    trustAnchors.map((anchor) => Object.freeze(structuredClone(anchor))),
  );
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

function assertRuntimeSnapshot(runtime, optional) {
  if (runtime === undefined && optional) return;
  if (
    !runtime ||
    typeof runtime !== "object" ||
    Array.isArray(runtime) ||
    (runtime.runId !== undefined &&
      (typeof runtime.runId !== "string" || runtime.runId.length === 0)) ||
    (runtime.objectiveVersion !== undefined &&
      (!Number.isInteger(runtime.objectiveVersion) || runtime.objectiveVersion < 0)) ||
    (runtime.checkpoint !== undefined &&
      (typeof runtime.checkpoint !== "string" || runtime.checkpoint.length === 0)) ||
    (runtime.runId === undefined &&
      runtime.objectiveVersion === undefined &&
      runtime.checkpoint === undefined)
  ) {
    throw codedError("threadmesh_task_runtime_invalid");
  }
}

function runtimeSnapshot(metadata) {
  return {
    ...(metadata.run_id ? { runId: metadata.run_id } : {}),
    ...(metadata.objective_version !== null
      ? { objectiveVersion: metadata.objective_version }
      : {}),
    ...(metadata.checkpoint ? { checkpoint: metadata.checkpoint } : {}),
  };
}

function tombstoneEnvelope(envelope) {
  const tombstone = {
    ...envelope,
    content: PURGED_TEXT,
    reason: PURGED_TEXT,
    ...(envelope.claimStatus === "evidence-referenced"
      ? { claimStatus: "unverified" }
      : {}),
  };
  delete tombstone.evidenceRefs;
  assertProtocolObject("envelope", tombstone);
  return tombstone;
}

function tombstoneProposal(proposal) {
  const tombstone = { ...proposal, reason: PURGED_TEXT };
  assertProtocolObject("relationship-proposal", tombstone);
  return tombstone;
}

function tombstoneSummary(summary) {
  const tombstone = { ...summary };
  delete tombstone.objective;
  delete tombstone.blockerHint;
  delete tombstone.dependencyHints;
  assertProtocolObject("task-summary", tombstone);
  return tombstone;
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
  #verificationTrustAnchors;

  constructor({
    filename = ":memory:",
    clock = Date.now,
    verificationTrustAnchors = [],
  } = {}) {
    this.clock = clock;
    this.#verificationTrustAnchors = freezeVerificationTrustAnchors(
      verificationTrustAnchors,
    );
    this.db = new Database(filename);
    if (filename !== ":memory:") fs.chmodSync(filename, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("secure_delete = FAST");
    this.db.pragma("foreign_keys = ON");
    try {
      this.#migrate();
      this.#validatePersistedGitEvidenceChains();
      this.#validatePersistedTurnExecutions();
      this.#validatePersistedAttentionState();
      this.#validatePersistedGitEvidenceDependencyFinalizations();
      this.#validatePersistedLifecycleBindings();
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
      for (const migration of SQLITE_SCHEMA_MIGRATIONS) {
        const recorded = this.db
          .prepare("SELECT * FROM schema_migrations WHERE version = ?")
          .get(migration.version);
        if (recorded && recorded.checksum !== migration.checksum) {
          throw codedError(
            "threadmesh_storage_migration_checksum_mismatch",
            String(migration.version),
          );
        }
      }
      if (version === 0) {
        this.#initializeSchema();
      }
      if (version < 2) {
        this.#addColumnIfMissing("task_metadata", "run_id", "TEXT");
        this.#addColumnIfMissing("task_metadata", "objective_version", "INTEGER");
        this.#addColumnIfMissing("task_metadata", "checkpoint", "TEXT");
        this.#addColumnIfMissing("dispositions", "decision_reason_code", "TEXT");
        this.#addColumnIfMissing("dispositions", "delivery_failure_reason", "TEXT");
      }
      if (version < 3) {
        this.#addColumnIfMissing("tasks", "adapter_ref_purged_at", "TEXT");
        this.#addColumnIfMissing(
          "relationship_proposals",
          "content_purged_at",
          "TEXT",
        );
        this.#addColumnIfMissing("task_summaries", "content_purged_at", "TEXT");
        this.#addColumnIfMissing("messages", "content_purged_at", "TEXT");
        this.#addColumnIfMissing("messages", "claim_status", "TEXT");
        this.db.exec(`
          UPDATE messages SET claim_status = json_extract(envelope_json, '$.claimStatus')
          WHERE claim_status IS NULL;
        `);
        this.#addColumnIfMissing(
          "admission_claims",
          "adapter_ref_purged_at",
          "TEXT",
        );
        this.#addColumnIfMissing("audit_events", "detail_purged_at", "TEXT");
      }
      if (version < 4) {
        this.#initializeDependencySchema();
      }
      if (version < 5) {
        this.#initializeGitEvidenceSchema();
      }
      if (version < 6) {
        this.#initializeDurableTurnIntentSchema();
      }
      if (version < 7) {
        this.#initializeTrustedEvidenceUnlockSchema();
      }
      if (version < 8) {
        this.#initializeExactLifecycleBindingSchema();
      }
      this.#assertSchemaCompatible();
      for (const migration of SQLITE_SCHEMA_MIGRATIONS) {
        this.db
          .prepare(
            `INSERT INTO schema_migrations (version, name, checksum, applied_at)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(version) DO NOTHING`,
          )
          .run(
            migration.version,
            migration.name,
            migration.checksum,
            nowIso(this.clock),
          );
      }
      this.db.pragma(`user_version = ${SQLITE_SCHEMA_VERSION}`);
    }).immediate();
  }

  #addColumnIfMissing(table, column, declaration) {
    const existing = new Set(
      this.db
        .prepare("SELECT name FROM pragma_table_info(?)")
        .all(table)
        .map((row) => row.name),
    );
    if (!existing.has(column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${declaration}`);
    }
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
        adapter_ref_purged_at TEXT,
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
        run_id TEXT,
        objective_version INTEGER,
        checkpoint TEXT,
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
        created_at TEXT NOT NULL,
        content_purged_at TEXT
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
        content_purged_at TEXT,
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
        content_purged_at TEXT,
        claim_status TEXT NOT NULL,
        UNIQUE (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS dispositions (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        delivery_state TEXT NOT NULL,
        decision_state TEXT NOT NULL,
        decision_reason_code TEXT,
        delivery_failure_reason TEXT,
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
        adapter_ref_purged_at TEXT,
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
        occurred_at TEXT NOT NULL,
        detail_purged_at TEXT
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

  #initializeDependencySchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dependency_edges (
        dependency_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        prerequisite_task_id TEXT NOT NULL,
        prerequisite_incarnation_id TEXT NOT NULL,
        dependent_task_id TEXT NOT NULL,
        dependent_incarnation_id TEXT NOT NULL,
        relationship_id TEXT,
        expected_event_type TEXT NOT NULL,
        authority_kind TEXT NOT NULL,
        authority_principal_id TEXT NOT NULL,
        freshness_json TEXT NOT NULL,
        edge_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        PRIMARY KEY (dependency_id, version),
        FOREIGN KEY (prerequisite_task_id, prerequisite_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id),
        FOREIGN KEY (dependent_task_id, dependent_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE INDEX IF NOT EXISTS dependency_edges_current_version
        ON dependency_edges (dependency_id, version DESC);

      CREATE TABLE IF NOT EXISTS dependency_satisfactions (
        dependency_id TEXT PRIMARY KEY,
        edge_version INTEGER NOT NULL,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        disposition_json TEXT NOT NULL,
        disposition_digest TEXT NOT NULL,
        satisfied_at TEXT NOT NULL,
        UNIQUE (sender_incarnation_id, message_id),
        FOREIGN KEY (dependency_id, edge_version)
          REFERENCES dependency_edges (dependency_id, version),
        FOREIGN KEY (sender_incarnation_id, message_id)
          REFERENCES messages (sender_incarnation_id, message_id)
      );
    `);
  }

  #initializeGitEvidenceSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS git_evidence_requirements (
        chain_id TEXT NOT NULL PRIMARY KEY,
        requirement_digest TEXT NOT NULL UNIQUE,
        requirement_json TEXT NOT NULL,
        authority_kind TEXT NOT NULL,
        authority_principal_id TEXT NOT NULL,
        implementer_task_id TEXT NOT NULL,
        implementer_incarnation_id TEXT NOT NULL,
        implementer_adapter_ref_digest TEXT NOT NULL,
        implementer_task_revision INTEGER NOT NULL,
        reviewer_task_id TEXT NOT NULL,
        reviewer_incarnation_id TEXT NOT NULL,
        reviewer_adapter_ref_digest TEXT NOT NULL,
        reviewer_task_revision INTEGER NOT NULL,
        verifier_task_id TEXT NOT NULL,
        verifier_incarnation_id TEXT NOT NULL,
        verifier_adapter_ref_digest TEXT NOT NULL,
        verifier_task_revision INTEGER NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0,
        head_record_digest TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        binding_digest TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (implementer_task_id, implementer_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id),
        FOREIGN KEY (reviewer_task_id, reviewer_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id),
        FOREIGN KEY (verifier_task_id, verifier_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE TABLE IF NOT EXISTS git_evidence_records (
        chain_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        stage TEXT NOT NULL,
        actor_task_id TEXT NOT NULL,
        actor_incarnation_id TEXT NOT NULL,
        previous_record_digest TEXT,
        record_digest TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (chain_id, sequence),
        UNIQUE (chain_id, record_digest),
        FOREIGN KEY (chain_id) REFERENCES git_evidence_requirements (chain_id),
        FOREIGN KEY (actor_task_id, actor_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE INDEX IF NOT EXISTS git_evidence_records_chain_sequence
        ON git_evidence_records (chain_id, sequence);
    `);
  }

  #initializeDurableTurnIntentSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turn_execution_intents (
        execution_id TEXT NOT NULL PRIMARY KEY,
        task_id TEXT NOT NULL,
        incarnation_id TEXT NOT NULL,
        adapter_kind TEXT NOT NULL,
        adapter_thread_id TEXT NOT NULL,
        adapter_snapshot_digest TEXT NOT NULL,
        adapter_ref_digest TEXT NOT NULL,
        task_revision INTEGER NOT NULL,
        adapter_idempotency_key TEXT NOT NULL UNIQUE,
        tool_allowlist_json TEXT NOT NULL,
        tool_allowlist_digest TEXT NOT NULL,
        prompt_digest TEXT NOT NULL,
        intent_digest TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        scenario_id TEXT,
        chain_id TEXT,
        message_id TEXT,
        state TEXT NOT NULL,
        turn_id TEXT,
        action_count INTEGER NOT NULL DEFAULT 0,
        action_head_digest TEXT,
        receipt_json TEXT,
        receipt_digest TEXT,
        reconciliation_json TEXT,
        reconciliation_digest TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id, incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE TABLE IF NOT EXISTS turn_tool_actions (
        execution_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        turn_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        args_json TEXT NOT NULL,
        args_digest TEXT NOT NULL,
        selection_digest TEXT NOT NULL,
        result_digest TEXT,
        result_status TEXT,
        previous_action_digest TEXT,
        action_digest TEXT,
        observed_at TEXT NOT NULL,
        result_completed_at TEXT,
        PRIMARY KEY (execution_id, ordinal),
        UNIQUE (execution_id, call_id),
        UNIQUE (execution_id, selection_digest),
        FOREIGN KEY (execution_id)
          REFERENCES turn_execution_intents (execution_id)
      );

      CREATE TABLE IF NOT EXISTS attention_receiver_cursors (
        receiver_task_id TEXT NOT NULL,
        receiver_incarnation_id TEXT NOT NULL,
        committed_cursor INTEGER NOT NULL DEFAULT 0,
        commit_count INTEGER NOT NULL DEFAULT 0,
        commit_head_digest TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        active_claim_epoch TEXT,
        active_event_cursor INTEGER,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (receiver_task_id, receiver_incarnation_id),
        FOREIGN KEY (receiver_task_id, receiver_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE TABLE IF NOT EXISTS attention_cursor_commits (
        receiver_task_id TEXT NOT NULL,
        receiver_incarnation_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        from_cursor INTEGER NOT NULL,
        to_cursor INTEGER NOT NULL,
        kind TEXT NOT NULL,
        source_id TEXT NOT NULL,
        event_digest TEXT NOT NULL,
        classification_digest TEXT,
        previous_commit_digest TEXT,
        commit_digest TEXT NOT NULL,
        committed_at TEXT NOT NULL,
        PRIMARY KEY (receiver_task_id, receiver_incarnation_id, sequence),
        UNIQUE (receiver_task_id, receiver_incarnation_id, source_id),
        UNIQUE (receiver_task_id, receiver_incarnation_id, commit_digest),
        FOREIGN KEY (receiver_task_id, receiver_incarnation_id)
          REFERENCES attention_receiver_cursors (
            receiver_task_id, receiver_incarnation_id
          )
      );

      CREATE TABLE IF NOT EXISTS attention_handler_claims (
        claim_epoch TEXT NOT NULL PRIMARY KEY,
        receiver_task_id TEXT NOT NULL,
        receiver_incarnation_id TEXT NOT NULL,
        event_cursor INTEGER NOT NULL,
        event_id TEXT NOT NULL,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        event_digest TEXT NOT NULL,
        state TEXT NOT NULL,
        turn_execution_id TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        claimed_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE (receiver_task_id, receiver_incarnation_id, event_cursor),
        UNIQUE (receiver_task_id, receiver_incarnation_id, event_id),
        FOREIGN KEY (receiver_task_id, receiver_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id),
        FOREIGN KEY (turn_execution_id)
          REFERENCES turn_execution_intents (execution_id)
      );

      CREATE INDEX IF NOT EXISTS turn_execution_intents_task_state
        ON turn_execution_intents (task_id, incarnation_id, state);
      CREATE INDEX IF NOT EXISTS turn_tool_actions_execution_ordinal
        ON turn_tool_actions (execution_id, ordinal);
      CREATE INDEX IF NOT EXISTS attention_handler_claims_receiver_cursor
        ON attention_handler_claims (
          receiver_task_id, receiver_incarnation_id, event_cursor
        );
      CREATE INDEX IF NOT EXISTS attention_cursor_commits_receiver_sequence
        ON attention_cursor_commits (
          receiver_task_id, receiver_incarnation_id, sequence
        );
    `);
  }

  #initializeTrustedEvidenceUnlockSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS git_evidence_dependency_bindings (
        chain_id TEXT NOT NULL PRIMARY KEY,
        dependency_id TEXT NOT NULL UNIQUE,
        edge_version INTEGER NOT NULL,
        requirement_digest TEXT NOT NULL,
        verifier_task_id TEXT NOT NULL,
        verifier_incarnation_id TEXT NOT NULL,
        dependent_task_id TEXT NOT NULL,
        dependent_incarnation_id TEXT NOT NULL,
        binding_digest TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        FOREIGN KEY (chain_id)
          REFERENCES git_evidence_requirements (chain_id),
        FOREIGN KEY (dependency_id, edge_version)
          REFERENCES dependency_edges (dependency_id, version),
        FOREIGN KEY (verifier_task_id, verifier_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id),
        FOREIGN KEY (dependent_task_id, dependent_incarnation_id)
          REFERENCES tasks (task_id, incarnation_id)
      );

      CREATE TABLE IF NOT EXISTS git_evidence_dependency_finalizations (
        chain_id TEXT NOT NULL PRIMARY KEY,
        execution_id TEXT NOT NULL UNIQUE,
        action_ordinal INTEGER NOT NULL,
        action_digest TEXT NOT NULL,
        result_digest TEXT NOT NULL,
        final_record_digest TEXT NOT NULL,
        dependency_id TEXT NOT NULL UNIQUE,
        edge_version INTEGER NOT NULL,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        event_digest TEXT NOT NULL,
        disposition_digest TEXT NOT NULL,
        effect_digest TEXT NOT NULL,
        binding_digest TEXT NOT NULL UNIQUE,
        finalized_at TEXT NOT NULL,
        UNIQUE (sender_incarnation_id, message_id),
        FOREIGN KEY (chain_id)
          REFERENCES git_evidence_dependency_bindings (chain_id),
        FOREIGN KEY (chain_id, final_record_digest)
          REFERENCES git_evidence_records (chain_id, record_digest),
        FOREIGN KEY (execution_id)
          REFERENCES turn_execution_intents (execution_id),
        FOREIGN KEY (execution_id, action_ordinal)
          REFERENCES turn_tool_actions (execution_id, ordinal),
        FOREIGN KEY (dependency_id)
          REFERENCES dependency_satisfactions (dependency_id),
        FOREIGN KEY (sender_incarnation_id, message_id)
          REFERENCES messages (sender_incarnation_id, message_id)
      );
    `);
  }

  #initializeExactLifecycleBindingSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lifecycle_action_publications (
        execution_id TEXT NOT NULL,
        action_ordinal INTEGER NOT NULL,
        action_digest TEXT NOT NULL,
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        event_digest TEXT NOT NULL,
        envelope_digest TEXT NOT NULL,
        publication_digest TEXT NOT NULL UNIQUE,
        published_at TEXT NOT NULL,
        PRIMARY KEY (execution_id, action_ordinal),
        UNIQUE (sender_incarnation_id, message_id),
        FOREIGN KEY (execution_id, action_ordinal)
          REFERENCES turn_tool_actions (execution_id, ordinal),
        FOREIGN KEY (sender_incarnation_id, message_id)
          REFERENCES messages (sender_incarnation_id, message_id)
      );

      CREATE TABLE IF NOT EXISTS attention_route_decision_bindings (
        claim_epoch TEXT NOT NULL PRIMARY KEY,
        route_projection_json TEXT NOT NULL,
        route_projection_digest TEXT NOT NULL,
        receiver_decision_execution_id TEXT NOT NULL UNIQUE,
        decision_action_ordinal INTEGER NOT NULL,
        decision_action_digest TEXT NOT NULL,
        decision_projection_json TEXT NOT NULL,
        decision_projection_digest TEXT NOT NULL,
        mailbox_claim_token_digest TEXT NOT NULL,
        binding_digest TEXT NOT NULL UNIQUE,
        committed_at TEXT NOT NULL,
        FOREIGN KEY (claim_epoch)
          REFERENCES attention_handler_claims (claim_epoch),
        FOREIGN KEY (receiver_decision_execution_id)
          REFERENCES turn_execution_intents (execution_id),
        FOREIGN KEY (receiver_decision_execution_id, decision_action_ordinal)
          REFERENCES turn_tool_actions (execution_id, ordinal)
      );

      CREATE TABLE IF NOT EXISTS context_admission_turn_bindings (
        sender_incarnation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        execution_id TEXT NOT NULL UNIQUE,
        turn_id TEXT NOT NULL,
        expected_revision INTEGER NOT NULL,
        admission_token_digest TEXT NOT NULL,
        adapter_ref_digest TEXT NOT NULL,
        completed_binding_digest TEXT NOT NULL,
        turn_receipt_digest TEXT NOT NULL,
        adapter_evidence_digest TEXT NOT NULL,
        binding_digest TEXT NOT NULL UNIQUE,
        confirmed_at TEXT NOT NULL,
        PRIMARY KEY (sender_incarnation_id, message_id),
        FOREIGN KEY (sender_incarnation_id, message_id)
          REFERENCES admission_claims (sender_incarnation_id, message_id),
        FOREIGN KEY (execution_id)
          REFERENCES turn_execution_intents (execution_id)
      );
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
    this.#assertGitEvidenceSchemaConstraints();
  }

  #assertGitEvidenceSchemaConstraints() {
    const fail = (detail) => {
      throw codedError("threadmesh_storage_schema_incompatible", detail);
    };
    const constraints = SQLITE_SCHEMA_MANIFEST.constraints;
    const uniqueSignatures = (table) => this.db
      .prepare("SELECT name FROM pragma_index_list(?) WHERE \"unique\" = 1")
      .all(table)
      .map(({ name }) => this.db
        .prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
        .all(name)
        .map((entry) => entry.name)
        .join(","))
      .sort();
    const foreignKeySignatures = (table) => {
      const groups = new Map();
      for (const row of this.db
        .prepare("SELECT * FROM pragma_foreign_key_list(?) ORDER BY id, seq")
        .all(table)) {
        if (!groups.has(row.id)) groups.set(row.id, []);
        groups.get(row.id).push(`${row.from}->${row.table}.${row.to}`);
      }
      return [...groups.values()].map((parts) => parts.join(",")).sort();
    };
    for (const [table, expected] of Object.entries(constraints.tables)) {
      const columns = this.db
        .prepare("SELECT * FROM pragma_table_info(?) ORDER BY cid")
        .all(table)
        .map((entry) => [
          entry.name,
          entry.type,
          entry.notnull,
          entry.dflt_value ?? "",
          entry.pk,
        ].join("|"));
      if (canonicalJson(columns) !== canonicalJson(expected.columns)) {
        fail(`${table} column constraints`);
      }
      if (canonicalJson(uniqueSignatures(table)) !==
          canonicalJson([...expected.unique].sort())) {
        fail(`${table} unique constraints`);
      }
      if (canonicalJson(foreignKeySignatures(table)) !==
          canonicalJson([...expected.foreignKeys].sort())) {
        fail(`${table} foreign keys`);
      }
    }
    for (const [name, expected] of Object.entries(constraints.indexes)) {
      const index = this.db
        .prepare("SELECT \"unique\", partial FROM pragma_index_list(?) WHERE name = ?")
        .get(expected.table, name);
      const columns = this.db
        .prepare("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
        .all(name)
        .map((entry) => entry.name);
      if (
        index?.unique !== expected.unique || index.partial !== expected.partial ||
        canonicalJson(columns) !== canonicalJson(expected.columns)
      ) fail(`${name} definition`);
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
    assertRuntimeSnapshot(task.runtime, true);

    const incarnation = this.db
      .prepare("SELECT * FROM tasks WHERE incarnation_id = ?")
      .get(task.incarnationId);
    if (incarnation && incarnation.task_id !== task.taskId) {
      throw codedError("threadmesh_incarnation_id_conflict", task.incarnationId);
    }
    if (incarnation) {
      const metadata = this.#taskMetadata(task);
      const same =
        incarnation.owner_kind === principal.kind &&
        incarnation.owner_principal_id === principal.principalId &&
        incarnation.harness === task.harness &&
        incarnation.state === (task.state ?? "idle") &&
        canonicalJson(
          incarnation.adapter_ref_json ? JSON.parse(incarnation.adapter_ref_json) : null,
        ) === canonicalJson(task.adapterRef ?? null) &&
        canonicalJson(runtimeSnapshot(metadata)) ===
          canonicalJson(task.runtime ?? {});
      if (!same) throw codedError("threadmesh_idempotency_conflict", task.incarnationId);
      return { ...task, runtime: runtimeSnapshot(metadata), revision: metadata.revision, replay: true };
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
          `INSERT INTO task_metadata (
             task_id, incarnation_id, revision, run_id,
             objective_version, checkpoint
           ) VALUES (?, ?, 0, ?, ?, ?)`,
        )
        .run(
          task.taskId,
          task.incarnationId,
          task.runtime?.runId ?? null,
          task.runtime?.objectiveVersion ?? null,
          task.runtime?.checkpoint ?? null,
        );
    }).immediate();
    return { ...task, revision: 0, replay: false };
  }

  createGitEvidenceRequirement(input, principal) {
    assertControlPlanePrincipal(principal);
    const requirement = createPureGitEvidenceRequirement(input);
    this.#assertConfiguredGitEvidenceTrustAnchor(
      requirement.preconfiguredTrustAnchorDigest,
    );
    return this.db.transaction(() => {
      if (
        this.db
          .prepare("SELECT 1 FROM git_evidence_requirements WHERE chain_id = ?")
          .get(requirement.chainId)
      ) {
        throw codedError("threadmesh_git_evidence_requirement_conflict");
      }
      const adapterRefDigests = {};
      const taskRevisions = {};
      for (const role of ["implementer", "reviewer", "verifier"]) {
        const current = this.#assertGitEvidenceActorCurrent(requirement[role]);
        if (
          principal.kind !== "policy" &&
          (current.task.owner_kind !== principal.kind ||
            current.task.owner_principal_id !== principal.principalId)
        ) {
          throw codedError("threadmesh_git_evidence_requirement_not_authorized");
        }
        adapterRefDigests[role] = current.adapterRefDigest;
        taskRevisions[role] = current.taskRevision;
      }
      const authority = {
        kind: principal.kind,
        principalId: principal.principalId,
      };
      const bindingDigest = sha256Digest({
        requirement,
        adapterRefDigests,
        taskRevisions,
        authority,
      });
      this.db
        .prepare(
          `INSERT INTO git_evidence_requirements (
             chain_id, requirement_digest, requirement_json,
             authority_kind, authority_principal_id,
             implementer_task_id, implementer_incarnation_id,
             implementer_adapter_ref_digest, implementer_task_revision,
             reviewer_task_id, reviewer_incarnation_id,
             reviewer_adapter_ref_digest, reviewer_task_revision,
             verifier_task_id, verifier_incarnation_id,
             verifier_adapter_ref_digest, verifier_task_revision,
             record_count, head_record_digest, revision,
             binding_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
        )
        .run(
          requirement.chainId,
          requirement.requirementDigest,
          canonicalJson(requirement),
          authority.kind,
          authority.principalId,
          requirement.implementer.taskId,
          requirement.implementer.incarnationId,
          adapterRefDigests.implementer,
          taskRevisions.implementer,
          requirement.reviewer.taskId,
          requirement.reviewer.incarnationId,
          adapterRefDigests.reviewer,
          taskRevisions.reviewer,
          requirement.verifier.taskId,
          requirement.verifier.incarnationId,
          adapterRefDigests.verifier,
          taskRevisions.verifier,
          bindingDigest,
          nowIso(this.clock),
        );
      return {
        requirement,
        adapterRefDigests: { ...adapterRefDigests },
        taskRevisions: { ...taskRevisions },
        state: validateGitEvidenceChain(requirement, []),
      };
    }).immediate();
  }

  appendGitEvidenceRecord(
    chainId,
    { stage, payload, expectedRevision, expectedHeadDigest } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#gitEvidenceSnapshot(chainId);
      this.#assertGitEvidenceCas(snapshot.state, expectedRevision, expectedHeadDigest);
      const record = appendPureGitEvidenceRecord(
        snapshot.requirement,
        snapshot.records,
        { stage, payload },
      );
      assertTaskPrincipal(
        principal,
        record.payload.actor.taskId,
        record.payload.actor.incarnationId,
      );
      const role = stage === "review-failed" ? "reviewer" : "implementer";
      this.#assertGitEvidenceActorCurrent(
        record.payload.actor,
        snapshot.adapterRefDigests[role],
        snapshot.taskRevisions[role],
      );
      this.#insertGitEvidenceRecord(record, expectedRevision, expectedHeadDigest);
      const state = validateGitEvidenceChain(
        snapshot.requirement,
        [...snapshot.records, record],
      );
      return { record, state };
    }).immediate();
  }

  appendIndependentGitVerificationRecord(
    chainId,
    {
      actor,
      turnId,
      toolCallDigest,
      request,
      response,
      expectedTrustAnchor,
      expectedRevision,
      expectedHeadDigest,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#gitEvidenceSnapshot(chainId);
      this.#assertGitEvidenceCas(snapshot.state, expectedRevision, expectedHeadDigest);
      assertTaskPrincipal(principal, actor?.taskId, actor?.incarnationId);
      this.#assertConfiguredGitEvidenceTrustAnchor(sha256Digest(expectedTrustAnchor));
      const record = appendPureIndependentVerificationRecord(
        snapshot.requirement,
        snapshot.records,
        {
          actor,
          turnId,
          toolCallDigest,
          request,
          response,
          expectedTrustAnchor,
        },
      );
      this.#assertGitEvidenceActorCurrent(
        record.payload.actor,
        snapshot.adapterRefDigests.verifier,
        snapshot.taskRevisions.verifier,
      );
      this.#insertGitEvidenceRecord(record, expectedRevision, expectedHeadDigest);
      const state = validateGitEvidenceChain(
        snapshot.requirement,
        [...snapshot.records, record],
      );
      return { record, state };
    }).immediate();
  }

  getGitEvidenceChain(chainId, principal) {
    const row = this.#gitEvidenceRequirementRow(chainId);
    this.#assertGitEvidenceReadAuthority(row, principal);
    const snapshot = this.#gitEvidenceSnapshot(chainId, row);
    return {
      requirement: snapshot.requirement,
      adapterRefDigests: { ...snapshot.adapterRefDigests },
      taskRevisions: { ...snapshot.taskRevisions },
      records: snapshot.records,
      state: snapshot.state,
    };
  }

  inspectGitEvidenceChain(chainId, principal) {
    const row = this.#gitEvidenceRequirementRow(chainId);
    this.#assertGitEvidenceReadAuthority(row, principal);
    const snapshot = this.#gitEvidenceSnapshot(chainId, row);
    return {
      chainId: snapshot.requirement.chainId,
      requirementDigest: snapshot.requirement.requirementDigest,
      revision: snapshot.state.recordCount,
      headDigest: snapshot.state.headDigest,
      nextStage: snapshot.state.nextStage,
      trustedComplete: snapshot.state.trustedComplete,
      records: snapshot.records.map((record) => ({
        sequence: record.sequence,
        stage: record.stage,
        recordDigest: record.recordDigest,
        previousRecordDigest: record.previousRecordDigest,
        actor: {
          taskId: record.payload.actor.taskId,
          incarnationId: record.payload.actor.incarnationId,
        },
      })),
    };
  }

  bindGitEvidenceDependency(
    chainId,
    { dependencyId, expectedVersion } = {},
    principal,
  ) {
    assertControlPlanePrincipal(principal);
    return this.db.transaction(() => {
      const requirementRow = this.#gitEvidenceRequirementRow(chainId);
      const chain = this.#gitEvidenceSnapshot(chainId, requirementRow);
      const edge = this.#currentDependencyEdgeRow(dependencyId);
      if (
        requirementRow.authority_kind !== principal.kind ||
        requirementRow.authority_principal_id !== principal.principalId ||
        edge.authority_kind !== principal.kind ||
        edge.authority_principal_id !== principal.principalId
      ) {
        throw codedError("threadmesh_git_evidence_dependency_binding_not_authorized");
      }
      const existing = this.db.prepare(
        `SELECT * FROM git_evidence_dependency_bindings
         WHERE chain_id = ? OR dependency_id = ?`,
      ).get(chainId, dependencyId);
      const binding = {
        chainId,
        requirementDigest: chain.requirement.requirementDigest,
        dependencyId,
        edgeVersion: expectedVersion,
        verifier: {
          taskId: chain.requirement.verifier.taskId,
          incarnationId: chain.requirement.verifier.incarnationId,
        },
        dependent: {
          taskId: edge.dependent_task_id,
          incarnationId: edge.dependent_incarnation_id,
        },
      };
      const bindingDigest = sha256Digest(binding);
      if (existing) {
        if (
          existing.chain_id === chainId &&
          existing.dependency_id === dependencyId &&
          existing.edge_version === expectedVersion &&
          existing.binding_digest === bindingDigest
        ) return { binding: { ...binding, bindingDigest }, replay: true };
        throw codedError("threadmesh_git_evidence_dependency_binding_conflict");
      }
      if (edge.version !== expectedVersion) {
        throw codedError("threadmesh_dependency_edge_version_conflict");
      }
      if (edge.status !== "waiting" || edge.revoked_at) {
        throw codedError("threadmesh_dependency_edge_inactive");
      }
      if (edge.expires_at && Date.parse(edge.expires_at) <= this.clock()) {
        throw codedError("threadmesh_dependency_edge_expired");
      }
      if (
        edge.prerequisite_task_id !== chain.requirement.verifier.taskId ||
        edge.prerequisite_incarnation_id !== chain.requirement.verifier.incarnationId
      ) {
        throw codedError("threadmesh_git_evidence_dependency_binding_mismatch");
      }
      if (this.db.prepare(
        "SELECT 1 FROM dependency_satisfactions WHERE dependency_id = ?",
      ).get(dependencyId)) {
        throw codedError("threadmesh_dependency_already_satisfied");
      }
      for (const role of ["implementer", "reviewer", "verifier"]) {
        this.#assertGitEvidenceActorCurrent(
          chain.requirement[role],
          chain.adapterRefDigests[role],
          chain.taskRevisions[role],
        );
      }
      this.db.prepare(
        `INSERT INTO git_evidence_dependency_bindings (
           chain_id, dependency_id, edge_version, requirement_digest,
           verifier_task_id, verifier_incarnation_id, dependent_task_id,
           dependent_incarnation_id, binding_digest, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        chainId, dependencyId, expectedVersion,
        chain.requirement.requirementDigest,
        chain.requirement.verifier.taskId,
        chain.requirement.verifier.incarnationId,
        edge.dependent_task_id, edge.dependent_incarnation_id,
        bindingDigest, nowIso(this.clock),
      );
      return { binding: { ...binding, bindingDigest }, replay: false };
    }).immediate();
  }

  createTurnExecutionIntent(input, expectedTaskRevision, principal) {
    const intent = createProposedDurableTurnIntent(input);
    assertTaskPrincipal(principal, intent.actor.taskId, intent.actor.incarnationId);
    if (!Number.isInteger(expectedTaskRevision) || expectedTaskRevision < 0) {
      throw codedError("threadmesh_turn_execution_task_revision_invalid");
    }
    return this.db.transaction(() => {
      const existing = this.db.prepare(
        "SELECT * FROM turn_execution_intents WHERE execution_id = ? OR adapter_idempotency_key = ?",
      ).get(intent.intentId, intent.adapterIdempotencyKey);
      if (existing) {
        const snapshot = this.#turnExecutionSnapshot(existing.execution_id, existing);
        if (
          snapshot.row.execution_id === intent.intentId &&
          snapshot.row.task_revision === expectedTaskRevision &&
          snapshot.row.intent_digest === this.#turnIntentDigest(intent)
        ) return { ...snapshot, replay: true };
        throw codedError("threadmesh_turn_execution_intent_conflict");
      }
      const current = this.#assertTurnExecutionActorCurrent(intent.actor);
      if (current.taskRevision !== expectedTaskRevision) {
        throw codedError("threadmesh_turn_execution_task_revision_conflict");
      }
      const at = nowIso(this.clock);
      const allowlistJson = canonicalJson(intent.allowedTools);
      this.db.prepare(
        `INSERT INTO turn_execution_intents (
           execution_id, task_id, incarnation_id, adapter_kind,
           adapter_thread_id, adapter_snapshot_digest, adapter_ref_digest,
           task_revision, adapter_idempotency_key, tool_allowlist_json,
           tool_allowlist_digest, prompt_digest, intent_digest, intent_json,
           scenario_id, chain_id, message_id, state, turn_id,
           action_count, action_head_digest, receipt_json, receipt_digest,
           reconciliation_json, reconciliation_digest, revision,
           created_at, started_at, completed_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL,
           0, NULL, NULL, NULL, NULL, NULL, 0, ?, NULL, NULL, ?)`,
      ).run(
        intent.intentId,
        intent.actor.taskId,
        intent.actor.incarnationId,
        current.adapterRef.kind,
        intent.actor.threadId,
        intent.actor.snapshotDigest,
        current.adapterRefDigest,
        current.taskRevision,
        intent.adapterIdempotencyKey,
        allowlistJson,
        sha256Digest(intent.allowedTools),
        intent.promptDigest,
        this.#turnIntentDigest(intent),
        canonicalJson(intent),
        intent.scenarioId,
        intent.chainId,
        intent.messageId,
        intent.state,
        at,
        at,
      );
      return { ...this.#turnExecutionSnapshot(intent.intentId), replay: false };
    }).immediate();
  }

  markTurnExecutionStarted(
    executionId,
    { expectedRevision } = {},
    principal,
  ) {
    return this.#transitionTurnExecution(
      executionId,
      expectedRevision,
      principal,
      (snapshot) => startDurableTurnIntent(snapshot.intent),
      { replayState: "started", replayMatch: () => true, acquired: true },
    );
  }

  bindStartedTurnExecutionOperation(
    executionId,
    { turnId, expectedRevision } = {},
    principal,
  ) {
    return this.#transitionTurnExecution(
      executionId,
      expectedRevision,
      principal,
      (snapshot) => bindStartedTurnOperation(snapshot.intent, { turnId }),
      {
        replayState: "started",
        replayMatch: (intent) => intent.turnStart?.turnId === turnId,
      },
    );
  }

  recordModelSelectedTurnToolAction(
    executionId,
    {
      turnId, callId, ordinal, name, arguments: argumentsValue,
      expectedRevision, expectedActionHeadDigest,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(snapshot, principal);
      const argsJson = this.#boundedCanonicalArguments(argumentsValue);
      const action = {
        turnId,
        callId,
        ordinal,
        name,
        argumentsDigest: sha256Digest(JSON.parse(argsJson)),
      };
      const existing = snapshot.actions.find(
        (entry) => entry.ordinal === ordinal || entry.callId === callId,
      );
      if (existing) {
        if (
          existing.ordinal === ordinal && existing.callId === callId &&
          existing.turnId === turnId && existing.name === name &&
          existing.argumentsDigest === action.argumentsDigest &&
          existing.argsJson === argsJson
        ) return { ...snapshot, replay: true };
        throw codedError("threadmesh_turn_execution_tool_action_conflict");
      }
      this.#assertTurnExecutionCas(snapshot, expectedRevision);
      if (expectedActionHeadDigest !== snapshot.actionHeadDigest) {
        throw codedError("threadmesh_turn_execution_action_head_conflict");
      }
      const nextIntent = recordModelSelectedToolAction(snapshot.intent, action);
      const selectionDigest = sha256Digest({
        executionId, ...action, args: JSON.parse(argsJson),
        previousActionDigest: snapshot.actionHeadDigest,
      });
      const at = nowIso(this.clock);
      try {
        this.db.prepare(
          `INSERT INTO turn_tool_actions (
             execution_id, ordinal, turn_id, call_id, tool_name, args_json,
             args_digest, selection_digest, result_digest, result_status,
             previous_action_digest, action_digest, observed_at,
             result_completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, NULL)`,
        ).run(
          executionId, ordinal, turnId, callId, name, argsJson,
          action.argumentsDigest, selectionDigest,
          snapshot.actionHeadDigest, at,
        );
        const updated = this.db.prepare(
          `UPDATE turn_execution_intents
           SET intent_json = ?, action_count = action_count + 1,
               action_head_digest = ?, revision = revision + 1, updated_at = ?
           WHERE execution_id = ? AND revision = ?
             AND action_count = ?
             AND ((action_head_digest IS NULL AND ? IS NULL)
               OR action_head_digest = ?)`,
        ).run(
          canonicalJson(nextIntent), selectionDigest, at, executionId,
          expectedRevision, snapshot.actionCount,
          snapshot.actionHeadDigest, snapshot.actionHeadDigest,
        );
        if (updated.changes !== 1) {
          throw codedError("threadmesh_turn_execution_revision_conflict");
        }
      } catch (error) {
        if (String(error?.code ?? "").startsWith("SQLITE_CONSTRAINT")) {
          throw codedError("threadmesh_turn_execution_tool_action_conflict");
        }
        throw error;
      }
      return { ...this.#turnExecutionSnapshot(executionId), replay: false };
    }).immediate();
  }

  completeModelSelectedTurnToolAction(
    executionId,
    {
      turnId, callId, ordinal, resultDigest, resultStatus,
      expectedRevision, expectedActionHeadDigest,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(snapshot, principal);
      const selected = snapshot.actions[ordinal];
      if (!selected || selected.turnId !== turnId || selected.callId !== callId) {
        throw codedError("threadmesh_turn_execution_tool_completion_missing_selection");
      }
      if (selected.resultDigest !== null || selected.resultStatus !== null) {
        if (selected.resultDigest === resultDigest && selected.resultStatus === resultStatus) {
          return { ...snapshot, replay: true };
        }
        throw codedError("threadmesh_turn_execution_tool_completion_conflict");
      }
      this.#assertTurnExecutionCas(snapshot, expectedRevision);
      if (expectedActionHeadDigest !== snapshot.actionHeadDigest) {
        throw codedError("threadmesh_turn_execution_action_head_conflict");
      }
      const nextIntent = completeModelSelectedToolAction(snapshot.intent, {
        turnId, callId, ordinal, resultDigest, resultStatus,
      });
      const actionDigest = sha256Digest({
        selectionDigest: selected.selectionDigest,
        resultDigest,
        resultStatus,
      });
      const at = nowIso(this.clock);
      const actionUpdated = this.db.prepare(
        `UPDATE turn_tool_actions
         SET result_digest = ?, result_status = ?, action_digest = ?,
             result_completed_at = ?
         WHERE execution_id = ? AND ordinal = ? AND call_id = ?
           AND result_digest IS NULL AND result_status IS NULL
           AND action_digest IS NULL`,
      ).run(resultDigest, resultStatus, actionDigest, at, executionId, ordinal, callId);
      if (actionUpdated.changes !== 1) {
        throw codedError("threadmesh_turn_execution_tool_completion_conflict");
      }
      const headerUpdated = this.db.prepare(
        `UPDATE turn_execution_intents
         SET intent_json = ?, revision = revision + 1, updated_at = ?
         WHERE execution_id = ? AND revision = ?
           AND action_head_digest = ?`,
      ).run(
        canonicalJson(nextIntent), at, executionId, expectedRevision,
        snapshot.actionHeadDigest,
      );
      if (headerUpdated.changes !== 1) {
        throw codedError("threadmesh_turn_execution_revision_conflict");
      }
      return { ...this.#turnExecutionSnapshot(executionId), replay: false };
    }).immediate();
  }

  bindCompletedTurnExecution(
    executionId,
    { binding, expectedRevision } = {},
    principal,
  ) {
    return this.#transitionTurnExecution(
      executionId,
      expectedRevision,
      principal,
      (snapshot) => bindCompletedTurnIntent(snapshot.intent, binding),
      {
        replayStates: ["completed-turn-bound", "promoted"],
        replayMatch: (_intent, snapshot) =>
          snapshot.row.receipt_json !== null &&
          sha256Digest(JSON.parse(snapshot.row.receipt_json)) === sha256Digest(binding),
        receipt: binding,
      },
    );
  }

  markTurnExecutionOutcomeUnknown(
    executionId,
    { reasonCode, expectedRevision } = {},
    principal,
  ) {
    const marker = { reasonCode };
    return this.#transitionTurnExecution(
      executionId, expectedRevision, principal,
      (snapshot) => markTurnOutcomeUnknown(snapshot.intent, marker),
      {
        replayState: "outcome-unknown",
        replayMatch: (intent) => sha256Digest(intent.abandonment) === sha256Digest(marker),
        reconciliation: { state: "outcome-unknown", ...marker },
      },
    );
  }

  reconcileTurnExecution(
    executionId,
    { result, expectedRevision } = {},
    principal,
  ) {
    if (result?.state === "found-terminal") {
      throw codedError("threadmesh_turn_execution_terminal_projection_required");
    }
    return this.#reconcileTurnExecutionResult(
      executionId, result, expectedRevision, principal,
    );
  }

  reconcileCodexTerminalTurnExecution(
    executionId,
    { baseline, observation, expectedRevision } = {},
    principal,
  ) {
    const result = projectCodexTerminalTurnReconciliation({ baseline, observation });
    return this.#reconcileTurnExecutionResult(
      executionId, result, expectedRevision, principal,
    );
  }

  #reconcileTurnExecutionResult(executionId, result, expectedRevision, principal) {
    return this.db.transaction(() => {
      const snapshot = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(snapshot, principal);
      if (
        snapshot.intent.state === "abandoned" &&
        snapshot.row.reconciliation_json !== null
      ) {
        const persisted = JSON.parse(snapshot.row.reconciliation_json);
        if (persisted?.state === "found-terminal" || result?.state === "found-terminal") {
          if (sha256Digest(persisted) === sha256Digest(result)) {
            return { ...snapshot, replay: true };
          }
          throw codedError("threadmesh_turn_execution_reconciliation_conflict");
        }
      }
      this.#assertTurnExecutionCas(snapshot, expectedRevision);
      const next = reconcileUnknownDurableTurnIntent(snapshot.intent, result);
      if (next === snapshot.intent) return { ...snapshot, replay: true };
      const receipt = result?.state === "found" ? result.binding : null;
      if (result?.state === "found") {
        this.#persistReconciledToolCompletions(snapshot, next);
      }
      return this.#writeTurnTransition(snapshot, next, {
        receipt,
        reconciliation: result,
      });
    }).immediate();
  }

  promoteTurnExecutionWithGitEvidenceRecord(
    executionId,
    {
      stage, payload, expectedEvidenceChainRevision,
      expectedEvidenceChainHead, expectedRevision,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(snapshot, principal);
      const chain = this.#gitEvidenceSnapshot(snapshot.intent.chainId);
      const expectedToolName = GIT_EVIDENCE_STAGE_TOOL[stage];
      const referencedAction = snapshot.actions.find((action) =>
        action.name === expectedToolName &&
        payload?.actor?.taskId === snapshot.intent.actor.taskId &&
        payload?.actor?.incarnationId === snapshot.intent.actor.incarnationId &&
        payload?.turnId === action.turnId &&
        payload?.toolCallDigest === action.actionDigest,
      );
      if (!expectedToolName || !referencedAction) {
        const code = snapshot.intent.state === "promoted"
          ? "threadmesh_turn_execution_promotion_conflict"
          : "threadmesh_turn_execution_stage_tool_mismatch";
        throw codedError(code);
      }
      if (snapshot.intent.state === "promoted") {
        let replayRecord;
        try {
          const prefix = chain.records.slice(0, expectedEvidenceChainRevision);
          const prefixState = validateGitEvidenceChain(chain.requirement, prefix);
          this.#assertGitEvidenceCas(
            prefixState,
            expectedEvidenceChainRevision,
            expectedEvidenceChainHead,
          );
          replayRecord = appendPureGitEvidenceRecord(
            chain.requirement,
            prefix,
            { stage, payload },
          );
        } catch {
          throw codedError("threadmesh_turn_execution_promotion_conflict");
        }
        const persisted = chain.records[expectedEvidenceChainRevision];
        if (
          persisted?.recordDigest === replayRecord.recordDigest &&
          snapshot.intent.promotion?.expectedEvidenceChainRevision ===
            expectedEvidenceChainRevision + 1 &&
          snapshot.intent.promotion?.expectedEvidenceChainHead === persisted.recordDigest
        ) return { ...snapshot, evidenceRecord: persisted, evidenceState: chain.state, replay: true };
        throw codedError("threadmesh_turn_execution_promotion_conflict");
      }
      this.#assertTurnExecutionCas(snapshot, expectedRevision);
      this.#assertGitEvidenceCas(
        chain.state,
        expectedEvidenceChainRevision,
        expectedEvidenceChainHead,
      );
      const record = appendPureGitEvidenceRecord(
        chain.requirement,
        chain.records,
        { stage, payload },
      );
      assertTaskPrincipal(
        principal,
        record.payload.actor.taskId,
        record.payload.actor.incarnationId,
      );
      const role = stage === "review-failed" ? "reviewer" : "implementer";
      this.#assertGitEvidenceActorCurrent(
        record.payload.actor,
        chain.adapterRefDigests[role],
        chain.taskRevisions[role],
      );
      this.#insertGitEvidenceRecord(
        record,
        expectedEvidenceChainRevision,
        expectedEvidenceChainHead,
      );
      const evidenceState = validateGitEvidenceChain(
        chain.requirement,
        [...chain.records, record],
      );
      const expected = {
        expectedEvidenceChainRevision: evidenceState.recordCount,
        expectedEvidenceChainHead: evidenceState.headDigest,
      };
      const next = promoteDurableTurnIntent(snapshot.intent, expected);
      return {
        ...this.#writeTurnTransition(snapshot, next),
        evidenceRecord: record,
        evidenceState,
      };
    }).immediate();
  }

  finalizeGitEvidenceDependency(
    executionId,
    {
      actionOrdinal,
      verificationToolArguments,
      request,
      response,
      expectedTrustAnchor,
      dependencyId,
      expectedDependencyVersion,
      event,
      disposition,
      expectedEvidenceChainRevision,
      expectedEvidenceChainHead,
      expectedRevision,
    } = {},
    principal,
  ) {
    assertLifecycleEvent(event);
    assertProtocolObject("disposition", disposition);
    return this.db.transaction(() => {
      const execution = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      const chain = this.#gitEvidenceSnapshot(execution.intent.chainId);
      assertTaskPrincipal(
        principal,
        chain.requirement.verifier.taskId,
        chain.requirement.verifier.incarnationId,
      );
      if (
        execution.intent.actor.taskId !== chain.requirement.verifier.taskId ||
        execution.intent.actor.incarnationId !== chain.requirement.verifier.incarnationId ||
        execution.intent.actor.threadId !== chain.requirement.verifier.threadId ||
        execution.intent.actor.snapshotDigest !== chain.requirement.verifier.snapshotDigest ||
        execution.intent.messageId !== event.messageId
      ) {
        throw codedError("threadmesh_git_evidence_finalization_actor_mismatch");
      }
      for (const role of ["implementer", "reviewer", "verifier"]) {
        this.#assertGitEvidenceActorCurrent(
          chain.requirement[role],
          chain.adapterRefDigests[role],
          chain.taskRevisions[role],
        );
      }
      for (const record of chain.records.slice(0, 3)) {
        this.#assertPromotedGitEvidenceRecordAction(record);
      }
      const binding = this.db.prepare(
        "SELECT * FROM git_evidence_dependency_bindings WHERE chain_id = ?",
      ).get(chain.requirement.chainId);
      if (!binding) {
        throw codedError("threadmesh_git_evidence_dependency_not_bound");
      }
      const edge = this.#currentDependencyEdgeRow(dependencyId);
      const expectedBindingDigest = sha256Digest({
        chainId: chain.requirement.chainId,
        requirementDigest: chain.requirement.requirementDigest,
        dependencyId,
        edgeVersion: expectedDependencyVersion,
        verifier: {
          taskId: chain.requirement.verifier.taskId,
          incarnationId: chain.requirement.verifier.incarnationId,
        },
        dependent: {
          taskId: edge.dependent_task_id,
          incarnationId: edge.dependent_incarnation_id,
        },
      });
      if (
        binding.dependency_id !== dependencyId ||
        binding.edge_version !== expectedDependencyVersion ||
        binding.requirement_digest !== chain.requirement.requirementDigest ||
        binding.verifier_task_id !== chain.requirement.verifier.taskId ||
        binding.verifier_incarnation_id !== chain.requirement.verifier.incarnationId ||
        binding.dependent_task_id !== edge.dependent_task_id ||
        binding.dependent_incarnation_id !== edge.dependent_incarnation_id ||
        binding.binding_digest !== expectedBindingDigest
      ) {
        throw codedError("threadmesh_git_evidence_dependency_binding_mismatch");
      }
      if (
        edge.version !== expectedDependencyVersion ||
        edge.prerequisite_task_id !== chain.requirement.verifier.taskId ||
        edge.prerequisite_incarnation_id !== chain.requirement.verifier.incarnationId
      ) {
        throw codedError("threadmesh_git_evidence_dependency_binding_mismatch");
      }
      if (edge.status !== "waiting" || edge.revoked_at) {
        throw codedError("threadmesh_dependency_edge_inactive");
      }
      if (edge.expires_at && Date.parse(edge.expires_at) <= this.clock()) {
        throw codedError("threadmesh_dependency_edge_expired");
      }
      if (
        event.sender.taskId !== chain.requirement.verifier.taskId ||
        event.sender.incarnationId !== chain.requirement.verifier.incarnationId ||
        event.target.taskId !== edge.dependent_task_id ||
        event.target.incarnationId !== edge.dependent_incarnation_id ||
        request?.subject?.messageId !== event.messageId ||
        request?.subject?.senderIncarnationId !== event.sender.incarnationId ||
        !sameTaskRef(request?.subject?.receiver, event.target)
      ) {
        throw codedError("threadmesh_git_evidence_dependency_event_mismatch");
      }
      const action = execution.actions[actionOrdinal];
      const toolArgs = action ? JSON.parse(action.argsJson) : null;
      const expectedVerificationToolArguments = {
        sourceEventId: execution.intent.eventId,
        event: boundedLifecycleActionEventBody(event),
        chainId: chain.requirement.chainId,
        expectedEvidenceChainRevision: 3,
        expectedEvidenceChainHead,
      };
      if (
        !action || action.ordinal !== actionOrdinal ||
        action.name !== FINAL_GIT_EVIDENCE_TOOL ||
        action.resultStatus !== "completed" ||
        !action.actionDigest ||
        canonicalJson(toolArgs) !== canonicalJson(verificationToolArguments) ||
        canonicalJson(toolArgs) !== canonicalJson(expectedVerificationToolArguments) ||
        action.resultDigest !== gitEvidenceVerificationResultDigest({
          request, response, expectedTrustAnchor,
        })
      ) {
        throw codedError("threadmesh_git_evidence_finalization_tool_mismatch");
      }
      if (
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.turnStart?.turnId !== action.turnId
      ) {
        throw codedError("threadmesh_git_evidence_finalization_turn_not_bound");
      }
      const prefix = chain.records.slice(0, 3);
      const prefixState = validateGitEvidenceChain(chain.requirement, prefix);
      this.#assertGitEvidenceCas(
        prefixState,
        expectedEvidenceChainRevision,
        expectedEvidenceChainHead,
      );
      const finalRecord = appendPureIndependentVerificationRecord(
        chain.requirement,
        prefix,
        {
          actor: execution.intent.actor,
          turnId: action.turnId,
          toolCallDigest: action.actionDigest,
          request,
          response,
          expectedTrustAnchor,
        },
      );
      const eventDigest = sha256Digest(event);
      const dispositionDigest = sha256Digest(disposition);
      if (
        disposition.outcome?.verificationAttestations?.length !== 1 ||
        canonicalJson(disposition.outcome.verificationAttestations[0]) !==
          canonicalJson(response?.attestation)
      ) {
        throw codedError("threadmesh_git_evidence_dependency_attestation_mismatch");
      }
      this.#assertDependencyFreshness(edge, event);
      const effect = evaluateDependencyEffect({
        event,
        disposition,
        trustAnchors: this.#verificationTrustAnchors,
        dependencyEdge: JSON.parse(edge.edge_json),
        currentDependencyEdge: JSON.parse(edge.edge_json),
        now: this.clock(),
      });
      if (!effect.unlock) {
        throw codedError("threadmesh_dependency_not_satisfied", effect.reasonCode);
      }
      const effectDigest = sha256Digest(effect);
      const finalizationBinding = {
        chainId: chain.requirement.chainId,
        requirementDigest: chain.requirement.requirementDigest,
        executionId,
        actionOrdinal,
        actionDigest: action.actionDigest,
        resultDigest: action.resultDigest,
        finalRecordDigest: finalRecord.recordDigest,
        dependencyId,
        edgeVersion: expectedDependencyVersion,
        senderIncarnationId: event.sender.incarnationId,
        messageId: event.messageId,
        eventDigest,
        dispositionDigest,
        effectDigest,
      };
      const finalizationBindingDigest = sha256Digest(finalizationBinding);
      const persisted = this.db.prepare(
        `SELECT * FROM git_evidence_dependency_finalizations
         WHERE chain_id = ? OR execution_id = ? OR dependency_id = ? OR
           (sender_incarnation_id = ? AND message_id = ?)`,
      ).get(
        chain.requirement.chainId, executionId, dependencyId,
        event.sender.incarnationId, event.messageId,
      );
      if (persisted) {
        const exact =
          persisted.binding_digest === finalizationBindingDigest &&
          chain.records[3]?.recordDigest === finalRecord.recordDigest &&
          chain.state.trustedComplete && execution.intent.state === "promoted" &&
          expectedRevision === execution.revision - 1;
        if (!exact) {
          throw codedError("threadmesh_git_evidence_dependency_finalization_conflict");
        }
        return {
          execution,
          evidenceRecord: chain.records[3],
          evidenceState: chain.state,
          dependency: this.#dependencyEdge(edge),
          effect,
          finalizationBindingDigest,
          replay: true,
          unlock: false,
        };
      }
      if (execution.intent.state !== "completed-turn-bound") {
        throw codedError("threadmesh_git_evidence_finalization_turn_not_bound");
      }
      this.#assertTurnExecutionCas(execution, expectedRevision);
      if (chain.records.length !== 3) {
        throw codedError("threadmesh_git_evidence_dependency_finalization_conflict");
      }
      this.#insertGitEvidenceRecord(
        finalRecord,
        expectedEvidenceChainRevision,
        expectedEvidenceChainHead,
      );
      const evidenceState = validateGitEvidenceChain(
        chain.requirement,
        [...chain.records, finalRecord],
      );
      const promotedIntent = promoteDurableTurnIntent(execution.intent, {
        expectedEvidenceChainRevision: evidenceState.recordCount,
        expectedEvidenceChainHead: evidenceState.headDigest,
      });
      const promotedExecution = this.#writeTurnTransition(execution, promotedIntent);
      const dependency = this.#satisfyDependencyEdge(
        { dependencyId, expectedVersion: expectedDependencyVersion, event, disposition },
        principal,
        chain.requirement.verifier,
      );
      this.db.prepare(
        `INSERT INTO git_evidence_dependency_finalizations (
           chain_id, execution_id, action_ordinal, action_digest,
           result_digest, final_record_digest, dependency_id, edge_version,
           sender_incarnation_id, message_id, event_digest,
           disposition_digest, effect_digest, binding_digest, finalized_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        chain.requirement.chainId, executionId, actionOrdinal,
        action.actionDigest, action.resultDigest, finalRecord.recordDigest,
        dependencyId, expectedDependencyVersion, event.sender.incarnationId,
        event.messageId, eventDigest, dispositionDigest, effectDigest,
        finalizationBindingDigest, nowIso(this.clock),
      );
      return {
        ...promotedExecution,
        evidenceRecord: finalRecord,
        evidenceState,
        dependency,
        effect,
        finalizationBindingDigest,
        replay: false,
        unlock: dependency.unlock,
      };
    }).immediate();
  }

  abandonTurnExecution(
    executionId,
    { reasonCode, expectedRevision } = {},
    principal,
  ) {
    const marker = { reasonCode };
    return this.#transitionTurnExecution(
      executionId, expectedRevision, principal,
      (snapshot) => abandonDurableTurnIntent(snapshot.intent, marker),
      {
        replayState: "abandoned",
        replayMatch: (intent) => sha256Digest(intent.abandonment) === sha256Digest(marker),
        reconciliation: { state: "abandoned", ...marker },
      },
    );
  }

  getTurnExecution(executionId, principal) {
    const snapshot = this.#turnExecutionSnapshot(executionId);
    this.#assertTurnExecutionReadAuthority(snapshot.row, principal);
    return snapshot;
  }

  // V8 deliberately accepts only completed model-action origins. Authenticated
  // requester kickoff is a separate origin kind and cannot be adopted here.
  publishLifecycleFromCompletedAction(
    executionId,
    { actionOrdinal = 0, expectedTool, event, expectedMaterial } = {},
    principal,
  ) {
    assertLifecycleEvent(event);
    return this.db.transaction(() => {
      const execution = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      const action = execution.actions.find((entry) => entry.ordinal === actionOrdinal);
      const specification = LIFECYCLE_PUBLICATION_TOOLS[expectedTool];
      let argumentsValue = null;
      try { argumentsValue = action ? JSON.parse(action.argsJson) : null; } catch {
        throw codedError("threadmesh_lifecycle_publication_action_mismatch");
      }
      const materialKeys = Object.keys(expectedMaterial ?? {}).sort();
      const expectedKeys = [...(specification?.materialKeys ?? [])].sort();
      const expectedArguments = specification ? {
        sourceEventId: execution.intent.eventId,
        event: boundedLifecycleActionEventBody(event),
        ...expectedMaterial,
      } : null;
      if (
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        !action || action.name !== expectedTool || !action.actionDigest ||
        action.resultStatus !== "completed" || specification?.eventType !== event.eventType ||
        canonicalJson(materialKeys) !== canonicalJson(expectedKeys) ||
        canonicalJson(argumentsValue) !== canonicalJson(expectedArguments) ||
        execution.intent.turnStart?.turnId !== action.turnId ||
        execution.intent.actor.taskId !== event.sender.taskId ||
        execution.intent.actor.incarnationId !== event.sender.incarnationId
      ) throw codedError("threadmesh_lifecycle_publication_action_mismatch");

      const envelope = projectLifecycleEventToEnvelope(event);
      const eventDigest = sha256Digest(event);
      const envelopeDigest = sha256Digest(envelope);
      const binding = {
        executionId,
        actionOrdinal,
        actionDigest: action.actionDigest,
        senderIncarnationId: event.sender.incarnationId,
        messageId: event.messageId,
        eventDigest,
        envelopeDigest,
      };
      const publicationDigest = sha256Digest(binding);
      const existing = this.db.prepare(
        `SELECT * FROM lifecycle_action_publications
         WHERE (execution_id = ? AND action_ordinal = ?) OR
           (sender_incarnation_id = ? AND message_id = ?)`,
      ).get(executionId, actionOrdinal, event.sender.incarnationId, event.messageId);
      if (existing) {
        if (
          existing.publication_digest !== publicationDigest ||
          existing.event_json !== canonicalJson(event)
        ) throw codedError("threadmesh_lifecycle_publication_conflict");
        return {
          replay: true,
          publicationDigest,
          envelopeDigest,
          disposition: this.#getDisposition(event.sender.incarnationId, event.messageId),
        };
      }
      if (this.db.prepare(
        `SELECT 1 FROM messages WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(event.sender.incarnationId, event.messageId)) {
        throw codedError("threadmesh_lifecycle_publication_conflict");
      }
      const submitted = this.submit(envelope, principal);
      if (submitted.replay) throw codedError("threadmesh_lifecycle_publication_conflict");
      this.db.prepare(
        `INSERT INTO lifecycle_action_publications (
           execution_id, action_ordinal, action_digest, sender_incarnation_id,
           message_id, event_json, event_digest, envelope_digest,
           publication_digest, published_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        executionId, actionOrdinal, action.actionDigest,
        event.sender.incarnationId, event.messageId, canonicalJson(event),
        eventDigest, envelopeDigest, publicationDigest, nowIso(this.clock),
      );
      return {
        replay: false,
        publicationDigest,
        envelopeDigest,
        disposition: submitted.disposition,
      };
    }).immediate();
  }

  claimAttentionEvent(
    receiver,
    { claimEpoch, eventCursor, eventId, expectedRevision } = {},
    principal,
  ) {
    assertTaskPrincipal(principal, receiver?.taskId, receiver?.incarnationId);
    return this.db.transaction(() => {
      this.#assertTaskActive(receiver);
      this.#assertAttentionId(claimEpoch, "threadmesh_attention_claim_invalid");
      const event = this.#attentionEventSnapshot(eventCursor, eventId, receiver);
      const existing = this.db.prepare(
        `SELECT * FROM attention_handler_claims
         WHERE claim_epoch = ? OR
           (receiver_task_id = ? AND receiver_incarnation_id = ? AND event_cursor = ?)`,
      ).get(claimEpoch, receiver.taskId, receiver.incarnationId, eventCursor);
      if (existing) {
        if (
          existing.claim_epoch === claimEpoch &&
          existing.event_id === event.eventId &&
          existing.event_digest === event.eventDigest &&
          existing.state === "claimed"
        ) return { claim: this.#projectAttentionClaim(existing), replay: true, acquired: false };
        throw codedError("threadmesh_attention_claim_conflict");
      }
      const cursor = this.#attentionCursorRow(receiver, true);
      this.#assertAttentionRevision(cursor, expectedRevision);
      this.#assertNextAttentionEvent(cursor, event);
      if (cursor.active_claim_epoch !== null || eventCursor <= cursor.committed_cursor) {
        throw codedError("threadmesh_attention_cursor_conflict");
      }
      const at = nowIso(this.clock);
      this.db.prepare(
        `INSERT INTO attention_handler_claims (
           claim_epoch, receiver_task_id, receiver_incarnation_id,
           event_cursor, event_id, sender_incarnation_id, message_id,
           event_digest, state, turn_execution_id, revision,
           claimed_at, completed_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'claimed', NULL, 0, ?, NULL, ?)`,
      ).run(
        claimEpoch, receiver.taskId, receiver.incarnationId,
        eventCursor, event.eventId, event.senderIncarnationId, event.messageId,
        event.eventDigest, at, at,
      );
      const update = this.db.prepare(
        `UPDATE attention_receiver_cursors
         SET active_claim_epoch = ?, active_event_cursor = ?,
             revision = revision + 1, updated_at = ?
         WHERE receiver_task_id = ? AND receiver_incarnation_id = ?
           AND revision = ? AND active_claim_epoch IS NULL`,
      ).run(
        claimEpoch, eventCursor, at, receiver.taskId, receiver.incarnationId,
        expectedRevision,
      );
      if (update.changes !== 1) throw codedError("threadmesh_attention_cursor_conflict");
      return {
        claim: this.#projectAttentionClaim(this.db.prepare(
          "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
        ).get(claimEpoch)),
        cursor: this.#projectAttentionCursor(this.#attentionCursorRow(receiver)),
        replay: false,
        acquired: true,
      };
    }).immediate();
  }

  bindCompletedAttentionHandler(
    claimEpoch,
    { turnExecutionId, expectedRevision } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      if (
        claim.state === "completed-bound" &&
        claim.turn_execution_id === turnExecutionId
      ) return { claim: this.#projectAttentionClaim(claim), replay: true };
      if (claim.state !== "claimed" || claim.revision !== expectedRevision) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      const execution = this.#turnExecutionSnapshot(turnExecutionId);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      const admissionBinding = this.db.prepare(
        `SELECT b.*, a.admission_token FROM context_admission_turn_bindings b
         JOIN admission_claims a USING (sender_incarnation_id, message_id)
         WHERE b.sender_incarnation_id = ? AND b.message_id = ?`,
      ).get(claim.sender_incarnation_id, claim.message_id);
      const exactAdmittedBusinessExecution =
        admissionBinding?.execution_id === turnExecutionId &&
        admissionBinding?.sender_incarnation_id === claim.sender_incarnation_id &&
        admissionBinding?.message_id === claim.message_id &&
        execution.intent.eventId === admissionBinding?.admission_token;
      if (exactAdmittedBusinessExecution) {
        const decisionBinding = this.db.prepare(
          `SELECT 1 FROM attention_route_decision_bindings WHERE claim_epoch = ?`,
        ).get(claimEpoch);
        if (!decisionBinding) {
          throw codedError("threadmesh_attention_handler_decision_binding_missing");
        }
        this.#validatePersistedLifecycleBindings();
      }
      if (
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.actor.taskId !== claim.receiver_task_id ||
        execution.intent.actor.incarnationId !== claim.receiver_incarnation_id ||
        (admissionBinding && !exactAdmittedBusinessExecution) ||
        (!admissionBinding && execution.intent.eventId !== claim.event_id) ||
        execution.intent.messageId !== claim.message_id
      ) throw codedError("threadmesh_attention_handler_binding_mismatch");
      const at = nowIso(this.clock);
      const updated = this.db.prepare(
        `UPDATE attention_handler_claims
         SET state = 'completed-bound', turn_execution_id = ?,
             revision = revision + 1, completed_at = ?, updated_at = ?
         WHERE claim_epoch = ? AND state = 'claimed' AND revision = ?`,
      ).run(turnExecutionId, at, at, claimEpoch, expectedRevision);
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      return {
        claim: this.#projectAttentionClaim(this.#attentionClaimRow(claimEpoch)),
        replay: false,
      };
    }).immediate();
  }

  commitReceiverDecision(
    claimEpoch,
    {
      routeProjection,
      receiverDecisionExecutionId,
      decisionActionOrdinal = 0,
      mailboxClaimToken,
      decision,
      expectedDispositionRevision,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      const execution = this.#turnExecutionSnapshot(receiverDecisionExecutionId);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      const action = execution.actions.find(
        (entry) => entry.ordinal === decisionActionOrdinal,
      );
      let actionArguments = null;
      try { actionArguments = action ? JSON.parse(action.argsJson) : null; } catch {
        throw codedError("threadmesh_receiver_decision_execution_mismatch");
      }
      const message = this.#message(claim.sender_incarnation_id, claim.message_id);
      let persistedEnvelope;
      try { persistedEnvelope = JSON.parse(message.envelope_json); } catch {
        throw codedError("threadmesh_receiver_decision_route_mismatch");
      }
      const publication = this.db.prepare(
        `SELECT * FROM lifecycle_action_publications
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(claim.sender_incarnation_id, claim.message_id);
      let lifecycleEvent;
      try { lifecycleEvent = publication ? JSON.parse(publication.event_json) : null; } catch {
        throw codedError("threadmesh_receiver_decision_route_mismatch");
      }
      if (
        !hasExactKeys(routeProjection, ATTENTION_OFFER_ROUTE_KEYS) ||
        routeProjection.state !== "offered" || routeProjection.offer !== true ||
        routeProjection.messageId !== claim.message_id ||
        routeProjection.reasonCode !== "attention-offer-authorized" ||
        routeProjection.eventType !== lifecycleEvent?.eventType ||
        routeProjection.grantId !== message.grant_id ||
        routeProjection.grantVersion !== message.grant_version ||
        canonicalJson(routeProjection.envelope) !== canonicalJson(persistedEnvelope)
      ) throw codedError("threadmesh_receiver_decision_route_mismatch");
      if (
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.actor.taskId !== claim.receiver_task_id ||
        execution.intent.actor.incarnationId !== claim.receiver_incarnation_id ||
        execution.intent.eventId !== claim.event_id ||
        execution.intent.messageId !== claim.message_id ||
        execution.intent.turnStart?.turnId !== action?.turnId ||
        action?.name !== "threadmesh_decide_offer" || !action.actionDigest ||
        action.resultStatus !== "completed" ||
        canonicalJson(actionArguments) !== canonicalJson({
          messageId: claim.message_id,
          decision,
        })
      ) throw codedError("threadmesh_receiver_decision_execution_mismatch");
      if (!isDecisionReasonAllowed(decision, DEFAULT_DECISION_REASONS[decision])) {
        throw codedError("threadmesh_decision_reason_invalid");
      }
      const routeProjectionDigest = sha256Digest(routeProjection);
      const mailboxClaimTokenDigest = sha256Digest(mailboxClaimToken);
      const existing = this.db.prepare(
        `SELECT * FROM attention_route_decision_bindings WHERE claim_epoch = ? OR
           receiver_decision_execution_id = ?`,
      ).get(claimEpoch, receiverDecisionExecutionId);
      if (existing) {
        let decisionProjection;
        try { decisionProjection = JSON.parse(existing.decision_projection_json); } catch {
          throw codedError("threadmesh_receiver_decision_binding_tampered");
        }
        const candidate = {
          claimEpoch,
          eventDigest: claim.event_digest,
          routeProjectionDigest,
          receiverDecisionExecutionId,
          decisionActionOrdinal,
          decisionActionDigest: action.actionDigest,
          decisionProjectionDigest: sha256Digest(decisionProjection),
          mailboxClaimTokenDigest,
        };
        const decisionAudit = this.db.prepare(
          `SELECT revision, detail_json FROM audit_events
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND event_type = 'receiver-decided' ORDER BY sequence`,
        ).all(claim.sender_incarnation_id, claim.message_id);
        let auditDetails = null;
        try {
          auditDetails = decisionAudit.map((entry) => ({
            revision: entry.revision,
            ...JSON.parse(entry.detail_json),
          }));
        } catch { /* conflict below */ }
        const exactHistoricalAudit = auditDetails?.filter((entry) =>
          entry.revision === decisionProjection.decision?.decisionRevision &&
          entry.decision === decisionProjection.decision?.state &&
          entry.reasonCode === decisionProjection.decision?.reasonCode) ?? [];
        if (
          existing.binding_digest !== sha256Digest(candidate) ||
          existing.route_projection_json !== canonicalJson(routeProjection) ||
          action.resultDigest !== existing.decision_projection_digest ||
          !isDecisionReasonAllowed(
            decisionProjection.decision?.state,
            decisionProjection.decision?.reasonCode,
          ) ||
          exactHistoricalAudit.length !== 1
        ) throw codedError("threadmesh_receiver_decision_binding_conflict");
        return { replay: true, bindingDigest: existing.binding_digest, decisionProjection };
      }
      if (claim.state !== "claimed") {
        throw codedError("threadmesh_receiver_decision_claim_state_mismatch");
      }
      const decisionProjection = {
        messageId: claim.message_id,
        receiver: {
          taskId: claim.receiver_task_id,
          incarnationId: claim.receiver_incarnation_id,
        },
        decision: {
          state: decision,
          reasonCode: DEFAULT_DECISION_REASONS[decision],
          decisionRevision: expectedDispositionRevision + 1,
        },
      };
      const decisionProjectionDigest = sha256Digest(decisionProjection);
      if (action.resultDigest !== decisionProjectionDigest) {
        throw codedError("threadmesh_receiver_decision_result_mismatch");
      }
      const binding = {
        claimEpoch,
        eventDigest: claim.event_digest,
        routeProjectionDigest,
        receiverDecisionExecutionId,
        decisionActionOrdinal,
        decisionActionDigest: action.actionDigest,
        decisionProjectionDigest,
        mailboxClaimTokenDigest,
      };
      const bindingDigest = sha256Digest(binding);
      const disposition = this.acknowledgePending(
        claim.sender_incarnation_id,
        claim.message_id,
        mailboxClaimToken,
        decision,
        expectedDispositionRevision,
        principal,
      );
      if (
        disposition.revision !== decisionProjection.decision.decisionRevision ||
        disposition.decision !== decisionProjection.decision.state ||
        disposition.decisionReasonCode !== decisionProjection.decision.reasonCode
      ) throw codedError("threadmesh_receiver_decision_result_mismatch");
      this.db.prepare(
        `INSERT INTO attention_route_decision_bindings (
           claim_epoch, route_projection_json, route_projection_digest,
           receiver_decision_execution_id, decision_action_ordinal,
           decision_action_digest, decision_projection_json,
           decision_projection_digest, mailbox_claim_token_digest,
           binding_digest, committed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        claimEpoch, canonicalJson(routeProjection), routeProjectionDigest,
        receiverDecisionExecutionId, decisionActionOrdinal, action.actionDigest,
        canonicalJson(decisionProjection), decisionProjectionDigest,
        mailboxClaimTokenDigest, bindingDigest, nowIso(this.clock),
      );
      return { replay: false, bindingDigest, decisionProjection, disposition };
    }).immediate();
  }

  promoteAttentionHandler(
    claimEpoch,
    { expectedClaimRevision, expectedCursorRevision } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      if (claim.state === "promoted") {
        return { claim: this.#projectAttentionClaim(claim), replay: true };
      }
      if (claim.state !== "completed-bound" || claim.revision !== expectedClaimRevision) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      const execution = this.#turnExecutionSnapshot(claim.turn_execution_id);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      if (execution.intent.state !== "promoted") {
        throw codedError("threadmesh_attention_handler_not_promoted");
      }
      const receiver = {
        taskId: claim.receiver_task_id,
        incarnationId: claim.receiver_incarnation_id,
      };
      const cursor = this.#attentionCursorRow(receiver);
      this.#assertAttentionRevision(cursor, expectedCursorRevision);
      if (
        cursor.active_claim_epoch !== claimEpoch ||
        cursor.active_event_cursor !== claim.event_cursor
      ) throw codedError("threadmesh_attention_cursor_conflict");
      const commit = this.#appendAttentionCursorCommit(cursor, {
        toCursor: claim.event_cursor,
        kind: "handler-promoted",
        sourceId: claimEpoch,
        eventDigest: claim.event_digest,
        classificationDigest: null,
      });
      const at = nowIso(this.clock);
      const updated = this.db.prepare(
        `UPDATE attention_handler_claims
         SET state = 'promoted', revision = revision + 1, updated_at = ?
         WHERE claim_epoch = ? AND state = 'completed-bound' AND revision = ?`,
      ).run(at, claimEpoch, expectedClaimRevision);
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      return {
        claim: this.#projectAttentionClaim(this.#attentionClaimRow(claimEpoch)),
        cursor: this.#projectAttentionCursor(this.#attentionCursorRow(receiver)),
        commit,
        replay: false,
      };
    }).immediate();
  }

  commitFinalizedDependencyAttentionHandler(
    claimEpoch,
    {
      dependencyId,
      expectedClaimRevision,
      expectedCursorRevision,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      if (!claim.turn_execution_id) {
        throw codedError("threadmesh_finalized_dependency_attention_handler_unbound");
      }
      const execution = this.#turnExecutionSnapshot(claim.turn_execution_id);
      const currentTask = this.#assertTaskActive({
        taskId: claim.receiver_task_id,
        incarnationId: claim.receiver_incarnation_id,
      });
      const currentMetadata = this.#taskMetadata({
        taskId: claim.receiver_task_id,
        incarnationId: claim.receiver_incarnation_id,
      });
      if (
        execution.row.task_id !== claim.receiver_task_id ||
        execution.row.incarnation_id !== claim.receiver_incarnation_id ||
        !currentTask.adapter_ref_json ||
        sha256Digest(JSON.parse(currentTask.adapter_ref_json)) !==
          execution.row.adapter_ref_digest ||
        ![execution.row.task_revision, execution.row.task_revision + 1]
          .includes(currentMetadata.revision) ||
        (currentMetadata.revision === execution.row.task_revision + 1 &&
          currentTask.state !== "ready")
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_actor_mismatch");
      }
      const action = execution.actions[0];
      let args;
      try { args = action ? JSON.parse(action.argsJson) : null; } catch {
        throw codedError("threadmesh_finalized_dependency_attention_decision_mismatch");
      }
      if (
        execution.intent.state !== "completed-turn-bound" ||
        execution.intent.actor.taskId !== claim.receiver_task_id ||
        execution.intent.actor.incarnationId !== claim.receiver_incarnation_id ||
        execution.intent.eventId !== claim.event_id ||
        execution.intent.messageId !== claim.message_id ||
        execution.actions.length !== 1 || action?.ordinal !== 0 ||
        action?.name !== "threadmesh_decide_offer" ||
        action?.resultStatus !== "completed" ||
        canonicalJson(args) !== canonicalJson({
          messageId: claim.message_id,
          decision: args?.decision,
        }) || args?.decision !== "accepted"
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_decision_mismatch");
      }
      const decisionAuditRows = this.db.prepare(
        `SELECT revision, detail_json FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
           AND event_type = 'receiver-decided'
         ORDER BY sequence`,
      ).all(claim.sender_incarnation_id, claim.message_id);
      let decisionAudit;
      try {
        decisionAudit = decisionAuditRows.length === 1
          ? { ...decisionAuditRows[0], detail: JSON.parse(decisionAuditRows[0].detail_json) }
          : null;
      } catch {
        throw codedError("threadmesh_finalized_dependency_attention_decision_mismatch");
      }
      const decisionProjection = decisionAudit ? {
        messageId: claim.message_id,
        receiver: {
          taskId: claim.receiver_task_id,
          incarnationId: claim.receiver_incarnation_id,
        },
        decision: {
          state: decisionAudit.detail.decision,
          reasonCode: decisionAudit.detail.reasonCode,
          decisionRevision: decisionAudit.revision,
        },
      } : null;
      if (
        !decisionProjection ||
        decisionProjection.decision.state !== args.decision ||
        action.resultDigest !== sha256Digest(decisionProjection)
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_decision_result_mismatch");
      }
      const admission = this.db.prepare(
        `SELECT * FROM admission_claims
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(claim.sender_incarnation_id, claim.message_id);
      let admittedRef = null;
      try {
        admittedRef = admission?.adapter_ref_json
          ? JSON.parse(admission.adapter_ref_json)
          : null;
      } catch {
        throw codedError("threadmesh_finalized_dependency_attention_admission_mismatch");
      }
      if (
        !admission || admission.state !== "completed" ||
        admission.adapter_ref_digest !== execution.row.adapter_ref_digest ||
        sha256Digest(admittedRef) !== execution.row.adapter_ref_digest ||
        admittedRef?.threadId !== execution.intent.actor.threadId ||
        admittedRef?.snapshotDigest !== execution.intent.actor.snapshotDigest
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_admission_mismatch");
      }
      const cursor = this.#attentionCursorRow({
        taskId: claim.receiver_task_id,
        incarnationId: claim.receiver_incarnation_id,
      });
      const finalization = this.db.prepare(
        `SELECT * FROM git_evidence_dependency_finalizations
         WHERE dependency_id = ? AND sender_incarnation_id = ? AND message_id = ?`,
      ).get(dependencyId, claim.sender_incarnation_id, claim.message_id);
      const satisfaction = this.db.prepare(
        `SELECT * FROM dependency_satisfactions
         WHERE dependency_id = ? AND sender_incarnation_id = ? AND message_id = ?`,
      ).get(dependencyId, claim.sender_incarnation_id, claim.message_id);
      const edge = this.#currentDependencyEdgeRow(dependencyId);
      if (
        !finalization || !satisfaction ||
        finalization.edge_version !== edge.version ||
        satisfaction.edge_version !== edge.version ||
        edge.dependent_task_id !== claim.receiver_task_id ||
        edge.dependent_incarnation_id !== claim.receiver_incarnation_id
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_finalization_missing");
      }
      let finalEvent;
      let disposition;
      try {
        finalEvent = JSON.parse(satisfaction.event_json);
        disposition = JSON.parse(satisfaction.disposition_json);
      } catch {
        throw codedError("threadmesh_finalized_dependency_attention_finalization_mismatch");
      }
      const satisfiedAt = Date.parse(satisfaction.satisfied_at);
      if (
        !Number.isFinite(satisfiedAt) ||
        satisfaction.satisfied_at !== disposition.updatedAt
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_finalization_mismatch");
      }
      const effect = evaluateDependencyEffect({
        event: finalEvent,
        disposition,
        trustAnchors: this.#verificationTrustAnchors,
        dependencyEdge: JSON.parse(edge.edge_json),
        currentDependencyEdge: JSON.parse(edge.edge_json),
        now: satisfiedAt,
      });
      if (
        finalEvent.eventType !== "dependency-satisfied" ||
        finalEvent.messageId !== claim.message_id ||
        finalEvent.sender.incarnationId !== claim.sender_incarnation_id ||
        !sameTaskRef(finalEvent.target, {
          taskId: claim.receiver_task_id,
          incarnationId: claim.receiver_incarnation_id,
        }) ||
        disposition.messageId !== claim.message_id ||
        disposition.decision?.state !== args.decision ||
        !sameTaskRef(disposition.decision?.decidedBy?.task, {
          taskId: claim.receiver_task_id,
          incarnationId: claim.receiver_incarnation_id,
        }) ||
        disposition.outcome?.state !== "externally-verified" ||
        disposition.outcome?.verificationAttestations?.length !== 1 ||
        satisfaction.disposition_digest !== sha256Digest(disposition) ||
        finalization.event_digest !== sha256Digest(finalEvent) ||
        finalization.disposition_digest !== satisfaction.disposition_digest ||
        finalization.effect_digest !== sha256Digest(effect) || !effect.unlock
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_finalization_mismatch");
      }
      verifyExternallyVerifiedDisposition(disposition, this.#verificationTrustAnchors);
      const liveDisposition = this.#message(
        claim.sender_incarnation_id, claim.message_id,
      );
      if (
        liveDisposition.decision_state !== args.decision ||
        liveDisposition.decision_reason_code !==
          decisionProjection.decision.reasonCode ||
        liveDisposition.outcome_state !== "externally-verified"
      ) {
        throw codedError("threadmesh_finalized_dependency_attention_decision_mismatch");
      }
      if (claim.state === "promoted") {
        return {
          claim: this.#projectAttentionClaim(claim),
          cursor: this.#projectAttentionCursor(cursor),
          replay: true,
        };
      }
      if (
        claim.state !== "completed-bound" ||
        claim.revision !== expectedClaimRevision
      ) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      this.#assertAttentionRevision(cursor, expectedCursorRevision);
      if (
        cursor.active_claim_epoch !== claimEpoch ||
        cursor.active_event_cursor !== claim.event_cursor
      ) throw codedError("threadmesh_attention_cursor_conflict");
      const commit = this.#appendAttentionCursorCommit(cursor, {
        toCursor: claim.event_cursor,
        kind: "handler-promoted",
        sourceId: claimEpoch,
        eventDigest: claim.event_digest,
        classificationDigest: null,
      });
      const updated = this.db.prepare(
        `UPDATE attention_handler_claims
         SET state = 'promoted', revision = revision + 1, updated_at = ?
         WHERE claim_epoch = ? AND state = 'completed-bound' AND revision = ?`,
      ).run(nowIso(this.clock), claimEpoch, expectedClaimRevision);
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      return {
        claim: this.#projectAttentionClaim(this.#attentionClaimRow(claimEpoch)),
        cursor: this.#projectAttentionCursor(this.#attentionCursorRow({
          taskId: claim.receiver_task_id,
          incarnationId: claim.receiver_incarnation_id,
        })),
        commit,
        replay: false,
      };
    }).immediate();
  }

  abandonAttentionHandler(
    claimEpoch,
    { expectedRevision } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      if (claim.state === "abandoned") {
        return { claim: this.#projectAttentionClaim(claim), replay: true };
      }
      if (!["claimed", "completed-bound"].includes(claim.state) ||
          claim.revision !== expectedRevision) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      const updated = this.db.prepare(
        `UPDATE attention_handler_claims
         SET state = 'abandoned', revision = revision + 1, updated_at = ?
         WHERE claim_epoch = ? AND revision = ?`,
      ).run(nowIso(this.clock), claimEpoch, expectedRevision);
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      return {
        claim: this.#projectAttentionClaim(this.#attentionClaimRow(claimEpoch)),
        replay: false,
      };
    }).immediate();
  }

  reopenAbandonedAttentionHandler(
    claimEpoch,
    { expectedRevision } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const claim = this.#attentionClaimRow(claimEpoch);
      assertTaskPrincipal(
        principal, claim.receiver_task_id, claim.receiver_incarnation_id,
      );
      if (claim.state !== "abandoned" || claim.revision !== expectedRevision) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      const cursor = this.#attentionCursorRow({
        taskId: claim.receiver_task_id,
        incarnationId: claim.receiver_incarnation_id,
      });
      if (cursor.active_claim_epoch !== claimEpoch) {
        throw codedError("threadmesh_attention_cursor_conflict");
      }
      const updated = this.db.prepare(
        `UPDATE attention_handler_claims
         SET state = CASE WHEN turn_execution_id IS NULL
               THEN 'claimed' ELSE 'completed-bound' END,
             revision = revision + 1, updated_at = ?
         WHERE claim_epoch = ? AND state = 'abandoned' AND revision = ?`,
      ).run(nowIso(this.clock), claimEpoch, expectedRevision);
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_claim_revision_conflict");
      }
      return {
        claim: this.#projectAttentionClaim(this.#attentionClaimRow(claimEpoch)),
        replay: false,
      };
    }).immediate();
  }

  advanceAttentionCursor(
    receiver,
    {
      eventCursor, eventId, classificationDigest,
      expectedRevision,
    } = {},
    principal,
  ) {
    assertTaskPrincipal(principal, receiver?.taskId, receiver?.incarnationId);
    if (!/^sha256:[a-f0-9]{64}$/u.test(classificationDigest ?? "")) {
      throw codedError("threadmesh_attention_classification_invalid");
    }
    return this.db.transaction(() => {
      this.#assertTaskActive(receiver);
      const event = this.#attentionEventSnapshot(eventCursor, eventId, receiver);
      const cursor = this.#attentionCursorRow(receiver, true);
      const existing = this.db.prepare(
        `SELECT * FROM attention_cursor_commits
         WHERE receiver_task_id = ? AND receiver_incarnation_id = ?
           AND source_id = ?`,
      ).get(receiver.taskId, receiver.incarnationId, eventId);
      if (existing) {
        if (
          existing.kind === "irrelevant-skip" &&
          existing.to_cursor === eventCursor &&
          existing.event_digest === event.eventDigest &&
          existing.classification_digest === classificationDigest
        ) return { cursor: this.#projectAttentionCursor(cursor), replay: true };
        throw codedError("threadmesh_attention_cursor_commit_conflict");
      }
      this.#assertAttentionRevision(cursor, expectedRevision);
      this.#assertNextAttentionEvent(cursor, event);
      if (cursor.active_claim_epoch !== null || eventCursor <= cursor.committed_cursor) {
        throw codedError("threadmesh_attention_cursor_conflict");
      }
      const commit = this.#appendAttentionCursorCommit(cursor, {
        toCursor: eventCursor,
        kind: "irrelevant-skip",
        sourceId: eventId,
        eventDigest: event.eventDigest,
        classificationDigest,
      });
      return {
        cursor: this.#projectAttentionCursor(this.#attentionCursorRow(receiver)),
        commit,
        replay: false,
      };
    }).immediate();
  }

  getAttentionCursor(receiver, principal) {
    if (!isTaskPrincipal(principal, receiver?.taskId, receiver?.incarnationId)) {
      assertControlPlanePrincipal(principal);
      if (principal.kind !== "policy") {
        const task = this.#taskRecord(receiver);
        if (
          task.owner_kind !== principal.kind ||
          task.owner_principal_id !== principal.principalId
        ) throw codedError("threadmesh_attention_cursor_read_not_authorized");
      }
    }
    const cursor = this.#attentionCursorRow(receiver, true);
    const activeClaim = cursor.active_claim_epoch === null
      ? null
      : this.#projectAttentionClaim(this.#attentionClaimRow(cursor.active_claim_epoch));
    return { cursor: this.#projectAttentionCursor(cursor), activeClaim };
  }

  createDependencyEdge(edge, principal) {
    assertControlPlanePrincipal(principal);
    const normalized = normalizeDependencyEdge(edge, this.clock);
    return this.db.transaction(() => {
      for (const ref of [normalized.prerequisite, normalized.dependent]) {
        const task = this.#assertTaskActive(ref);
        if (
          principal.kind !== "policy" &&
          (task.owner_kind !== principal.kind ||
            task.owner_principal_id !== principal.principalId)
        ) {
          throw codedError(
            "threadmesh_dependency_edge_scope_not_authorized",
            ref.taskId,
          );
        }
      }
      if (normalized.expiresAt && Date.parse(normalized.expiresAt) <= this.clock()) {
        throw codedError("threadmesh_dependency_edge_expired");
      }
      const current = this.#currentDependencyEdgeRow(normalized.dependencyId, false);
      if (current) {
        const replayCandidate = edge.createdAt === undefined
          ? { ...normalized, createdAt: JSON.parse(current.edge_json).createdAt }
          : normalized;
        const same =
          current.version === normalized.version &&
          current.authority_kind === principal.kind &&
          current.authority_principal_id === principal.principalId &&
          canonicalJson(JSON.parse(current.edge_json)) ===
            canonicalJson(replayCandidate);
        if (same) {
          return { ...this.#dependencyEdge(current), replay: true };
        }
        if (
          principal.kind !== "policy" &&
          (current.authority_kind !== principal.kind ||
            current.authority_principal_id !== principal.principalId)
        ) {
          throw codedError("threadmesh_dependency_edge_not_authorized");
        }
        if (normalized.version !== current.version + 1) {
          throw codedError("threadmesh_dependency_edge_version_conflict");
        }
        const satisfied = this.db
          .prepare("SELECT 1 FROM dependency_satisfactions WHERE dependency_id = ?")
          .get(normalized.dependencyId);
        if (satisfied) {
          throw codedError("threadmesh_dependency_already_satisfied");
        }
      } else if (normalized.version !== 1) {
        throw codedError("threadmesh_dependency_edge_version_conflict");
      }
      this.db
        .prepare(
          `INSERT INTO dependency_edges (
             dependency_id, version, prerequisite_task_id,
             prerequisite_incarnation_id, dependent_task_id,
             dependent_incarnation_id, relationship_id,
             expected_event_type, authority_kind, authority_principal_id,
             freshness_json, edge_json, status, created_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`,
        )
        .run(
          normalized.dependencyId,
          normalized.version,
          normalized.prerequisite.taskId,
          normalized.prerequisite.incarnationId,
          normalized.dependent.taskId,
          normalized.dependent.incarnationId,
          normalized.relationshipId ?? null,
          normalized.expectedEventType,
          principal.kind,
          principal.principalId,
          canonicalJson(normalized.freshness),
          canonicalJson(normalized),
          normalized.createdAt,
          normalized.expiresAt ?? null,
        );
      return {
        ...this.#dependencyEdge(
          this.#currentDependencyEdgeRow(normalized.dependencyId),
        ),
        replay: false,
      };
    }).immediate();
  }

  getDependencyEdge(dependencyId, principal, version = null) {
    const row = version === null
      ? this.#currentDependencyEdgeRow(dependencyId)
      : this.db
          .prepare(
            `SELECT * FROM dependency_edges
             WHERE dependency_id = ? AND version = ?`,
          )
          .get(dependencyId, version);
    if (!row) throw codedError("threadmesh_dependency_edge_not_found", dependencyId);
    this.#assertDependencyReadAuthority(row, principal);
    return this.#dependencyEdge(row);
  }

  revokeDependencyEdge(dependencyId, expectedVersion, principal) {
    assertControlPlanePrincipal(principal);
    return this.db.transaction(() => {
      const current = this.#currentDependencyEdgeRow(dependencyId);
      this.#assertDependencyControlAuthority(current, principal);
      if (
        current.status === "revoked" &&
        [current.version, current.version - 1].includes(expectedVersion)
      ) {
        return { ...this.#dependencyEdge(current), replay: true };
      }
      if (current.version !== expectedVersion) {
        throw codedError("threadmesh_dependency_edge_version_conflict");
      }
      if (
        this.db
          .prepare("SELECT 1 FROM dependency_satisfactions WHERE dependency_id = ?")
          .get(dependencyId)
      ) {
        throw codedError("threadmesh_dependency_already_satisfied");
      }
      const at = nowIso(this.clock);
      const previous = JSON.parse(current.edge_json);
      const revoked = {
        ...previous,
        version: current.version + 1,
        createdAt: at,
        revokedAt: at,
      };
      this.db
        .prepare(
          `INSERT INTO dependency_edges (
             dependency_id, version, prerequisite_task_id,
             prerequisite_incarnation_id, dependent_task_id,
             dependent_incarnation_id, relationship_id,
             expected_event_type, authority_kind, authority_principal_id,
             freshness_json, edge_json, status, created_at, expires_at,
             revoked_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'revoked', ?, ?, ?)`,
        )
        .run(
          dependencyId,
          revoked.version,
          current.prerequisite_task_id,
          current.prerequisite_incarnation_id,
          current.dependent_task_id,
          current.dependent_incarnation_id,
          current.relationship_id,
          current.expected_event_type,
          principal.kind,
          principal.principalId,
          current.freshness_json,
          canonicalJson(revoked),
          at,
          current.expires_at,
          at,
        );
      return {
        ...this.#dependencyEdge(this.#currentDependencyEdgeRow(dependencyId)),
        replay: false,
      };
    }).immediate();
  }

  satisfyDependencyEdge(
    input,
    principal,
  ) {
    return this.#satisfyDependencyEdge(input, principal);
  }

  #satisfyDependencyEdge(
    { dependencyId, expectedVersion, event, disposition },
    principal,
    frozenVerifier = null,
  ) {
    assertLifecycleEvent(event);
    assertProtocolObject("disposition", disposition);
    const projectedEnvelope = projectLifecycleEventToEnvelope(event);
    const dispositionDigest = sha256Digest(disposition);
    return this.db.transaction(() => {
      const current = this.#currentDependencyEdgeRow(dependencyId);
      if (frozenVerifier === null) {
        this.#assertDependencySatisfactionAuthority(current, principal);
        if (this.db.prepare(
          "SELECT 1 FROM git_evidence_dependency_bindings WHERE dependency_id = ?",
        ).get(dependencyId)) {
          throw codedError("threadmesh_dependency_git_evidence_finalize_required");
        }
      } else {
        assertTaskPrincipal(
          principal, frozenVerifier.taskId, frozenVerifier.incarnationId,
        );
        if (
          current.prerequisite_task_id !== frozenVerifier.taskId ||
          current.prerequisite_incarnation_id !== frozenVerifier.incarnationId
        ) {
          throw codedError("threadmesh_git_evidence_dependency_binding_mismatch");
        }
      }
      const existing = this.db
        .prepare("SELECT * FROM dependency_satisfactions WHERE dependency_id = ?")
        .get(dependencyId);
      if (existing) {
        const same =
          existing.edge_version === expectedVersion &&
          existing.sender_incarnation_id === event.sender.incarnationId &&
          existing.message_id === event.messageId &&
          existing.disposition_digest === dispositionDigest &&
          canonicalJson(JSON.parse(existing.event_json)) === canonicalJson(event);
        if (!same) throw codedError("threadmesh_dependency_satisfaction_conflict");
        return {
          ...this.#dependencyEdge(current),
          replay: true,
          unlock: false,
        };
      }
      const messageBinding = this.db
        .prepare(
          `SELECT dependency_id FROM dependency_satisfactions
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(event.sender.incarnationId, event.messageId);
      if (messageBinding) {
        throw codedError(
          "threadmesh_dependency_satisfaction_conflict",
          messageBinding.dependency_id,
        );
      }
      if (current.version !== expectedVersion) {
        throw codedError("threadmesh_dependency_edge_version_conflict");
      }
      if (current.status !== "waiting" || current.revoked_at) {
        throw codedError("threadmesh_dependency_edge_inactive");
      }
      if (current.expires_at && Date.parse(current.expires_at) <= this.clock()) {
        throw codedError("threadmesh_dependency_edge_expired");
      }
      if (Date.parse(event.expiresAt) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      this.#assertTaskActive({
        taskId: current.prerequisite_task_id,
        incarnationId: current.prerequisite_incarnation_id,
      });
      this.#assertTaskActive({
        taskId: current.dependent_task_id,
        incarnationId: current.dependent_incarnation_id,
      });

      const row = this.#message(event.sender.incarnationId, event.messageId);
      this.#assertCurrentAuthorization(row);
      if (canonicalJson(JSON.parse(row.envelope_json)) !== canonicalJson(projectedEnvelope)) {
        throw codedError("threadmesh_dependency_event_binding_mismatch");
      }
      const receiver = {
        taskId: row.target_task_id,
        incarnationId: row.target_incarnation_id,
      };
      if (
        row.decision_state !== "accepted" ||
        disposition.messageId !== row.message_id ||
        !sameTaskRef(disposition.receiver, receiver) ||
        disposition.revision !== row.revision + 1 ||
        disposition.delivery.state !== row.delivery_state ||
        disposition.decision.state !== row.decision_state ||
        !sameTaskRef(disposition.decision.decidedBy?.task, receiver)
      ) {
        throw codedError("threadmesh_dependency_disposition_binding_mismatch");
      }
      this.#assertDependencyFreshness(current, event);
      verifyExternallyVerifiedDisposition(
        disposition,
        this.#verificationTrustAnchors,
      );

      const edge = JSON.parse(current.edge_json);
      const effect = evaluateDependencyEffect({
        event,
        disposition,
        trustAnchors: this.#verificationTrustAnchors,
        dependencyEdge: edge,
        currentDependencyEdge: edge,
        now: this.clock(),
      });
      if (!effect.unlock) {
        throw codedError("threadmesh_dependency_not_satisfied", effect.reasonCode);
      }

      const updated = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1,
             outcome_state = 'externally-verified', updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND revision = ? AND decision_state = 'accepted'
             AND outcome_state <> 'externally-verified'`,
        )
        .run(
          disposition.updatedAt,
          event.sender.incarnationId,
          event.messageId,
          row.revision,
        );
      if (updated.changes !== 1) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      this.db
        .prepare(
          `INSERT INTO dependency_satisfactions (
             dependency_id, edge_version, sender_incarnation_id, message_id,
             event_json, disposition_json, disposition_digest, satisfied_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          dependencyId,
          expectedVersion,
          event.sender.incarnationId,
          event.messageId,
          canonicalJson(event),
          canonicalJson(disposition),
          dispositionDigest,
          disposition.updatedAt,
        );
      const remainingDependency = this.db
        .prepare(
          `SELECT edge.dependency_id
           FROM dependency_edges AS edge
           JOIN (
             SELECT dependency_id, MAX(version) AS version
             FROM dependency_edges
             GROUP BY dependency_id
           ) AS current_edge
             ON current_edge.dependency_id = edge.dependency_id
            AND current_edge.version = edge.version
           LEFT JOIN dependency_satisfactions AS satisfaction
             ON satisfaction.dependency_id = edge.dependency_id
            AND satisfaction.edge_version = edge.version
           WHERE edge.dependent_task_id = ?
             AND edge.dependent_incarnation_id = ?
             AND edge.status = 'waiting'
             AND edge.revoked_at IS NULL
             AND satisfaction.dependency_id IS NULL
           LIMIT 1`,
        )
        .get(current.dependent_task_id, current.dependent_incarnation_id);
      let unlock = false;
      if (!remainingDependency) {
        const dependentMetadata = this.#taskMetadata({
          taskId: current.dependent_task_id,
          incarnationId: current.dependent_incarnation_id,
        });
        const taskState = this.db
          .prepare(
            `UPDATE tasks SET state = 'ready'
             WHERE task_id = ? AND incarnation_id = ?
               AND state IN ('waiting', 'idle')`,
          )
          .run(current.dependent_task_id, current.dependent_incarnation_id);
        if (taskState.changes === 1) {
          const taskRevision = this.db
            .prepare(
              `UPDATE task_metadata SET revision = revision + 1
               WHERE task_id = ? AND incarnation_id = ? AND revision = ?`,
            )
            .run(
              current.dependent_task_id,
              current.dependent_incarnation_id,
              dependentMetadata.revision,
            );
          if (taskRevision.changes !== 1) {
            throw codedError("threadmesh_revision_conflict");
          }
          unlock = true;
        }
      }
      this.#audit(
        event.sender.incarnationId,
        event.messageId,
        "dependency-satisfied",
        disposition.revision,
        {
          dependencyId,
          edgeVersion: expectedVersion,
          dispositionDigest,
          unlock,
          remainingDependencyId: remainingDependency?.dependency_id ?? null,
        },
      );
      return {
        ...this.#dependencyEdge(current),
        status: "satisfied",
        satisfiedAt: disposition.updatedAt,
        satisfaction: {
          senderIncarnationId: event.sender.incarnationId,
          messageId: event.messageId,
          dispositionDigest,
        },
        replay: false,
        unlock,
      };
    }).immediate();
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
    const metadata = this.#taskMetadata(taskRef);
    return {
      taskId: task.task_id,
      incarnationId: task.incarnation_id,
      harness: task.harness,
      state: task.state,
      adapterRef: task.adapter_ref_json ? JSON.parse(task.adapter_ref_json) : null,
      runtime: runtimeSnapshot(metadata),
      revision: metadata.revision,
    };
  }

  updateTaskState(taskRef, state, expectedRevision, principal) {
    if (typeof state !== "string" || state.length === 0 || state.length > 64) {
      throw codedError("threadmesh_task_state_invalid");
    }
    return this.db.transaction(() => {
      const task = this.#taskRecord(taskRef);
      this.#assertTaskOwnerOrSelf(task, principal);
      const metadata = this.#taskMetadata(taskRef);
      if (metadata.retired_at) throw codedError("threadmesh_task_retired");
      if (metadata.revision !== expectedRevision) {
        throw codedError("threadmesh_revision_conflict");
      }
      this.db
        .prepare(
          `UPDATE tasks SET state = ?
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .run(state, taskRef.taskId, taskRef.incarnationId);
      const revision = this.db
        .prepare(
          `UPDATE task_metadata SET revision = revision + 1
           WHERE task_id = ? AND incarnation_id = ? AND revision = ?`,
        )
        .run(taskRef.taskId, taskRef.incarnationId, expectedRevision);
      if (revision.changes !== 1) throw codedError("threadmesh_revision_conflict");
      return this.getTask(taskRef, principal);
    }).immediate();
  }

  updateTaskRuntime(taskRef, runtime, expectedRevision, principal) {
    assertRuntimeSnapshot(runtime, false);
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
          `UPDATE task_metadata SET revision = revision + 1,
             run_id = ?, objective_version = ?, checkpoint = ?
           WHERE task_id = ? AND incarnation_id = ? AND revision = ?`,
        )
        .run(
          runtime.runId ?? null,
          runtime.objectiveVersion ?? null,
          runtime.checkpoint ?? null,
          taskRef.taskId,
          taskRef.incarnationId,
          expectedRevision,
        );
      if (result.changes !== 1) throw codedError("threadmesh_revision_conflict");
      return this.getTask(taskRef, principal);
    }).immediate();
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
    assertRuntimeSnapshot(next?.runtime, true);
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
          `INSERT INTO task_metadata (
             task_id, incarnation_id, revision, run_id,
             objective_version, checkpoint
           ) VALUES (?, ?, 0, ?, ?, ?)`,
        )
        .run(
          next.taskId,
          next.incarnationId,
          next.runtime?.runId ?? null,
          next.runtime?.objectiveVersion ?? null,
          next.runtime?.checkpoint ?? null,
        );
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
    const grant = createEffectiveGrant(draft, decision, principal);
    this.#assertGrantAuthority(grant, principal);
    return this.db.transaction(() => {
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
      const installed = this.#installGrant(grant, principal);
      if (decision?.proposalId) {
        const approved = this.db
          .prepare(
            `UPDATE relationship_proposals SET status = 'approved'
             WHERE proposal_id = ? AND status = 'pending'`,
          )
          .run(decision.proposalId);
        if (approved.changes !== 1) {
          throw codedError("threadmesh_relationship_proposal_not_pending");
        }
      }
      return installed;
    }).immediate();
  }

  installGrant(grant, principal) {
    this.#assertGrantAuthority(grant, principal);
    return this.db.transaction(() => this.#installGrant(grant, principal)).immediate();
  }

  #assertGrantAuthority(grant, principal) {
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
  }

  #installGrant(grant, principal) {
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
      const queued = this.db
        .prepare(
          `SELECT m.sender_incarnation_id, m.message_id, m.envelope_json,
                  d.revision, d.delivery_state, d.decision_state
           FROM messages m JOIN dispositions d
             USING (sender_incarnation_id, message_id)
           LEFT JOIN adapter_submissions s
             USING (sender_incarnation_id, message_id)
           WHERE m.grant_id = ? AND m.grant_version = ?
             AND d.delivery_state NOT IN ('adapter-submitted', 'failed', 'expired')
             AND d.decision_state IN ('pending', 'deferred', 'accepted')
             AND COALESCE(s.state, '') NOT IN ('outcome-unknown', 'receipt-recorded')`,
        )
        .all(grantId, grant.grant_version)
        .filter((message) =>
          isStateChangingIntent(JSON.parse(message.envelope_json).intent),
        );
      for (const message of queued) {
        if (
          !isDispositionTransitionAllowed(
            "decision",
            message.decision_state,
            "revoked",
          )
        ) {
          throw codedError("threadmesh_revision_or_state_conflict");
        }
        const updated = this.db
          .prepare(
          `UPDATE dispositions SET revision = revision + 1,
               decision_state = 'revoked', decision_reason_code = 'revoked',
               updated_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ?
               AND revision = ?
               AND decision_state IN ('pending', 'deferred', 'accepted')
               AND delivery_state NOT IN ('adapter-submitted', 'failed', 'expired')`,
          )
          .run(
            revokedAt,
            message.sender_incarnation_id,
            message.message_id,
            message.revision,
          );
        if (updated.changes === 1) {
          this.#audit(
            message.sender_incarnation_id,
            message.message_id,
            "authorization-revoked",
            message.revision + 1,
            { grantId, grantVersion: grant.grant_version },
          );
        }
      }
      return {
        grantId,
        grantVersion: grant.grant_version,
        revokedAt,
        invalidatedMessages: queued.length,
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
          `SELECT m.*, d.revision, d.delivery_state, d.decision_state,
                  d.decision_reason_code, d.delivery_failure_reason,
                  d.outcome_state
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
             envelope_digest, envelope_json, expires_at, created_at,
             claim_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          envelope.claimStatus,
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
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state,
                d.decision_reason_code, d.delivery_failure_reason,
                d.outcome_state,
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

  respond(
    senderIncarnationId,
    messageId,
    decision,
    expectedRevision,
    principal,
    reasonCode = DEFAULT_DECISION_REASONS[decision],
  ) {
    if (!isDecisionReasonAllowed(decision, reasonCode)) {
      throw codedError("threadmesh_decision_reason_invalid", `${decision}:${reasonCode}`);
    }
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      if (["accepted", "deferred"].includes(decision)) {
        this.#assertCurrentAuthorization(row);
      }
      if (decision !== "expired" && Date.parse(row.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      if (row.revision !== expectedRevision) {
        throw codedError("threadmesh_revision_conflict");
      }
      if (!isDispositionTransitionAllowed("decision", row.decision_state, decision)) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      const result = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1,
             decision_state = ?, decision_reason_code = ?, updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
             AND decision_state = ?`,
        )
        .run(
          decision,
          reasonCode,
          nowIso(this.clock),
          senderIncarnationId,
          messageId,
          expectedRevision,
          row.decision_state,
        );
      if (result.changes !== 1) throw codedError("threadmesh_revision_or_state_conflict");
      const updated = this.#getDisposition(senderIncarnationId, messageId);
      this.#audit(senderIncarnationId, messageId, "receiver-decided", updated.revision, {
        decision,
        reasonCode,
      });
      return updated;
    }).immediate();
  }

  failDelivery(
    senderIncarnationId,
    messageId,
    expectedRevision,
    failureReason,
    principal,
  ) {
    if (typeof failureReason !== "string" || failureReason.length === 0) {
      throw codedError("threadmesh_delivery_failure_reason_invalid");
    }
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      if (
        row.revision !== expectedRevision ||
        !isDispositionTransitionAllowed("delivery", row.delivery_state, "failed")
      ) {
        throw codedError("threadmesh_revision_or_state_conflict");
      }
      const unknown = this.db
        .prepare(
          `SELECT 1 FROM adapter_submissions
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND state IN ('outcome-unknown', 'receipt-recorded')`,
        )
        .get(senderIncarnationId, messageId);
      if (unknown) throw codedError("threadmesh_external_outcome_unknown");
      const at = nowIso(this.clock);
      const result = this.db
        .prepare(
          `UPDATE dispositions SET revision = revision + 1,
             delivery_state = 'failed', delivery_failure_reason = ?, updated_at = ?
           WHERE sender_incarnation_id = ? AND message_id = ?
             AND revision = ? AND delivery_state = ?`,
        )
        .run(
          failureReason.slice(0, 2000),
          at,
          senderIncarnationId,
          messageId,
          expectedRevision,
          row.delivery_state,
        );
      if (result.changes !== 1) throw codedError("threadmesh_revision_or_state_conflict");
      const updated = this.#getDisposition(senderIncarnationId, messageId);
      this.#audit(senderIncarnationId, messageId, "delivery-failed", updated.revision, {
        failureReason: failureReason.slice(0, 2000),
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
      const adapterRef = assertContextAdapterRef(JSON.parse(task.adapter_ref_json));
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
      const admission = {
        decision: "accepted",
        receiverIncarnationId: envelope.target.incarnationId,
        revision: expectedRevision,
      };
      return {
        admissionToken,
        adapterRef,
        envelope,
        admission,
        revision: expectedRevision,
        rendering: renderRegisteredPeerContext(envelope),
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
      const adapterRef = assertContextAdapterRef(JSON.parse(claim.adapter_ref_json));
      const projectedAdapterEvidence = projectContextAdapterEvidence(
        adapterRef,
        adapterEvidence,
      );
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
        adapterEvidence: projectedAdapterEvidence,
      });
      return disposition;
    }).immediate();
  }

  confirmContextAdmissionFromTurn(
    senderIncarnationId,
    messageId,
    {
      executionId,
      expectedRevision,
      admissionToken,
    } = {},
    principal,
  ) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      const execution = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(execution, principal);
      let completedBinding;
      try {
        completedBinding = execution.row.receipt_json
          ? JSON.parse(execution.row.receipt_json)
          : null;
      } catch {
        throw codedError("threadmesh_context_admission_turn_receipt_mismatch");
      }
      const claim = this.db.prepare(
        `SELECT * FROM admission_claims
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(senderIncarnationId, messageId);
      let adapterRef;
      try { adapterRef = claim?.adapter_ref_json ? JSON.parse(claim.adapter_ref_json) : null; } catch {
        throw codedError("threadmesh_context_admission_turn_ref_mismatch");
      }
      const evidence = completedBinding?.evidence;
      const receipt = completedBinding?.receipt;
      const projectedEvidence = adapterRef
        ? projectContextAdapterEvidence(assertContextAdapterRef(adapterRef), evidence)
        : null;
      if (
        !claim ||
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.actor.taskId !== row.target_task_id ||
        execution.intent.actor.incarnationId !== row.target_incarnation_id ||
        execution.intent.messageId !== messageId ||
        execution.intent.eventId !== claim.admission_token ||
        execution.intent.actor.threadId !== adapterRef?.threadId ||
        execution.intent.actor.snapshotDigest !== adapterRef?.snapshotDigest ||
        execution.row.adapter_ref_digest !== claim.adapter_ref_digest ||
        execution.intent.turnStart?.turnId !== execution.row.turn_id ||
        evidence?.turnId !== execution.row.turn_id ||
        receipt?.adapterOperationId !== execution.row.turn_id ||
        completedBinding?.adapterReceiptDigest !== sha256Digest(receipt) ||
        execution.row.receipt_digest !== completedBinding.adapterReceiptDigest
      ) throw codedError("threadmesh_context_admission_turn_receipt_mismatch");
      const completedBindingDigest = sha256Digest(completedBinding);
      const turnReceiptDigest = sha256Digest(receipt);
      const adapterEvidenceDigest = sha256Digest(evidence);
      const admissionTokenDigest = sha256Digest(admissionToken);
      const binding = {
        senderIncarnationId,
        messageId,
        executionId,
        turnId: execution.row.turn_id,
        expectedRevision,
        admissionTokenDigest,
        adapterRefDigest: claim.adapter_ref_digest,
        completedBindingDigest,
        turnReceiptDigest,
        adapterEvidenceDigest,
      };
      const bindingDigest = sha256Digest(binding);
      const existing = this.db.prepare(
        `SELECT * FROM context_admission_turn_bindings
         WHERE (sender_incarnation_id = ? AND message_id = ?) OR execution_id = ?`,
      ).get(senderIncarnationId, messageId, executionId);
      if (existing) {
        if (
          existing.binding_digest !== bindingDigest ||
          claim.state !== "completed" || row.delivery_state !== "context-admitted"
        ) throw codedError("threadmesh_context_admission_turn_binding_conflict");
        return {
          replay: true,
          bindingDigest,
          disposition: this.#getDisposition(senderIncarnationId, messageId),
        };
      }
      if (
        claim.state !== "in-flight" || claim.expected_revision !== expectedRevision ||
        claim.admission_token !== admissionToken
      ) throw codedError("threadmesh_context_admission_token_invalid");
      const disposition = this.confirmContextAdmission(
        senderIncarnationId,
        messageId,
        expectedRevision,
        admissionToken,
        evidence,
        principal,
      );
      this.db.prepare(
        `INSERT INTO context_admission_turn_bindings (
           sender_incarnation_id, message_id, execution_id, turn_id,
           expected_revision, admission_token_digest, adapter_ref_digest,
           completed_binding_digest, turn_receipt_digest,
           adapter_evidence_digest, binding_digest, confirmed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        senderIncarnationId, messageId, executionId, execution.row.turn_id,
        expectedRevision, admissionTokenDigest, claim.adapter_ref_digest,
        completedBindingDigest, turnReceiptDigest, adapterEvidenceDigest,
        bindingDigest, nowIso(this.clock),
      );
      return { replay: false, bindingDigest, disposition };
    }).immediate();
  }

  prepareAdapterSubmission(senderIncarnationId, messageId, expectedRevision, principal) {
    return this.db.transaction(() => {
      const row = this.#message(senderIncarnationId, messageId);
      assertTaskPrincipal(principal, row.target_task_id, row.target_incarnation_id);
      const existing = this.db
        .prepare(
          `SELECT * FROM adapter_submissions
           WHERE sender_incarnation_id = ? AND message_id = ?`,
        )
        .get(senderIncarnationId, messageId);
      if (
        existing &&
        existing.state !== "prepared" &&
        existing.state !== "confirmed-not-submitted"
      ) {
        if (existing.expected_revision !== expectedRevision) {
          throw codedError("threadmesh_adapter_submission_in_flight", existing.state);
        }
        return {
          replay: true,
          submission: this.#adapterSubmission(existing, row),
        };
      }
      this.#assertCurrentAuthorization(row);
      if (Date.parse(row.expires_at) <= this.clock()) {
        throw codedError("threadmesh_message_expired");
      }
      this.#assertAdapterSubmissionState(row, expectedRevision);
      const task = this.db
        .prepare(
          `SELECT adapter_ref_json FROM tasks
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .get(row.target_task_id, row.target_incarnation_id);
      if (!task?.adapter_ref_json) throw codedError("threadmesh_target_adapter_not_bound");
      const adapterRef = JSON.parse(task.adapter_ref_json);
      if (existing && existing.state !== "confirmed-not-submitted") {
        if (existing.expected_revision === expectedRevision) {
          return {
            replay: true,
            adapterRef,
            envelope: JSON.parse(row.envelope_json),
            submission: this.#adapterSubmission(existing, row),
          };
        }
        throw codedError("threadmesh_adapter_submission_in_flight", existing.state);
      }
      const adapterRefDigest = sha256Digest(adapterRef);
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
      return {
        replay: false,
        adapterRef,
        envelope: JSON.parse(row.envelope_json),
        submission: this.#adapterSubmission(submission, row),
      };
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
      const task = this.db
        .prepare(
          `SELECT adapter_ref_json FROM tasks
           WHERE task_id = ? AND incarnation_id = ?`,
        )
        .get(message.target_task_id, message.target_incarnation_id);
      if (!task?.adapter_ref_json) throw codedError("threadmesh_target_adapter_not_bound");
      const adapterRef = JSON.parse(task.adapter_ref_json);
      if (sha256Digest(adapterRef) !== submission.adapter_ref_digest) {
        throw codedError("threadmesh_adapter_ref_changed");
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
      return {
        replay: false,
        submission: this.#adapterSubmission(updated, message),
        dispatch: {
          adapterRef,
          envelope: JSON.parse(message.envelope_json),
        },
      };
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

  inspectMessage(senderIncarnationId, messageId, principal) {
    const row = this.db
      .prepare(
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state,
                d.decision_reason_code, d.delivery_failure_reason,
                d.outcome_state,
                source.owner_kind AS source_owner_kind,
                source.owner_principal_id AS source_owner_principal_id,
                target.owner_kind AS target_owner_kind,
                target.owner_principal_id AS target_owner_principal_id
         FROM messages m
         JOIN dispositions d USING (sender_incarnation_id, message_id)
         JOIN tasks source ON source.incarnation_id = m.sender_incarnation_id
         JOIN tasks target ON target.task_id = m.target_task_id
                          AND target.incarnation_id = m.target_incarnation_id
         WHERE m.sender_incarnation_id = ? AND m.message_id = ?`,
      )
      .get(senderIncarnationId, messageId);
    // Keep missing and unauthorized records indistinguishable to callers. The
    // inspector is deliberately not a message-ID enumeration surface.
    if (!row) throw codedError("threadmesh_inspection_not_authorized");
    const envelope = JSON.parse(row.envelope_json);
    const taskParticipant =
      isTaskPrincipal(
        principal,
        envelope.sender.taskId,
        envelope.sender.incarnationId,
      ) ||
      isTaskPrincipal(
        principal,
        envelope.target.taskId,
        envelope.target.incarnationId,
      );
    const ownerParticipant =
      principal?.kind === "user" &&
      ((row.source_owner_kind === principal.kind &&
        row.source_owner_principal_id === principal.principalId) ||
        (row.target_owner_kind === principal.kind &&
          row.target_owner_principal_id === principal.principalId));
    const policyViewer = principal?.kind === "policy";
    if (!taskParticipant && !ownerParticipant && !policyViewer) {
      throw codedError("threadmesh_inspection_not_authorized");
    }

    const expired = Date.parse(row.expires_at) <= this.clock();
    const purged = row.content_purged_at !== null;
    let currentlyAuthorized = false;
    try {
      this.#assertCurrentAuthorization(row);
      currentlyAuthorized = true;
    } catch (error) {
      if (error?.code !== "threadmesh_policy_denied") throw error;
      currentlyAuthorized = false;
    }
    const contentVisible =
      !purged && !expired && currentlyAuthorized && !policyViewer &&
      (taskParticipant || ownerParticipant);
    let redactionReason = "authorization-no-longer-current";
    if (policyViewer) redactionReason = "metadata-only-policy-view";
    if (expired) redactionReason = "expired";
    if (purged) redactionReason = "purged";
    const evidenceRefs = envelope.evidenceRefs ?? [];
    const submission = this.db
      .prepare(
        `SELECT submission_id, state, envelope_digest, adapter_ref_digest,
                adapter_idempotency_key, updated_at
         FROM adapter_submissions
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      )
      .get(senderIncarnationId, messageId);
    const events = this.db
      .prepare(
        `SELECT sequence AS cursor, event_type AS eventType, revision,
                occurred_at AS occurredAt
         FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
         ORDER BY sequence ASC`,
      )
      .all(senderIncarnationId, messageId);
    const actorType = envelope.sender.actorType;
    return {
      specVersion: "0.0-draft",
      messageId,
      provenance: {
        authorship:
          actorType === "user"
            ? "user-authored"
            : actorType === "agent"
              ? "peer-authored"
              : `${actorType}-authored`,
        actor: {
          actorType,
          ...(envelope.sender.actorId
            ? { actorId: envelope.sender.actorId }
            : {}),
        },
        source: {
          taskId: envelope.sender.taskId,
          incarnationId: envelope.sender.incarnationId,
          harness: envelope.sender.harness,
        },
        target: envelope.target,
        relationshipId: envelope.relationshipId,
        intent: envelope.intent,
        claimStatus: row.claim_status ?? envelope.claimStatus,
      },
      evidence: contentVisible
        ? { state: "visible", refs: evidenceRefs }
        : { state: "redacted", count: evidenceRefs.length, reason: redactionReason },
      content: contentVisible
        ? { state: "visible", reason: envelope.reason, value: envelope.content }
        : { state: "redacted", reason: redactionReason },
      lifecycle: {
        createdAt: envelope.createdAt,
        expiresAt: envelope.expiresAt,
        expired,
        ...(purged ? { contentPurgedAt: row.content_purged_at } : {}),
      },
      disposition: this.#disposition(row),
      adapterSubmission: submission
        ? {
            submissionId: submission.submission_id,
            state: submission.state,
            envelopeDigest: submission.envelope_digest,
            adapterRefDigest: submission.adapter_ref_digest,
            adapterIdempotencyKeyDigest: sha256Digest(
              submission.adapter_idempotency_key,
            ),
            updatedAt: submission.updated_at,
          }
        : null,
      events,
    };
  }

  purgeSensitiveContent({ before, limit = 100 } = {}, principal) {
    assertPolicyPrincipal(principal);
    const cutoffTime = Date.parse(before);
    if (!Number.isFinite(cutoffTime) || cutoffTime > this.clock()) {
      throw codedError("threadmesh_retention_cutoff_invalid");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw codedError("threadmesh_retention_limit_invalid");
    }
    const cutoff = new Date(cutoffTime).toISOString();
    const boundedLimit = limit;
    return this.db.transaction(() => {
      const purgedAt = nowIso(this.clock);
      const messages = this.db
        .prepare(
          `SELECT m.sender_incarnation_id, m.message_id, m.envelope_json,
                  d.revision
           FROM messages m
           JOIN dispositions d USING (sender_incarnation_id, message_id)
           LEFT JOIN admission_claims a
             USING (sender_incarnation_id, message_id)
           LEFT JOIN adapter_submissions s
             USING (sender_incarnation_id, message_id)
           WHERE m.content_purged_at IS NULL
             AND m.expires_at <= ?
             AND COALESCE(a.state, '') != 'in-flight'
             AND COALESCE(s.state, '') NOT IN (
               'outcome-unknown', 'manual-reconciliation'
             )
           ORDER BY m.sequence ASC LIMIT ?`,
        )
        .all(cutoff, boundedLimit);
      for (const message of messages) {
        const tombstone = tombstoneEnvelope(JSON.parse(message.envelope_json));
        const updated = this.db
          .prepare(
            `UPDATE messages SET envelope_json = ?, content_purged_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ?
               AND content_purged_at IS NULL`,
          )
          .run(
            canonicalJson(tombstone),
            purgedAt,
            message.sender_incarnation_id,
            message.message_id,
          );
        if (updated.changes !== 1) {
          throw codedError("threadmesh_retention_state_conflict");
        }
        this.db
          .prepare(
            `UPDATE audit_events SET
               detail_json = ?, detail_purged_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ?
               AND detail_purged_at IS NULL`,
          )
          .run(
            canonicalJson({ redacted: true, reason: "retention-policy" }),
            purgedAt,
            message.sender_incarnation_id,
            message.message_id,
          );
        this.db
          .prepare(
            `DELETE FROM mailbox_claims
             WHERE sender_incarnation_id = ? AND message_id = ?`,
          )
          .run(message.sender_incarnation_id, message.message_id);
        this.#audit(
          message.sender_incarnation_id,
          message.message_id,
          "content-purged",
          message.revision,
          { retentionCutoff: cutoff },
        );
      }

      const proposals = this.db
        .prepare(
          `SELECT proposal_id, proposal_json FROM relationship_proposals
           WHERE content_purged_at IS NULL
             AND json_extract(proposal_json, '$.expiresAt') <= ?
           ORDER BY proposal_id ASC LIMIT ?`,
        )
        .all(cutoff, boundedLimit);
      for (const proposal of proposals) {
        this.db
          .prepare(
            `UPDATE relationship_proposals
             SET proposal_json = ?, content_purged_at = ?
             WHERE proposal_id = ? AND content_purged_at IS NULL`,
          )
          .run(
            canonicalJson(tombstoneProposal(JSON.parse(proposal.proposal_json))),
            purgedAt,
            proposal.proposal_id,
          );
      }

      const summaries = this.db
        .prepare(
          `SELECT s.summary_id, s.summary_json
           FROM task_summaries s
           LEFT JOIN grants g
             ON g.grant_id = s.grant_id AND g.grant_version = s.grant_version
           LEFT JOIN task_metadata t
             ON t.task_id = s.task_id AND t.incarnation_id = s.incarnation_id
           WHERE s.content_purged_at IS NULL AND s.updated_at <= ?
             AND (
               (g.revoked_at IS NOT NULL AND g.revoked_at <= ?) OR
               (g.expires_at IS NOT NULL AND g.expires_at <= ?) OR
               (t.retired_at IS NOT NULL AND t.retired_at <= ?)
             )
           ORDER BY s.summary_id ASC LIMIT ?`,
        )
        .all(cutoff, cutoff, cutoff, cutoff, boundedLimit);
      for (const summary of summaries) {
        this.db
          .prepare(
            `UPDATE task_summaries
             SET summary_json = ?, content_purged_at = ?
             WHERE summary_id = ? AND content_purged_at IS NULL`,
          )
          .run(
            canonicalJson(tombstoneSummary(JSON.parse(summary.summary_json))),
            purgedAt,
            summary.summary_id,
          );
      }

      const adapterRefs = this.db
        .prepare(
          `SELECT t.task_id, t.incarnation_id
           FROM tasks t JOIN task_metadata tm
             USING (task_id, incarnation_id)
           WHERE t.adapter_ref_json IS NOT NULL
             AND t.adapter_ref_purged_at IS NULL
             AND tm.retired_at IS NOT NULL AND tm.retired_at <= ?
             AND NOT EXISTS (
               SELECT 1 FROM messages m
               JOIN adapter_submissions s
                 USING (sender_incarnation_id, message_id)
               WHERE m.target_task_id = t.task_id
                 AND m.target_incarnation_id = t.incarnation_id
                 AND s.state IN ('outcome-unknown', 'manual-reconciliation')
             )
             AND NOT EXISTS (
               SELECT 1 FROM messages m
               JOIN admission_claims a
                 USING (sender_incarnation_id, message_id)
               WHERE m.target_task_id = t.task_id
                 AND m.target_incarnation_id = t.incarnation_id
                 AND a.state = 'in-flight'
             )
           ORDER BY t.task_id, t.incarnation_id LIMIT ?`,
        )
        .all(cutoff, boundedLimit);
      for (const task of adapterRefs) {
        this.db
          .prepare(
            `UPDATE tasks SET adapter_ref_json = NULL,
               adapter_ref_purged_at = ?
             WHERE task_id = ? AND incarnation_id = ?
               AND adapter_ref_purged_at IS NULL`,
          )
          .run(purgedAt, task.task_id, task.incarnation_id);
      }

      const admissionRefs = this.db
        .prepare(
          `SELECT a.sender_incarnation_id, a.message_id
           FROM admission_claims a
           JOIN messages m USING (sender_incarnation_id, message_id)
           JOIN task_metadata tm
             ON tm.task_id = m.target_task_id
            AND tm.incarnation_id = m.target_incarnation_id
           WHERE a.adapter_ref_purged_at IS NULL
             AND a.state != 'in-flight'
             AND tm.retired_at IS NOT NULL AND tm.retired_at <= ?
           ORDER BY a.sender_incarnation_id, a.message_id LIMIT ?`,
        )
        .all(cutoff, boundedLimit);
      for (const claim of admissionRefs) {
        this.db
          .prepare(
            `UPDATE admission_claims SET adapter_ref_json = ?,
               adapter_ref_purged_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ?
               AND adapter_ref_purged_at IS NULL`,
          )
          .run(
            canonicalJson({ kind: "purged" }),
            purgedAt,
            claim.sender_incarnation_id,
            claim.message_id,
          );
      }

      const replayRecords = this.db
        .prepare(
          `SELECT authentication_id, method, idempotency_key
           FROM operation_replays
           WHERE method IN (
             'relationships.propose', 'tasks.publishSummary', 'messages.send',
             'tasks.register', 'tasks.attach', 'tasks.rotateIncarnation'
           )
             AND completed_at <= ?
           ORDER BY completed_at, authentication_id, method, idempotency_key
           LIMIT ?`,
        )
        .all(cutoff, boundedLimit);
      for (const replay of replayRecords) {
        this.db
          .prepare(
            `DELETE FROM operation_replays
             WHERE authentication_id = ? AND method = ? AND idempotency_key = ?`,
          )
          .run(
            replay.authentication_id,
            replay.method,
            replay.idempotency_key,
          );
      }

      return {
        purgedAt,
        retentionCutoff: cutoff,
        messages: messages.map((message) => ({
          senderIncarnationId: message.sender_incarnation_id,
          messageId: message.message_id,
        })),
        proposalIds: proposals.map((proposal) => proposal.proposal_id),
        summaryIds: summaries.map((summary) => summary.summary_id),
        adapterRefs: adapterRefs.map((task) => ({
          taskId: task.task_id,
          incarnationId: task.incarnation_id,
        })),
        admissionClaimRefs: admissionRefs.map((claim) => ({
          senderIncarnationId: claim.sender_incarnation_id,
          messageId: claim.message_id,
        })),
        replayRecordsDeleted: replayRecords.length,
      };
    }).immediate();
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
        if (
          !isDispositionTransitionAllowed(
            "delivery",
            candidate.delivery_state,
            "expired",
          ) ||
          (decision !== candidate.decision_state &&
            !isDispositionTransitionAllowed(
              "decision",
              candidate.decision_state,
              decision,
            ))
        ) {
          throw codedError("threadmesh_revision_or_state_conflict");
        }
        const result = this.db
          .prepare(
            `UPDATE dispositions SET revision = revision + 1,
               delivery_state = 'expired', decision_state = ?,
               decision_reason_code = CASE
                 WHEN ? = 'expired' THEN 'expired' ELSE decision_reason_code END,
               updated_at = ?
             WHERE sender_incarnation_id = ? AND message_id = ? AND revision = ?
               AND delivery_state NOT IN ('adapter-submitted', 'failed', 'expired')`,
          )
          .run(
            decision,
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

  #currentDependencyEdgeRow(dependencyId, required = true) {
    if (typeof dependencyId !== "string" || dependencyId.length === 0) {
      throw codedError("threadmesh_dependency_edge_invalid", "dependencyId");
    }
    const row = this.db
      .prepare(
        `SELECT * FROM dependency_edges
         WHERE dependency_id = ? ORDER BY version DESC LIMIT 1`,
      )
      .get(dependencyId);
    if (!row && required) {
      throw codedError("threadmesh_dependency_edge_not_found", dependencyId);
    }
    return row ?? null;
  }

  #dependencyEdge(row) {
    const edge = JSON.parse(row.edge_json);
    const satisfaction = this.db
      .prepare(
        `SELECT edge_version, sender_incarnation_id, message_id,
                disposition_digest, satisfied_at
         FROM dependency_satisfactions WHERE dependency_id = ?`,
      )
      .get(row.dependency_id);
    const isSatisfied = satisfaction?.edge_version === row.version;
    return {
      ...edge,
      authority: {
        kind: row.authority_kind,
        principalId: row.authority_principal_id,
      },
      status: isSatisfied ? "satisfied" : row.status,
      ...(isSatisfied
        ? {
            satisfiedAt: satisfaction.satisfied_at,
            satisfaction: {
              senderIncarnationId: satisfaction.sender_incarnation_id,
              messageId: satisfaction.message_id,
              dispositionDigest: satisfaction.disposition_digest,
            },
          }
        : {}),
    };
  }

  #assertDependencyControlAuthority(row, principal) {
    assertControlPlanePrincipal(principal);
    if (
      principal.kind !== "policy" &&
      (row.authority_kind !== principal.kind ||
        row.authority_principal_id !== principal.principalId)
    ) {
      throw codedError("threadmesh_dependency_edge_not_authorized");
    }
  }

  #assertDependencyReadAuthority(row, principal) {
    const participatingTask =
      isTaskPrincipal(
        principal,
        row.prerequisite_task_id,
        row.prerequisite_incarnation_id,
      ) ||
      isTaskPrincipal(
        principal,
        row.dependent_task_id,
        row.dependent_incarnation_id,
      );
    const controlAuthority =
      principal?.kind === "policy" ||
      (principal?.kind === row.authority_kind &&
        principal?.principalId === row.authority_principal_id);
    if (!participatingTask && !controlAuthority) {
      throw codedError("threadmesh_dependency_edge_not_authorized");
    }
  }

  #assertDependencySatisfactionAuthority(row, principal) {
    if (
      principal?.kind !== "policy" &&
      !isTaskPrincipal(
        principal,
        row.dependent_task_id,
        row.dependent_incarnation_id,
      )
    ) {
      throw codedError("threadmesh_dependency_satisfaction_not_authorized");
    }
  }

  #assertDependencyFreshness(row, event) {
    const expected = JSON.parse(row.freshness_json);
    const dependent = this.#taskMetadata({
      taskId: row.dependent_task_id,
      incarnationId: row.dependent_incarnation_id,
    });
    const checks = [
      ["expectedRunId", "run_id"],
      ["expectedObjectiveVersion", "objective_version"],
      ["expectedCheckpoint", "checkpoint"],
    ];
    for (const [eventKey, metadataKey] of checks) {
      if (
        expected[eventKey] !== undefined &&
        (event.freshness[eventKey] !== expected[eventKey] ||
          dependent[metadataKey] !== expected[eventKey])
      ) {
        throw codedError("threadmesh_dependency_edge_stale", eventKey);
      }
    }
  }

  #assertConfiguredGitEvidenceTrustAnchor(expectedDigest) {
    if (
      typeof expectedDigest !== "string" ||
      !this.#verificationTrustAnchors.some(
        (anchor) => sha256Digest(anchor) === expectedDigest,
      )
    ) {
      throw codedError("threadmesh_git_evidence_trust_anchor_not_configured");
    }
  }

  #turnIntentDigest(intent) {
    return sha256Digest({
      intentId: intent.intentId,
      scenarioId: intent.scenarioId,
      chainId: intent.chainId,
      messageId: intent.messageId,
      eventId: intent.eventId,
      actor: intent.actor,
      adapterIdempotencyKey: intent.adapterIdempotencyKey,
      promptDigest: intent.promptDigest,
      allowedTools: intent.allowedTools,
    });
  }

  #boundedCanonicalArguments(value) {
    let serialized;
    try {
      serialized = canonicalJson(value);
    } catch {
      throw codedError("threadmesh_turn_execution_arguments_invalid");
    }
    if (serialized.length < 2 || Buffer.byteLength(serialized, "utf8") > 65_536) {
      throw codedError("threadmesh_turn_execution_arguments_invalid");
    }
    return serialized;
  }

  #assertTurnExecutionActorCurrent(
    actor,
    expectedAdapterRefDigest = null,
    expectedTaskRevision = null,
  ) {
    const task = this.#assertTaskActive(actor);
    const taskRevision = this.#taskMetadata(actor).revision;
    let adapterRef;
    try {
      adapterRef = task.adapter_ref_json ? JSON.parse(task.adapter_ref_json) : null;
    } catch {
      throw codedError("threadmesh_turn_execution_actor_snapshot_mismatch");
    }
    const adapterRefDigest = sha256Digest(adapterRef);
    if (
      adapterRef?.kind !== "codex-app-server" ||
      adapterRef.threadId !== actor.threadId ||
      adapterRef.snapshotDigest !== actor.snapshotDigest ||
      (expectedAdapterRefDigest !== null && adapterRefDigest !== expectedAdapterRefDigest) ||
      (expectedTaskRevision !== null && taskRevision !== expectedTaskRevision)
    ) {
      throw codedError("threadmesh_turn_execution_actor_snapshot_mismatch");
    }
    return { task, adapterRef, adapterRefDigest, taskRevision };
  }

  #turnExecutionSnapshot(executionId, knownRow = null) {
    const row = knownRow ?? this.db.prepare(
      "SELECT * FROM turn_execution_intents WHERE execution_id = ?",
    ).get(executionId);
    if (!row) throw codedError("threadmesh_turn_execution_not_found", executionId);
    let intent;
    try {
      intent = validateDurableTurnIntent(JSON.parse(row.intent_json));
    } catch (error) {
      if (error?.code) throw error;
      throw codedError("threadmesh_turn_execution_storage_tampered");
    }
    let allowlist;
    try {
      allowlist = JSON.parse(row.tool_allowlist_json);
    } catch {
      throw codedError("threadmesh_turn_execution_storage_tampered");
    }
    if (
      row.execution_id !== intent.intentId ||
      row.task_id !== intent.actor.taskId ||
      row.incarnation_id !== intent.actor.incarnationId ||
      row.adapter_kind !== "codex-app-server" ||
      row.adapter_thread_id !== intent.actor.threadId ||
      row.adapter_snapshot_digest !== intent.actor.snapshotDigest ||
      row.adapter_idempotency_key !== intent.adapterIdempotencyKey ||
      row.tool_allowlist_digest !== sha256Digest(allowlist) ||
      canonicalJson(allowlist) !== canonicalJson(intent.allowedTools) ||
      row.prompt_digest !== intent.promptDigest ||
      row.intent_digest !== this.#turnIntentDigest(intent) ||
      row.scenario_id !== intent.scenarioId ||
      row.chain_id !== intent.chainId ||
      row.message_id !== intent.messageId ||
      row.state !== intent.state ||
      row.turn_id !== (intent.turnStart?.turnId ?? null) ||
      !Number.isInteger(row.task_revision) || row.task_revision < 0 ||
      !Number.isInteger(row.revision) || row.revision < 0 ||
      !Number.isInteger(row.action_count) || row.action_count < 0 ||
      !/^sha256:[a-f0-9]{64}$/u.test(row.adapter_ref_digest)
    ) throw codedError("threadmesh_turn_execution_storage_tampered");

    const actionRows = this.db.prepare(
      "SELECT * FROM turn_tool_actions WHERE execution_id = ? ORDER BY ordinal",
    ).all(executionId);
    const actions = [];
    let head = null;
    for (let ordinal = 0; ordinal < actionRows.length; ordinal += 1) {
      const actionRow = actionRows[ordinal];
      let args;
      try { args = JSON.parse(actionRow.args_json); } catch {
        throw codedError("threadmesh_turn_execution_storage_tampered");
      }
      const selected = intent.toolActions[ordinal];
      const projected = {
        ordinal: actionRow.ordinal,
        turnId: actionRow.turn_id,
        callId: actionRow.call_id,
        name: actionRow.tool_name,
        argumentsDigest: actionRow.args_digest,
        resultDigest: actionRow.result_digest,
        resultStatus: actionRow.result_status,
        argsJson: actionRow.args_json,
        selectionDigest: actionRow.selection_digest,
        actionDigest: actionRow.action_digest,
      };
      const selectionDigest = sha256Digest({
        executionId,
        turnId: projected.turnId,
        callId: projected.callId,
        ordinal: projected.ordinal,
        name: projected.name,
        argumentsDigest: projected.argumentsDigest,
        args,
        previousActionDigest: head,
      });
      const completed = projected.resultDigest !== null || projected.resultStatus !== null ||
        projected.actionDigest !== null || actionRow.result_completed_at !== null;
      const completionConsistent = !completed
        ? projected.resultDigest === null && projected.resultStatus === null &&
          projected.actionDigest === null && actionRow.result_completed_at === null
        : /^sha256:[a-f0-9]{64}$/u.test(projected.resultDigest ?? "") &&
          projected.resultStatus === "completed" &&
          projected.actionDigest === sha256Digest({
            selectionDigest,
            resultDigest: projected.resultDigest,
            resultStatus: projected.resultStatus,
          }) && typeof actionRow.result_completed_at === "string";
      if (
        actionRow.ordinal !== ordinal || !selected ||
        canonicalJson(args) !== actionRow.args_json ||
        actionRow.args_digest !== sha256Digest(args) ||
        actionRow.previous_action_digest !== head ||
        actionRow.selection_digest !== selectionDigest || !completionConsistent ||
        selected.turnId !== projected.turnId || selected.callId !== projected.callId ||
        selected.ordinal !== projected.ordinal || selected.name !== projected.name ||
        selected.argumentsDigest !== projected.argumentsDigest ||
        selected.resultDigest !== projected.resultDigest ||
        selected.resultStatus !== projected.resultStatus
      ) throw codedError("threadmesh_turn_execution_storage_tampered");
      head = selectionDigest;
      actions.push(projected);
    }
    if (
      actionRows.length !== intent.toolActions.length ||
      row.action_count !== actionRows.length || row.action_head_digest !== head
    ) throw codedError("threadmesh_turn_execution_storage_tampered");
    if (row.receipt_json !== null) {
      let receipt;
      try { receipt = JSON.parse(row.receipt_json); } catch {
        throw codedError("threadmesh_turn_execution_storage_tampered");
      }
      if (
        row.receipt_digest !== receipt.adapterReceiptDigest ||
        intent.completedTurn === null ||
        sha256Digest(intent.completedTurn) !== sha256Digest({
          evidence: receipt.evidence,
          adapterReceiptDigest: receipt.adapterReceiptDigest,
          toolCalls: receipt.toolCalls,
        })
      ) throw codedError("threadmesh_turn_execution_storage_tampered");
    } else if (intent.completedTurn !== null || row.receipt_digest !== null) {
      throw codedError("threadmesh_turn_execution_storage_tampered");
    }
    if (row.reconciliation_json !== null) {
      try {
        const value = JSON.parse(row.reconciliation_json);
        if (row.reconciliation_digest !== sha256Digest(value)) {
          throw codedError("threadmesh_turn_execution_storage_tampered");
        }
        if (
          value?.state === "found-terminal" &&
          (
            intent.state !== "abandoned" || row.receipt_json !== null ||
            row.action_count !== 0 ||
            sha256Digest(value) !== sha256Digest({
              state: "found-terminal",
              turnId: intent.turnStart?.turnId,
              ...intent.abandonment,
            })
          )
        ) throw codedError("threadmesh_turn_execution_storage_tampered");
      } catch (error) {
        if (error?.code) throw error;
        throw codedError("threadmesh_turn_execution_storage_tampered");
      }
    } else if (row.reconciliation_digest !== null) {
      throw codedError("threadmesh_turn_execution_storage_tampered");
    }
    return Object.freeze({
      executionId,
      intent,
      revision: row.revision,
      actionCount: row.action_count,
      actionHeadDigest: row.action_head_digest,
      actions: Object.freeze(actions.map((entry) => Object.freeze(entry))),
      row,
    });
  }

  #assertTurnExecutionPrincipalAndBinding(snapshot, principal) {
    assertTaskPrincipal(principal, snapshot.row.task_id, snapshot.row.incarnation_id);
    this.#assertTurnExecutionActorCurrent(
      snapshot.intent.actor,
      snapshot.row.adapter_ref_digest,
      snapshot.row.task_revision,
    );
  }

  #persistReconciledToolCompletions(snapshot, nextIntent) {
    const at = nowIso(this.clock);
    for (const selected of snapshot.actions) {
      const recovered = nextIntent.toolActions[selected.ordinal];
      if (
        !recovered || recovered.turnId !== selected.turnId ||
        recovered.callId !== selected.callId || recovered.name !== selected.name ||
        recovered.argumentsDigest !== selected.argumentsDigest ||
        recovered.resultStatus !== "completed" ||
        !/^sha256:[a-f0-9]{64}$/u.test(recovered.resultDigest ?? "")
      ) throw codedError("threadmesh_turn_execution_reconciliation_conflict");
      if (selected.resultDigest !== null || selected.resultStatus !== null) {
        if (
          selected.resultDigest !== recovered.resultDigest ||
          selected.resultStatus !== recovered.resultStatus
        ) throw codedError("threadmesh_turn_execution_reconciliation_conflict");
        continue;
      }
      const actionDigest = sha256Digest({
        selectionDigest: selected.selectionDigest,
        resultDigest: recovered.resultDigest,
        resultStatus: recovered.resultStatus,
      });
      const updated = this.db.prepare(
        `UPDATE turn_tool_actions
         SET result_digest = ?, result_status = ?, action_digest = ?,
             result_completed_at = ?
         WHERE execution_id = ? AND ordinal = ?
           AND selection_digest = ? AND result_digest IS NULL
           AND result_status IS NULL AND action_digest IS NULL`,
      ).run(
        recovered.resultDigest, recovered.resultStatus, actionDigest, at,
        snapshot.executionId, selected.ordinal, selected.selectionDigest,
      );
      if (updated.changes !== 1) {
        throw codedError("threadmesh_turn_execution_reconciliation_conflict");
      }
    }
  }

  #assertTurnExecutionCas(snapshot, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision !== snapshot.revision) {
      throw codedError("threadmesh_turn_execution_revision_conflict");
    }
  }

  #transitionTurnExecution(
    executionId,
    expectedRevision,
    principal,
    transition,
    options = {},
  ) {
    return this.db.transaction(() => {
      const snapshot = this.#turnExecutionSnapshot(executionId);
      this.#assertTurnExecutionPrincipalAndBinding(snapshot, principal);
      if (
        (options.replayState === snapshot.intent.state ||
          options.replayStates?.includes(snapshot.intent.state)) &&
        options.replayMatch?.(snapshot.intent, snapshot)
      ) return { ...snapshot, replay: true, acquired: false };
      this.#assertTurnExecutionCas(snapshot, expectedRevision);
      const next = transition(snapshot);
      const result = this.#writeTurnTransition(snapshot, next, options);
      return { ...result, acquired: options.acquired === true };
    }).immediate();
  }

  #writeTurnTransition(snapshot, nextIntent, { receipt, reconciliation } = {}) {
    const at = nowIso(this.clock);
    const receiptJson = receipt === undefined
      ? snapshot.row.receipt_json
      : receipt === null ? null : canonicalJson(receipt);
    const receiptDigest = receipt === undefined
      ? snapshot.row.receipt_digest
      : receipt === null ? null : receipt.adapterReceiptDigest;
    const reconciliationJson = reconciliation === undefined
      ? snapshot.row.reconciliation_json
      : reconciliation === null ? null : canonicalJson(reconciliation);
    const reconciliationDigest = reconciliation === undefined
      ? snapshot.row.reconciliation_digest
      : reconciliation === null ? null : sha256Digest(reconciliation);
    const updated = this.db.prepare(
      `UPDATE turn_execution_intents
       SET intent_json = ?, state = ?, turn_id = ?, receipt_json = ?,
           receipt_digest = ?, reconciliation_json = ?,
           reconciliation_digest = ?, revision = revision + 1,
           started_at = CASE WHEN ? = 'started' AND started_at IS NULL THEN ? ELSE started_at END,
           completed_at = CASE WHEN ? IN ('completed-turn-bound','promoted','abandoned')
             THEN COALESCE(completed_at, ?) ELSE completed_at END,
           updated_at = ?
       WHERE execution_id = ? AND revision = ?`,
    ).run(
      canonicalJson(nextIntent), nextIntent.state, nextIntent.turnStart?.turnId ?? null,
      receiptJson, receiptDigest, reconciliationJson, reconciliationDigest,
      nextIntent.state, at, nextIntent.state, at, at,
      snapshot.executionId, snapshot.revision,
    );
    if (updated.changes !== 1) {
      throw codedError("threadmesh_turn_execution_revision_conflict");
    }
    return { ...this.#turnExecutionSnapshot(snapshot.executionId), replay: false };
  }

  #validatePersistedTurnExecutions() {
    const rows = this.db.prepare(
      "SELECT execution_id FROM turn_execution_intents ORDER BY execution_id",
    ).all();
    for (const row of rows) this.#turnExecutionSnapshot(row.execution_id);
  }

  #assertTurnExecutionReadAuthority(row, principal) {
    if (isTaskPrincipal(principal, row.task_id, row.incarnation_id)) return;
    assertControlPlanePrincipal(principal);
    if (principal.kind === "policy") return;
    const task = this.#taskRecord({ taskId: row.task_id, incarnationId: row.incarnation_id });
    if (
      task.owner_kind !== principal.kind ||
      task.owner_principal_id !== principal.principalId
    ) throw codedError("threadmesh_turn_execution_read_not_authorized");
  }

  #assertAttentionId(value, code) {
    if (
      typeof value !== "string" || value.length < 1 || value.length > 256 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
    ) throw codedError(code);
  }

  #attentionEventSnapshot(eventCursor, eventId, receiver) {
    if (!Number.isInteger(eventCursor) || eventCursor < 1) {
      throw codedError("threadmesh_attention_event_invalid");
    }
    this.#assertAttentionId(eventId, "threadmesh_attention_event_invalid");
    const row = this.db.prepare(
      "SELECT * FROM audit_events WHERE sequence = ? AND event_id = ?",
    ).get(eventCursor, eventId);
    if (!row) throw codedError("threadmesh_attention_event_not_found");
    const message = this.db.prepare(
      `SELECT * FROM messages
       WHERE sender_incarnation_id = ? AND message_id = ?`,
    ).get(row.sender_incarnation_id, row.message_id);
    if (
      !message || message.target_task_id !== receiver.taskId ||
      message.target_incarnation_id !== receiver.incarnationId
    ) throw codedError("threadmesh_attention_event_receiver_mismatch");
    let detail;
    try { detail = JSON.parse(row.detail_json); } catch {
      throw codedError("threadmesh_attention_event_storage_tampered");
    }
    const event = {
      eventCursor: row.sequence,
      eventId: row.event_id,
      senderIncarnationId: row.sender_incarnation_id,
      messageId: row.message_id,
      eventType: row.event_type,
      revision: row.revision,
      detail,
      occurredAt: row.occurred_at,
    };
    return { ...event, eventDigest: sha256Digest(event) };
  }

  #attentionCursorRow(receiver, create = false) {
    if (create) {
      this.db.prepare(
        `INSERT INTO attention_receiver_cursors (
           receiver_task_id, receiver_incarnation_id, committed_cursor,
           commit_count, commit_head_digest, revision,
           active_claim_epoch, active_event_cursor, updated_at
         ) VALUES (?, ?, 0, 0, NULL, 0, NULL, NULL, ?)
         ON CONFLICT(receiver_task_id, receiver_incarnation_id) DO NOTHING`,
      ).run(receiver.taskId, receiver.incarnationId, nowIso(this.clock));
    }
    const row = this.db.prepare(
      `SELECT * FROM attention_receiver_cursors
       WHERE receiver_task_id = ? AND receiver_incarnation_id = ?`,
    ).get(receiver.taskId, receiver.incarnationId);
    if (!row) throw codedError("threadmesh_attention_cursor_not_found");
    return row;
  }

  #assertNextAttentionEvent(cursor, event) {
    const next = this.db.prepare(
      `SELECT audit.sequence, audit.event_id
       FROM audit_events AS audit
       JOIN messages AS message
         ON message.sender_incarnation_id = audit.sender_incarnation_id
        AND message.message_id = audit.message_id
       WHERE message.target_task_id = ?
         AND message.target_incarnation_id = ?
         AND audit.sequence > ?
       ORDER BY audit.sequence
       LIMIT 1`,
    ).get(
      cursor.receiver_task_id,
      cursor.receiver_incarnation_id,
      cursor.committed_cursor,
    );
    if (!next || next.sequence !== event.eventCursor || next.event_id !== event.eventId) {
      throw codedError("threadmesh_attention_event_not_next");
    }
  }

  #attentionClaimRow(claimEpoch) {
    this.#assertAttentionId(claimEpoch, "threadmesh_attention_claim_invalid");
    const row = this.db.prepare(
      "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
    ).get(claimEpoch);
    if (!row) throw codedError("threadmesh_attention_claim_not_found");
    return row;
  }

  #assertAttentionRevision(cursor, expectedRevision) {
    if (!Number.isInteger(expectedRevision) || expectedRevision !== cursor.revision) {
      throw codedError("threadmesh_attention_cursor_revision_conflict");
    }
  }

  #projectAttentionCursor(row) {
    return Object.freeze({
      receiver: Object.freeze({
        taskId: row.receiver_task_id,
        incarnationId: row.receiver_incarnation_id,
      }),
      committedCursor: row.committed_cursor,
      commitCount: row.commit_count,
      commitHeadDigest: row.commit_head_digest,
      revision: row.revision,
      activeClaimEpoch: row.active_claim_epoch,
      activeEventCursor: row.active_event_cursor,
    });
  }

  #projectAttentionClaim(row) {
    return Object.freeze({
      claimEpoch: row.claim_epoch,
      receiver: Object.freeze({
        taskId: row.receiver_task_id,
        incarnationId: row.receiver_incarnation_id,
      }),
      eventCursor: row.event_cursor,
      eventId: row.event_id,
      senderIncarnationId: row.sender_incarnation_id,
      messageId: row.message_id,
      eventDigest: row.event_digest,
      state: row.state,
      turnExecutionId: row.turn_execution_id,
      revision: row.revision,
    });
  }

  #appendAttentionCursorCommit(cursor, input) {
    if (input.toCursor <= cursor.committed_cursor) {
      throw codedError("threadmesh_attention_cursor_conflict");
    }
    const sequence = cursor.commit_count + 1;
    const commitBody = {
      receiver: {
        taskId: cursor.receiver_task_id,
        incarnationId: cursor.receiver_incarnation_id,
      },
      sequence,
      fromCursor: cursor.committed_cursor,
      toCursor: input.toCursor,
      kind: input.kind,
      sourceId: input.sourceId,
      eventDigest: input.eventDigest,
      classificationDigest: input.classificationDigest,
      previousCommitDigest: cursor.commit_head_digest,
    };
    const commitDigest = sha256Digest(commitBody);
    const at = nowIso(this.clock);
    try {
      this.db.prepare(
        `INSERT INTO attention_cursor_commits (
           receiver_task_id, receiver_incarnation_id, sequence,
           from_cursor, to_cursor, kind, source_id, event_digest,
           classification_digest, previous_commit_digest, commit_digest,
           committed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        cursor.receiver_task_id, cursor.receiver_incarnation_id, sequence,
        cursor.committed_cursor, input.toCursor, input.kind, input.sourceId,
        input.eventDigest, input.classificationDigest, cursor.commit_head_digest,
        commitDigest, at,
      );
      const updated = this.db.prepare(
        `UPDATE attention_receiver_cursors
         SET committed_cursor = ?, commit_count = commit_count + 1,
             commit_head_digest = ?, revision = revision + 1,
             active_claim_epoch = NULL, active_event_cursor = NULL,
             updated_at = ?
         WHERE receiver_task_id = ? AND receiver_incarnation_id = ?
           AND revision = ? AND commit_count = ?
           AND ((commit_head_digest IS NULL AND ? IS NULL)
             OR commit_head_digest = ?)` ,
      ).run(
        input.toCursor, commitDigest, at,
        cursor.receiver_task_id, cursor.receiver_incarnation_id,
        cursor.revision, cursor.commit_count,
        cursor.commit_head_digest, cursor.commit_head_digest,
      );
      if (updated.changes !== 1) {
        throw codedError("threadmesh_attention_cursor_conflict");
      }
    } catch (error) {
      if (String(error?.code ?? "").startsWith("SQLITE_CONSTRAINT")) {
        throw codedError("threadmesh_attention_cursor_commit_conflict");
      }
      throw error;
    }
    return Object.freeze({ ...commitBody, commitDigest, committedAt: at });
  }

  #validatePersistedAttentionState() {
    const cursors = this.db.prepare(
      "SELECT * FROM attention_receiver_cursors ORDER BY receiver_task_id, receiver_incarnation_id",
    ).all();
    for (const cursor of cursors) {
      const commits = this.db.prepare(
        `SELECT * FROM attention_cursor_commits
         WHERE receiver_task_id = ? AND receiver_incarnation_id = ?
         ORDER BY sequence`,
      ).all(cursor.receiver_task_id, cursor.receiver_incarnation_id);
      let position = 0;
      let head = null;
      for (let index = 0; index < commits.length; index += 1) {
        const commit = commits[index];
        const body = {
          receiver: {
            taskId: cursor.receiver_task_id,
            incarnationId: cursor.receiver_incarnation_id,
          },
          sequence: commit.sequence,
          fromCursor: commit.from_cursor,
          toCursor: commit.to_cursor,
          kind: commit.kind,
          sourceId: commit.source_id,
          eventDigest: commit.event_digest,
          classificationDigest: commit.classification_digest,
          previousCommitDigest: commit.previous_commit_digest,
        };
        if (
          commit.sequence !== index + 1 || commit.from_cursor !== position ||
          commit.to_cursor <= position || commit.previous_commit_digest !== head ||
          commit.commit_digest !== sha256Digest(body) ||
          !["irrelevant-skip", "handler-promoted"].includes(commit.kind)
        ) throw codedError("threadmesh_attention_storage_tampered");
        position = commit.to_cursor;
        head = commit.commit_digest;
      }
      if (
        cursor.committed_cursor !== position ||
        cursor.commit_count !== commits.length ||
        cursor.commit_head_digest !== head ||
        !Number.isInteger(cursor.revision) || cursor.revision < commits.length ||
        ((cursor.active_claim_epoch === null) !== (cursor.active_event_cursor === null))
      ) throw codedError("threadmesh_attention_storage_tampered");
      if (cursor.active_claim_epoch !== null) {
        const claim = this.#attentionClaimRow(cursor.active_claim_epoch);
        if (
          claim.receiver_task_id !== cursor.receiver_task_id ||
          claim.receiver_incarnation_id !== cursor.receiver_incarnation_id ||
          claim.event_cursor !== cursor.active_event_cursor ||
          claim.event_cursor <= cursor.committed_cursor ||
          claim.state === "promoted"
        ) throw codedError("threadmesh_attention_storage_tampered");
      }
    }
    const claims = this.db.prepare(
      "SELECT * FROM attention_handler_claims ORDER BY claim_epoch",
    ).all();
    for (const claim of claims) {
      if (!['claimed', 'completed-bound', 'promoted', 'abandoned'].includes(claim.state)) {
        throw codedError("threadmesh_attention_storage_tampered");
      }
      const event = this.#attentionEventSnapshot(
        claim.event_cursor,
        claim.event_id,
        { taskId: claim.receiver_task_id, incarnationId: claim.receiver_incarnation_id },
      );
      if (
        claim.sender_incarnation_id !== event.senderIncarnationId ||
        claim.message_id !== event.messageId ||
        claim.event_digest !== event.eventDigest
      ) throw codedError("threadmesh_attention_storage_tampered");
      if (claim.turn_execution_id !== null) {
        const execution = this.#turnExecutionSnapshot(claim.turn_execution_id);
        const admissionBinding = this.db.prepare(
          `SELECT b.*, a.admission_token FROM context_admission_turn_bindings b
           JOIN admission_claims a USING (sender_incarnation_id, message_id)
           WHERE b.sender_incarnation_id = ? AND b.message_id = ?`,
        ).get(claim.sender_incarnation_id, claim.message_id);
        const exactAdmittedBusinessExecution =
          admissionBinding?.execution_id === claim.turn_execution_id &&
          admissionBinding?.sender_incarnation_id === claim.sender_incarnation_id &&
          admissionBinding?.message_id === claim.message_id &&
          execution.intent.eventId === admissionBinding?.admission_token;
        const exactDecisionBinding = exactAdmittedBusinessExecution
          ? this.db.prepare(
              `SELECT 1 FROM attention_route_decision_bindings WHERE claim_epoch = ?`,
            ).get(claim.claim_epoch)
          : null;
        if (
          claim.state === "claimed" ||
          (admissionBinding && !exactAdmittedBusinessExecution) ||
          (!admissionBinding && execution.intent.eventId !== claim.event_id) ||
          (exactAdmittedBusinessExecution && !exactDecisionBinding) ||
          execution.intent.messageId !== claim.message_id ||
          execution.intent.actor.taskId !== claim.receiver_task_id ||
          execution.intent.actor.incarnationId !== claim.receiver_incarnation_id ||
          !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
          (claim.state === "promoted" && execution.intent.state !== "promoted")
        ) throw codedError("threadmesh_attention_storage_tampered");
      } else if (["completed-bound", "promoted"].includes(claim.state)) {
        throw codedError("threadmesh_attention_storage_tampered");
      }
    }
  }

  #validatePersistedLifecycleBindings() {
    const fail = () => {
      throw codedError("threadmesh_lifecycle_binding_storage_tampered");
    };
    for (const row of this.db.prepare(
      "SELECT * FROM lifecycle_action_publications ORDER BY execution_id, action_ordinal",
    ).all()) {
      let event;
      try { event = JSON.parse(row.event_json); assertLifecycleEvent(event); } catch { fail(); }
      const execution = this.#turnExecutionSnapshot(row.execution_id);
      const action = execution.actions.find((entry) => entry.ordinal === row.action_ordinal);
      const publicationTool = LIFECYCLE_PUBLICATION_TOOLS[action?.name];
      let actionArguments = null;
      try { actionArguments = action ? JSON.parse(action.argsJson) : null; } catch { fail(); }
      const actionArgumentKeys = actionArguments && typeof actionArguments === "object"
        ? Object.keys(actionArguments).sort()
        : [];
      const expectedArgumentKeys = publicationTool
        ? ["sourceEventId", "event", ...publicationTool.materialKeys].sort()
        : [];
      const message = this.db.prepare(
        `SELECT * FROM messages WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(row.sender_incarnation_id, row.message_id);
      const envelope = event ? projectLifecycleEventToEnvelope(event) : null;
      const receivedAudits = this.db.prepare(
        `SELECT revision, detail_json FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
           AND event_type = 'message-durably-received'`,
      ).all(row.sender_incarnation_id, row.message_id);
      let receivedDetail = null;
      try {
        receivedDetail = receivedAudits.length === 1
          ? JSON.parse(receivedAudits[0].detail_json)
          : null;
      } catch { fail(); }
      const binding = {
        executionId: row.execution_id,
        actionOrdinal: row.action_ordinal,
        actionDigest: row.action_digest,
        senderIncarnationId: row.sender_incarnation_id,
        messageId: row.message_id,
        eventDigest: row.event_digest,
        envelopeDigest: row.envelope_digest,
      };
      if (
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        !action || action.actionDigest !== row.action_digest ||
        !publicationTool || publicationTool.eventType !== event.eventType ||
        action.resultStatus !== "completed" ||
        execution.intent.turnStart?.turnId !== action.turnId ||
        execution.intent.actor.taskId !== event.sender.taskId ||
        execution.intent.actor.incarnationId !== event.sender.incarnationId ||
        canonicalJson(actionArgumentKeys) !== canonicalJson(expectedArgumentKeys) ||
        actionArguments?.sourceEventId !== execution.intent.eventId ||
        canonicalJson(actionArguments?.event) !==
          canonicalJson(boundedLifecycleActionEventBody(event)) ||
        event.sender.incarnationId !== row.sender_incarnation_id ||
        event.messageId !== row.message_id || row.event_json !== canonicalJson(event) ||
        row.event_digest !== sha256Digest(event) ||
        row.envelope_digest !== sha256Digest(envelope) ||
        message?.envelope_digest !== row.envelope_digest ||
        canonicalJson(JSON.parse(message?.envelope_json ?? "null")) !== canonicalJson(envelope) ||
        receivedAudits.length !== 1 || receivedAudits[0].revision !== 0 ||
        canonicalJson(receivedDetail) !== canonicalJson({
          envelopeDigest: row.envelope_digest,
          grantId: message?.grant_id,
          grantVersion: message?.grant_version,
        }) ||
        row.publication_digest !== sha256Digest(binding)
      ) fail();
    }
    for (const row of this.db.prepare(
      "SELECT * FROM attention_route_decision_bindings ORDER BY claim_epoch",
    ).all()) {
      let route;
      let decisionProjection;
      try {
        route = JSON.parse(row.route_projection_json);
        decisionProjection = JSON.parse(row.decision_projection_json);
      } catch { fail(); }
      const claim = this.db.prepare(
        "SELECT * FROM attention_handler_claims WHERE claim_epoch = ?",
      ).get(row.claim_epoch);
      if (!claim) fail();
      const execution = this.#turnExecutionSnapshot(row.receiver_decision_execution_id);
      const action = execution.actions.find(
        (entry) => entry.ordinal === row.decision_action_ordinal,
      );
      const message = this.#message(claim.sender_incarnation_id, claim.message_id);
      const publication = this.db.prepare(
        `SELECT event_json FROM lifecycle_action_publications
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(claim.sender_incarnation_id, claim.message_id);
      let lifecycleEvent;
      try {
        lifecycleEvent = JSON.parse(publication?.event_json ?? "null");
        assertLifecycleEvent(lifecycleEvent);
      } catch { fail(); }
      const decisionAudit = this.db.prepare(
        `SELECT revision, detail_json FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
           AND event_type = 'receiver-decided' ORDER BY sequence`,
      ).all(claim.sender_incarnation_id, claim.message_id);
      let decisionAuditDetails = null;
      try {
        decisionAuditDetails = decisionAudit.map((entry) => ({
          revision: entry.revision,
          ...JSON.parse(entry.detail_json),
        }));
      } catch { fail(); }
      const historicalDecisionAudits = decisionAuditDetails.filter((entry) =>
        entry.revision === decisionProjection.decision?.decisionRevision &&
        entry.decision === decisionProjection.decision?.state &&
        entry.reasonCode === decisionProjection.decision?.reasonCode);
      const decisionAuditChainValid = decisionAuditDetails.length > 0 &&
        decisionAuditDetails.every((entry, index) =>
          Number.isInteger(entry.revision) &&
          isDecisionReasonAllowed(entry.decision, entry.reasonCode) &&
          (index === 0 || (
            entry.revision > decisionAuditDetails[index - 1].revision &&
            isDispositionTransitionAllowed(
              "decision", decisionAuditDetails[index - 1].decision, entry.decision,
            )
          )));
      const latestDecisionAudit = decisionAuditDetails.at(-1);
      const mailboxClaim = this.db.prepare(
        `SELECT * FROM mailbox_claims
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(claim.sender_incarnation_id, claim.message_id);
      const mailboxAudits = this.db.prepare(
        `SELECT revision, detail_json FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
           AND event_type = 'mailbox-claimed'`,
      ).all(claim.sender_incarnation_id, claim.message_id);
      let mailboxAuditDetail = null;
      try {
        mailboxAuditDetail = mailboxAudits.length === 1
          ? JSON.parse(mailboxAudits[0].detail_json)
          : null;
      } catch { fail(); }
      let actionArguments = null;
      try { actionArguments = action ? JSON.parse(action.argsJson) : null; } catch { fail(); }
      const binding = {
        claimEpoch: row.claim_epoch,
        eventDigest: claim.event_digest,
        routeProjectionDigest: row.route_projection_digest,
        receiverDecisionExecutionId: row.receiver_decision_execution_id,
        decisionActionOrdinal: row.decision_action_ordinal,
        decisionActionDigest: row.decision_action_digest,
        decisionProjectionDigest: row.decision_projection_digest,
        mailboxClaimTokenDigest: row.mailbox_claim_token_digest,
      };
      if (
        !hasExactKeys(route, ATTENTION_OFFER_ROUTE_KEYS) ||
        route.state !== "offered" || route.offer !== true ||
        route.reasonCode !== "attention-offer-authorized" ||
        route.messageId !== claim.message_id ||
        route.eventType !== lifecycleEvent?.eventType ||
        route.grantId !== message.grant_id ||
        route.grantVersion !== message.grant_version ||
        canonicalJson(route.envelope) !== canonicalJson(JSON.parse(message.envelope_json)) ||
        canonicalJson(route.envelope) !==
          canonicalJson(projectLifecycleEventToEnvelope(lifecycleEvent)) ||
        row.route_projection_json !== canonicalJson(route) ||
        row.route_projection_digest !== sha256Digest(route) ||
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.actor.taskId !== claim.receiver_task_id ||
        execution.intent.actor.incarnationId !== claim.receiver_incarnation_id ||
        execution.intent.eventId !== claim.event_id ||
        execution.intent.messageId !== claim.message_id ||
        !action || action.actionDigest !== row.decision_action_digest ||
        action.name !== "threadmesh_decide_offer" ||
        action.resultStatus !== "completed" ||
        execution.intent.turnStart?.turnId !== action.turnId ||
        canonicalJson(actionArguments) !== canonicalJson({
          messageId: claim.message_id,
          decision: decisionProjection.decision?.state,
        }) ||
        action.resultDigest !== row.decision_projection_digest ||
        row.decision_projection_json !== canonicalJson(decisionProjection) ||
        !hasExactKeys(decisionProjection, ["messageId", "receiver", "decision"]) ||
        !hasExactKeys(decisionProjection.receiver, ["taskId", "incarnationId"]) ||
        !hasExactKeys(
          decisionProjection.decision,
          ["state", "reasonCode", "decisionRevision"],
        ) ||
        row.decision_projection_digest !== sha256Digest(decisionProjection) ||
        decisionProjection.messageId !== claim.message_id ||
        decisionProjection.receiver?.taskId !== claim.receiver_task_id ||
        decisionProjection.receiver?.incarnationId !== claim.receiver_incarnation_id ||
        !isDecisionReasonAllowed(
          decisionProjection.decision?.state,
          decisionProjection.decision?.reasonCode,
        ) ||
        historicalDecisionAudits.length !== 1 || !decisionAuditChainValid ||
        latestDecisionAudit?.decision !== message.decision_state ||
        latestDecisionAudit?.reasonCode !== message.decision_reason_code ||
        message.revision < latestDecisionAudit.revision ||
        !mailboxClaim || mailboxClaim.state !== "acknowledged" ||
        mailboxClaim.receiver_task_id !== claim.receiver_task_id ||
        mailboxClaim.receiver_incarnation_id !== claim.receiver_incarnation_id ||
        sha256Digest(mailboxClaim.claim_token) !== row.mailbox_claim_token_digest ||
        mailboxClaim.expected_revision + 1 !==
          decisionProjection.decision?.decisionRevision ||
        mailboxAudits.length !== 1 ||
        mailboxAudits[0].revision !== mailboxClaim.expected_revision ||
        canonicalJson(mailboxAuditDetail) !== canonicalJson({
          claimTokenDigest: sha256Digest(mailboxClaim.claim_token),
          expiresAt: mailboxClaim.expires_at,
        }) ||
        row.binding_digest !== sha256Digest(binding) ||
        (claim.turn_execution_id !== null &&
          claim.turn_execution_id === row.receiver_decision_execution_id)
      ) fail();
    }
    for (const row of this.db.prepare(
      "SELECT * FROM context_admission_turn_bindings ORDER BY sender_incarnation_id, message_id",
    ).all()) {
      const claim = this.db.prepare(
        `SELECT * FROM admission_claims
         WHERE sender_incarnation_id = ? AND message_id = ?`,
      ).get(row.sender_incarnation_id, row.message_id);
      const message = this.#message(row.sender_incarnation_id, row.message_id);
      const execution = this.#turnExecutionSnapshot(row.execution_id);
      let completedBinding;
      let adapterRef;
      try {
        completedBinding = JSON.parse(execution.row.receipt_json);
        adapterRef = JSON.parse(claim.adapter_ref_json);
      } catch { fail(); }
      let projectedEvidence;
      try {
        projectedEvidence = projectContextAdapterEvidence(
          assertContextAdapterRef(adapterRef), completedBinding.evidence,
        );
      } catch { fail(); }
      const admissionAudits = this.db.prepare(
        `SELECT revision, detail_json FROM audit_events
         WHERE sender_incarnation_id = ? AND message_id = ?
           AND event_type = 'context-admitted'`,
      ).all(row.sender_incarnation_id, row.message_id);
      let admissionAuditDetail = null;
      try {
        admissionAuditDetail = admissionAudits.length === 1
          ? JSON.parse(admissionAudits[0].detail_json)
          : null;
      } catch { fail(); }
      const binding = {
        senderIncarnationId: row.sender_incarnation_id,
        messageId: row.message_id,
        executionId: row.execution_id,
        turnId: row.turn_id,
        expectedRevision: row.expected_revision,
        admissionTokenDigest: row.admission_token_digest,
        adapterRefDigest: row.adapter_ref_digest,
        completedBindingDigest: row.completed_binding_digest,
        turnReceiptDigest: row.turn_receipt_digest,
        adapterEvidenceDigest: row.adapter_evidence_digest,
      };
      if (
        claim?.state !== "completed" || message.delivery_state !== "context-admitted" ||
        claim.expected_revision !== row.expected_revision ||
        sha256Digest(claim.admission_token) !== row.admission_token_digest ||
        claim.adapter_ref_digest !== row.adapter_ref_digest ||
        sha256Digest(adapterRef) !== row.adapter_ref_digest ||
        execution.row.adapter_ref_digest !== row.adapter_ref_digest ||
        !["completed-turn-bound", "promoted"].includes(execution.intent.state) ||
        execution.intent.actor.taskId !== message.target_task_id ||
        execution.intent.actor.incarnationId !== message.target_incarnation_id ||
        execution.intent.actor.threadId !== adapterRef.threadId ||
        execution.intent.actor.snapshotDigest !== adapterRef.snapshotDigest ||
        execution.intent.messageId !== row.message_id ||
        execution.intent.eventId !== claim.admission_token ||
        execution.intent.turnStart?.turnId !== row.turn_id ||
        execution.row.turn_id !== row.turn_id ||
        completedBinding.evidence?.turnId !== row.turn_id ||
        completedBinding.receipt?.adapterOperationId !== row.turn_id ||
        completedBinding.adapterReceiptDigest !==
          sha256Digest(completedBinding.receipt) ||
        execution.row.receipt_digest !== completedBinding.adapterReceiptDigest ||
        row.completed_binding_digest !== sha256Digest(completedBinding) ||
        row.turn_receipt_digest !== sha256Digest(completedBinding.receipt) ||
        row.adapter_evidence_digest !== sha256Digest(completedBinding.evidence) ||
        admissionAudits.length !== 1 ||
        admissionAudits[0].revision !== row.expected_revision + 1 ||
        canonicalJson(admissionAuditDetail) !== canonicalJson({
          admissionToken: claim.admission_token,
          adapterEvidence: projectedEvidence,
        }) ||
        row.binding_digest !== sha256Digest(binding)
      ) fail();
    }
  }

  #assertGitEvidenceActorCurrent(
    actor,
    expectedAdapterRefDigest = null,
    expectedTaskRevision = null,
  ) {
    const task = this.#assertTaskActive(actor);
    const taskRevision = this.#taskMetadata(actor).revision;
    let adapterRef;
    try {
      adapterRef = task.adapter_ref_json ? JSON.parse(task.adapter_ref_json) : null;
    } catch {
      throw codedError("threadmesh_git_evidence_actor_snapshot_mismatch");
    }
    const adapterRefDigest = sha256Digest(adapterRef);
    if (
      adapterRef?.kind !== "codex-app-server" ||
      adapterRef.threadId !== actor.threadId ||
      adapterRef.snapshotDigest !== actor.snapshotDigest ||
      (expectedAdapterRefDigest !== null &&
        adapterRefDigest !== expectedAdapterRefDigest) ||
      (expectedTaskRevision !== null && taskRevision !== expectedTaskRevision)
    ) {
      throw codedError("threadmesh_git_evidence_actor_snapshot_mismatch");
    }
    return { task, adapterRefDigest, taskRevision };
  }

  #gitEvidenceRequirementRow(chainId) {
    const row = this.db
      .prepare("SELECT * FROM git_evidence_requirements WHERE chain_id = ?")
      .get(chainId);
    if (!row) throw codedError("threadmesh_git_evidence_requirement_not_found", chainId);
    return row;
  }

  #gitEvidenceRequirement(row) {
    let requirement;
    try {
      requirement = JSON.parse(row.requirement_json);
      validateGitEvidenceChain(requirement, []);
    } catch (error) {
      if (error?.code) throw error;
      throw codedError("threadmesh_git_evidence_storage_tampered");
    }
    const adapterRefDigests = {
      implementer: row.implementer_adapter_ref_digest,
      reviewer: row.reviewer_adapter_ref_digest,
      verifier: row.verifier_adapter_ref_digest,
    };
    const taskRevisions = {
      implementer: row.implementer_task_revision,
      reviewer: row.reviewer_task_revision,
      verifier: row.verifier_task_revision,
    };
    const authority = {
      kind: row.authority_kind,
      principalId: row.authority_principal_id,
    };
    const projectionMatches =
      row.chain_id === requirement.chainId &&
      row.requirement_digest === requirement.requirementDigest &&
      row.implementer_task_id === requirement.implementer.taskId &&
      row.implementer_incarnation_id === requirement.implementer.incarnationId &&
      row.reviewer_task_id === requirement.reviewer.taskId &&
      row.reviewer_incarnation_id === requirement.reviewer.incarnationId &&
      row.verifier_task_id === requirement.verifier.taskId &&
      row.verifier_incarnation_id === requirement.verifier.incarnationId &&
      ["user", "policy"].includes(authority.kind) &&
      typeof authority.principalId === "string" &&
      authority.principalId.length > 0 &&
      Object.values(adapterRefDigests).every(
        (digest) => /^sha256:[a-f0-9]{64}$/u.test(digest ?? ""),
      ) &&
      Object.values(taskRevisions).every(
        (revision) => Number.isInteger(revision) && revision >= 0,
      ) &&
      Number.isInteger(row.record_count) && row.record_count >= 0 &&
      Number.isInteger(row.revision) && row.revision >= 0 &&
      (row.head_record_digest === null ||
        /^sha256:[a-f0-9]{64}$/u.test(row.head_record_digest)) &&
      row.binding_digest === sha256Digest({
        requirement,
        adapterRefDigests,
        taskRevisions,
        authority,
      });
    if (!projectionMatches) {
      throw codedError("threadmesh_git_evidence_storage_tampered");
    }
    this.#assertConfiguredGitEvidenceTrustAnchor(
      requirement.preconfiguredTrustAnchorDigest,
    );
    return { requirement, adapterRefDigests, taskRevisions };
  }

  #gitEvidenceSnapshot(chainId, knownRow = null) {
    const row = knownRow ?? this.#gitEvidenceRequirementRow(chainId);
    const { requirement, adapterRefDigests, taskRevisions } =
      this.#gitEvidenceRequirement(row);
    const recordRows = this.db
      .prepare(
        `SELECT * FROM git_evidence_records
         WHERE chain_id = ? ORDER BY sequence`,
      )
      .all(chainId);
    const records = recordRows.map((recordRow) => {
      let record;
      try {
        record = JSON.parse(recordRow.record_json);
      } catch {
        throw codedError("threadmesh_git_evidence_storage_tampered");
      }
      if (
        recordRow.chain_id !== record.chainId ||
        recordRow.sequence !== record.sequence ||
        recordRow.stage !== record.stage ||
        recordRow.actor_task_id !== record.payload?.actor?.taskId ||
        recordRow.actor_incarnation_id !== record.payload?.actor?.incarnationId ||
        recordRow.previous_record_digest !== record.previousRecordDigest ||
        recordRow.record_digest !== record.recordDigest
      ) {
        throw codedError("threadmesh_git_evidence_storage_tampered");
      }
      return record;
    });
    const state = validateGitEvidenceChain(requirement, records);
    if (
      row.record_count !== state.recordCount ||
      row.revision !== state.recordCount ||
      row.head_record_digest !== state.headDigest
    ) {
      throw codedError("threadmesh_git_evidence_storage_tampered");
    }
    return {
      requirement,
      adapterRefDigests,
      taskRevisions,
      records,
      state,
    };
  }

  #validatePersistedGitEvidenceChains() {
    const rows = this.db
      .prepare("SELECT * FROM git_evidence_requirements ORDER BY chain_id")
      .all();
    for (const row of rows) this.#gitEvidenceSnapshot(row.chain_id, row);
  }

  #assertPromotedGitEvidenceRecordAction(record) {
    const expectedToolName = GIT_EVIDENCE_STAGE_TOOL[record.stage];
    const rows = this.db.prepare(
      `SELECT execution.execution_id, execution.intent_json,
              execution.state, execution.chain_id,
              execution.task_id, execution.incarnation_id,
              action.turn_id, action.tool_name, action.result_status,
              action.action_digest
       FROM turn_tool_actions AS action
       JOIN turn_execution_intents AS execution
         ON execution.execution_id = action.execution_id
       WHERE action.action_digest = ?`,
    ).all(record.payload.toolCallDigest);
    if (rows.length !== 1 || !expectedToolName) {
      throw codedError("threadmesh_git_evidence_record_action_not_promoted");
    }
    const row = rows[0];
    let intent;
    try {
      intent = validateDurableTurnIntent(JSON.parse(row.intent_json));
    } catch {
      throw codedError("threadmesh_git_evidence_record_action_not_promoted");
    }
    if (
      row.state !== "promoted" || intent.state !== "promoted" ||
      row.chain_id !== record.chainId ||
      row.task_id !== record.payload.actor.taskId ||
      row.incarnation_id !== record.payload.actor.incarnationId ||
      row.turn_id !== record.payload.turnId ||
      row.tool_name !== expectedToolName ||
      row.result_status !== "completed" ||
      row.action_digest !== record.payload.toolCallDigest ||
      intent.promotion?.expectedEvidenceChainRevision !== record.sequence ||
      intent.promotion?.expectedEvidenceChainHead !== record.recordDigest
    ) {
      throw codedError("threadmesh_git_evidence_record_action_not_promoted");
    }
  }

  #validatePersistedGitEvidenceDependencyFinalizations() {
    const bindings = this.db.prepare(
      "SELECT * FROM git_evidence_dependency_bindings ORDER BY chain_id",
    ).all();
    for (const binding of bindings) {
      const chain = this.#gitEvidenceSnapshot(binding.chain_id);
      const edge = this.db.prepare(
        `SELECT * FROM dependency_edges
         WHERE dependency_id = ? AND version = ?`,
      ).get(binding.dependency_id, binding.edge_version);
      const body = edge && {
        chainId: binding.chain_id,
        requirementDigest: chain.requirement.requirementDigest,
        dependencyId: binding.dependency_id,
        edgeVersion: binding.edge_version,
        verifier: {
          taskId: chain.requirement.verifier.taskId,
          incarnationId: chain.requirement.verifier.incarnationId,
        },
        dependent: {
          taskId: edge.dependent_task_id,
          incarnationId: edge.dependent_incarnation_id,
        },
      };
      if (
        !edge || binding.requirement_digest !== body.requirementDigest ||
        binding.verifier_task_id !== body.verifier.taskId ||
        binding.verifier_incarnation_id !== body.verifier.incarnationId ||
        binding.dependent_task_id !== body.dependent.taskId ||
        binding.dependent_incarnation_id !== body.dependent.incarnationId ||
        binding.binding_digest !== sha256Digest(body) ||
        edge.prerequisite_task_id !== body.verifier.taskId ||
        edge.prerequisite_incarnation_id !== body.verifier.incarnationId
      ) {
        throw codedError("threadmesh_git_evidence_dependency_storage_tampered");
      }
    }
    const rows = this.db.prepare(
      "SELECT * FROM git_evidence_dependency_finalizations ORDER BY chain_id",
    ).all();
    for (const row of rows) {
      const chain = this.#gitEvidenceSnapshot(row.chain_id);
      const execution = this.#turnExecutionSnapshot(row.execution_id);
      const action = execution.actions[row.action_ordinal];
      const satisfaction = this.db.prepare(
        "SELECT * FROM dependency_satisfactions WHERE dependency_id = ?",
      ).get(row.dependency_id);
      const edge = this.db.prepare(
        `SELECT * FROM dependency_edges
         WHERE dependency_id = ? AND version = ?`,
      ).get(row.dependency_id, row.edge_version);
      let event;
      let disposition;
      try {
        event = JSON.parse(satisfaction?.event_json ?? "null");
        disposition = JSON.parse(satisfaction?.disposition_json ?? "null");
      } catch {
        throw codedError("threadmesh_git_evidence_dependency_storage_tampered");
      }
      const finalRecord = chain.records[3];
      const satisfactionTime = Date.parse(satisfaction?.satisfied_at ?? "");
      const historicalTimeValid =
        Number.isFinite(satisfactionTime) &&
        satisfaction.satisfied_at === disposition?.updatedAt;
      let effect = null;
      if (edge && historicalTimeValid) {
        try {
          effect = evaluateDependencyEffect({
            event,
            disposition,
            trustAnchors: this.#verificationTrustAnchors,
            dependencyEdge: JSON.parse(edge.edge_json),
            currentDependencyEdge: JSON.parse(edge.edge_json),
            now: satisfactionTime,
          });
        } catch {
          effect = null;
        }
      }
      const body = {
        chainId: row.chain_id,
        requirementDigest: chain.requirement.requirementDigest,
        executionId: row.execution_id,
        actionOrdinal: row.action_ordinal,
        actionDigest: row.action_digest,
        resultDigest: row.result_digest,
        finalRecordDigest: row.final_record_digest,
        dependencyId: row.dependency_id,
        edgeVersion: row.edge_version,
        senderIncarnationId: row.sender_incarnation_id,
        messageId: row.message_id,
        eventDigest: row.event_digest,
        dispositionDigest: row.disposition_digest,
        effectDigest: row.effect_digest,
      };
      for (const record of chain.records.slice(0, 3)) {
        this.#assertPromotedGitEvidenceRecordAction(record);
      }
      if (
        !chain.state.trustedComplete || !finalRecord || !satisfaction || !edge ||
        !historicalTimeValid ||
        execution.intent.state !== "promoted" || !action ||
        action.name !== FINAL_GIT_EVIDENCE_TOOL ||
        action.resultStatus !== "completed" ||
        action.actionDigest !== row.action_digest ||
        action.resultDigest !== row.result_digest ||
        finalRecord.recordDigest !== row.final_record_digest ||
        finalRecord.payload.turnId !== action.turnId ||
        finalRecord.payload.toolCallDigest !== action.actionDigest ||
        satisfaction.edge_version !== row.edge_version ||
        satisfaction.sender_incarnation_id !== row.sender_incarnation_id ||
        satisfaction.message_id !== row.message_id ||
        sha256Digest(event) !== row.event_digest ||
        sha256Digest(disposition) !== row.disposition_digest ||
        satisfaction.disposition_digest !== row.disposition_digest ||
        !effect?.unlock || sha256Digest(effect) !== row.effect_digest ||
        row.binding_digest !== sha256Digest(body)
      ) {
        throw codedError("threadmesh_git_evidence_dependency_storage_tampered");
      }
    }
  }

  #assertGitEvidenceCas(state, expectedRevision, expectedHeadDigest) {
    if (
      !Number.isInteger(expectedRevision) ||
      expectedRevision < 0 ||
      expectedRevision !== state.recordCount
    ) {
      throw codedError("threadmesh_git_evidence_revision_conflict");
    }
    if (expectedHeadDigest !== state.headDigest) {
      throw codedError("threadmesh_git_evidence_head_conflict");
    }
  }

  #insertGitEvidenceRecord(record, expectedRevision, expectedHeadDigest) {
    try {
      this.db
        .prepare(
          `INSERT INTO git_evidence_records (
             chain_id, sequence, stage, actor_task_id,
             actor_incarnation_id, previous_record_digest, record_digest,
             record_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.chainId,
          record.sequence,
          record.stage,
          record.payload.actor.taskId,
          record.payload.actor.incarnationId,
          record.previousRecordDigest,
          record.recordDigest,
          canonicalJson(record),
          nowIso(this.clock),
        );
      const header = this.db
        .prepare(
          `UPDATE git_evidence_requirements
           SET record_count = record_count + 1,
               head_record_digest = ?, revision = revision + 1
           WHERE chain_id = ? AND record_count = ? AND revision = ?
             AND ((head_record_digest IS NULL AND ? IS NULL)
               OR head_record_digest = ?)`,
        )
        .run(
          record.recordDigest,
          record.chainId,
          expectedRevision,
          expectedRevision,
          expectedHeadDigest,
          expectedHeadDigest,
        );
      if (header.changes !== 1) {
        throw codedError("threadmesh_git_evidence_append_conflict");
      }
    } catch (error) {
      if (String(error?.code ?? "").startsWith("SQLITE_CONSTRAINT")) {
        throw codedError("threadmesh_git_evidence_append_conflict");
      }
      throw error;
    }
  }

  #assertGitEvidenceReadAuthority(row, principal) {
    assertControlPlanePrincipal(principal);
    if (principal.kind === "policy") return;
    if (
      row.authority_kind === principal.kind &&
      row.authority_principal_id === principal.principalId
    ) return;
    const roles = ["implementer", "reviewer", "verifier"];
    const ownsEveryRole = roles.every((role) => {
      const task = this.#taskRecord({
        taskId: row[`${role}_task_id`],
        incarnationId: row[`${role}_incarnation_id`],
      });
      return task.owner_kind === principal.kind &&
        task.owner_principal_id === principal.principalId;
    });
    if (!ownsEveryRole) {
      throw codedError("threadmesh_git_evidence_not_authorized");
    }
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
        `SELECT revision, retired_at, run_id, objective_version, checkpoint
         FROM task_metadata
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
    const grantRow = this.db
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
    const taskSnapshot = (ref) => {
      const row = this.db
        .prepare(
          `SELECT t.task_id AS taskId, t.incarnation_id AS incarnationId,
                  m.retired_at AS retiredAt, m.run_id AS runId,
                  m.objective_version AS objectiveVersion,
                  m.checkpoint AS checkpoint
           FROM tasks t JOIN task_metadata m USING (task_id, incarnation_id)
           WHERE t.task_id = ? AND t.incarnation_id = ?`,
        )
        .get(ref.taskId, ref.incarnationId);
      return row ?? null;
    };
    const grant = grantRow
      ? {
          ...JSON.parse(grantRow.grant_json),
          revokedAt: grantRow.revoked_at ?? undefined,
        }
      : null;
    const decision = evaluateRelationshipPolicy({
      envelope,
      grant,
      currentGrant: grant,
      sourceTask: taskSnapshot(envelope.sender),
      targetTask: taskSnapshot(envelope.target),
      now: this.clock(),
    });
    if (decision.decision !== "allow") {
      const error = codedError(decision.publicErrorCode);
      error.policyDecision = decision;
      throw error;
    }
    return grantRow;
  }

  #assertCurrentAuthorization(row) {
    const envelope = JSON.parse(row.envelope_json);
    const grant = this.#activeGrantFor(envelope);
    if (grant.grant_id !== row.grant_id || grant.grant_version !== row.grant_version) {
      const error = codedError("threadmesh_policy_denied");
      error.policyDecision = {
        decision: "deny",
        reasonCode: "policy-denied",
        publicErrorCode: "threadmesh_policy_denied",
        internalReasonCode: "grant-superseded",
      };
      throw error;
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
      !isDispositionTransitionAllowed(
        "delivery",
        row.delivery_state,
        "context-admitted",
      )
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
      !isDispositionTransitionAllowed(
        "delivery",
        row.delivery_state,
        "adapter-submitted",
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
        `SELECT m.*, d.revision, d.delivery_state, d.decision_state,
                d.decision_reason_code, d.delivery_failure_reason,
                d.outcome_state
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
      ...(row.decision_reason_code
        ? { decisionReasonCode: row.decision_reason_code }
        : {}),
      ...(row.delivery_failure_reason
        ? { deliveryFailureReason: row.delivery_failure_reason }
        : {}),
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

  checkpointStorage(principal) {
    assertPolicyPrincipal(principal);
    const result = this.db.pragma("wal_checkpoint(TRUNCATE)")[0];
    return {
      busy: result.busy,
      logFrames: result.log,
      checkpointedFrames: result.checkpointed,
    };
  }

  close() {
    this.db.close();
  }
}
