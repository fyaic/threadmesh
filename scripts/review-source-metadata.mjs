import { execFileSync } from "node:child_process";
import process from "node:process";

import { sha256Digest } from "../src/canonical-json.mjs";

const sourceUrl = process.argv[2];
const match = /^https:\/\/github\.com\/fyaic\/threadmesh\/issues\/7#issuecomment-(\d+)$/.exec(
  sourceUrl ?? "",
);
if (!match) {
  console.error("usage: npm run review:source -- https://github.com/fyaic/threadmesh/issues/7#issuecomment-<numeric-id>");
  process.exit(1);
}

let comment;
try {
  comment = JSON.parse(execFileSync(
    "gh",
    ["api", "--hostname", "github.com", `repos/fyaic/threadmesh/issues/comments/${match[1]}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ));
} catch {
  console.error("review source could not be authenticated through GitHub");
  process.exit(2);
}

if (
  comment.html_url !== sourceUrl ||
  comment.issue_url !== "https://api.github.com/repos/fyaic/threadmesh/issues/7"
) {
  console.error("review source is not an issue #7 comment");
  process.exit(2);
}

console.log(JSON.stringify({
  sourceUrl,
  sourceBodyDigest: sha256Digest(comment.body),
  reviewedAt: comment.created_at,
  reviewer: {
    githubLogin: comment.user?.login ?? null,
    githubAuthorAssociation: comment.author_association ?? null,
  },
}, null, 2));
