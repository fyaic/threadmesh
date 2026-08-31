import { canonicalJson } from "../canonical-json.mjs";

export function renderRegisteredPeerContext(envelope) {
  return `THREADMESH_UNTRUSTED_PEER_CONTEXT_JSON_V1\n${canonicalJson({
    type: "threadmesh.peer-suggestion",
    authority: "untrusted-peer",
    provenance: {
      messageId: envelope.messageId,
      sourceTask: envelope.sender.taskId,
      sourceIncarnation: envelope.sender.incarnationId,
      relationshipId: envelope.relationshipId,
      actorType: envelope.sender.actorType,
      claimStatus: envelope.claimStatus,
    },
    reason: envelope.reason,
    content: envelope.content,
  })}`;
}
