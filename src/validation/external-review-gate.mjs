import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { sha256Digest } from "../canonical-json.mjs";

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

function sourceCommentId(sourceUrl) {
  const match = /^https:\/\/github\.com\/fyaic\/threadmesh\/issues\/7#issuecomment-(\d+)$/.exec(
    sourceUrl ?? "",
  );
  return match?.[1] ?? null;
}

function expectedRelationship(authorAssociation) {
  return INSIDE_ASSOCIATIONS.has(authorAssociation)
    ? "maintainer-organization"
    : "outside-maintainer-organization";
}

function bodyBindsReview(body, record) {
  if (!nonEmpty(body)) return false;
  const lane = record.perspective === "distributed-systems"
    ? "distributed systems"
    : "agent safety";
  const lowerBody = body.toLowerCase();
  const identityBound = body.includes(`Reviewed commit: ${record.reviewedCommit}`) &&
    lowerBody.includes(`review lane: ${lane}`) &&
    lowerBody.includes(`verdict: ${record.verdict}`);
  const findingsBound = Array.isArray(record.findings) && record.findings.length > 0
    ? record.findings.every((finding) =>
        nonEmpty(finding?.location) &&
        nonEmpty(finding?.summary) &&
        body.includes(finding.location) &&
        body.includes(finding.summary))
    : /\bno findings\b/i.test(body);
  return identityBound && findingsBound;
}

function validateRecord(entry, record, source, verifiedEvidenceUrls, manifest, errors) {
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

  const commentId = sourceCommentId(record?.sourceUrl);
  if (!commentId) errors.push(`${label}: source must be a numeric issue #7 comment permalink`);
  if (!nonEmpty(record?.sourceBodyDigest)) errors.push(`${label}: sourceBodyDigest missing`);
  if (!nonEmpty(record?.reviewedAt) || Number.isNaN(Date.parse(record.reviewedAt))) {
    errors.push(`${label}: reviewedAt invalid`);
  }

  if (!source) {
    errors.push(`${label}: authenticated GitHub source unavailable`);
  } else {
    if (String(source.commentDatabaseId) !== commentId) {
      errors.push(`${label}: GitHub comment database ID mismatch`);
    }
    if (source.url !== record.sourceUrl || source.issueUrl !== ISSUE_URL) {
      errors.push(`${label}: GitHub source repository or issue mismatch`);
    }
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
    if (!bodyBindsReview(source.body, record)) {
      errors.push(`${label}: GitHub source body does not bind commit, perspective, and verdict`);
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
    if (!nonEmpty(finding?.rationale) || !/^https:\/\/github\.com\/fyaic\/threadmesh\//.test(
      finding?.evidenceUrl ?? "",
    )) {
      errors.push(`${findingLabel}: rationale or repository evidence missing`);
    } else if (!verifiedEvidenceUrls.has(finding.evidenceUrl)) {
      errors.push(`${findingLabel}: repository evidence URL could not be verified`);
    }
  }
}

export function evaluateExternalReviewGate({
  manifest,
  records,
  verifiedSources = new Map(),
  verifiedEvidenceUrls = new Set(),
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
  const safeSources = verifiedSources instanceof Map ? verifiedSources : new Map();
  const safeEvidenceUrls = verifiedEvidenceUrls instanceof Set
    ? verifiedEvidenceUrls
    : new Set();
  for (const entry of entries) {
    const record = nonEmpty(entry?.path) ? safeRecords.get(entry.path) : null;
    if (!record) errors.push(`${entry?.path ?? "<invalid-review-path>"}: record missing`);
    else validateRecord(
      entry,
      record,
      safeSources.get(record.sourceUrl),
      safeEvidenceUrls,
      safeManifest,
      errors,
    );
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

function fetchGithubSource(record) {
  const commentId = sourceCommentId(record?.sourceUrl);
  if (!commentId) return null;
  try {
    const output = execFileSync("gh", [
      "api",
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

function verifyGithubEvidenceUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.origin !== "https://github.com") return false;
  if (url.hash || url.search) return false;
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] !== "fyaic" || segments[1] !== "threadmesh") return false;
  let apiPath;
  if ((segments[2] === "pull" || segments[2] === "issues") && /^\d+$/.test(segments[3] ?? "")) {
    apiPath = `repos/${REPOSITORY}/${segments[2] === "pull" ? "pulls" : "issues"}/${segments[3]}`;
  } else if (segments[2] === "commit" && /^[0-9a-f]{40}$/.test(segments[3] ?? "")) {
    apiPath = `repos/${REPOSITORY}/commits/${segments[3]}`;
  } else {
    return false;
  }
  try {
    const output = execFileSync("gh", ["api", apiPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const resource = JSON.parse(output);
    return resource.html_url === `${url.origin}${url.pathname}`;
  } catch {
    return false;
  }
}

export function verifyExternalReviewGate({ root }) {
  const manifestPath = path.join(root, "docs", "09-reviews", "m0-review-gate.json");
  let manifest;
  const records = new Map();
  const verifiedSources = new Map();
  const verifiedEvidenceUrls = new Set();
  try {
    manifest = readJson(manifestPath);
    for (const entry of Array.isArray(manifest?.reviews) ? manifest.reviews : []) {
      if (!nonEmpty(entry?.path)) continue;
      const absolute = path.resolve(root, entry.path);
      const reviewRoot = path.resolve(root, REVIEW_PATH_PREFIX);
      if (!absolute.startsWith(`${reviewRoot}${path.sep}`)) continue;
      const record = readJson(absolute);
      records.set(entry.path, record);
      const source = fetchGithubSource(record);
      if (source) verifiedSources.set(record.sourceUrl, source);
      for (const finding of Array.isArray(record.findings) ? record.findings : []) {
        if (verifyGithubEvidenceUrl(finding.evidenceUrl)) {
          verifiedEvidenceUrls.add(finding.evidenceUrl);
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
    verifiedSources,
    verifiedEvidenceUrls,
    targetIsAncestor,
  });
}

export function evaluateLiveRepositoryState({ head, branch, clean, remoteMain, errors = [] }) {
  const result = { satisfied: false, head, branch, clean, remoteMain, errors: [...errors] };
  if (result.branch !== "main") result.errors.push("live validation requires branch main");
  if (!result.clean) result.errors.push("live validation requires a clean worktree");
  if (result.head !== result.remoteMain) {
    result.errors.push("local HEAD must equal the current GitHub main commit");
  }
  result.satisfied = result.errors.length === 0;
  return result;
}

export function verifyLiveRepositoryState({ root }) {
  const snapshot = {
    head: null,
    branch: null,
    clean: false,
    remoteMain: null,
    errors: [],
  };
  try {
    snapshot.head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    snapshot.branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    snapshot.clean = execFileSync("git", ["status", "--porcelain"], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).length === 0;
    snapshot.remoteMain = execFileSync("gh", [
      "api", `repos/${REPOSITORY}/commits/main`, "--jq", ".sha",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    snapshot.errors.push("repository state or remote main could not be verified");
  }
  return evaluateLiveRepositoryState(snapshot);
}
