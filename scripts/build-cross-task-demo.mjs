import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "docs", "assets", "threadmesh-cross-task-moment.png");
const outputDirectory = path.join(root, "docs", "assets");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-cross-task-demo-"));
const fps = 12;
const durationSeconds = 11.6;
const frameCount = Math.ceil(durationSeconds * fps);
const width = 1280;
const height = 720;

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing source hero: ${sourcePath}`);
}

const imageData = `data:image/png;base64,${fs.readFileSync(sourcePath).toString("base64")}`;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value) {
  const normalized = clamp(value);
  return normalized * normalized * (3 - (2 * normalized));
}

function progress(time, start, end) {
  return smoothstep((time - start) / (end - start));
}

function mix(from, to, amount) {
  return from + ((to - from) * amount);
}

function windowOpacity(time, fadeInStart, fullStart, fullEnd, fadeOutEnd) {
  return Math.min(
    progress(time, fadeInStart, fullStart),
    1 - progress(time, fullEnd, fadeOutEnd),
  );
}

function cameraAt(time) {
  if (time < 1.8) return { zoom: 1, x: 640, y: 360 };
  if (time < 3.15) {
    const p = progress(time, 1.8, 3.15);
    return { zoom: mix(1, 1.58, p), x: mix(640, 170, p), y: mix(360, 465, p) };
  }
  if (time < 4.05) return { zoom: 1.58, x: 170, y: 465 };
  if (time < 5.2) {
    const p = progress(time, 4.05, 5.2);
    return { zoom: mix(1.58, 1, p), x: mix(170, 640, p), y: mix(465, 360, p) };
  }
  if (time < 6.85) return { zoom: 1, x: 640, y: 360 };
  if (time < 8.15) {
    const p = progress(time, 6.85, 8.15);
    return { zoom: mix(1, 1.68, p), x: mix(640, 850, p), y: mix(360, 324, p) };
  }
  if (time < 9.5) return { zoom: 1.68, x: 850, y: 324 };
  if (time < 10.5) {
    const p = progress(time, 9.5, 10.5);
    return { zoom: mix(1.68, 1.08, p), x: mix(850, 660, p), y: mix(324, 350, p) };
  }
  return { zoom: 1.08, x: 660, y: 350 };
}

function cubicPoint(amount, start, controlOne, controlTwo, end) {
  const t = clamp(amount);
  const inverse = 1 - t;
  return {
    x: (inverse ** 3 * start.x) + (3 * inverse ** 2 * t * controlOne.x) +
      (3 * inverse * t ** 2 * controlTwo.x) + (t ** 3 * end.x),
    y: (inverse ** 3 * start.y) + (3 * inverse ** 2 * t * controlOne.y) +
      (3 * inverse * t ** 2 * controlTwo.y) + (t ** 3 * end.y),
  };
}

const captions = [
  { start: 0.25, full: 0.55, end: 1.55, out: 1.8, kicker: "TWO TASKS", text: "Two independent agent sessions are working." },
  { start: 1.85, full: 2.15, end: 3.85, out: 4.15, kicker: "SESSION A", text: "Agent A finishes the upstream work." },
  { start: 4.45, full: 4.75, end: 6.65, out: 6.95, kicker: "THE DECISION", text: "A notices Session B needs the result—and reaches out." },
  { start: 7.1, full: 7.4, end: 9.25, out: 9.55, kicker: "SESSION B", text: "B receives context from another task." },
  { start: 9.75, full: 10.05, end: 11.2, out: 11.5, kicker: "THREADMESH", text: "A reached B before you did." },
];

function captionSvg(time) {
  return captions.map((caption) => {
    const opacity = windowOpacity(time, caption.start, caption.full, caption.end, caption.out);
    if (opacity <= 0) return "";
    const offset = mix(12, 0, progress(time, caption.start, caption.full));
    return `<g opacity="${opacity.toFixed(3)}" transform="translate(0 ${offset.toFixed(2)})">
      <rect x="300" y="603" width="680" height="82" rx="23" fill="#ffffff" fill-opacity="0.94" stroke="#e2e4e8"/>
      <rect x="321" y="621" width="4" height="46" rx="2" fill="#ff745f"/>
      <text x="344" y="634" fill="#e25f4d" font-size="13" font-weight="760" letter-spacing="1.55">${caption.kicker}</text>
      <text x="344" y="663" fill="#20242a" font-size="23" font-weight="670">${caption.text}</text>
    </g>`;
  }).join("\n");
}

function frameSvg(time) {
  const camera = cameraAt(time);
  const sourceFocus = windowOpacity(time, 0.3, 0.55, 4.15, 4.45);
  const targetFocus = windowOpacity(time, 0.3, 0.55, 9.45, 9.75);
  const sourceRing = windowOpacity(time, 1.75, 2.1, 5.2, 5.55);
  const pathAmount = progress(time, 4.75, 6.45);
  const pathOpacity = windowOpacity(time, 4.45, 4.75, 6.55, 6.9);
  const targetPulse = windowOpacity(time, 6.55, 7.0, 9.45, 9.8);
  const dot = cubicPoint(
    pathAmount,
    { x: 263, y: 470 },
    { x: 390, y: 465 },
    { x: 480, y: 323 },
    { x: 624, y: 323 },
  );
  const startFade = progress(time, 0, 0.35);
  const endFade = progress(time, 11.25, 11.6);
  const whiteOverlay = Math.max(1 - startFade, endFade);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1280" viewBox="0 0 1280 1280">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="9" stdDeviation="12" flood-color="#23262b" flood-opacity="0.15"/>
      </filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="viewport"><rect width="1280" height="720"/></clipPath>
    </defs>
    <rect width="1280" height="720" fill="#fbfaf8"/>
    <g clip-path="url(#viewport)">
      <g transform="translate(640 360) scale(${camera.zoom.toFixed(4)}) translate(${-camera.x.toFixed(3)} ${-camera.y.toFixed(3)})">
        <image href="${imageData}" x="0" y="-66.667" width="1280" height="853.333" preserveAspectRatio="none"/>

        <g opacity="${sourceFocus.toFixed(3)}">
          <rect x="34" y="43" width="252" height="638" rx="25" fill="none" stroke="#ff806c" stroke-width="2" stroke-opacity="0.48"/>
          <rect x="52" y="93" width="92" height="29" rx="14.5" fill="#20242a"/>
          <text x="98" y="113" fill="#ffffff" font-size="13" font-weight="760" text-anchor="middle" letter-spacing="1.2">SESSION A</text>
        </g>
        <g opacity="${targetFocus.toFixed(3)}">
          <rect x="288" y="34" width="974" height="651" rx="25" fill="none" stroke="#5d6570" stroke-width="1.4" stroke-opacity="0.34"/>
          <rect x="315" y="93" width="92" height="29" rx="14.5" fill="#20242a"/>
          <text x="361" y="113" fill="#ffffff" font-size="13" font-weight="760" text-anchor="middle" letter-spacing="1.2">SESSION B</text>
        </g>

        <rect x="47" y="435" width="228" height="72" rx="15" fill="none" stroke="#ff745f" stroke-width="3" opacity="${sourceRing.toFixed(3)}" filter="url(#glow)"/>

        <g opacity="${pathOpacity.toFixed(3)}">
          <path d="M263 470 C390 465 480 323 624 323" fill="none" stroke="#ff745f" stroke-width="4" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="${(1 - pathAmount).toFixed(4)}"/>
          <circle cx="${dot.x.toFixed(2)}" cy="${dot.y.toFixed(2)}" r="8" fill="#ff745f" filter="url(#glow)"/>
        </g>

        <rect x="621" y="290" width="464" height="68" rx="15" fill="none" stroke="#ff745f" stroke-width="${(2.4 + (Math.sin(time * 7) * 0.5)).toFixed(2)}" opacity="${targetPulse.toFixed(3)}" filter="url(#glow)"/>
      </g>

      ${captionSvg(time)}

      <text x="34" y="695" fill="#747b84" font-size="12" font-weight="620" letter-spacing="0.9">EDITORIAL RECREATION · REAL BEHAVIOR EVIDENCE LINKED BELOW</text>
      <rect width="1280" height="720" fill="#fbfaf8" opacity="${whiteOverlay.toFixed(3)}"/>
    </g>
  </svg>`;
}

