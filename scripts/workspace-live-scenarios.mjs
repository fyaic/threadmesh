import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Ordinary user goals only. Neither kickoff names a peer, a tool, or a send.
export function liveScenario(name = "api") {
  if (name === "preferences") return {
    name, sender: "brand", receiver: "website", unrelated: "database",
    senderGoal: "Maintain approved product terminology and customer-facing claims",
    receiverGoal: "Maintain the product landing page copy",
    unrelatedGoal: "Maintain database backup schedules",
    prompts: {
      website: "Review landing.json against ../brand/brief.json, our shared source of approved terminology and claims. Keep a short customer-facing headline and description, with the product name in the headline. Keep the page ready as our approved brief evolves.",
      brand: "Update brief.json with the final product decision: the product is now named Member Portal, the free tier is limited to 5 projects, and all customer-facing copy must use US spelling. Remove the old product name and unlimited-free claim from the approved brief. Keep the brief concise.",
    },
    artifact: "website/landing.json",
    businessAssertion: "landing uses Member Portal, states the 5-project free limit, removes old name/unlimited claim and preserves protected price",
    setup(root) {
      fs.writeFileSync(path.join(root, "brand/brief.json"), JSON.stringify({ product: "Team Hub", freeTier: "Unlimited projects", spelling: "UK" }));
      fs.writeFileSync(path.join(root, "website/landing.json"), JSON.stringify({ headline: "Organise work with Team Hub", description: "Unlimited free projects for your team." }));
      fs.writeFileSync(path.join(root, "website/price.txt"), "Paid plan: $12/month\n");
    },
    async verify(root) {
      const page = JSON.parse(fs.readFileSync(path.join(root, "website/landing.json"), "utf8"));
      assert.equal(typeof page.headline, "string");
      assert.equal(typeof page.description, "string");
      assert.match(page.headline, /Member Portal/);
      const copy = `${page.headline}\n${page.description}`;
      assert.match(copy, /\b(?:5|five)[ -]projects?\b/i);
      assert.match(copy, /free/i);
      assert.doesNotMatch(copy, /Team Hub|unlimited|organis(?:e|ed|ing|ation)|colour/i);
      assert.equal(fs.readFileSync(path.join(root, "website/price.txt"), "utf8"), "Paid plan: $12/month\n");
    },
  };
  if (name !== "api") throw new Error("Scenario must be api or preferences");
  return {
    name, sender: "backend", receiver: "client", unrelated: "legal",
    senderGoal: "Maintain the /orders backend API contract",
    receiverGoal: "Maintain the /orders JavaScript client and its pagination behavior",
    unrelatedGoal: "Translate the privacy policy into French",
    prompts: {
      client: "You maintain client.mjs. Inspect it and make sure it follows the current API contract in ../backend/contract.json (the shared source of truth). Keep the exported fetchAll(fetchPage) API returning a flat array. Leave the file ready for use. This task continues as the project evolves.",
      backend: "Revise contract.json to use cursor pagination: requests take cursor (null for first page); responses contain items and next_cursor (null at the end). Remove next_page. Keep the /orders endpoint and item schema unchanged. Finish the backend contract update.",
    },
    artifact: "client/client.mjs",
    businessAssertion: "client follows both cursor pages and terminates",
    setup(root) {
      fs.writeFileSync(path.join(root, "backend/contract.json"), JSON.stringify({ endpoint: "/orders", request: { page: "integer starting at 1" }, response: { items: "array of { id: string }", next_page: "integer or null" } }, null, 2));
      fs.writeFileSync(path.join(root, "client/client.mjs"), "export async function fetchAll(fetchPage) {\n  const items = []; let page = 1;\n  do { const data = await fetchPage({ page }); items.push(...data.items); page = data.next_page; } while (page != null);\n  return items;\n}\n");
    },
    async verify(root) {
      const { fetchAll } = await import(pathToFileURL(path.join(root, "client/client.mjs")).href);
      const calls = [];
      const result = await fetchAll(async args => {
        calls.push(args);
        if (calls.length > 2) throw new Error("Pagination did not terminate");
        assert.deepEqual(args, { cursor: calls.length === 1 ? null : "batch-two" });
        return calls.length === 1 ? { items: [{ id: "one" }], next_cursor: "batch-two" } : { items: [{ id: "two" }], next_cursor: null };
      });
      assert.deepEqual(result, [{ id: "one" }, { id: "two" }]);
    },
  };
}
