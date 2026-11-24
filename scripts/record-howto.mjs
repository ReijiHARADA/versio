// Records the two onboarding how-to clips from the filming-only demo build.
//   npm run record:howto            → src/assets/intro/howto-{collect,read}.{mp4,jpg}
// One continuous browser session (collect, then read) is cut into two clips
// at the timestamps the script logs, so the read clip starts from the
// library the collect clip produced.
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const PORT = 5232;
const BASE = `http://localhost:${PORT}/`;
// A 14" MacBook Pro at its default scale, minus the menu bar the page draws.
const VIEW = { width: 1512, height: 958 };
const MENU_H = 24;
const DROPS = [
  ["wearability.pdf", "test-fixtures/generated-pdfs/basic-two-column.pdf"],
  ["interactive-jewellery.pdf", "test-fixtures/generated-pdfs/ACM-style-two-column.pdf"],
  ["power-over-skin.pdf", "test-fixtures/generated-pdfs/footnote.pdf"],
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
// Headless video has no OS cursor: draw an arrow pointer, a Finder-like drag
// badge, and a key HUD so shortcuts read on screen.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 24 L7.5 18.8 L11.4 27.6 L15 26 L11.2 17.4 L18.6 17.4 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = "position:fixed;left:-40px;top:0;margin:-2px 0 0 -2px;pointer-events:none;z-index:2147483647;transform-origin:2px 2px;transition:transform .08s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))";
    const g = document.createElement("div");
    g.id = "howto-drag-badge";
    g.style.cssText = "position:fixed;left:-200px;top:0;margin:20px 0 0 16px;padding:6px 11px;border-radius:9px;background:rgba(255,255,255,.96);box-shadow:0 6px 20px rgba(0,0,0,.18);font:600 12.5px -apple-system,system-ui,sans-serif;color:#1d1d1f;pointer-events:none;z-index:2147483646;display:none";
    const k = document.createElement("div");
    k.id = "howto-keys";
    k.style.cssText = "position:fixed;left:50%;bottom:44px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none;z-index:2147483646;opacity:0;transition:opacity .15s";
    // Window controls: the Tauri window draws real ones over the sidebar.
    const tl = document.createElement("div");
    tl.style.cssText = "position:fixed;left:18px;top:18px;display:flex;gap:8px;pointer-events:none;z-index:2147483645";
    tl.innerHTML = ["#ff5f57", "#febc2e", "#28c840"].map((c) => `<span style="width:12px;height:12px;border-radius:50%;background:${c};box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12)"></span>`).join("");
    document.body.append(tl, g, k, c);
    addEventListener("mousemove", (e) => {
      for (const el of [c, g]) { el.style.left = e.clientX + "px"; el.style.top = e.clientY + "px"; }
    }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.86)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const p = await ctx.newPage();
const t0 = Date.now();
const mark = () => (Date.now() - t0) / 1000;
globalThis.__page = p;
p.on("pageerror", (e) => console.error("pageerror:", e.message));
const wait = (ms) => p.waitForTimeout(ms);
const visibleText = (t, exact = true) => p.getByText(t, { exact }).locator("visible=true").first();

// A practiced hand: eased, quick, no hesitation.
let pos = { x: VIEW.width + 20, y: 420 };
async function glide(x, y, ms = 420) {
  const from = pos, n = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    await p.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(ms / n);
  }
  pos = { x, y };
}
async function center(loc) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  return { x: box.x + Math.min(box.width / 2, 80), y: box.y + box.height / 2 };
}
async function click(loc, { ms = 380, modifiers = [] } = {}) {
  const { x, y } = await center(loc);
  await glide(x, y, ms);
  for (const m of modifiers) await p.keyboard.down(m);
  await p.mouse.down(); await wait(60); await p.mouse.up();
  for (const m of modifiers) await p.keyboard.up(m);
}
async function keys(labels, show = 900) {
  await p.evaluate((labels) => {
    const k = document.getElementById("howto-keys");
    k.innerHTML = labels.map((l) => `<span style="min-width:34px;height:34px;padding:0 10px;display:grid;place-items:center;border-radius:9px;background:rgba(28,28,30,.86);color:#fff;font:600 16px -apple-system,system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.2)">${l}</span>`).join("");
    k.style.opacity = "1";
  }, labels);
  setTimeout(() => p.evaluate(() => (document.getElementById("howto-keys").style.opacity = "0")).catch(() => {}), show);
}
// The app imports one PDF per drop, so drop them one at a time.
async function dropPdf([name, path], to) {
  await p.evaluate((name) => {
    const g = document.getElementById("howto-drag-badge");
    g.textContent = name;
    g.style.display = "block";
  }, name);
  pos = { x: VIEW.width + 20, y: to.y + 60 };
  await p.mouse.move(pos.x, pos.y);
  await glide(to.x, to.y, 520);
  const dt = await p.evaluateHandle(([name, bytes]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
    return dt;
  }, [name, [...readFileSync(path)]]);
  for (const t of ["dragenter", "dragover", "drop"]) await p.dispatchEvent("main", t, { dataTransfer: dt });
  await p.evaluate(() => (document.getElementById("howto-drag-badge").style.display = "none"));
}