fs.mkdirSync(outputDirectory, { recursive: true });
try {
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const time = frameIndex / fps;
    const baseName = `frame-${String(frameIndex).padStart(3, "0")}`;
    const svgPath = path.join(temporaryDirectory, `${baseName}.svg`);
    fs.writeFileSync(svgPath, frameSvg(time));
    execFileSync("qlmanage", ["-t", "-s", String(width), "-o", temporaryDirectory, svgPath], { stdio: "ignore" });
  }

  const framePattern = path.join(temporaryDirectory, "frame-%03d.svg.png");
  const mp4Path = path.join(outputDirectory, "threadmesh-cross-task-demo.mp4");
  execFileSync("ffmpeg", [
    "-y", "-framerate", String(fps), "-i", framePattern,
    "-vf", `crop=${width}:${height}:0:0,format=yuv420p`,
    "-r", "24", "-movflags", "+faststart", mp4Path,
  ], { stdio: "ignore" });

  const palettePath = path.join(temporaryDirectory, "palette.png");
  execFileSync("ffmpeg", [
    "-y", "-i", mp4Path,
    "-vf", "fps=8,scale=960:-1:flags=lanczos,palettegen=max_colors=80",
    palettePath,
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-i", mp4Path, "-i", palettePath,
    "-filter_complex", "fps=8,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4",
    path.join(outputDirectory, "threadmesh-cross-task-demo.gif"),
  ], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-y", "-ss", "8.6", "-i", mp4Path, "-frames:v", "1",
    path.join(outputDirectory, "threadmesh-cross-task-demo-cover.png"),
  ], { stdio: "ignore" });
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

process.stdout.write("Built cinematic cross-task demo (MP4, GIF, cover).\n");
