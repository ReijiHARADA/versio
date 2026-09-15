/**
 * Capture Settings behavior GIFs from the production AppSidebar.
 *
 * Usage: npm run capture:settings-previews
 *
 * Requires: Playwright browsers, ffmpeg on PATH.
 * See docs/SETTINGS_PREVIEWS.md
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "src/assets/settings-previews");
const workRoot = path.join("/tmp", "paper-reader-settings-previews");
const CAPTURE_URL = "http://127.0.0.1:5199/";
const VIEWPORT = { width: 640, height: 360 };
const DPR = 2;
const FPS = 12;
/** GIF netscape loop: 2 ⇒ play, then loop twice more = 3 plays total. */
const GIF_LOOP_COUNT = 2;

const CLIPS = [
  {
    id: "sidebar-roots-only-off",
    mode: "auto",
    rootsOnly: false,
    kind: "roots",
  },
  {
    id: "sidebar-roots-only-on",
    mode: "auto",
    rootsOnly: true,
    kind: "roots",
  },
  {
    id: "sidebar-mode-auto",
    mode: "auto",
    rootsOnly: true,
    kind: "auto",
  },
  {
    id: "sidebar-mode-expanded",
    mode: "expanded",
    rootsOnly: true,
    kind: "static",
  },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function moveCursor(page, from, to, ms) {
  const steps = Math.max(8, Math.round(ms / 30));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const x = from.x + (to.x - from.x) * e;
    const y = from.y + (to.y - from.y) * e;
    await page.evaluate(
      ({ x, y }) => {
        const el = document.getElementById("capture-cursor");
        if (el) {
          el.style.left = `${x}px`;
          el.style.top = `${y}px`;
        }
      },
      { x, y }
    );
    await sleep(ms / steps);
  }
}

async function waitForApi(page) {
  await page.waitForFunction(() => Boolean(window.__sidebarCapture), null, {
    timeout: 15_000,
  });
}

async function configure(page, mode, rootsOnly) {
  await page.evaluate(
    ({ mode, rootsOnly }) => {
      window.__sidebarCapture.configure({ mode, rootsOnly });
    },
    { mode, rootsOnly }
  );
  await sleep(250);
}

async function setCursorVisible(page, visible) {
  await page.evaluate((visible) => {
    const el = document.getElementById("capture-cursor");
    if (el) el.style.display = visible ? "block" : "none";
  }, visible);
}

async function captureFrames(page, clipDir, runSequence) {
  fs.rmSync(clipDir, { recursive: true, force: true });
  fs.mkdirSync(clipDir, { recursive: true });
  let frame = 0;
  const shoot = async () => {
    const file = path.join(clipDir, `f-${String(frame).padStart(3, "0")}.png`);
    await page.locator("[data-capture-root]").screenshot({ path: file, type: "png" });
    frame += 1;
  };

  let shooting = true;
  const loop = (async () => {
    while (shooting) {
      await shoot();
      await sleep(1000 / FPS);
    }
  })();

  await runSequence(page);
  shooting = false;
  await loop;
  return frame;
}

async function encodeGif(clipDir, outGif, posterPng, { loopCount }) {
  const palette = path.join(clipDir, "palette.png");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      path.join(clipDir, "f-%03d.png"),
      "-vf",
      "palettegen=max_colors=128:stats_mode=diff",
      palette,
    ],
    { stdio: "pipe" }
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      path.join(clipDir, "f-%03d.png"),
      "-i",
      palette,
      "-lavfi",
      "paletteuse=dither=bayer:bayer_scale=3",
      "-loop",
      String(loopCount),
      outGif,
    ],
    { stdio: "pipe" }
  );
  const frames = fs
    .readdirSync(clipDir)
    .filter((f) => /^f-\d+\.png$/.test(f))
    .sort();
  const mid = frames[Math.floor(frames.length / 2)] ?? frames[0];
  if (mid) fs.copyFileSync(path.join(clipDir, mid), posterPng);
}

function writeStill(clipDir, posterPng) {
  const frames = fs
    .readdirSync(clipDir)
    .filter((f) => /^f-\d+\.png$/.test(f))
    .sort();
  const pick = frames[Math.floor(frames.length * 0.6)] ?? frames[0];
  if (pick) fs.copyFileSync(path.join(clipDir, pick), posterPng);
}

function startVite() {
  const viteBin = path.join(root, "node_modules/vite/bin/vite.js");
  return spawn(
    process.execPath,
    [viteBin, "--config", "scripts/capture-settings-previews/vite.config.ts", "--host", "127.0.0.1"],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    }
  );
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }
  throw new Error(`Capture Vite server did not start: ${url} (${lastError})`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(workRoot, { recursive: true, force: true });
  fs.mkdirSync(workRoot, { recursive: true });

  const vite = startVite();
  let viteLog = "";
  vite.stdout?.on("data", (d) => {
    viteLog += d.toString();
  });
  vite.stderr?.on("data", (d) => {
    viteLog += d.toString();
  });

  try {
    await waitForServer(CAPTURE_URL);
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: DPR,
    });
    await page.goto(CAPTURE_URL, { waitUntil: "networkidle" });
    await waitForApi(page);

    const away = { x: 420, y: 240 };
    const over = { x: 32, y: 120 };

    for (const clip of CLIPS) {
      console.log(`Capturing ${clip.id}…`);
      await configure(page, clip.mode, clip.rootsOnly);
      await setCursorVisible(page, clip.kind !== "static");
      await page.evaluate(
        ({ x, y }) => {
          const el = document.getElementById("capture-cursor");
          if (el) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
          }
        },
        away
      );
      await page.mouse.move(away.x, away.y);
      await sleep(300);

      const clipDir = path.join(workRoot, clip.id);
      await captureFrames(page, clipDir, async () => {
        if (clip.kind === "static") {
          await sleep(700);
          return;
        }
        if (clip.kind === "roots") {
          await sleep(700);
          await moveCursor(page, away, over, 450);
          await sleep(1200);
          await moveCursor(page, over, away, 450);
          await page.mouse.move(away.x, away.y);
          await sleep(700);
          return;
        }
        // auto: enter → expand → leave → collapse
        await sleep(700);
        await moveCursor(page, away, over, 500);
        await page.locator("[data-capture-root] aside").hover({
          position: { x: 24, y: 100 },
          force: true,
        });
        await sleep(1300);
        await moveCursor(page, over, away, 500);
        await page.mouse.move(500, 240);
        await sleep(900);
      });

      const poster = path.join(outDir, `${clip.id}.poster.png`);
      if (clip.kind === "static") {
        writeStill(clipDir, poster);
        // Keep a 1-frame gif alias unused; UI uses poster as still.
        const staleGif = path.join(outDir, `${clip.id}.gif`);
        if (fs.existsSync(staleGif)) fs.unlinkSync(staleGif);
        console.log(`  → ${path.relative(root, poster)} (still)`);
      } else {
        const gif = path.join(outDir, `${clip.id}.gif`);
        await encodeGif(clipDir, gif, poster, { loopCount: GIF_LOOP_COUNT });
        console.log(`  → ${path.relative(root, gif)} (${fs.statSync(gif).size} bytes)`);
      }
    }

    await browser.close();
  } catch (error) {
    console.error(viteLog.slice(-4000));
    throw error;
  } finally {
    vite.kill("SIGTERM");
    await sleep(300);
    try {
      vite.kill("SIGKILL");
    } catch {
      // ignore
    }
  }

  if (viteLog.toLowerCase().includes("error")) {
    console.warn(viteLog.slice(-2000));
  }
  console.log("Done. Assets in src/assets/settings-previews/");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