await p.goto(BASE);
await visibleText("ウェアラブル研究").waitFor();
await p.mouse.move(pos.x, pos.y);
await wait(600);

// ── Clip 1: collect ─────────────────────────────────────────────
const collectStart = mark();
await wait(400);
await dropPdf(DROPS[0], { x: 760, y: 360 });
await glide(VIEW.width - 80, 520, 300);
await dropPdf(DROPS[1], { x: 780, y: 400 });
await glide(VIEW.width - 80, 560, 300);
await dropPdf(DROPS[2], { x: 800, y: 440 });
await glide(980, 520, 300);
await visibleText("Power-over-Skin", false).waitFor();
await visibleText("インタラクティブ・ジュエリー", false).waitFor();
await wait(1300);
// ⌘-click two papers, then drag both onto a project (pointer tracking, not HTML5 DnD).
await keys(["⌘"], 1500);
await click(visibleText("ウェアラビリティのためのデザイン"), { modifiers: ["Meta"] });
await wait(120);
await click(visibleText("Power-over-Skin", false), { ms: 260, modifiers: ["Meta"] });
await wait(250);
const row = await center(visibleText("Power-over-Skin", false));
const target = await center(visibleText("ウェアラブル研究"));
await glide(row.x, row.y, 200);
await p.mouse.down();
await glide(row.x - 30, row.y + 4, 80);
await glide(target.x, target.y, 520);
await wait(150);
await p.mouse.up();
await wait(1700);
const collectEnd = mark();

// ── Clip 2: read ────────────────────────────────────────────────
const readStart = mark();
await wait(300);
await click(visibleText("ウェアラビリティのためのデザイン"), { ms: 360 });
await wait(1500);
await glide(860, 520, 300);
for (let s = 0; s < 6; s++) { await p.mouse.wheel(0, 70); await wait(22); }
await wait(500);
await click(p.getByRole("button", { name: "原文を表示" }).first(), { ms: 340 });
await wait(1700);
await p.mouse.down(); await wait(60); await p.mouse.up();
await wait(400);
// Select a phrase and leave a memo.
const para = p.locator("[data-paper-block-id]").filter({ hasText: "コンピューティング・ツール" }).locator("visible=true").first();
await para.scrollIntoViewIfNeeded();
const pb = await para.boundingBox();
await glide(pb.x + 30, pb.y + 12, 300);
await p.mouse.down();
await glide(pb.x + Math.min(pb.width - 40, 360), pb.y + 12, 380);
await p.mouse.up();
await wait(450);
await p.keyboard.type("配置の基準 → 図1と比べる", { delay: 45 });
await wait(250);
await click(p.getByRole("button", { name: "メモを保存" }), { ms: 280 });
await wait(700);
await click(visibleText("すべての論文"), { ms: 420 });
await wait(500);
await keys(["⌘", "K"]);
await p.keyboard.press("Meta+k");
await wait(350);
await p.keyboard.type("ジュエリー", { delay: 80 });
await wait(2000);
const readEnd = mark();

await ctx.close();
// The macOS menu bar sits above the app window on the device's screen.
const SRC = ".cache/howto-src";
mkdirSync(SRC, { recursive: true });
const bar = await b.newPage({ viewport: { width: VIEW.width, height: MENU_H } });
await bar.setContent(`<body style="margin:0;height:${MENU_H}px;display:flex;align-items:center;gap:20px;padding:0 16px;box-sizing:border-box;background:rgba(236,236,240,1);color:#1d1d1f;font:13px -apple-system,'Hiragino Sans',system-ui,sans-serif;white-space:nowrap">
  <b style="font-weight:700">Versio</b><span>ファイル</span><span>編集</span><span>表示</span><span>ウインドウ</span><span>ヘルプ</span>
  <span style="margin-left:auto">11月24日(火) 9:41</span></body>`);
await bar.screenshot({ path: `${SRC}/menubar.png` });
await b.close();
vite.kill();

const raw = join(dir, readdirSync(dir).find((f) => f.endsWith(".webm")));
// Full device screen (menu bar + app), high quality: the input for the Rotato render.
function cut(name, from, to) {
  const out = `${SRC}/howto-${name}-screen.mp4`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", from.toFixed(2), "-to", to.toFixed(2), "-i", raw, "-i", `${SRC}/menubar.png`,
    "-filter_complex", `[0:v]fps=30,pad=${VIEW.width}:${VIEW.height + MENU_H}:0:${MENU_H}[app];[app][1:v]overlay=0:0`,
    "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out]);
  console.log(`${out} ${(to - from).toFixed(1)}s`);
}
cut("collect", collectStart, collectEnd);
cut("read", readStart, readEnd);
