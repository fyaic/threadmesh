import extension from "./pi-threadmesh-extension.mjs";

function loadTools() {
  const tools = new Map();
  extension({ registerTool(tool) { tools.set(tool.name, tool); } });
  return tools;
}

async function call(tools, name, parameters) {
  const tool = tools.get(name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool.execute(`call_${name}`, parameters, null, null, null);
}

function projection(result) {
  return {
    isError: result.isError === true,
    ok: result.details?.ok === true,
    code: result.details?.code ?? null,
    sent: result.details?.result?.sent === true,
  };
}

const scenario = process.argv[2];
const discover = "threadmesh_related_tasks";
const suggest = "threadmesh_send_suggestion";
const targetTaskId = JSON.parse(process.env.THREADMESH_TARGET_JSON).taskId;
const suggestion = {
  targetTaskId,
  content: "Verified upstream checksum: sha256:pi-consumer-layer-one.",
  reason: "The receiver declared this checksum dependency.",
};
const tools = loadTools();
let result;

if (scenario === "enumerate") {
  result = {
    tools: [...tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    })),
  };
} else if (scenario === "happy") {
  result = {
    discover: projection(await call(tools, discover, {})),
    suggest: projection(await call(tools, suggest, suggestion)),
  };
} else if (scenario === "send-before-discovery") {
  result = { suggest: projection(await call(tools, suggest, suggestion)) };
} else if (scenario === "unknown-target") {
  await call(tools, discover, {});
  result = {
    suggest: projection(await call(tools, suggest, {
      ...suggestion,
      targetTaskId: "task_unknown_target",
    })),
  };
} else if (scenario === "duplicate-send") {
  await call(tools, discover, {});
  result = {
    first: projection(await call(tools, suggest, suggestion)),
    second: projection(await call(tools, suggest, suggestion)),
  };
} else {
  throw new Error("unknown scenario");
}

process.stdout.write(`${JSON.stringify(result)}\n`);
