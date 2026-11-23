/**
 * Browser smoke for Versio (Playwright).
 *
 * Prerequisites:
 * - Frontend preview/dev serving VERSIO_URL (default http://localhost:5173)
 * - Built assets already produced (`npm run build` + `npm run preview` in CI)
 *
 * Critical checks must fail (not skip) when fixtures are missing.
 * Uses the bundled Introduction paper + workspace UI; no MADLAD / network PDFs.
 */
import { mkdirSync, rmSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.VERSIO_URL ?? "http://localhost:5173";
const outDir = new URL("../test-results/browser-verify/", import.meta.url);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const runId = `${Date.now()}`;
const verifyProjectName = `Browser Verify Project ${runId}`;
const renamedProjectName = `${verifyProjectName} Renamed`;
const parentFolderName = `Browser Verify Parent ${runId}`;
const childFolderName = `${parentFolderName} Child`;

const SAMPLE_TITLE_JA = "Versio: 言語を越えて論文を読む";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failures = [];
const createdWorkspaceNames = new Set();

async function shot(name) {
  const file = new URL(`${name}.png`, outDir);
  await page.screenshot({ path: file.pathname, fullPage: true });
  return file.pathname;
}

async function diagnose(label) {
  const url = page.url();
  const headings = await page
    .locator("h1, h2, h3")
    .allTextContents()
    .then((items) =>
      items
        .map((text) => text.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 12)
    )
    .catch(() => []);
  const bodySnippet = await page
    .locator("body")
    .innerText()
    .then((text) => text.replace(/\s+/g, " ").trim().slice(0, 280))
    .catch(() => "");
  const path = await shot(`fail-${label.replace(/\s+/g, "-").slice(0, 80)}`);
  return [
    `url=${url}`,
    `headings=${JSON.stringify(headings)}`,
    `body≈${JSON.stringify(bodySnippet)}`,
    `screenshot=${path}`,
  ].join(" | ");
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    let diag = "";
    try {
      diag = await diagnose(name);
    } catch {
      diag = "diagnose failed";
    }
    failures.push(`${name}: ${detail} || ${diag}`);
    console.error(`fail ${name}: ${detail}`);
    console.error(`  ${diag}`);
  }
}

