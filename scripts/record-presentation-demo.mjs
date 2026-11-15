import { chromium } from "/Users/harada/Desktop/MyProjects/projects/paper-reader/node_modules/playwright/index.mjs";

const OUT = process.argv[2];
const BASE = "http://localhost:5199/";
const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
// Headless video has no OS cursor; draw one.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(30,30,30,.35);border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .12s";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const p = await ctx.newPage();
const wait = (ms) => p.waitForTimeout(ms);
let pos = { x: 960, y: 540 };
async function moveTo(loc, steps = 30) {
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  const x = box.x + Math.min(box.width / 2, 60), y = box.y + box.height / 2;
  await p.mouse.move(x, y, { steps });
  pos = { x, y };
}
async function click(loc, pause = 400) {
  await moveTo(loc);
  await wait(pause);
  await p.mouse.down(); await wait(90); await p.mouse.up();
}
async function scroll(total, step = 60, delay = 28) {
  for (let s = 0; s < Math.abs(total); s += step) {
    await p.mouse.wheel(0, Math.sign(total) * step);
    await wait(delay);
  }
}

await p.goto(BASE);
await wait(1200);
await p.mouse.move(pos.x, pos.y);

// 1. Library: workspace tree + importing card
await wait(1500);
await moveTo(p.getByText("Human–AI Interaction Guidelines.pdf"));
await wait(2200);
await moveTo(p.getByText("HCIリサーチ").first());
await wait(1200);

// 2. Open the paper
await click(p.getByText("ウェアラビリティのためのデザイン", { exact: true }).last(), 600);
await wait(3500);

// 3. Bilingual: show original of the abstract, then back
await p.mouse.move(1300, 520, { steps: 25 });
await wait(800);
const orig = p.getByRole("button", { name: "原文を表示" }).first();
await click(orig);
await wait(3500);
// Toggle is still under the cursor; click it again in place to close.
await p.mouse.down(); await wait(90); await p.mouse.up();
await wait(1500);

// 4. Read a little
await p.mouse.move(1250, 650, { steps: 20 });
await scroll(700);
await wait(2000);

// 5. Outline → 1. 配置 (Figure 1)
await click(p.getByText("1. 配置", { exact: true }).first());
await wait(2500);
const zoom = p.getByRole("button", { name: "拡大表示" }).first();
if (await zoom.count()) {
  await click(zoom);
  await wait(3000);
  await p.keyboard.press("Escape");
  await wait(1500);
}

// 6. Outline → guidelines panel
await click(p.getByText("ウェアラビリティのためのデザインガイドライン", { exact: true }).first());
await wait(3500);
await p.mouse.move(1250, 600, { steps: 20 });
await scroll(500);
await wait(2000);

// 7. Search
await click(p.getByRole("button", { name: "検索 (⌘F)" }));
await wait(700);
await p.keyboard.type("ウェアラビリティ", { delay: 140 });
await wait(1500);
await p.keyboard.press("Enter"); await wait(1200);
await p.keyboard.press("Enter"); await wait(1500);
await p.keyboard.press("Escape");
await wait(1000);

// 8. References, then back to library
await click(p.getByText("References", { exact: true }).first());
await wait(3000);
await click(p.getByRole("button", { name: "ライブラリに戻る" }));
await wait(3000);

const video = p.video();
await ctx.close();
console.log(await video.path());
await b.close();
