import { createHash } from "node:crypto";

function normalize(value) {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }

  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256Digest(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
