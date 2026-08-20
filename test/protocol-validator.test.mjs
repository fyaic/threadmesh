import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertProtocolObject } from "../src/protocol-validator.mjs";

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
