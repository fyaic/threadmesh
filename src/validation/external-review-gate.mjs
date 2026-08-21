import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256Digest } from "../canonical-json.mjs";

const REPOSITORY = "fyaic/threadmesh";
const ISSUE_URL = `https://github.com/${REPOSITORY}/issues/7`;
const REVIEW_PATH_PREFIX = "docs/09-reviews/external/";
const TERMINAL_DISPOSITIONS = new Set([
  "accepted",
  "resolved",
  "deferred-with-rationale",
  "rejected-with-rationale",
]);
const ACCEPTED_VERDICTS = new Set(["approve", "approve-with-resolved-findings"]);
const INSIDE_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issueCommentId(url) {
  const match = /^https:\/\/github\.com\/fyaic\/threadmesh\/issues\/7#issuecomment-(\d+)$/.exec(
    url ?? "",
  );
  return match?.[1] ?? null;
}

function extractCanonicalMachineBlock(body, name) {
  if (!nonEmpty(body)) return null;
  const opener = `<!-- ${name}\n`;
  const closer = "\n-->";
  const start = body.indexOf(opener);
  if (start < 0 || body.indexOf(opener, start + opener.length) >= 0) return null;
  const payloadStart = start + opener.length;
  const end = body.indexOf(closer, payloadStart);
  if (end < 0 || body.indexOf(closer, end + closer.length) >= 0) return null;
  const payload = body.slice(payloadStart, end);
  if (payload.includes("\n")) return null;
  try {
    const parsed = JSON.parse(payload);
    return canonicalJson(parsed) === payload ? parsed : null;
  } catch {
    return null;
  }
}

function reviewClaim(record) {
  return {
    findings: Array.isArray(record.findings)
      ? record.findings.map((finding) => ({
          id: finding.id,
          location: finding.location,
          summary: finding.summary,
        }))
      : null,
    perspective: record.perspective,
    reviewedCommit: record.reviewedCommit,
    schemaVersion: 1,
    verdict: record.verdict,
  };
}

function dispositionClaim(record, finding) {
  return {
    disposition: finding.disposition,
    findingId: finding.id,
    fixUrl: finding.fixUrl ?? null,
    rationale: finding.rationale,
    reviewId: record.reviewId,
    schemaVersion: 1,
  };
}

function expectedRelationship(authorAssociation) {
  return INSIDE_ASSOCIATIONS.has(authorAssociation)
    ? "maintainer-organization"
    : "outside-maintainer-organization";
}

function validateCommentIdentity(url, comment, errors, label) {
  const commentId = issueCommentId(url);
  if (!commentId) {
    errors.push(`${label}: source must be a numeric issue #7 comment permalink`);
    return false;
  }
  if (!comment) {
    errors.push(`${label}: authenticated GitHub comment unavailable`);
    return false;
  }
  if (
    String(comment.commentDatabaseId) !== commentId ||
    comment.url !== url ||
    comment.issueUrl !== ISSUE_URL
  ) {
    errors.push(`${label}: GitHub comment repository, issue, or ID mismatch`);
    return false;
  }
  return true;
}