async function waitForPreviewReady() {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await page.goto(`${base}/#/`, {
        waitUntil: "domcontentloaded",
        timeout: 5_000,
      });
      if (response && response.ok()) {
        await page.getByRole("heading", { name: "すべての論文" }).waitFor({
          timeout: 10_000,
        });
        return;
      }
      lastError = new Error(`HTTP ${response?.status() ?? "no response"}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await page.waitForTimeout(250);
  }
  throw new Error(
    `preview not ready at ${base}: ${lastError?.message ?? "unknown"}`
  );
}

async function hoverSidebar() {
  await page.locator("aside").first().hover();
}

/** PathTrail puts folder text in h1>nav[aria-label=場所], so heading accessible name is "場所". */
function locationTrail() {
  return page.getByRole("navigation", { name: "場所" });
}

async function expectLocation(folderName) {
  await locationTrail().getByText(folderName, { exact: true }).waitFor({
    timeout: 10_000,
  });
}

async function createRootFolder(name) {
  await hoverSidebar();
  await page.getByRole("button", { name: "新規フォルダ" }).click();
  await page.getByLabel("フォルダ名").fill(name);
  await page.getByRole("button", { name: "作成", exact: true }).click();
  createdWorkspaceNames.add(name);
  // Root create navigates to /project/:id
  await page.waitForURL(/#\/project\//, { timeout: 10_000 });
  await expectLocation(name);
  await page.getByRole("link", { name: name, exact: true }).waitFor({
    timeout: 10_000,
  });
}

async function deleteWorkspaceByName(name) {
  await hoverSidebar();
  const link = page.getByRole("link", { name: name, exact: true });
  if ((await link.count()) === 0) return;
  await page.getByRole("link", { name: name, exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "削除", exact: true }).click();
  await link.waitFor({ state: "detached", timeout: 10_000 });
  createdWorkspaceNames.delete(name);
}

async function ensureSamplePaper() {
  // The Introduction is seeded once on a fresh library; a reused profile may have trashed it, so re-add it directly.
  await page.getByRole("link", { name: "すべての論文" }).click();
  await page.getByRole("heading", { name: "すべての論文" }).waitFor({ timeout: 10_000 });
  const card = page.getByText(SAMPLE_TITLE_JA).first();
  if (!(await card.isVisible().catch(() => false))) {
    await page.evaluate(async () => {
      const db = await import("/src/services/database.ts");
      const data = await import("/src/data/introductionPaper.ts");
      const { useLibraryCache } = await import("/src/stores/libraryCache.ts");
      if (!(await db.getPaper(data.introductionPaper.id))) {
        await db.savePaper(data.introductionPaper);
        await db.saveSections(data.introductionSections);
        await db.saveBlocks(data.introductionBlocks);
      }
      const paper = await db.getPaper(data.introductionPaper.id);
      if (paper && !useLibraryCache.getState().papers.some((p) => p.id === paper.id)) useLibraryCache.getState().addPaper(paper);
    });
  }
  await card.waitFor({ state: "visible", timeout: 15_000 });
  return card;
}

try {
  await waitForPreviewReady();
  console.log(`ok  preview ready (${base})`);

  await check("library heading", async () => {
    await page.getByRole("heading", { name: "すべての論文" }).waitFor({
      timeout: 10_000,
    });
  });

  await check("library search", async () => {
    await hoverSidebar();
    await page.locator("#library-search").waitFor({
      state: "visible",
      timeout: 10_000,
    });
  });
  await shot("library");

  await check("project action menu", async () => {
    await createRootFolder(verifyProjectName);
    await hoverSidebar();
    if (await page.locator("header").getByTitle("プロジェクトを削除").count()) {
      throw new Error("project header still contains a delete button");
    }

    await page
      .getByRole("link", { name: verifyProjectName, exact: true })
      .click({ button: "right" });
    await page.getByRole("menuitem", { name: "名称を変更" }).waitFor();
    await page.getByRole("menuitem", { name: "論文ファイルを追加" }).waitFor();
    await page.getByRole("menuitem", { name: "削除", exact: true }).waitFor();

    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: verifyProjectName, exact: true }).dblclick();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill(renamedProjectName);
    await page.getByRole("textbox", { name: "名称", exact: true }).press("Enter");
    createdWorkspaceNames.delete(verifyProjectName);
    createdWorkspaceNames.add(renamedProjectName);
    await page.getByRole("link", { name: renamedProjectName, exact: true }).waitFor({
      timeout: 10_000,
    });
    await expectLocation(renamedProjectName);

    await hoverSidebar();
    await page
      .getByRole("link", { name: renamedProjectName, exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "削除", exact: true }).click();
    await page
      .getByRole("link", { name: renamedProjectName, exact: true })
      .waitFor({ state: "detached", timeout: 10_000 });
    createdWorkspaceNames.delete(renamedProjectName);
  });
  await shot("project-action-menu");

  await check("workspace child folders in main view", async () => {
    await page.getByRole("link", { name: "すべての論文" }).click();
    await page.getByRole("heading", { name: "すべての論文" }).waitFor({
      timeout: 10_000,
    });

    await createRootFolder(parentFolderName);
    await expectLocation(parentFolderName);

    await hoverSidebar();
    await page
      .getByRole("link", { name: parentFolderName, exact: true }).click({ button: "right" });
    await page.getByRole("menuitem", { name: "サブフォルダーを追加" }).click();
    await page.getByLabel("フォルダ名").fill(childFolderName);
    await page.getByRole("button", { name: "作成", exact: true }).click();
    createdWorkspaceNames.add(childFolderName);

    // Stay on parent; child appears as a main-view folder card (h3 inside article).
    await expectLocation(parentFolderName);
    const folderCard = page.locator("article").filter({ hasText: childFolderName });
    await folderCard
      .getByRole("heading", { name: childFolderName, exact: true })
      .waitFor({ timeout: 10_000 });
    await folderCard.getByText("フォルダ").waitFor({ timeout: 5_000 });
    await page.getByRole("link", { name: childFolderName, exact: true }).waitFor({
      timeout: 10_000,
    });
  });
  await shot("workspace-child-folders");

  await page.getByRole("link", { name: "設定" }).click();
  await check("settings reading preview", async () => {
    await page.getByRole("button", { name: "読書", exact: true }).click();
    const preview = page.getByLabel("本文プレビュー");
    await preview.waitFor({ timeout: 10_000 });
    // Fixture body from ReadingPreview — confirms the live Reader surface rendered.
    await preview.getByText("注意機構があれば十分である").waitFor({ timeout: 5_000 });
  });
  await shot("settings-reading");

  await check("settings translation engine", async () => {
    await page.getByRole("button", { name: "翻訳", exact: true }).click();
    await page.getByText("翻訳モデル", { exact: true }).first().waitFor({ timeout: 10_000 });
    await page.getByText("デスクトップ版でのみ利用できます").first().waitFor({ timeout: 5_000 });
  });
  await shot("settings-translation");

  let sampleCard = null;
  await check("sample paper fixture", async () => {
    sampleCard = await ensureSamplePaper();
  });
  await shot("library-after-sample");

  if (!sampleCard) {
    failures.push(
      "reader suite: aborted because sample paper fixture was not created (must not skip)"
    );
    console.error("fail reader suite: sample paper fixture missing (not skipped)");
  } else {
    await check("reader title and body", async () => {
      await sampleCard.click();
      await page.waitForURL(/#\/reader\//, { timeout: 10_000 });
      await page.getByText(SAMPLE_TITLE_JA).first().waitFor({ timeout: 10_000 });
      await page
        .locator("[data-text-role='translation']")
        .first()
        .waitFor({ timeout: 15_000 });
    });

    await check("reader search UI", async () => {
      await page.keyboard.press("Meta+f");
      const field = page.getByPlaceholder("この論文を検索");
      await field.waitFor({ state: "visible", timeout: 10_000 });
      await field.fill("glossary");
      await page.locator("[data-search-panel]").waitFor({ state: "visible", timeout: 5_000 });
      await shot("reader-search");
      await page.keyboard.press("Escape");
      await page.locator("[data-search-panel]").waitFor({ state: "detached", timeout: 5_000 });
    });
    await shot("reader");

    await page.getByRole("link", { name: "すべての論文" }).click();
    await page.getByRole("heading", { name: "すべての論文", exact: true }).waitFor({
      timeout: 10_000,
    });

    await check("favorite mark on paper card", async () => {
      const card = page.locator("article").filter({ hasText: SAMPLE_TITLE_JA }).first();
      await card.getByRole("button", { name: "論文の操作" }).click();
      await page.getByRole("menuitem", { name: "お気に入り" }).click();
      await card.getByLabel("お気に入り").waitFor({ timeout: 10_000 });
    });
    await shot("library-favorite");

    await check("inline memo popover stays on reader", async () => {
      const card = page.locator("article").filter({ hasText: SAMPLE_TITLE_JA }).first();
      await card.click();
      await page.waitForURL(/#\/reader\//, { timeout: 10_000 });
      const translation = page.locator("[data-text-role='translation']").first();
      await translation.waitFor({ timeout: 10_000 });
      await translation.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const root = document.querySelector('[data-testid="reader-body"]');
        const el = root?.querySelector('[data-text-role="translation"]');
        if (!el) throw new Error("translation paragraph missing");
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const textNode = walker.nextNode();
        if (!textNode || !textNode.textContent) throw new Error("translation text missing");
        const end = Math.min(12, textNode.textContent.length);
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, end);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        root?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      });
      const dialog = page.getByRole("dialog", { name: "メモを追加" });
      await dialog.waitFor({ state: "visible", timeout: 5_000 });
      // A body selection must not switch the inspector to its Notes tab.
      if (await page.locator('#inspector-tab-notes[aria-selected="true"]').count()) {
        throw new Error("Notes inspector opened from a body selection");
      }
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    });

    await check("markdown export dialog", async () => {
      await page.getByRole("button", { name: "書き出す" }).click();
      const dialog = page.getByRole("dialog", { name: "書き出す" });
      await dialog.waitFor({ state: "visible", timeout: 10_000 });
      const bounds = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      if (
        bounds.top < 0 ||
        bounds.left < 0 ||
        bounds.right > bounds.viewportWidth ||
        bounds.bottom > bounds.viewportHeight
      ) {
        throw new Error(`export dialog is outside the viewport: ${JSON.stringify(bounds)}`);
      }
      await shot("reader-export-dialog");
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
    });
  }
} finally {
  // Cleanup workspaces created by this run (best-effort; failures already recorded).
  try {
    await page.getByRole("link", { name: "すべての論文" }).click({ timeout: 3_000 }).catch(() => {});
    for (const name of [...createdWorkspaceNames].reverse()) {
      await deleteWorkspaceByName(name).catch((error) => {
        console.warn(`cleanup skip ${name}: ${error instanceof Error ? error.message : error}`);
      });
    }
  } catch (error) {
    console.warn(`cleanup error: ${error instanceof Error ? error.message : error}`);
  }
  await browser.close();
}

if (failures.length > 0) {
  console.error("\nBrowser verify failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`\nBrowser verify passed. Screenshots: ${outDir.pathname}`);
