import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "docs", "assets", "demo");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-initiative-wow-"));
const width = 1280;
const height = 720;

const evidenceFiles = [
  "docs/09-reviews/2026-08-25-pi-integration-kit-validation.md",
  "docs/09-reviews/2026-08-25-codex-to-kimi-proactive.md",
  "docs/09-reviews/2026-09-01-m5-2-real-codex-event-pump-behavior.md",
];

for (const evidenceFile of evidenceFiles) {
  if (!fs.existsSync(path.join(root, evidenceFile))) {
    throw new Error(`Missing retained evidence: ${evidenceFile}`);
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pill(text, x, y, { fill = "#17232b", stroke = "#2d8978", color = "#75ead1", width: pillWidth } = {}) {
  const computedWidth = pillWidth ?? Math.max(112, text.length * 9.5 + 34);
  return `<rect x="${x}" y="${y}" width="${computedWidth}" height="34" rx="17" fill="${fill}" stroke="${stroke}"/>
    <text x="${x + 17}" y="${y + 23}" fill="${color}" font-size="15" font-weight="700">${escapeXml(text)}</text>`;
}

function task({ x, y, width: taskWidth, title, status, accent, lines, muted = false }) {
  const opacity = muted ? 0.54 : 1;
  return `<g opacity="${opacity}">
    <rect x="${x}" y="${y}" width="${taskWidth}" height="96" rx="17" fill="#151a23" stroke="#303746"/>
    <circle cx="${x + 24}" cy="${y + 28}" r="6" fill="${accent}"/>
    <text x="${x + 41}" y="${y + 34}" fill="#f4f6fb" font-size="18" font-weight="700">${escapeXml(title)}</text>
    <text x="${x + taskWidth - 18}" y="${y + 33}" fill="#8993a6" font-size="13" text-anchor="end">${escapeXml(status)}</text>
    <text x="${x + 24}" y="${y + 67}" fill="#9ca6b8" font-size="14">${escapeXml(lines)}</text>
  </g>`;
}

function message({ x, y, width: messageWidth, label, labelColor = "#8e99ac", lines, accent = "#63e6be", source = "" }) {
  const lineSvg = lines.map((line, index) =>
    `<text x="${x + 28}" y="${y + 74 + (index * 31)}" fill="#e9edf5" font-size="20" font-weight="520">${escapeXml(line)}</text>`,
  ).join("\n");
  return `<rect x="${x}" y="${y}" width="${messageWidth}" height="${92 + (lines.length * 31)}" rx="19" fill="#171c25" stroke="#343c4c"/>
    <rect x="${x}" y="${y}" width="5" height="${92 + (lines.length * 31)}" rx="3" fill="${accent}"/>
    <text x="${x + 28}" y="${y + 36}" fill="${labelColor}" font-size="15" font-weight="750" letter-spacing="1.2">${escapeXml(label.toUpperCase())}</text>
    ${source ? `<text x="${x + messageWidth - 24}" y="${y + 36}" fill="#7e899c" font-size="14" text-anchor="end">${escapeXml(source)}</text>` : ""}
    ${lineSvg}`;
}

function base({ step, title, subtitle, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#080a0f"/>
        <stop offset="0.64" stop-color="#10151f"/>
        <stop offset="1" stop-color="#0c1b1b"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.82" cy="0.18" r="0.72">
        <stop offset="0" stop-color="#44d7b6" stop-opacity="0.18"/>
        <stop offset="1" stop-color="#44d7b6" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#background)"/>
    <rect width="1280" height="720" fill="url(#glow)"/>
    <g font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
      <text x="56" y="48" fill="#63e6be" font-size="17" font-weight="760" letter-spacing="2.1">THREADMESH / THE MOMENT</text>
      <text x="56" y="101" fill="#f6f7fb" font-size="37" font-weight="780">${escapeXml(title)}</text>
      <text x="57" y="136" fill="#a3adbe" font-size="19">${escapeXml(subtitle)}</text>
      ${body}
      <line x1="56" y1="666" x2="1224" y2="666" stroke="#2a3140"/>
      <text x="56" y="697" fill="#7d8798" font-size="14">Evidence-backed interaction reenactment • not a live product recording</text>
      <text x="1224" y="697" fill="#7d8798" font-size="14" text-anchor="end">${step}/5</text>
    </g>
  </svg>`;
}

function shell({ selected = "A", panelTitle, panelStatus, content, cStatus = "idle · 0 turns" }) {
  const selectedAccent = "#63e6be";
  return `<rect x="56" y="172" width="1168" height="458" rx="24" fill="#0d1118" stroke="#303746"/>
    <rect x="56" y="172" width="335" height="458" rx="24" fill="#10151e"/>
    <line x1="391" y1="172" x2="391" y2="630" stroke="#303746"/>
    <text x="82" y="211" fill="#808b9e" font-size="13" font-weight="700" letter-spacing="1.4">AGENT SESSIONS</text>
    ${task({ x: 76, y: 230, width: 295, title: "Agent A · API", status: selected === "A" ? "active" : "done", accent: selected === "A" ? selectedAccent : "#657186", lines: "Owns the upstream contract", muted: selected !== "A" })}
    ${task({ x: 76, y: 342, width: 295, title: "Agent B · SDK", status: selected === "B" ? "checkpoint" : "waiting", accent: selected === "B" ? selectedAccent : "#f0b35b", lines: "Needs A's verified contract", muted: selected !== "B" })}
    ${task({ x: 76, y: 454, width: 295, title: "Agent C · Docs", status: cStatus, accent: "#657186", lines: "Unrelated authorized session", muted: true })}
    <text x="427" y="211" fill="#f0f3f8" font-size="18" font-weight="720">${escapeXml(panelTitle)}</text>
    <text x="1192" y="211" fill="#8490a4" font-size="14" text-anchor="end">${escapeXml(panelStatus)}</text>
    ${content}`;
}

const frames = [
  {
    duration: 2.2,
    svg: base({
      step: 1,
      title: "You start Agent A. Once.",
      subtitle: "B is waiting on A. C is unrelated. You do not open either session.",
      body: shell({
        selected: "A",
        panelTitle: "Agent A · API contract",
        panelStatus: "working",
        content: `${message({ x: 430, y: 252, width: 728, label: "You", accent: "#6c7a91", lines: ["Implement and verify the API contract."] })}
          ${message({ x: 430, y: 394, width: 728, label: "Agent A", lines: ["I'll implement the contract and check", "whether another authorized session depends on it."] })}`,
      }),
    }),
  },
  {
    duration: 2.2,
    svg: base({
      step: 2,
      title: "A notices that B needs the result.",
      subtitle: "The model chooses bounded discovery; no user relays context and no model polls B.",
      body: shell({
        selected: "A",
        panelTitle: "Agent A · API contract",
        panelStatus: "dependency detected",
        content: `${message({ x: 430, y: 247, width: 728, label: "Agent A", lines: ["Contract verified. Agent B declares a matching", "dependency on this exact artifact."] })}
          <rect x="430" y="390" width="728" height="110" rx="19" fill="#111e20" stroke="#2d8978"/>
          <text x="458" y="427" fill="#75ead1" font-size="15" font-weight="760" letter-spacing="1.2">AUTONOMOUS TOOL CHOICE</text>
          <text x="458" y="467" fill="#edf4f2" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="19">discover → suggest(target: Agent B)</text>
          ${pill("relevant dependency", 430, 532, { width: 196 })}
          ${pill("bounded payload", 642, 532, { width: 166 })}
          ${pill("expires", 824, 532, { width: 112 })}`,
      }),
    }),
  },
  {
    duration: 3.2,
    svg: base({
      step: 3,
      title: "A reaches B—before you do.",
      subtitle: "This is the moment: one session proactively contacts another because the work became relevant.",
      body: shell({
        selected: "B",
        panelTitle: "Agent B · SDK implementation",
        panelStatus: "safe checkpoint",
        content: `<rect x="430" y="245" width="728" height="56" rx="16" fill="#1b242d" stroke="#ff6b61" stroke-width="2"/>
          <circle cx="458" cy="273" r="8" fill="#ff6b61"/>
          <text x="480" y="279" fill="#f5f7fb" font-size="18" font-weight="760">FROM AGENT A · ANOTHER SESSION</text>
          ${message({ x: 430, y: 320, width: 728, label: "Proactive handoff", labelColor: "#75ead1", source: "via ThreadMesh", lines: ["The verified API contract you were waiting for is ready.", "Artifact: api-contract · verification: passed", "Reason: matches your declared dependency."] })}
          ${pill("Accept", 430, 545, { width: 112 })}
          ${pill("Defer", 558, 545, { fill: "#171c25", stroke: "#3a4353", color: "#aeb7c8", width: 112 })}
          ${pill("Reject", 686, 545, { fill: "#171c25", stroke: "#3a4353", color: "#aeb7c8", width: 112 })}`,
      }),
    }),
  },
  {
    duration: 2.2,
    svg: base({
      step: 4,
      title: "B stays in control. C stays quiet.",
      subtitle: "The receiver admits context at a checkpoint; an irrelevant session gets zero turns.",
      body: shell({
        selected: "B",
        panelTitle: "Agent B · SDK implementation",
        panelStatus: "context admitted",
        cStatus: "idle · 0 turns",
        content: `${message({ x: 430, y: 248, width: 728, label: "Agent B", lines: ["Accepted at checkpoint. Continuing with the", "verified contract—without changing my current owner."] })}
          <rect x="430" y="401" width="728" height="122" rx="19" fill="#111e20" stroke="#2d8978"/>
          <text x="458" y="439" fill="#75ead1" font-size="15" font-weight="760" letter-spacing="1.2">AUDITED RESULT</text>
          <text x="458" y="478" fill="#edf4f2" font-size="20">B: context admitted · work resumed</text>
          <text x="458" y="508" fill="#9ca8b8" font-size="17">C: irrelevant route skipped · native turns 0</text>` ,
      }),
    }),
  },
  {
    duration: 2.2,
    svg: base({
      step: 5,
      title: "Agent initiative. Receiver control.",
      subtitle: "A selective-attention layer between durable agent sessions—not shared memory or a workflow script.",
      body: `<rect x="56" y="182" width="1168" height="320" rx="26" fill="#0d1219" stroke="#303746"/>
        <text x="640" y="255" fill="#f4f7fb" font-size="32" font-weight="760" text-anchor="middle">A noticed B needed the result—and reached out.</text>
        <g transform="translate(126 320)">
          ${pill("1 kickoff", 0, 0, { width: 172 })}
          ${pill("0 copy / paste relays", 202, 0, { width: 230 })}
          ${pill("0 polling turns", 462, 0, { width: 190 })}
          ${pill("0 irrelevant wakes", 682, 0, { width: 220 })}
        </g>
        <text x="640" y="421" fill="#9eabba" font-size="21" text-anchor="middle">Proven across retained Pi → Kimi, Codex → Kimi, and Codex lifecycle cases.</text>
        <text x="640" y="557" fill="#63e6be" font-size="27" font-weight="760" text-anchor="middle">github.com/fyaic/threadmesh</text>`,
    }),
  },
];

fs.mkdirSync(outputDirectory, { recursive: true });
try {
  const concatLines = [];
  const pngPaths = [];
  for (const [index, frame] of frames.entries()) {
    const baseName = `initiative-${String(index + 1).padStart(2, "0")}`;
    const svgPath = path.join(temporaryDirectory, `${baseName}.svg`);
    const pngPath = path.join(temporaryDirectory, `${baseName}.png`);
    fs.writeFileSync(svgPath, frame.svg);
    execFileSync("qlmanage", ["-t", "-s", String(width), "-o", temporaryDirectory, svgPath], { stdio: "ignore" });
    fs.renameSync(`${svgPath}.png`, pngPath);
    pngPaths.push(pngPath);
    concatLines.push(`file '${pngPath.replaceAll("'", "'\\''")}'`);
    concatLines.push(`duration ${frame.duration}`);
  }
  concatLines.push(`file '${pngPaths.at(-1).replaceAll("'", "'\\''")}'`);

  const concatPath = path.join(temporaryDirectory, "frames.txt");
  fs.writeFileSync(concatPath, `${concatLines.join("\n")}\n`);
  const mp4Path = path.join(outputDirectory, "session-initiative-wow.mp4");
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
    "-vf", `crop=${width}:${height}:0:0,format=yuv420p`,
    "-t", "12", "-r", "30", "-movflags", "+faststart", mp4Path,
  ], { stdio: "ignore" });

  const palettePath = path.join(temporaryDirectory, "palette.png");
  execFileSync("ffmpeg", [
    "-y", "-i", mp4Path,
    "-vf", "fps=10,scale=960:-1:flags=lanczos,palettegen=max_colors=128",
    palettePath,
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-i", mp4Path, "-i", palettePath,
    "-filter_complex", "fps=10,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3",
    path.join(outputDirectory, "session-initiative-wow.gif"),
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-i", pngPaths[2], "-vf", `crop=${width}:${height}:0:0`, "-frames:v", "1",
    path.join(outputDirectory, "session-initiative-wow-cover.png"),
  ], { stdio: "ignore" });
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Built 12-second session-initiative wow moment (MP4, GIF, cover).\n");
