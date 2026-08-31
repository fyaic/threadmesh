import { sha256Digest } from "../canonical-json.mjs";
import { verifyIndependentGitVerification } from "../validation/independent-git-verifier.mjs";

export const GIT_EVIDENCE_STAGES = Object.freeze([
  "implementation",
  "review-failed",
  "fix",
  "independently-verified",
]);

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code);
}

function valid(value, pattern, code) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateActor(actor, code = "threadmesh_git_evidence_actor_invalid") {
  exactObject(actor, ["taskId", "incarnationId", "threadId", "snapshotDigest"], code);
  valid(actor.taskId, ID, code);
  valid(actor.incarnationId, ID, code);
  valid(actor.threadId, ID, code);
  valid(actor.snapshotDigest, DIGEST, code);
}

function sameActor(left, right) {
  return left.taskId === right.taskId &&
    left.incarnationId === right.incarnationId &&
    left.threadId === right.threadId &&
    left.snapshotDigest === right.snapshotDigest;
}

function actorIdentityDistinct(left, right) {
  return left.taskId !== right.taskId &&
    left.incarnationId !== right.incarnationId &&
    left.threadId !== right.threadId;
}

function requirementBody(input) {
  exactObject(input, [
    "chainId",
    "validatedBaseSha",
    "fixtureSeedSha",
    "fixtureDefinitionDigest",
    "trustedTestBlobDigest",
    "implementer",
    "reviewer",
    "verifier",
    "preconfiguredTrustAnchorDigest",
  ], "threadmesh_git_evidence_requirement_invalid");
  valid(input.chainId, ID, "threadmesh_git_evidence_requirement_invalid");
  valid(input.validatedBaseSha, SHA, "threadmesh_git_evidence_requirement_invalid");
  valid(input.fixtureSeedSha, SHA, "threadmesh_git_evidence_requirement_invalid");
  valid(input.fixtureDefinitionDigest, DIGEST, "threadmesh_git_evidence_requirement_invalid");
  valid(input.trustedTestBlobDigest, DIGEST, "threadmesh_git_evidence_requirement_invalid");
  valid(input.preconfiguredTrustAnchorDigest, DIGEST, "threadmesh_git_evidence_requirement_invalid");
  validateActor(input.implementer);
  validateActor(input.reviewer);
  validateActor(input.verifier);
  if (
    !actorIdentityDistinct(input.implementer, input.reviewer) ||
    !actorIdentityDistinct(input.implementer, input.verifier) ||
    !actorIdentityDistinct(input.reviewer, input.verifier)
  ) fail("threadmesh_git_evidence_roles_not_distinct");
  return clone(input);
}

export function createGitEvidenceRequirement(input) {
  const body = requirementBody(input);
  return deepFreeze({ ...body, requirementDigest: sha256Digest(body) });
}

function validateRequirement(requirement) {
  exactObject(requirement, [
    "chainId",
    "validatedBaseSha",
    "fixtureSeedSha",
    "fixtureDefinitionDigest",
    "trustedTestBlobDigest",
    "implementer",
    "reviewer",
    "verifier",
    "preconfiguredTrustAnchorDigest",
    "requirementDigest",
  ], "threadmesh_git_evidence_requirement_invalid");
  const { requirementDigest, ...body } = requirement;
  const validated = requirementBody(body);
  valid(requirementDigest, DIGEST, "threadmesh_git_evidence_requirement_invalid");
  if (sha256Digest(validated) !== requirementDigest) fail("threadmesh_git_evidence_requirement_tampered");
  return requirement;
}

const PAYLOAD_KEYS = Object.freeze({
  implementation: Object.freeze([
    "actor", "turnId", "toolCallDigest", "commitSha", "parentSha", "treeSha",
    "diffDigest", "testEvidenceDigest",
  ]),
  "review-failed": Object.freeze([
    "actor", "turnId", "toolCallDigest", "implementationSha", "findingDigest",
    "reproductionEvidenceDigest",
  ]),
  fix: Object.freeze([
    "actor", "turnId", "toolCallDigest", "commitSha", "parentSha", "treeSha",
    "diffDigest", "resolvesFindingDigest", "testEvidenceDigest",
  ]),
  "independently-verified": Object.freeze([
    "actor", "turnId", "toolCallDigest", "verificationRequest",
    "verificationResponse", "expectedTrustAnchorDigest",
  ]),
});

const PRIVATE_REQUEST_KEYS = Object.freeze([
  "chain", "implementation", "fix", "finding", "trustedTest", "subject",
]);

