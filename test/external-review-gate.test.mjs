import assert from "node:assert/strict";
import test from "node:test";

import { canonicalJson, sha256Digest } from "../src/canonical-json.mjs";
import {
  evaluateExternalReviewGate,
} from "../src/validation/external-review-gate.mjs";

const target = "265e461f1b8714c56f7fe817795b81d895f732c6";
const fixUrl = "https://github.com/fyaic/threadmesh/pull/20";

function machineBlock(name, value) {
  return `<!-- ${name}\n${canonicalJson(value)}\n-->`;
}

function comment(id, login, relationship, body, createdAt) {
  const url = `https://github.com/fyaic/threadmesh/issues/7#issuecomment-${id}`;
  return {
    url,
    value: {
      commentDatabaseId: id,
      url,
      issueUrl: "https://github.com/fyaic/threadmesh/issues/7",
      githubLogin: login,
      authorAssociation: relationship === "maintainer-organization" ? "MEMBER" : "NONE",
      body,
      createdAt,
    },
  };
}

function record(id, login, perspective, relationship, dispositionCommentId) {
  const finding = {
    id: `${id}-finding-1`,
    location: "docs/03-protocol/delivery-semantics.md",
    summary: "Example resolved finding.",
    disposition: "resolved",
    rationale: "The merged patch and regression case resolve the finding.",
    evidenceUrl: `https://github.com/fyaic/threadmesh/issues/7#issuecomment-${dispositionCommentId}`,
    evidenceBodyDigest: null,
    dispositionAt: "2026-08-20T13:00:00Z",
    fixUrl,
  };
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
    sourceUrl: `https://github.com/fyaic/threadmesh/issues/7#issuecomment-${id}`,
    sourceBodyDigest: null,
    reviewedAt: "2026-08-20T12:00:00Z",
    findings: [finding],
  };
  const reviewBody = [
    "Human-readable final review.",
    machineBlock("threadmesh-review-v1", {
      findings: [{ id: finding.id, location: finding.location, summary: finding.summary }],
      perspective,
      reviewedCommit: target,
      schemaVersion: 1,
      verdict: review.verdict,
    }),
  ].join("\n\n");
  review.sourceBodyDigest = sha256Digest(reviewBody);
  const dispositionBody = [
    "Public maintainer disposition.",
    machineBlock("threadmesh-disposition-v1", {
      disposition: finding.disposition,
      findingId: finding.id,
      fixUrl,
      rationale: finding.rationale,
      reviewId: review.reviewId,
      schemaVersion: 1,
    }),
  ].join("\n\n");
  finding.evidenceBodyDigest = sha256Digest(dispositionBody);
  return {
    review,
    reviewComment: comment(id, login, relationship, reviewBody, review.reviewedAt),
    dispositionComment: comment(
      dispositionCommentId,
      "threadmesh-maintainer",
      "maintainer-organization",
      dispositionBody,
      finding.dispositionAt,
    ),
  };
}

function acceptedFixture() {
  const firstFixture = record(
    "1001",
    "reviewer-one",
    "distributed-systems",
    "outside-maintainer-organization",
    "2001",
  );
  const secondFixture = record(
    "1002",
    "reviewer-two",
    "agent-safety",
    "maintainer-organization",
    "2002",
  );
  const paths = [
    "docs/09-reviews/external/distributed.json",
    "docs/09-reviews/external/safety.json",
  ];
  const records = new Map([
    [paths[0], firstFixture.review],
    [paths[1], secondFixture.review],
  ]);
  const verifiedComments = new Map();
  for (const fixture of [firstFixture, secondFixture]) {
    verifiedComments.set(fixture.reviewComment.url, fixture.reviewComment.value);
    verifiedComments.set(fixture.dispositionComment.url, fixture.dispositionComment.value);
  }
  return {
    records,
    verifiedComments,
    verifiedFixes: new Map([[fixUrl, { accepted: true, commit: "a".repeat(40) }]]),
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
});

test("two authenticated machine reviews and dispositions satisfy the gate", () => {
  const report = evaluateExternalReviewGate(acceptedFixture());
  assert.equal(report.satisfied, true);
  assert.equal(report.reviewCount, 2);
  assert.equal(report.externalReviewerCount, 1);
});

test("self-asserted reviewer identity cannot satisfy the gate", () => {
  const fixture = acceptedFixture();
  fixture.verifiedComments.clear();
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /authenticated GitHub comment unavailable/);
});

test("natural-language negation cannot be transcribed as approval", () => {
  const fixture = acceptedFixture();
  const first = fixture.records.get(fixture.manifest.reviews[0].path);
  const source = fixture.verifiedComments.get(first.sourceUrl);
  source.body = [
    "Verdict: request changes. Do not transcribe this as Verdict: approve.",
    "The phrase No findings is false: blockers remain.",
  ].join("\n");
  first.sourceBodyDigest = sha256Digest(source.body);
  fixture.manifest.reviews[0].digest = sha256Digest(first);
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /machine block does not exactly match/);
});

test("invented disposition or unrelated fix cannot satisfy the gate", () => {
  const fixture = acceptedFixture();
  const first = fixture.records.get(fixture.manifest.reviews[0].path);
  fixture.verifiedComments.delete(first.findings[0].evidenceUrl);
  fixture.verifiedFixes.set(fixUrl, { accepted: false });
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /authenticated GitHub comment unavailable/);
  assert.match(report.errors.join("\n"), /resolved fix is not merged/);
});

test("duplicate reviewers, digest tampering, or non-terminal findings fail closed", () => {
  const fixture = acceptedFixture();
  const second = fixture.records.get(fixture.manifest.reviews[1].path);
  second.reviewer.githubLogin = "reviewer-one";
  second.findings[0].disposition = "pending";
  const report = evaluateExternalReviewGate(fixture);
  assert.equal(report.satisfied, false);
  assert.match(report.errors.join("\n"), /digest mismatch/);
  assert.match(report.errors.join("\n"), /reviewers must be distinct/);
  assert.match(report.errors.join("\n"), /disposition is not terminal/);
});