function validateRecord(entry, record, comments, verifiedFixes, manifest, errors) {
  const label = nonEmpty(entry?.path) ? entry.path : "<invalid-review-path>";
  if (!nonEmpty(entry?.path) ||
      !entry.path.startsWith(REVIEW_PATH_PREFIX) ||
      !entry.path.endsWith(".json")) {
    errors.push(`${label}: review path is outside ${REVIEW_PATH_PREFIX}`);
  }
  if (!nonEmpty(entry?.digest) || entry.digest !== sha256Digest(record)) {
    errors.push(`${label}: digest mismatch`);
  }
  if (record?.schemaVersion !== 1) errors.push(`${label}: unsupported schemaVersion`);
  if (!nonEmpty(record?.reviewId)) errors.push(`${label}: reviewId missing`);
  if (!nonEmpty(record?.reviewer?.githubLogin)) errors.push(`${label}: reviewer login missing`);
  if (!nonEmpty(record?.reviewer?.affiliation)) errors.push(`${label}: affiliation missing`);
  if (!["maintainer-organization", "outside-maintainer-organization"].includes(
    record?.reviewer?.organizationRelationship,
  )) {
    errors.push(`${label}: organization relationship invalid`);
  }
  if (!manifest.requiredPerspectives.includes(record?.perspective)) {
    errors.push(`${label}: perspective not required by gate`);
  }
  if (record?.reviewedCommit !== manifest.reviewTarget) {
    errors.push(`${label}: reviewed commit differs from gate target`);
  }
  if (!ACCEPTED_VERDICTS.has(record?.verdict)) errors.push(`${label}: verdict is not accepted`);
  if (!nonEmpty(record?.sourceBodyDigest)) errors.push(`${label}: sourceBodyDigest missing`);
  if (!nonEmpty(record?.reviewedAt) || Number.isNaN(Date.parse(record.reviewedAt))) {
    errors.push(`${label}: reviewedAt invalid`);
  }

  const source = comments.get(record?.sourceUrl);
  if (validateCommentIdentity(record?.sourceUrl, source, errors, label)) {
    if (source.githubLogin !== record.reviewer?.githubLogin) {
      errors.push(`${label}: GitHub source author mismatch`);
    }
    if (record.reviewer?.organizationRelationship !== expectedRelationship(source.authorAssociation)) {
      errors.push(`${label}: GitHub author association contradicts organization relationship`);
    }
    if (record.sourceBodyDigest !== sha256Digest(source.body)) {
      errors.push(`${label}: GitHub source body digest mismatch`);
    }
    if (source.createdAt !== record.reviewedAt) {
      errors.push(`${label}: GitHub source timestamp mismatch`);
    }
    const machineReview = extractCanonicalMachineBlock(source.body, "threadmesh-review-v1");
    if (canonicalJson(machineReview) !== canonicalJson(reviewClaim(record))) {
      errors.push(`${label}: reviewer-authored machine block does not exactly match the record`);
    }
  }

  if (!Array.isArray(record?.findings)) {
    errors.push(`${label}: findings must be an array`);
    return;
  }
  for (const [index, finding] of record.findings.entries()) {
    const findingLabel = `${label}: finding ${index + 1}`;
    if (!nonEmpty(finding?.id) || !nonEmpty(finding?.location) || !nonEmpty(finding?.summary)) {
      errors.push(`${findingLabel}: identity, location, or summary missing`);
    }
    if (!TERMINAL_DISPOSITIONS.has(finding?.disposition)) {
      errors.push(`${findingLabel}: disposition is not terminal`);
    }
    if (!nonEmpty(finding?.rationale)) errors.push(`${findingLabel}: rationale missing`);
    if (!nonEmpty(finding?.evidenceBodyDigest)) {
      errors.push(`${findingLabel}: evidenceBodyDigest missing`);
    }
    if (!nonEmpty(finding?.dispositionAt) || Number.isNaN(Date.parse(finding.dispositionAt))) {
      errors.push(`${findingLabel}: dispositionAt invalid`);
    }
    const disposition = comments.get(finding?.evidenceUrl);
    if (validateCommentIdentity(finding?.evidenceUrl, disposition, errors, findingLabel)) {
      if (!INSIDE_ASSOCIATIONS.has(disposition.authorAssociation)) {
        errors.push(`${findingLabel}: disposition source is not maintainer-associated`);
      }
      if (finding.evidenceBodyDigest !== sha256Digest(disposition.body)) {
        errors.push(`${findingLabel}: disposition body digest mismatch`);
      }
      if (finding.dispositionAt !== disposition.createdAt) {
        errors.push(`${findingLabel}: disposition timestamp mismatch`);
      }
      const machineDisposition = extractCanonicalMachineBlock(
        disposition.body,
        "threadmesh-disposition-v1",
      );
      if (canonicalJson(machineDisposition) !== canonicalJson(dispositionClaim(record, finding))) {
        errors.push(`${findingLabel}: authenticated disposition block does not match the record`);
      }
    }
    if (finding.disposition === "resolved") {
      if (!nonEmpty(finding.fixUrl) || !verifiedFixes.get(finding.fixUrl)?.accepted) {
        errors.push(`${findingLabel}: resolved fix is not merged into the current commit`);
      }
    } else if (finding.fixUrl !== null && finding.fixUrl !== undefined) {
      errors.push(`${findingLabel}: non-resolved disposition must not claim a fix URL`);
    }
  }
}