function trustAnchorDigest(anchor) {
  return sha256Digest(anchor);
}

function privateVerificationRequest(request) {
  const { repoPath: _repoPath, ...bounded } = request;
  exactObject(bounded, PRIVATE_REQUEST_KEYS, "threadmesh_git_evidence_verification_request_invalid");
  return clone(bounded);
}

function validateIndependentBinding(requirement, records, payload) {
  const implementation = records[0]?.payload;
  const review = records[1]?.payload;
  const fix = records[2]?.payload;
  const request = payload.verificationRequest;
  const response = payload.verificationResponse;
  exactObject(request, PRIVATE_REQUEST_KEYS, "threadmesh_git_evidence_verification_request_invalid");
  valid(payload.expectedTrustAnchorDigest, DIGEST, "threadmesh_git_evidence_payload_invalid");
  const finding = request.finding;
  if (
    request.chain?.chainId !== requirement.chainId ||
    request.chain?.requirementDigest !== requirement.requirementDigest ||
    request.chain?.validatedBaseSha !== requirement.validatedBaseSha ||
    request.chain?.fixtureSeedSha !== requirement.fixtureSeedSha ||
    request.chain?.fixtureDefinitionDigest !== requirement.fixtureDefinitionDigest ||
    request.implementation?.sha !== implementation.commitSha ||
    request.implementation?.treeSha !== implementation.treeSha ||
    request.implementation?.diffDigest !== implementation.diffDigest ||
    request.fix?.sha !== fix.commitSha ||
    request.fix?.treeSha !== fix.treeSha ||
    request.fix?.diffDigest !== fix.diffDigest ||
    finding?.digest !== review.findingDigest ||
    request.trustedTest?.blobDigest !== requirement.trustedTestBlobDigest ||
    request.subject?.senderIncarnationId !== requirement.verifier.incarnationId ||
    payload.expectedTrustAnchorDigest !== requirement.preconfiguredTrustAnchorDigest ||
    trustAnchorDigest(response?.trustAnchor) !== requirement.preconfiguredTrustAnchorDigest
  ) fail("threadmesh_git_evidence_verification_binding_mismatch");
  try {
    verifyIndependentGitVerification({
      request: { ...clone(request), repoPath: "/threadmesh/replay/repository" },
      response,
      expectedTrustAnchor: response.trustAnchor,
    });
  } catch {
    fail("threadmesh_git_evidence_verification_untrusted");
  }
}

function validatePayloadShape(stage, payload) {
  exactObject(payload, PAYLOAD_KEYS[stage], "threadmesh_git_evidence_payload_invalid");
  validateActor(payload.actor);
  valid(payload.turnId, ID, "threadmesh_git_evidence_payload_invalid");
  valid(payload.toolCallDigest, DIGEST, "threadmesh_git_evidence_payload_invalid");
  for (const key of Object.keys(payload)) {
    if (key.endsWith("Sha")) valid(payload[key], SHA, "threadmesh_git_evidence_payload_invalid");
    if (key.endsWith("Digest")) valid(payload[key], DIGEST, "threadmesh_git_evidence_payload_invalid");
  }
}

function validateStageBinding(requirement, records, stage, payload) {
  const implementation = records[0]?.payload;
  const review = records[1]?.payload;
  const fix = records[2]?.payload;
  if (stage === "implementation") {
    if (!sameActor(payload.actor, requirement.implementer)) fail("threadmesh_git_evidence_wrong_actor");
    if (payload.parentSha !== requirement.fixtureSeedSha) fail("threadmesh_git_evidence_wrong_parent");
    if (payload.commitSha === payload.parentSha) fail("threadmesh_git_evidence_commit_invalid");
  } else if (stage === "review-failed") {
    if (!sameActor(payload.actor, requirement.reviewer)) fail("threadmesh_git_evidence_wrong_actor");
    if (payload.implementationSha !== implementation.commitSha) fail("threadmesh_git_evidence_wrong_implementation");
  } else if (stage === "fix") {
    if (!sameActor(payload.actor, requirement.implementer)) fail("threadmesh_git_evidence_wrong_actor");
    if (payload.parentSha !== implementation.commitSha) fail("threadmesh_git_evidence_wrong_parent");
    if (payload.commitSha === payload.parentSha) fail("threadmesh_git_evidence_commit_invalid");
    if (payload.resolvesFindingDigest !== review.findingDigest) fail("threadmesh_git_evidence_wrong_finding");
  } else {
    if (!sameActor(payload.actor, requirement.verifier)) fail("threadmesh_git_evidence_wrong_actor");
    validateIndependentBinding(requirement, records, payload);
  }
}

