import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

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
]);

export function assertProtocolObject(kind, value) {
  const schemaId = validators.get(kind);
  if (!schemaId) {
    throw codedError("threadmesh_validator_unknown_kind", kind);
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate(value)) {
    const errorKind = kind.replaceAll("-", "_");
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
    if (value.expiresAt && createdAt >= Date.parse(value.expiresAt)) {
      throw codedError("threadmesh_grant_invalid", "createdAt must precede expiresAt");
    }
    if (value.revokedAt && createdAt > Date.parse(value.revokedAt)) {
      throw codedError("threadmesh_grant_invalid", "revokedAt must not precede createdAt");
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

  return value;
}

export function codedError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}
