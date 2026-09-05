import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { liveScenario } from "../scripts/workspace-live-scenarios.mjs";

test("copy case rejects unchanged, misleading and out-of-scope artifacts", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-copy-assertion-"));
  const scenario = liveScenario("preferences");
  try {
    for (const name of [scenario.sender, scenario.receiver]) fs.mkdirSync(path.join(root, name));
    scenario.setup(root);
    await assert.rejects(scenario.verify(root));
    const write = description => fs.writeFileSync(path.join(root, scenario.artifact), JSON.stringify({ headline: "Organize with Member Portal", description, signupButton: "Create my workspace" }));
    write("Unlimited free use with 5 projects.");
    await assert.rejects(scenario.verify(root));
    write("Start free with up to 5 projects.");
    await scenario.verify(root);
    const approved = fs.readFileSync(path.join(root, scenario.artifact), "utf8");
    fs.writeFileSync(path.join(root, scenario.artifact), approved.replace("Create my workspace", "Sign up"));
    await assert.rejects(scenario.verify(root), /Create my workspace/);
    fs.writeFileSync(path.join(root, scenario.artifact), approved);
    fs.writeFileSync(path.join(root, "website/price.txt"), "Paid plan: $25/month\n");
    await assert.rejects(scenario.verify(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("no-contact control changes only internal backend notes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-no-contact-"));
  const scenario = liveScenario("api-no-contact");
  try {
    for (const name of [scenario.sender, scenario.receiver]) fs.mkdirSync(path.join(root, name));
    scenario.setup(root);
    fs.writeFileSync(path.join(root, "backend/local-notes.md"), "Internal agenda review: Monday.\n");
    await scenario.verify(root);
    assert.equal(scenario.expectsContact, false);
    fs.writeFileSync(path.join(root, "backend/contract.json"), "{}");
    await assert.rejects(scenario.verify(root));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("API case keeps original ordinary prompts and rejects old pagination", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-api-assertion-"));
  const scenario = liveScenario();
  try {
    for (const name of [scenario.sender, scenario.receiver]) fs.mkdirSync(path.join(root, name));
    scenario.setup(root);
    await assert.rejects(scenario.verify(root));
    assert.equal(scenario.name, "api");
    for (const name of ["api", "preferences", "api-no-contact"]) {
      for (const prompt of Object.values(liveScenario(name).prompts)) assert.doesNotMatch(prompt, /threadmesh_|send|message|contact/i);
    }
    assert.throws(() => liveScenario("unknown"), /Scenario must/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
