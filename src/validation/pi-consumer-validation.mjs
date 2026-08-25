import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { sha256Digest } from "../canonical-json.mjs";
import { createPiIntegrationFixture } from "./pi-integration-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = (name) => path.join(root, "test", "fixtures", name);
const execFileAsync = promisify(execFile);

function fileDigest(filename) {
  return `sha256:${createHash("sha256").update(fs.readFileSync(filename)).digest("hex")}`;
}

export function piConsumerEnvironment(fixture) {
  return {
    PATH: process.env.PATH,
    THREADMESH_URL: fixture.endpoint,
    THREADMESH_SENDER_TOKEN: fixture.senderToken,
    THREADMESH_SOURCE_JSON: JSON.stringify(fixture.source),
    THREADMESH_TARGET_JSON: JSON.stringify(fixture.target),
    THREADMESH_RELATIONSHIP_ID: fixture.relationshipId,
  };
}

export function installPackedPiConsumer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-pi-consumer-"));
  const packageDirectory = path.join(directory, "package");
  const consumerDirectory = path.join(directory, "consumer");
  fs.mkdirSync(packageDirectory);
  fs.mkdirSync(consumerDirectory);
  try {
    const packed = JSON.parse(execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", packageDirectory],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ))[0];
    const tarball = path.join(packageDirectory, packed.filename);
    fs.writeFileSync(
      path.join(consumerDirectory, "package.json"),
      JSON.stringify({ name: "threadmesh-pi-consumer", private: true, type: "module" }),
    );
    execFileSync(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      { cwd: consumerDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    fs.copyFileSync(
      fixturePath("pi-threadmesh-extension.mjs"),
      path.join(consumerDirectory, "pi-threadmesh-extension.mjs"),
    );
    fs.copyFileSync(
      fixturePath("pi-consumer-driver.mjs"),
      path.join(consumerDirectory, "pi-consumer-driver.mjs"),
    );
    return {
      directory,
      consumerDirectory,
      extensionPath: path.join(consumerDirectory, "pi-threadmesh-extension.mjs"),
      package: {
        name: packed.name,
        version: packed.version,
        integrity: packed.integrity,
        tarballDigest: fileDigest(tarball),
        entryCount: packed.entryCount,
      },
      close() {
        fs.rmSync(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

async function runConsumerCase(consumerDirectory, scenario) {
  const fixture = await createPiIntegrationFixture({ condition: "relevant" });
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [path.join(consumerDirectory, "pi-consumer-driver.mjs"), scenario],
      {
        cwd: consumerDirectory,
        env: piConsumerEnvironment(fixture),
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 1_000_000,
      },
    );
    const value = JSON.parse(stdout);
    const page = await fixture.receiver.pollMailbox({ receiver: fixture.target });
    const decisions = [];
    for (const message of page.messages) {
      const decided = await fixture.receiver.decide({ message, decision: "accepted" });
      decisions.push(decided.disposition.decision);
    }
    return {
      scenario,
      value,
      mailboxMessages: page.messages.length,
      receiverDecisions: decisions,
    };
  } finally {
    await fixture.close();
  }
}

function evaluateCases(cases) {
  const byName = new Map(cases.map((value) => [value.scenario, value]));
  const enumeration = byName.get("enumerate");
  const happy = byName.get("happy");
  const before = byName.get("send-before-discovery");
  const unknown = byName.get("unknown-target");
  const duplicate = byName.get("duplicate-send");
  const toolNames = enumeration.value.tools.map(({ name }) => name);
  const checks = [
    {
      id: "PI-L1-01",
      state: "passed",
      evidence: "packed consumer imported and executed",
    },
    {
      id: "PI-L1-02",
      state: JSON.stringify(toolNames) === JSON.stringify([
        "threadmesh_related_tasks",
        "threadmesh_send_suggestion",
      ]) ? "passed" : "failed",
      toolCount: toolNames.length,
      toolNames,
      toolsHash: sha256Digest(enumeration.value.tools),
    },
    {
      id: "PI-L1-03",
      state: happy.value.discover.ok === true && happy.value.suggest.sent === true &&
        happy.mailboxMessages === 1 && happy.receiverDecisions[0] === "accepted"
        ? "passed" : "failed",
      mailboxMessages: happy.mailboxMessages,
      receiverDecision: happy.receiverDecisions[0] ?? null,
    },
    {
      id: "PI-L1-04",
      state: before.value.suggest.code === "threadmesh_proactive_bridge_discovery_required" &&
        before.mailboxMessages === 0 ? "passed" : "failed",
      code: before.value.suggest.code,
      mailboxMessages: before.mailboxMessages,
    },
    {
      id: "PI-L1-05",
      state: unknown.value.suggest.code === "threadmesh_proactive_bridge_target_unknown" &&
        unknown.mailboxMessages === 0 ? "passed" : "failed",
      code: unknown.value.suggest.code,
      mailboxMessages: unknown.mailboxMessages,
    },
    {
      id: "PI-L1-06",
      state: duplicate.value.first.sent === true &&
        duplicate.value.second.code === "threadmesh_proactive_bridge_send_budget_exceeded" &&
        duplicate.mailboxMessages === 1 && duplicate.receiverDecisions[0] === "accepted"
        ? "passed" : "failed",
      code: duplicate.value.second.code,
      mailboxMessages: duplicate.mailboxMessages,
      receiverDecision: duplicate.receiverDecisions[0] ?? null,
    },
  ];
  return { checks, state: checks.every(({ state }) => state === "passed") ? "passed" : "failed" };
}

export async function runPiConsumerSmoke() {
  const startedAt = new Date().toISOString();
  const consumer = installPackedPiConsumer();
  let result;

  try {
    const cases = [];
    for (const scenario of [
      "enumerate",
      "happy",
      "send-before-discovery",
      "unknown-target",
      "duplicate-send",
    ]) {
      cases.push(await runConsumerCase(consumer.consumerDirectory, scenario));
    }
    const evaluated = evaluateCases(cases);
    result = {
      mode: "pi-consumer-smoke",
      startedAt,
      finishedAt: new Date().toISOString(),
      state: evaluated.state,
      package: consumer.package,
      checks: evaluated.checks,
    };
  } finally {
    consumer.close();
  }
  return {
    ...result,
    cleanup: {
      attempted: true,
      complete: !fs.existsSync(consumer.directory),
      temporaryConsumerRemoved: !fs.existsSync(consumer.directory),
    },
  };
}
