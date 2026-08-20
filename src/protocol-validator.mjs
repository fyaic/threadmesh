import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { sha256Digest } from "./canonical-json.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaRoot = path.join(root, "spec", "schema");
const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictRequired: false,
  strictTypes: false,
});
addFormats(ajv);

for (const name of fs.readdirSync(schemaRoot).filter((item) => item.endsWith(".json"))) {
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaRoot, name), "utf8")));
}

const validators = new Map([
  ["envelope", "https://threadmesh.dev/spec/0.0-draft/envelope.schema.json"],
  ["grant", "https://threadmesh.dev/spec/0.0-draft/relationship-grant.schema.json"],
  ["capabilities", "https://threadmesh.dev/spec/0.0-draft/capabilities.schema.json"],
  ["disposition", "https://threadmesh.dev/spec/0.0-draft/disposition.schema.json"],
  ["task-summary", "https://threadmesh.dev/spec/0.0-draft/task-summary.schema.json"],
  [
    "relationship-proposal",
    "https://threadmesh.dev/spec/0.0-draft/relationship-proposal.schema.json",
  ],
  ["auth-context", "https://threadmesh.dev/spec/0.0-draft/auth-context.schema.json"],
  ["jsonrpc", "https://threadmesh.dev/spec/0.0-draft/jsonrpc.schema.json"],
  [
    "jsonrpc-request",
    "https://threadmesh.dev/spec/0.0-draft/jsonrpc.schema.json#/$defs/request",
  ],
  [
    "jsonrpc-response",
    "https://threadmesh.dev/spec/0.0-draft/jsonrpc.schema.json#/$defs/response",
  ],
]);

export function assertProtocolObject(kind, value) {
  const schemaId = validators.get(kind);
  if (!schemaId) {
    throw codedError("threadmesh_validator_unknown_kind", kind);
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate(value)) {
    const errorKind = kind.startsWith("jsonrpc-")
      ? "jsonrpc"
      : kind.replaceAll("-", "_");
    throw codedError(
      `threadmesh_${errorKind}_invalid`,
      ajv.errorsText(validate.errors, { separator: "; " }),
    );
  }

  if (kind === "envelope" && Date.parse(value.createdAt) >= Date.parse(value.expiresAt)) {
    throw codedError("threadmesh_envelope_invalid", "createdAt must precede expiresAt");
  }

  if (kind === "grant") {
    const createdAt = Date.parse(value.createdAt);
    if (value.authorization.decidedAt !== value.createdAt) {
      throw codedError(
        "threadmesh_grant_invalid",
        "createdAt must equal authorization.decidedAt",
      );
    }
    if (value.expiresAt && createdAt >= Date.parse(value.expiresAt)) {
      throw codedError("threadmesh_grant_invalid", "createdAt must precede expiresAt");
    }
    if (value.revokedAt && createdAt > Date.parse(value.revokedAt)) {
      throw codedError("threadmesh_grant_invalid", "revokedAt must not precede createdAt");
    }
    if (value.authorization.integrity.digest !== grantAuthorizationDigest(value)) {
      throw codedError(
        "threadmesh_grant_invalid",
        "authorization integrity digest mismatch",
      );
    }
  }

  if (
    kind === "task-summary" &&
    value.audience.visibility === "relationship-scoped" &&
    !value.audience.relationshipIds.includes(value.projection.relationshipId)
  ) {
    throw codedError(
      "threadmesh_task_summary_invalid",
      "projection relationshipId must be present in audience.relationshipIds",
    );
  }

  if (kind === "relationship-proposal") {
    if (Date.parse(value.createdAt) >= Date.parse(value.expiresAt)) {
      throw codedError(
        "threadmesh_relationship_proposal_invalid",
        "createdAt must precede expiresAt",
      );
    }
    if (
      value.source.taskId !== value.proposedBy.task.taskId ||
      value.source.incarnationId !== value.proposedBy.task.incarnationId
    ) {
      throw codedError(
        "threadmesh_relationship_proposal_invalid",
        "proposedBy task must equal source",
      );
    }
  }

  return value;
}

export function grantAuthorizationDigest(grant) {
  const { integrity: _integrity, ...authorization } = grant.authorization;
  return sha256Digest({
    grant: {
      specVersion: grant.specVersion,
      grantId: grant.grantId,
      grantVersion: grant.grantVersion,
      relationshipId: grant.relationshipId,
      relationshipType: grant.relationshipType,
      source: grant.source,
      target: grant.target,
      allowedIntents: grant.allowedIntents,
      allowedDeliveryModes: grant.allowedDeliveryModes,
      summaryVisibility: grant.summaryVisibility,
      structuredGateResponses: grant.structuredGateResponses,
      grantedBy: grant.grantedBy,
      createdAt: grant.createdAt,
      ...(grant.expiresAt ? { expiresAt: grant.expiresAt } : {}),
    },
    authorization,
  });
}

export function codedError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}
