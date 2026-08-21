import assert from "node:assert/strict";
import test from "node:test";

import { sha256Digest } from "../src/canonical-json.mjs";
import {
  evaluateExternalReviewGate,
  evaluateLiveRepositoryState,
} from "../src/validation/external-review-gate.mjs";

const target = "265e461f1b8714c56f7fe817795b81d895f732c6";

function record(id, login, perspective, relationship) {
  const sourceUrl = `https://github.com/fyaic/threadmesh/issues/7#issuecomment-${id}`;
  const lane = perspective === "distributed-systems" ? "distributed systems" : "agent safety";
  const body = [
    `Reviewed commit: ${target}`,
    `Review lane: ${lane}`,
    "Verdict: approve-with-resolved-findings",
    "docs/03-protocol/delivery-semantics.md",
    "Example resolved finding.",
  ].join("\n");
  const review = {
    schemaVersion: 1,
    reviewId: id,
    reviewer: {
      githubLogin: login,
      affiliation: `${login} independent lab`,
      organizationRelationship: relationship,
    },
    perspective,
    reviewedCommit: target,
    verdict: "approve-with-resolved-findings",
    sourceUrl,
    sourceBodyDigest: sha256Digest(body),
    reviewedAt: "2026-08-20T12:00:00Z",
    findings: [{
      id: `${id}-finding-1`,
      location: "docs/03-protocol/delivery-semantics.md",
      summary: "Example resolved finding.",
      disposition: "resolved",
      rationale: "The linked patch and regression case resolve the finding.",
      evidenceUrl: "https://github.com/fyaic/threadmesh/pull/20",
    }],
  };
  return {
    review,
    source: {
      commentDatabaseId: id,
      url: sourceUrl,
      issueUrl: "https://github.com/fyaic/threadmesh/issues/7",
      githubLogin: login,
      authorAssociation: relationship === "maintainer-organization" ? "MEMBER" : "NONE",
      body,
      createdAt: "2026-08-20T12:00:00Z",
    },
  };
}

function acceptedFixture() {
  const firstFixture = record(
    "1001",
    "reviewer-one",
    "distributed-systems",
    "outside-maintainer-organization",
  );
  const secondFixture = record(
    "1002",
    "reviewer-two",
    "agent-safety",
    "maintainer-organization",
  );
  const paths = [
    "docs/09-reviews/external/distributed.json",
    "docs/09-reviews/external/safety.json",
  ];
  const first = firstFixture.review;
  const second = secondFixture.review;
  const records = new Map([[paths[0], first], [paths[1], second]]);
  const verifiedSources = new Map([
    [first.sourceUrl, firstFixture.source],
    [second.sourceUrl, secondFixture.source],
  ]);
  return {
    records,
    verifiedSources,
    verifiedEvidenceUrls: new Set(["https://github.com/fyaic/threadmesh/pull/20"]),
    manifest: {
      schemaVersion: 1,
      scope: "m0-normative",
      issueUrl: "https://github.com/fyaic/threadmesh/issues/7",
      reviewTarget: target,
      status: "accepted",
      requiredReviews: 2,
      requiredPerspectives: ["distributed-systems", "agent-safety"],
      reviews: paths.map((reviewPath) => ({
        path: reviewPath,
        digest: sha256Digest(records.get(reviewPath)),
      })),
    },
  };
}

test("the checked-in awaiting manifest cannot satisfy the live gate", () => {
  const report = evaluateExternalReviewGate({
    manifest: {
      schemaVersion: 1,
      scope: "m0-normative",
      issueUrl: "https://github.com/fyaic/threadmesh/issues/7",
      reviewTarget: target,
      status: "awaiting",
      requiredReviews: 2,
      requiredPerspectives: ["distributed-systems", "agent-safety"],
      reviews: [],
    },
    records: new Map(),
  });
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /required review count not met/);
  assert.match(report.errors.join("\n"), /no reviewer outside/);
});

test("two distinct, complete, integrity-bound reviews satisfy the gate", () => {
  const fixture = acceptedFixture();
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, true);
  assert.equal(report.reviewCount, 2);
  assert.equal(report.externalReviewerCount, 1);
  assert.deepEqual(report.perspectives, ["agent-safety", "distributed-systems"]);
});

test("self-asserted reviewer identity cannot satisfy the authenticated-source gate", () => {
  const fixture = acceptedFixture();
  fixture.verifiedSources.clear();
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /authenticated GitHub source unavailable/);
});

test("GitHub author and body must match the checked-in transcription", () => {
  const fixture = acceptedFixture();
  const first = fixture.records.get(fixture.manifest.reviews[0].path);
  const source = fixture.verifiedSources.get(first.sourceUrl);
  source.githubLogin = "forged-reviewer";
  source.body = `${source.body}\nchanged after transcription`;
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /source author mismatch/);
  assert.match(report.errors.join("\n"), /source body digest mismatch/);
});

test("invented disposition evidence cannot satisfy the gate", () => {
  const fixture = acceptedFixture();
  fixture.verifiedEvidenceUrls.clear();
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /evidence URL could not be verified/);
});

test("live repository state requires clean synchronized main", () => {
  const sha = "a".repeat(40);
  assert.equal(evaluateLiveRepositoryState({
    head: sha,
    branch: "main",
    clean: true,
    remoteMain: sha,
  }).satisfied, true);
  const report = evaluateLiveRepositoryState({
    head: sha,
    branch: "feature",
    clean: false,
    remoteMain: "b".repeat(40),
  });
  assert.equal(report.satisfied, false);
  assert.equal(report.errors.length, 3);
});

test("duplicate reviewers, digest tampering, or non-terminal findings fail closed", () => {
  const fixture = acceptedFixture();
  const secondPath = fixture.manifest.reviews[1].path;
  const second = fixture.records.get(secondPath);
  second.reviewer.githubLogin = "reviewer-one";
  second.findings[0].disposition = "pending";
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /digest mismatch/);
  assert.match(report.errors.join("\n"), /reviewers must be distinct/);
  assert.match(report.errors.join("\n"), /disposition is not terminal/);
});
