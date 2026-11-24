// Records the two onboarding how-to clips from the filming-only demo build.
//   npm run record:howto            → src/assets/intro/howto-{collect,read}.{mp4,jpg}
// One continuous browser session (collect, then read) is cut into two clips
// at the timestamps the script logs, so the read clip starts from the
// library the collect clip produced.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5232;
const BASE = `http://localhost:${PORT}/`;
const OUT = "src/assets/intro";
const VIEW = { width: 1280, height: 800 };
const DROPS = [
  ["wearability.pdf", "test-fixtures/generated-pdfs/basic-two-column.pdf"],
  ["interactive-jewellery.pdf", "test-fixtures/generated-pdfs/ACM-style-two-column.pdf"],
];

const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], {
  env: { ...process.env, VITE_VERSIO_DEMO: "1", VITE_VERSIO_DEMO_SEED: "howto" },
  stdio: ["ignore", "pipe", "inherit"],
});
await new Promise((resolve, reject) => {
  vite.stdout.on("data", (d) => String(d).includes("Local:") && resolve());
  vite.on("exit", (code) => reject(new Error(`vite exited ${code}`)));
});

process.on("exit", () => vite.kill());
process.on("uncaughtException", async (e) => {
  console.error(e.message.split("\n").slice(0, 3).join("\n"));
  await globalThis.__page?.screenshot({ path: join(tmpdir(), "versio-howto-fail.png") }).catch(() => {});
  process.exit(1);
});
const dir = mkdtempSync(join(tmpdir(), "versio-howto-"));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: VIEW, recordVideo: { dir, size: VIEW } });
const t0 = Date.now();
const mark = () => (Date.now() - t0) / 1000;
// Headless video has no OS cursor; draw one, plus a Finder-like drag badge.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;left:-40px;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(30,30,30,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .12s";
    const g = document.createElement("div");
    g.id = "howto-drag-badge";
        g.style.cssText = "position:fixed;left:-200px;top:0;margin:14px 0 0 14px;padding:6px 12px;border-radius:9px;background:rgba(255,255,255,.95);box-shadow:0 6px 20px rgba(0,0,0,.18);font:600 13px -apple-system,system-ui,sans-serif;color:#1d1d1f;pointer-events:none;z-index:2147483646;display:none";
    document.body.append(g, c);
    addEventListener("mousemove", (e) => {
      for (const el of [c, g]) { el.style.left = e.clientX + "px"; el.style.top = e.clientY + "px"; }
    }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const p = await ctx.newPage();
globalThis.__page = p;
p.on("pageerror", (e) => console.error("pageerror:", e.message));
const wait = (ms) => p.waitForTimeout(ms);
async function center(loc) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  return { x: box.x + Math.min(box.width / 2, 80), y: box.y + box.height / 2 };
}
async function moveTo(loc, steps = 28) {
  const { x, y } = await center(loc);
  await p.mouse.move(x, y, { steps });
}
async function click(loc, pause = 350) {
  await moveTo(loc);
  await wait(pause);
  await p.mouse.down(); await wait(90); await p.mouse.up();
}

await p.goto(BASE);
await p.getByText("ウェアラブル研究").locator("visible=true").first().waitFor();
await p.mouse.move(VIEW.width + 20, 420);
await wait(600);

