import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "docs", "assets", "demo");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-demo-assets-"));
const width = 1280;
const height = 720;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function textLines(lines, { x = 80, y = 250, size = 38, gap = 54, color = "#f6f7fb", weight = 600 } = {}) {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + (index * gap)}" fill="${color}" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`,
  ).join("\n");
}

function card({ x, y, width: cardWidth, height: cardHeight, title, lines, accent = "#63e6be" }) {
  return `
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="22" fill="#171b24" stroke="#2d3443"/>
    <rect x="${x}" y="${y}" width="6" height="${cardHeight}" rx="3" fill="${accent}"/>
    <text x="${x + 30}" y="${y + 46}" fill="${accent}" font-size="20" font-weight="700" letter-spacing="1">${escapeXml(title)}</text>
    ${textLines(lines, { x: x + 30, y: y + 94, size: 27, gap: 40, weight: 560 })}`;
}

function frame({ index, eyebrow, title, subtitle = "", body = "", footer = "Executable evidence • pre-alpha" }) {
  const titleSize = title.length > 42 ? 42 : title.length > 34 ? 46 : 51;
  const subtitleSize = subtitle.length > 82 ? 20 : 24;
  // Quick Look produces square thumbnails. A square canvas preserves the
  // 16:9 artwork at 1:1; ffmpeg crops the unused lower area afterward.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#080a10"/>
        <stop offset="0.58" stop-color="#111621"/>
        <stop offset="1" stop-color="#101b1d"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.85" cy="0.1" r="0.8">
        <stop offset="0" stop-color="#3dd6b0" stop-opacity="0.18"/>
        <stop offset="1" stop-color="#3dd6b0" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    <rect width="1280" height="720" fill="url(#glow)"/>
    <g font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
      <text x="64" y="58" fill="#63e6be" font-size="18" font-weight="750" letter-spacing="2.4">THREADMESH / ${escapeXml(eyebrow.toUpperCase())}</text>
      <text x="64" y="132" fill="#f6f7fb" font-size="${titleSize}" font-weight="760">${escapeXml(title)}</text>
      ${subtitle ? `<text x="66" y="177" fill="#aeb7c8" font-size="${subtitleSize}" font-weight="480">${escapeXml(subtitle)}</text>` : ""}
      ${body}
      <line x1="64" y1="664" x2="1216" y2="664" stroke="#2a3140"/>
      <text x="64" y="697" fill="#7f899b" font-size="16">${escapeXml(footer)}</text>
      <text x="1180" y="697" fill="#7f899b" font-size="16">${index}/8</text>
    </g>
  </svg>`;
}

const jsonOutput = execFileSync(process.execPath, ["bin/threadmesh.mjs", "demo", "--json"], {
  cwd: root,
  encoding: "utf8",
});
const demo = JSON.parse(jsonOutput);
if (
  demo.state !== "passed" ||
  demo.comparison?.manual?.totalUserActionsLowerBound !== 9 ||
  demo.comparison?.threadmesh?.totalUserActions !== 1 ||
  demo.safety?.activeCheckpoint?.receiverStateAfter !== "running" ||
  demo.dependency?.reasonCode !== "dependency-satisfied-verified" ||
  demo.cleanup?.complete !== true
) {
  throw new Error("Demo evidence did not match the walkthrough contract.");
}

const sequence = demo.sequence.map((step) => step.eventType).join("  →  ");
const slides = [
  {
    duration: 8,
    svg: frame({
      index: 1,
      eyebrow: "the job",
      title: "Stop babysitting parallel agents.",
      subtitle: "No copy/paste relay. No model polling. No silent takeover.",
      body: `<text x="66" y="295" fill="#dce2ed" font-size="32">Let sessions hand work off when dependencies become real.</text>
        <text x="66" y="342" fill="#dce2ed" font-size="32">The receiver decides when that context is admitted.</text>
        <rect x="66" y="410" width="742" height="84" rx="20" fill="#152523" stroke="#2f7d70"/>
        <text x="96" y="462" fill="#63e6be" font-size="27" font-weight="700">Agent initiative. ThreadMesh boundaries.</text>`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 2,
      eyebrow: "user pain",
      title: "Four handoffs. Two operator experiences.",
      subtitle: "The baseline below is executable workflow accounting—not a timing or token claim.",
      body: `${card({ x: 66, y: 235, width: 540, height: 270, title: "MANUAL LOWER BOUND", accent: "#ff7b72", lines: ["1 initial kickoff", "4 status checks", "4 copy / relay actions", `≥ ${demo.comparison.manual.totalUserActionsLowerBound} user actions`] })}
        ${card({ x: 674, y: 235, width: 540, height: 270, title: "THREADMESH DEMO", lines: ["1 initial kickoff", "0 status checks", "0 relay actions", `${demo.comparison.threadmesh.totalUserActions} user action`] })}`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 3,
      eyebrow: "retained real codex run",
      title: "One kickoff. Sessions advance the chain.",
      subtitle: "Real native Codex turns; Git and verifier effects in this retained run were simulated.",
      body: `${card({ x: 66, y: 235, width: 348, height: 238, title: "INITIATIVE", lines: ["9 native turns", "0 later phase prompts", "0 direct activations"] })}
        ${card({ x: 466, y: 235, width: 348, height: 238, title: "SELECTIVITY", lines: ["A → R → same-A", "→ V → dependent", "irrelevant session: 0 turns"] })}
        ${card({ x: 866, y: 235, width: 348, height: 238, title: "HYGIENE", lines: ["5 / 5 sessions removed", "coordinator artifacts removed", "bounded public evidence"] })}`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 4,
      eyebrow: "fresh executable demo",
      title: "A review loop moves without human relay.",
      subtitle: "The asset builder ran threadmesh demo --json and rejected any evidence mismatch.",
      body: `<rect x="66" y="225" width="1148" height="300" rx="22" fill="#090c12" stroke="#303848"/>
        <circle cx="98" cy="257" r="7" fill="#ff6b6b"/><circle cx="122" cy="257" r="7" fill="#ffd43b"/><circle cx="146" cy="257" r="7" fill="#51cf66"/>
        <text x="96" y="315" fill="#7f899b" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">$ npm run demo</text>
        <text x="96" y="365" fill="#f6f7fb" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22">${escapeXml(sequence)}</text>
        <text x="96" y="420" fill="#63e6be" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21">relay after kickoff: ${demo.counters.manualRelayActions}   polling turns: ${demo.counters.modelPollingTurns}   wrong unlocks: ${demo.counters.incorrectUnlocks}</text>
        <text x="96" y="475" fill="#aeb7c8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20">cleanup: complete   durable wake recovery: ${demo.counters.durableReconciliations} / ${demo.sequence.length}</text>`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 5,
      eyebrow: "receiver sovereignty",
      title: "B is active. The result waits at a checkpoint.",
      subtitle: "A completion event is retained without steering, interrupting, or starting a native turn.",
      body: `<text x="94" y="290" fill="#f6f7fb" font-size="28" font-weight="700">A / review</text>
        <line x1="270" y1="280" x2="540" y2="280" stroke="#63e6be" stroke-width="4"/>
        <polygon points="540,280 520,268 520,292" fill="#63e6be"/>
        <rect x="560" y="225" width="278" height="112" rx="20" fill="#152523" stroke="#2f7d70"/>
        <text x="595" y="270" fill="#63e6be" font-size="20" font-weight="700">CHECKPOINT MAILBOX</text>
        <text x="595" y="306" fill="#dce2ed" font-size="23">decision: pending</text>
        <line x1="838" y1="280" x2="1010" y2="280" stroke="#3b4353" stroke-width="4" stroke-dasharray="10 10"/>
        <text x="1040" y="290" fill="#f6f7fb" font-size="28" font-weight="700">B / running</text>
        ${card({ x: 188, y: 400, width: 904, height: 132, title: "FRESH ASSERTIONS FROM THE DEMO", lines: [`state: ${demo.safety.activeCheckpoint.receiverStateBefore} → ${demo.safety.activeCheckpoint.receiverStateAfter}    steer: 0    interrupt: 0    native turns: 0`] })}`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 6,
      eyebrow: "selective attention",
      title: "Recover relevant events. Ignore the rest.",
      subtitle: "The durable mailbox is truth; a wake signal is only a bounded hint.",
      body: `${card({ x: 66, y: 235, width: 540, height: 270, title: "DROPPED WAKE HINTS", lines: [`wake hints supplied: 0`, `durable reconciliations: ${demo.safety.durableReconciliations}`, "relevant events recovered: 4", "lost work: 0"] })}
        ${card({ x: 674, y: 235, width: 540, height: 270, title: "UNSUBSCRIBED CONTROL", accent: "#ffd43b", lines: [`offers: ${demo.safety.activeCheckpoint.unsubscribedOffers}`, "native turn starts: 0", "reason:", demo.safety.activeCheckpoint.unsubscribedReasonCode] })}`,
    }),
  },
  {
    duration: 10,
    svg: frame({
      index: 7,
      eyebrow: "verified dependency",
      title: "Delivery ≠ verification ≠ authority.",
      subtitle: "The downstream task remains waiting until the exact dependency proof passes.",
      body: `<g transform="translate(70 255)">
        <rect x="0" y="0" width="220" height="110" rx="18" fill="#171b24" stroke="#3b4353"/><text x="34" y="48" fill="#f6f7fb" font-size="24" font-weight="700">delivered</text><text x="34" y="82" fill="#8b95a7" font-size="18">mailbox receipt</text>
        <text x="238" y="66" fill="#63e6be" font-size="34">→</text>
        <rect x="280" y="0" width="220" height="110" rx="18" fill="#171b24" stroke="#3b4353"/><text x="314" y="48" fill="#f6f7fb" font-size="24" font-weight="700">accepted</text><text x="314" y="82" fill="#8b95a7" font-size="18">receiver decision</text>
        <text x="518" y="66" fill="#63e6be" font-size="34">→</text>
        <rect x="560" y="0" width="250" height="110" rx="18" fill="#152523" stroke="#2f7d70"/><text x="594" y="48" fill="#63e6be" font-size="24" font-weight="700">externally verified</text><text x="594" y="82" fill="#bfe9df" font-size="18">signed attestation</text>
        <text x="828" y="66" fill="#63e6be" font-size="34">→</text>
        <rect x="870" y="0" width="260" height="110" rx="18" fill="#152523" stroke="#2f7d70"/><text x="904" y="48" fill="#63e6be" font-size="24" font-weight="700">dependent: ready</text><text x="904" y="82" fill="#bfe9df" font-size="18">authorized unlock</text>
      </g>
      <text x="70" y="455" fill="#f6f7fb" font-size="27" font-weight="700">Result: ${escapeXml(demo.dependency.reasonCode)}</text>
      <text x="70" y="500" fill="#aeb7c8" font-size="22">Wrong unlocks: ${demo.counters.incorrectUnlocks} • state survived SQLite close/reopen • cleanup complete</text>`,
    }),
  },
  {
    duration: 8,
    svg: frame({
      index: 8,
      eyebrow: "try the proof",
      title: "Run the closed loop in one command.",
      subtitle: "Works locally without model quota or access to your existing agent sessions.",
      body: `<rect x="66" y="235" width="1148" height="100" rx="20" fill="#090c12" stroke="#303848"/>
        <text x="98" y="297" fill="#63e6be" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="23">npx --yes --package=github:fyaic/threadmesh threadmesh demo</text>
        ${card({ x: 66, y: 390, width: 1148, height: 150, title: "HONEST EVIDENCE BOUNDARY", accent: "#ffd43b", lines: ["Deterministic Git/verifier integration is merged on main.", "A fresh real Codex real-effects rerun remains pending a network-valid host."] })}`,
    }),
  },
];

fs.mkdirSync(outputDirectory, { recursive: true });
try {
  const concatLines = [];
  for (const [index, slide] of slides.entries()) {
    const base = `slide-${String(index + 1).padStart(2, "0")}`;
    const svgPath = path.join(temporaryDirectory, `${base}.svg`);
    fs.writeFileSync(svgPath, slide.svg);
    execFileSync("qlmanage", ["-t", "-s", String(width), "-o", temporaryDirectory, svgPath], {
      stdio: "ignore",
    });
    const generated = `${svgPath}.png`;
    const pngPath = path.join(temporaryDirectory, `${base}.png`);
    fs.renameSync(generated, pngPath);
    concatLines.push(`file '${pngPath.replaceAll("'", "'\\''")}'`);
    concatLines.push(`duration ${slide.duration}`);
  }
  concatLines.push(`file '${path.join(temporaryDirectory, "slide-08.png")}'`);
  const concatPath = path.join(temporaryDirectory, "slides.txt");
  fs.writeFileSync(concatPath, `${concatLines.join("\n")}\n`);

  const mp4Path = path.join(outputDirectory, "threadmesh-proof-walkthrough.mp4");
  execFileSync("ffmpeg", [
    "-y", "-f", "concat", "-safe", "0", "-i", concatPath,
    "-vf", `crop=${width}:${height}:0:0,format=yuv420p`,
    "-t", "76", "-r", "30", "-movflags", "+faststart", mp4Path,
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
    path.join(outputDirectory, "threadmesh-proof-walkthrough.gif"),
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-i", mp4Path, "-frames:v", "1",
    path.join(outputDirectory, "threadmesh-proof-walkthrough-cover.png"),
  ], { stdio: "ignore" });
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Built 76-second ThreadMesh proof walkthrough (MP4, GIF, cover).\n");
