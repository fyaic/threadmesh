import { runPiConsumerSmoke } from "../src/validation/pi-consumer-validation.mjs";

const result = await runPiConsumerSmoke();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.state === "passed" ? 0 : 1;
