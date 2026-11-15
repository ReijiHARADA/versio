/**
 * Import a real PDF via Library file input and capture Reader screenshots.
 * Requires VERSIO_URL (default http://127.0.0.1:5173).
 *
 * Usage:
 *   node scripts/spot-reader-extraction.mjs path/to/paper.pdf [label]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const base = process.env.VERSIO_URL ?? "http://127.0.0.1:5173";
const pdfPath = process.argv[2];
const label = process.argv[3] ?? path.basename(pdfPath, ".pdf").slice(0, 40);
if (!pdfPath) {
  console.error("usage: node scripts/spot-reader-extraction.mjs <pdf> [label]");
  process.exit(1);
}

const outDir = new URL("../test-results/browser-verify/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${base}/#/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 20_000 });

const input = page.getByTestId("library-add-pdf-input");
await input.setInputFiles(pdfPath);

// Wait until a paper card becomes readable / openable.
const deadline = Date.now() + 180_000;
let opened = false;
while (Date.now() < deadline) {
  const openBtn = page.getByRole("link", { name: /読む|開く/ }).first();
  if (await openBtn.count().catch(() => 0)) {
    await openBtn.click({ timeout: 5_000 }).catch(() => {});
    opened = true;
    break;
  }
  const card = page.locator("[data-testid=paper-card], a[href*='#/reader']").first();
  if (await card.count().catch(() => 0)) {
    await card.click({ timeout: 5_000 }).catch(() => {});
    opened = true;
    break;
  }
  await page.waitForTimeout(1500);
}

if (!opened) {
  const shot = new URL(`fail-import-${label}.png`, outDir);
  await page.screenshot({ path: shot.pathname, fullPage: true });
  console.error(`import timeout; screenshot=${shot.pathname}`);
  await browser.close();
  process.exit(2);
}

await page.waitForTimeout(2500);
const readerShot = new URL(`reader-${label}.png`, outDir);
await page.screenshot({ path: readerShot.pathname, fullPage: true });
const headings = await page
  .locator("h1, h2, h3, [data-block-type='heading'], [data-role='title']")
  .allTextContents()
  .then((items) => items.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 16))
  .catch(() => []);
console.log(JSON.stringify({ label, screenshot: readerShot.pathname, headings }, null, 2));
await browser.close();
