import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specRoot = path.join(root, "spec");
const schemaRoot = path.join(specRoot, "schema");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // Conditional subschemas refine types declared by their parent schema.
  strictRequired: false,
  strictTypes: false,
});
addFormats(ajv);

const schemaFiles = fs
  .readdirSync(schemaRoot)
  .filter((name) => name.endsWith(".json"))
  .sort();

for (const name of schemaFiles) {
  ajv.addSchema(readJson(path.join(schemaRoot, name)));
}

const manifestPath = path.join(specRoot, "conformance", "manifest.json");
const manifest = readJson(manifestPath);
const manifestSchema = ajv.getSchema(
  "https://threadmesh.dev/spec/0.0-draft/conformance-manifest.schema.json",
);

if (!manifestSchema(manifest)) {
  throw new Error(`Invalid conformance manifest:\n${ajv.errorsText(manifestSchema.errors)}`);
}

const transitions = {
  delivery: {
    "control-plane-accepted": ["durably-received", "failed", "expired"],
    "durably-received": [
      "receiver-notified",
      "checkpoint-offered",
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ],
    "receiver-notified": [
      "checkpoint-offered",
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ],
    "checkpoint-offered": [
      "context-admitted",
      "adapter-submitted",
      "failed",
      "expired",
    ],
    "context-admitted": ["adapter-submitted", "failed", "expired"],
    "adapter-submitted": [],
    failed: [],
    expired: [],
  },
  decision: {
    pending: [
      "accepted",
      "rejected",
      "deferred",
      "stale",
      "expired",
      "unsupported",
      "revoked",
    ],
    deferred: ["accepted", "rejected", "stale", "expired", "revoked"],
    accepted: ["revoked"],
    rejected: [],
    stale: [],
    expired: [],
    unsupported: [],
    revoked: [],
  },
  outcome: {
    "not-observed": ["effect-observed", "externally-verified", "failed"],
    "effect-observed": ["externally-verified"],
    "externally-verified": [],
    failed: [],
  },
};

let failures = 0;

for (const testCase of manifest.schemaCases) {
  const schema = readJson(path.join(specRoot, testCase.schema));
  const validate = ajv.getSchema(schema.$id);
  const fixture = readJson(path.join(specRoot, testCase.fixture));
  let actual = validate(fixture);

  if (actual && schema.$id.endsWith("/envelope.schema.json")) {
    actual = Date.parse(fixture.createdAt) < Date.parse(fixture.expiresAt);
  }

  if (actual !== testCase.valid) {
    failures += 1;
    const detail = validate.errors ? ajv.errorsText(validate.errors) : "semantic date check";
    console.error(`FAIL schema: ${testCase.name} (${detail})`);
  } else {
    console.log(`PASS schema: ${testCase.name}`);
  }
}

for (const testCase of manifest.transitionCases) {
  const allowed = transitions[testCase.machine]?.[testCase.from];
  const actual = Array.isArray(allowed) && allowed.includes(testCase.to);

  if (actual !== testCase.valid) {
    failures += 1;
    console.error(
      `FAIL transition: ${testCase.name} (${testCase.machine}: ${testCase.from} -> ${testCase.to})`,
    );
  } else {
    console.log(`PASS transition: ${testCase.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} conformance case(s) failed.`);
  process.exit(1);
}

console.log(
  `\nValidated ${schemaFiles.length} schemas, ${manifest.schemaCases.length} schema cases, and ${manifest.transitionCases.length} transition cases.`,
);