export function evaluateExternalReviewGate({
  manifest,
  records,
  verifiedComments = new Map(),
  verifiedFixes = new Map(),
  targetIsAncestor = true,
}) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push("manifest schemaVersion must be 1");
  if (manifest?.scope !== "m0-normative") errors.push("manifest scope must be m0-normative");
  if (manifest?.issueUrl !== ISSUE_URL) errors.push("manifest issueUrl must identify issue #7");
  if (!/^[0-9a-f]{40}$/.test(manifest?.reviewTarget ?? "")) {
    errors.push("manifest reviewTarget must be a full commit SHA");
  }
  if (manifest?.requiredReviews !== 2) errors.push("manifest must require exactly two reviews");
  if (!Array.isArray(manifest?.requiredPerspectives) ||
      !["agent-safety", "distributed-systems"].every((value) =>
        manifest.requiredPerspectives.includes(value))) {
    errors.push("manifest must require distributed-systems and agent-safety perspectives");
  }
  if (!Array.isArray(manifest?.reviews)) errors.push("manifest reviews must be an array");
  if (!targetIsAncestor) errors.push("review target is not an ancestor of the current commit");

  const entries = Array.isArray(manifest?.reviews) ? manifest.reviews : [];
  const requiredPerspectives = Array.isArray(manifest?.requiredPerspectives)
    ? manifest.requiredPerspectives
    : [];
  const safeManifest = { ...manifest, requiredPerspectives };
  const safeRecords = records instanceof Map ? records : new Map();
  const safeComments = verifiedComments instanceof Map ? verifiedComments : new Map();
  const safeFixes = verifiedFixes instanceof Map ? verifiedFixes : new Map();
  for (const entry of entries) {
    const record = nonEmpty(entry?.path) ? safeRecords.get(entry.path) : null;
    if (!record) errors.push(`${entry?.path ?? "<invalid-review-path>"}: record missing`);
    else validateRecord(entry, record, safeComments, safeFixes, safeManifest, errors);
  }

  const loaded = entries
    .map((entry) => nonEmpty(entry?.path) ? safeRecords.get(entry.path) : null)
    .filter(Boolean);
  const reviewers = new Set(loaded.map((record) => record.reviewer?.githubLogin));
  const reviewIds = new Set(loaded.map((record) => record.reviewId));
  const perspectives = new Set(loaded.map((record) => record.perspective));
  if (entries.length !== manifest?.requiredReviews) errors.push("required review count not met");
  if (reviewers.size !== entries.length) errors.push("reviewers must be distinct");
  if (reviewIds.size !== entries.length) errors.push("reviewIds must be distinct");
  if (!requiredPerspectives.every((value) => perspectives.has(value))) {
    errors.push("required review perspectives not covered");
  }
  if (!loaded.some((record) =>
    record.reviewer?.organizationRelationship === "outside-maintainer-organization")) {
    errors.push("no reviewer outside the maintainer organization");
  }
  if (manifest?.status !== "accepted") errors.push("manifest status is not accepted");

  return {
    satisfied: errors.length === 0,
    scope: manifest?.scope ?? null,
    reviewTarget: manifest?.reviewTarget ?? null,
    reviewCount: loaded.length,
    externalReviewerCount: loaded.filter((record) =>
      record.reviewer?.organizationRelationship === "outside-maintainer-organization").length,
    perspectives: [...perspectives].sort(),
    errors,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fetchGithubComment(url) {
  const commentId = issueCommentId(url);
  if (!commentId) return null;
  try {
    const output = execFileSync("gh", [
      "api",
      "--hostname",
      "github.com",
      `repos/${REPOSITORY}/issues/comments/${commentId}`,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const comment = JSON.parse(output);
    return {
      commentDatabaseId: comment.id,
      url: comment.html_url,
      issueUrl: comment.issue_url?.replace("api.github.com/repos", "github.com"),
      githubLogin: comment.user?.login,
      authorAssociation: comment.author_association,
      body: comment.body,
      createdAt: comment.created_at,
    };
  } catch {
    return null;
  }
}

function verifyGithubFixUrl(value, root) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { accepted: false };
  }
  if (url.origin !== "https://github.com" || url.hash || url.search) return { accepted: false };
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "fyaic" || segments[1] !== "threadmesh") return { accepted: false };
  let apiPath;
  let commit;
  if (segments[2] === "pull" && /^\d+$/.test(segments[3] ?? "")) {
    apiPath = `repos/${REPOSITORY}/pulls/${segments[3]}`;
  } else if (segments[2] === "commit" && /^[0-9a-f]{40}$/.test(segments[3] ?? "")) {
    apiPath = `repos/${REPOSITORY}/commits/${segments[3]}`;
    commit = segments[3];
  } else {
    return { accepted: false };
  }
  try {
    const output = execFileSync("gh", ["api", "--hostname", "github.com", apiPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const resource = JSON.parse(output);
    if (resource.html_url !== `${url.origin}${url.pathname}`) return { accepted: false };
    if (segments[2] === "pull") {
      if (!resource.merged_at || !/^[0-9a-f]{40}$/.test(resource.merge_commit_sha ?? "")) {
        return { accepted: false };
      }
      commit = resource.merge_commit_sha;
    }
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: root,
      stdio: "ignore",
    });
    return { accepted: true, commit };
  } catch {
    return { accepted: false };
  }
}

