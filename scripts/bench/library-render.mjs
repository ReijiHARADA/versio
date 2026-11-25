// Library render bench: how the Library screen copes with N papers.
//   npm run bench:library-render -- 100 1000 3000 10000
// Builds the in-memory demo (VITE_VERSIO_DEMO=1, never the user's library) once,
// serves it with `vite preview`, and opens `?scaleN=N` in headless Chromium.
import { spawn, execFileSync } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5241;
const sizes = process.argv.slice(2).map(Number).filter((n) => n > 0);
const env = { ...process.env, VITE_VERSIO_DEMO: "1" };
execFileSync("npx", ["vite", "build", "--outDir", ".cache/library-render-dist"], { env, stdio: "ignore" });
const server = spawn("npx", ["vite", "preview", "--outDir", ".cache/library-render-dist", "--port", String(PORT), "--strictPort"], { env, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve) => server.stdout.on("data", (d) => String(d).includes("Local:") && resolve()));
process.on("exit", () => server.kill());

const browser = await chromium.launch();
for (const n of sizes.length ? sizes : [100, 1000]) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 } });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/?scaleN=${n}`);
  await page.waitForFunction((n) => document.querySelectorAll("article[data-paper-id]").length >= Math.min(n, 6), n, { timeout: 600_000 });
  const firstCards = Date.now() - t0;
  await page.waitForTimeout(1500);
  await page.mouse.move(900, 500);
  // Record frame times passively while real wheel events scroll the list (~7200 px/s).
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const step = (now) => {
      window.__frames.push(now - last);
      last = now;
      if (!window.__stopFrames) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(16);
  }
  const stats = await page.evaluate(() => {
    window.__stopFrames = true;
    const frames = window.__frames.slice(1).sort((a, b) => a - b);
    const cards = document.querySelectorAll("article[data-paper-id]").length;
    const nodes = document.getElementsByTagName("*").length;
    const p = (q) => frames[Math.floor(frames.length * q)]?.toFixed(1);
    return { cards, nodes, frames: frames.length, p50: p(0.5), p95: p(0.95), max: frames.at(-1)?.toFixed(0), heapMB: (performance.memory?.usedJSHeapSize / 1e6).toFixed(0) };
  });
  // Library search: warm up (the synonym dictionary loads lazily), then time typing a query.
  await page.keyboard.press("Meta+k");
  await page.keyboard.type("jewellery");
  await page.waitForTimeout(3000);
  await page.keyboard.press("Meta+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(1000);
  const t1 = Date.now();
  await page.keyboard.type("power");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  const typeMs = Date.now() - t1;
  await page.waitForTimeout(1500);
  const t2 = Date.now();
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  const searchMs = { type5KeysMs: typeMs, settleFrameMs: Date.now() - t2 };
  console.log(JSON.stringify({ papers: n, firstCardsMs: firstCards, ...searchMs, ...stats }));
  await page.close();
}
await browser.close();
process.exit(0);
