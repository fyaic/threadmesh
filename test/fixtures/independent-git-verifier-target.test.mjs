import assert from "node:assert/strict";
import fs from "node:fs";

const value = fs.readFileSync("artifact.txt", "utf8");
if (value.includes("HANG")) await new Promise(() => setInterval(() => {}, 1_000));
assert.equal(value.trim(), "FIXED");