function recordBody({ requirement, stage, sequence, previousRecordDigest, payload }) {
  return {
    chainId: requirement.chainId,
    requirementDigest: requirement.requirementDigest,
    stage,
    sequence,
    previousRecordDigest,
    payload: clone(payload),
  };
}

export function validateGitEvidenceChain(requirement, records = []) {
  validateRequirement(requirement);
  if (!Array.isArray(records) || records.length > GIT_EVIDENCE_STAGES.length) {
    fail("threadmesh_git_evidence_records_invalid");
  }
  let previousRecordDigest = null;
  const seen = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    exactObject(record, [
      "chainId", "requirementDigest", "stage", "sequence", "previousRecordDigest",
      "payload", "recordDigest",
    ], "threadmesh_git_evidence_record_invalid");
    const stage = GIT_EVIDENCE_STAGES[index];
    if (record.chainId !== requirement.chainId || record.requirementDigest !== requirement.requirementDigest) {
      fail("threadmesh_git_evidence_chain_mismatch");
    }
    if (record.stage !== stage || record.sequence !== index + 1) fail("threadmesh_git_evidence_stage_order_invalid");
    if (record.previousRecordDigest !== previousRecordDigest) fail("threadmesh_git_evidence_previous_digest_invalid");
    validatePayloadShape(stage, record.payload);
    validateStageBinding(requirement, records.slice(0, index), stage, record.payload);
    const { recordDigest, ...body } = record;
    valid(recordDigest, DIGEST, "threadmesh_git_evidence_record_invalid");
    if (sha256Digest(body) !== recordDigest) fail("threadmesh_git_evidence_record_tampered");
    if (seen.has(recordDigest)) fail("threadmesh_git_evidence_record_duplicate");
    seen.add(recordDigest);
    previousRecordDigest = recordDigest;
  }
  return deepFreeze({
    structurallyComplete: records.length === GIT_EVIDENCE_STAGES.length,
    trustedComplete: records.length === GIT_EVIDENCE_STAGES.length,
    nextStage: GIT_EVIDENCE_STAGES[records.length] ?? null,
    headDigest: previousRecordDigest,
    recordCount: records.length,
  });
}

export function appendGitEvidenceRecord(requirement, records, { stage, payload }) {
  const state = validateGitEvidenceChain(requirement, records);
  if (state.structurallyComplete) fail("threadmesh_git_evidence_chain_complete");
  if (stage !== state.nextStage) fail("threadmesh_git_evidence_stage_order_invalid");
  if (stage === "independently-verified") fail("threadmesh_git_evidence_bridge_required");
  validatePayloadShape(stage, payload);
  validateStageBinding(requirement, records, stage, payload);
  const body = recordBody({
    requirement,
    stage,
    sequence: records.length + 1,
    previousRecordDigest: state.headDigest,
    payload,
  });
  const record = deepFreeze({ ...body, recordDigest: sha256Digest(body) });
  return record;
}

export function appendIndependentVerificationRecord(requirement, records, {
  actor,
  turnId,
  toolCallDigest,
  request,
  response,
  expectedTrustAnchor,
}) {
  const state = validateGitEvidenceChain(requirement, records);
  if (state.structurallyComplete) fail("threadmesh_git_evidence_chain_complete");
  if (state.nextStage !== "independently-verified") fail("threadmesh_git_evidence_stage_order_invalid");
  if (trustAnchorDigest(expectedTrustAnchor) !== requirement.preconfiguredTrustAnchorDigest) {
    fail("threadmesh_git_evidence_wrong_trust_anchor");
  }
  if (trustAnchorDigest(response?.trustAnchor) !== trustAnchorDigest(expectedTrustAnchor)) {
    fail("threadmesh_git_evidence_wrong_trust_anchor");
  }
  const payload = {
    actor,
    turnId,
    toolCallDigest,
    verificationRequest: privateVerificationRequest(request),
    verificationResponse: clone(response),
    expectedTrustAnchorDigest: trustAnchorDigest(expectedTrustAnchor),
  };
  validatePayloadShape("independently-verified", payload);
  validateStageBinding(requirement, records, "independently-verified", payload);
  const body = recordBody({
    requirement,
    stage: "independently-verified",
    sequence: records.length + 1,
    previousRecordDigest: state.headDigest,
    payload,
  });
  return deepFreeze({ ...body, recordDigest: sha256Digest(body) });
}
