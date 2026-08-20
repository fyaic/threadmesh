import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { sha256Digest } from "../canonical-json.mjs";

const TERMINAL_DISPOSITIONS = new Set([
  "accepted",
  "resolved",
  "deferred-with-rationale",
  "rejected-with-rationale",
]);
const ACCEPTED_VERDICTS = new Set(["approve", "approve-with-resolved-findings"]);
const REVIEW_PATH_PREFIX = "docs/09-reviews/external/";

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateRecord(entry, record, manifest, errors) {
  const label = entry.path;
  if (!entry.path.startsWith(REVIEW_PATH_PREFIX) || !entry.path.endsWith(".json")) {
    errors.push(`${label}: review path is outside ${REVIEW_PATH_PREFIX}`);
  }
  if (entry.digest !== sha256Digest(record)) errors.push(`${label}: digest mismatch`);
  if (record.schemaVersion !== 1) errors.push(`${label}: unsupported schemaVersion`);
  if (!nonEmpty(record.reviewId)) errors.push(`${label}: reviewId missing`);
  if (!nonEmpty(record.reviewer?.githubLogin)) errors.push(`${label}: reviewer login missing`);
  if (!nonEmpty(record.reviewer?.affiliation)) errors.push(`${label}: affiliation missing`);
  if (!["maintainer-organization", "outside-maintainer-organization"].includes(
    record.reviewer?.organizationRelationship,
  )) {
    errors.push(`${label}: organization relationship invalid`);
  }
  if (!manifest.requiredPerspectives.includes(record.perspective)) {
    errors.push(`${label}: perspective not required by gate`);
  }
  if (record.reviewedCommit !== manifest.reviewTarget) {
    errors.push(`${label}: reviewed commit differs from gate target`);
  }
  if (!ACCEPTED_VERDICTS.has(record.verdict)) errors.push(`${label}: verdict is not accepted`);
  if (!/^https:\/\/github\.com\/fyaic\/threadmesh\/(issues|pull)\/\d+/.test(record.sourceUrl ?? "")) {
    errors.push(`${label}: public repository source URL missing`);
  }
  if (!nonEmpty(record.reviewedAt) || Number.isNaN(Date.parse(record.reviewedAt))) {
    errors.push(`${label}: reviewedAt invalid`);
  }
  if (!Array.isArray(record.findings)) {
    errors.push(`${label}: findings must be an array`);
    return;
  }
  for (const [index, finding] of record.findings.entries()) {
    const findingLabel = `${label}: finding ${index + 1}`;
    if (!nonEmpty(finding.id) || !nonEmpty(finding.location) || !nonEmpty(finding.summary)) {
      errors.push(`${findingLabel}: identity, location, or summary missing`);
    }
    if (!TERMINAL_DISPOSITIONS.has(finding.disposition)) {
      errors.push(`${findingLabel}: disposition is not terminal`);
    }
    if (!nonEmpty(finding.rationale) || !/^https:\/\/github\.com\/fyaic\/threadmesh\//.test(
      finding.evidenceUrl ?? "",
    )) {
      errors.push(`${findingLabel}: rationale or repository evidence missing`);
    }
  }
}

export function evaluateExternalReviewGate({ manifest, records, targetIsAncestor = true }) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (manifest?.issueUrl !== "https://github.com/fyaic/threadmesh/issues/7") {
    errors.push("manifest issueUrl must identify issue #7");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest?.reviewTarget ?? "")) {
    errors.push("manifest reviewTarget must be a full commit SHA");
  }
  if (manifest?.requiredReviews !== 2) errors.push("manifest must require exactly two reviews");
  if (
    !Array.isArray(manifest?.requiredPerspectives) ||
    !["agent-safety", "distributed-systems"].every((value) =>
      manifest.requiredPerspectives.includes(value))
  ) {
    errors.push("manifest must require distributed-systems and agent-safety perspectives");
  }
  if (!Array.isArray(manifest?.reviews)) errors.push("manifest reviews must be an array");
  if (!targetIsAncestor) errors.push("review target is not an ancestor of the current commit");

  const entries = Array.isArray(manifest?.reviews) ? manifest.reviews : [];
  for (const entry of entries) {
    const record = records.get(entry.path);
    if (!record) errors.push(`${entry.path}: record missing`);
    else validateRecord(entry, record, manifest, errors);
  }

  const loaded = entries.map((entry) => records.get(entry.path)).filter(Boolean);
  const reviewers = new Set(loaded.map((record) => record.reviewer?.githubLogin));
  const reviewIds = new Set(loaded.map((record) => record.reviewId));
  const perspectives = new Set(loaded.map((record) => record.perspective));
  if (entries.length !== manifest?.requiredReviews) errors.push("required review count not met");
  if (reviewers.size !== entries.length) errors.push("reviewers must be distinct");
  if (reviewIds.size !== entries.length) errors.push("reviewIds must be distinct");
  if (!manifest?.requiredPerspectives?.every((value) => perspectives.has(value))) {
    errors.push("required review perspectives not covered");
  }
  if (!loaded.some((record) =>
    record.reviewer?.organizationRelationship === "outside-maintainer-organization")) {
    errors.push("no reviewer outside the maintainer organization");
  }
  if (manifest?.status !== "accepted") errors.push("manifest status is not accepted");

  return {
    satisfied: errors.length === 0,
    reviewTarget: manifest?.reviewTarget ?? null,
    reviewCount: loaded.length,
    externalReviewerCount: loaded.filter((record) =>
      record.reviewer?.organizationRelationship === "outside-maintainer-organization").length,
    perspectives: [...perspectives].sort(),
    errors,
  };
}

export function verifyExternalReviewGate({ root }) {
  const manifestPath = path.join(root, "docs", "09-reviews", "m0-review-gate.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const records = new Map();
  for (const entry of manifest.reviews ?? []) {
    const absolute = path.resolve(root, entry.path);
    const reviewRoot = path.resolve(root, REVIEW_PATH_PREFIX);
    if (absolute.startsWith(`${reviewRoot}${path.sep}`)) {
      records.set(entry.path, JSON.parse(fs.readFileSync(absolute, "utf8")));
    }
  }
  let targetIsAncestor = false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", manifest.reviewTarget, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    targetIsAncestor = true;
  } catch {
    targetIsAncestor = false;
  }
  return evaluateExternalReviewGate({ manifest, records, targetIsAncestor });
}

