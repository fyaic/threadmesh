import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertProtocolObject,
  verifyExternallyVerifiedDisposition,
  verifyVerificationAttestation,
} from "../src/protocol-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "spec", "conformance", "fixtures");
const fixture = (name) =>
  JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));

test("accepts a grant-projected task summary", () => {
  const summary = fixture("task-summary-valid.json");
  assert.equal(assertProtocolObject("task-summary", summary), summary);
});

test("rejects a task summary outside the projected relationship", () => {
  assert.throws(
    () =>
      assertProtocolObject(
        "task-summary",
        fixture("task-summary-invalid-projection-mismatch.json"),
      ),
    { code: "threadmesh_task_summary_invalid" },
  );
});

test("rejects incoherent disposition and capability declarations", () => {
  assert.throws(
    () =>
      assertProtocolObject(
        "disposition",
        fixture("disposition-invalid-accepted-policy-denied.json"),
      ),
    { code: "threadmesh_disposition_invalid" },
  );
  assert.throws(
    () =>
      assertProtocolObject(
        "capabilities",
        fixture("capabilities-invalid-interrupt-no-cancellation.json"),
      ),
    { code: "threadmesh_capabilities_invalid" },
  );
});

test("accepts partial interruption results and rejects umbrella success", () => {
  const partial = fixture("interruption-result-valid-partial.json");
  assert.equal(assertProtocolObject("interruption-result", partial), partial);
  assert.throws(
    () =>
      assertProtocolObject(
        "interruption-result",
        fixture("interruption-result-invalid-umbrella-success.json"),
      ),
    { code: "threadmesh_interruption_result_invalid" },
  );
});

test("requires integrity-bound trusted attestations for external verification", () => {
  const attestation = fixture("verification-attestation-valid.json");
  assert.equal(
    assertProtocolObject("verification-attestation", attestation),
    attestation,
  );
  assert.equal(
    verifyVerificationAttestation(
      attestation,
      fixture("verification-trust-anchor.json"),
    ),
    attestation,
  );
  const verified = fixture("disposition-valid-externally-verified.json");
  assert.equal(assertProtocolObject("disposition", verified), verified);
  assert.equal(
    verifyExternallyVerifiedDisposition(verified, [
      fixture("verification-trust-anchor.json"),
    ]),
    verified,
  );
  assert.throws(
    () => verifyExternallyVerifiedDisposition(verified, []),
    { code: "threadmesh_verification_trust_denied" },
  );
  assert.throws(
    () =>
      assertProtocolObject(
        "verification-attestation",
        fixture("verification-attestation-invalid-tampered-digest.json"),
      ),
    { code: "threadmesh_verification_attestation_invalid" },
  );
  assert.throws(
    () =>
      verifyVerificationAttestation(
        fixture("verification-attestation-invalid-signature.json"),
        fixture("verification-trust-anchor.json"),
      ),
    { code: "threadmesh_verification_proof_invalid" },
  );
  assert.throws(
    () =>
      assertProtocolObject(
        "disposition",
        fixture("disposition-invalid-verified-arbitrary-evidence.json"),
      ),
    { code: "threadmesh_disposition_invalid" },
  );
});