export function verifyExternalReviewGate({ root }) {
  const manifestPath = path.join(root, "docs", "09-reviews", "m0-review-gate.json");
  let manifest;
  const records = new Map();
  const verifiedComments = new Map();
  const verifiedFixes = new Map();
  try {
    manifest = readJson(manifestPath);
    for (const entry of Array.isArray(manifest?.reviews) ? manifest.reviews : []) {
      if (!nonEmpty(entry?.path)) continue;
      const absolute = path.resolve(root, entry.path);
      const reviewRoot = path.resolve(root, REVIEW_PATH_PREFIX);
      if (!absolute.startsWith(`${reviewRoot}${path.sep}`)) continue;
      const record = readJson(absolute);
      records.set(entry.path, record);
      for (const url of [
        record.sourceUrl,
        ...(Array.isArray(record.findings)
          ? record.findings.map((finding) => finding.evidenceUrl)
          : []),
      ]) {
        if (!verifiedComments.has(url)) verifiedComments.set(url, fetchGithubComment(url));
      }
      for (const finding of Array.isArray(record.findings) ? record.findings : []) {
        if (finding.fixUrl && !verifiedFixes.has(finding.fixUrl)) {
          verifiedFixes.set(finding.fixUrl, verifyGithubFixUrl(finding.fixUrl, root));
        }
      }
    }
  } catch {
    return {
      satisfied: false,
      scope: null,
      reviewTarget: null,
      reviewCount: 0,
      externalReviewerCount: 0,
      perspectives: [],
      errors: ["review manifest or record could not be read"],
    };
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
  return evaluateExternalReviewGate({
    manifest,
    records,
    verifiedComments,
    verifiedFixes,
    targetIsAncestor,
  });
}

export function verifyIsolatedExecutionState({ root, expectedSha }) {
  const result = {
    satisfied: false,
    head: null,
    branch: null,
    clean: false,
    remoteMain: null,
    expectedSha: expectedSha ?? null,
    errors: [],
  };
  try {
    result.head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    result.branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    result.clean = execFileSync("git", ["status", "--porcelain"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).length === 0;
    result.remoteMain = execFileSync("gh", [
      "api", "--hostname", "github.com", `repos/${REPOSITORY}/commits/main`, "--jq", ".sha",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    result.errors.push("isolated repository state could not be verified");
    return result;
  }
  if (!/^[0-9a-f]{40}$/.test(result.expectedSha ?? "")) {
    result.errors.push("isolated execution SHA missing or invalid");
  }
  if (result.branch !== "") result.errors.push("live child must run in a detached worktree");
  if (!result.clean) result.errors.push("isolated live worktree is not clean");
  if (result.head !== result.expectedSha || result.head !== result.remoteMain) {
    result.errors.push("isolated execution does not match validated GitHub main");
  }
  result.satisfied = result.errors.length === 0;
  return result;
}