// ── Clip 1: collect ─────────────────────────────────────────────
const collectStart = mark();
await wait(700);
// The app imports one PDF per drop, so drop them one at a time.
async function dropPdf(name, path, from, to) {
  await p.mouse.move(from.x, from.y);
  await p.evaluate((name) => {
    const g = document.getElementById("howto-drag-badge");
    g.textContent = name;
    g.style.display = "block";
  }, name);
  await p.mouse.move(to.x, to.y, { steps: 36 });
  await wait(350);
  const dt = await p.evaluateHandle(([name, bytes]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
    return dt;
  }, [name, [...readFileSync(path)]]);
  for (const t of ["dragenter", "dragover", "drop"]) await p.dispatchEvent("main", t, { dataTransfer: dt });
  await p.evaluate(() => (document.getElementById("howto-drag-badge").style.display = "none"));
}
const visibleText = (t) => p.getByText(t, { exact: true }).locator("visible=true").first();
await dropPdf(...DROPS[0], { x: VIEW.width + 20, y: 420 }, { x: 760, y: 400 });
await p.mouse.move(VIEW.width - 60, 600, { steps: 24 });
await visibleText("ウェアラビリティのためのデザイン").waitFor();
await wait(500);
await dropPdf(...DROPS[1], { x: VIEW.width + 20, y: 600 }, { x: 800, y: 440 });
await p.mouse.move(900, 520, { steps: 15 });
await p.getByText("インタラクティブ・ジュエリー").locator("visible=true").first().waitFor();
await wait(2600);
// Drag the paper onto a project in the sidebar (pointer tracking, not HTML5 DnD).
const row = await center(visibleText("ウェアラビリティのためのデザイン"));
const target = await center(visibleText("ウェアラブル研究"));
await p.mouse.move(row.x, row.y, { steps: 22 });
await wait(300);
await p.mouse.down();
await p.mouse.move(row.x - 40, row.y + 4, { steps: 6 });
await p.mouse.move(target.x, target.y, { steps: 36 });
await wait(350);
await p.mouse.up();
await wait(2400);
const collectEnd = mark();

// ── Clip 2: read ────────────────────────────────────────────────
const readStart = mark();
await wait(500);
await click(visibleText("ウェアラビリティのためのデザイン"), 500);
await wait(2600);
await p.mouse.move(880, 520, { steps: 20 });
for (let s = 0; s < 6; s++) { await p.mouse.wheel(0, 60); await wait(30); }
await wait(900);
const orig = p.getByRole("button", { name: "原文を表示" }).first();
await click(orig);
await wait(2600);
await p.mouse.down(); await wait(90); await p.mouse.up();
await wait(900);
// Highlight: drag-select part of a paragraph.
const para = p.locator("[data-paper-block-id]").filter({ hasText: "コンピューティング・ツール" }).locator("visible=true").first();
await para.scrollIntoViewIfNeeded();
await wait(400);
const pb = await para.boundingBox();
await p.mouse.move(pb.x + 30, pb.y + 12, { steps: 20 });
await p.mouse.down();
await p.mouse.move(pb.x + Math.min(pb.width - 40, 360), pb.y + 12, { steps: 30 });
await p.mouse.up();
await wait(700);
await p.keyboard.type("配置の基準 → 図1と比べる", { delay: 90 });
await wait(500);
await click(p.getByRole("button", { name: "メモを保存" }));
await wait(1400);
await click(visibleText("すべての論文"));
await wait(1200);
await p.keyboard.press("Meta+k");
await wait(700);
await p.keyboard.type("ジュエリー", { delay: 160 });
await wait(2600);
const readEnd = mark();

await ctx.close();
await b.close();
vite.kill();

const raw = join(dir, readdirSync(dir).find((f) => f.endsWith(".webm")));
function cut(name, from, to) {
  const mp4 = `${OUT}/howto-${name}.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", from.toFixed(2), "-to", to.toFixed(2), "-i", raw,
    "-vf", "scale=1280:-2,fps=30", "-c:v", "libx265", "-tag:v", "hvc1", "-crf", "30", "-preset", "slow", "-pix_fmt", "yuv420p",
    "-an", "-movflags", "+faststart", mp4]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-sseof", "-0.1", "-i", mp4, "-frames:v", "1", "-q:v", "4", `${OUT}/howto-${name}.jpg`]);
  console.log(`${mp4} ${(to - from).toFixed(1)}s ${(statSync(mp4).size / 1024).toFixed(0)} KB`);
}
cut("collect", collectStart, collectEnd);
cut("read", readStart, readEnd);
