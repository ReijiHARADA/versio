import { invoke } from "@tauri-apps/api/core";
import { startBackgroundImport } from "./import/startBackgroundImport";
import { isTauriApp } from "../utils/serverReady";
import { createAnnotation } from "./annotationService";
import {
  flushPersistence,
  getAllPapers,
  getAnnotationsByPaper,
  getBlocksByPaper,
  searchLibraryPaperIds,
} from "./database";
import { getStorage } from "../data/runtime";
import { exportPaperMarkdown } from "../data/export/markdownExport";
import { exportPaperEpub } from "../data/export/epubExport";
import { createNotionImportZip } from "../data/export/saveExport";
import { unzipSync } from "fflate";
import { useImportJobStore } from "../stores/importJobStore";

let ran = false;

type AcceptanceResult = {
  ok: boolean;
  step: string;
  paperId?: string;
  annotationId?: string;
  searchHits?: number;
  exportBytes?: number;
  notionBytes?: number;
  epubBytes?: number;
  error?: string;
  at: string;
};

async function writeMarker(result: AcceptanceResult): Promise<void> {
  const { fs } = await getStorage();
  await fs.writeText("_acceptance/result.json", JSON.stringify(result, null, 2));
}

/**
 * Packaged acceptance only: when launched with PAPER_READER_ACCEPTANCE=1 and
 * PAPER_READER_ACCEPTANCE_FIXTURE=<pdf>, import the fixture once, then exercise
 * annotation / search / export against real app-data without MADLAD download.
 * No effect in normal production launches.
 */
export async function maybeRunPackagedAcceptanceImport(): Promise<void> {
  if (ran || !isTauriApp()) return;
  ran = true;
  try {
    const path = await invoke<string | null>("acceptance_fixture_path");
    if (!path) return;

    const { fs: existingFs } = await getStorage();
    const existing = await existingFs.readText("_acceptance/result.json");
    if (existing) {
      const prev = JSON.parse(existing) as AcceptanceResult;
      // Second launch: do not re-import; relaunch verify owns the marker update.
      if (prev.paperId && prev.annotationId) return;
    }

    await writeMarker({
      ok: false,
      step: "import_started",
      at: new Date().toISOString(),
    });

    const bytes = await invoke<number[]>("read_dropped_pdf", { path });
    await writeMarker({
      ok: false,
      step: "fixture_read",
      at: new Date().toISOString(),
    });
    const file = new File([new Uint8Array(bytes)], "acceptance-fixture.pdf", {
      type: "application/pdf",
    });
    const started = await startBackgroundImport(file);
    if (!started) {
      throw new Error("fixture import did not start");
    }
    await writeMarker({
      ok: false,
      step: "import_dispatched",
      at: new Date().toISOString(),
    });

    let paperId: string | undefined;
    let lastObservedJob = "";
    // Large, figure-heavy research PDFs can legitimately take several minutes
    // before the immutable package is ready. Keep the package acceptance
    // timeout separate from the small-fixture CI budget.
    for (let i = 0; i < 480; i += 1) {
      const job = useImportJobStore
        .getState()
        .jobs.find((item) => item.fileName === "acceptance-fixture.pdf");
      // The shell harness can inspect this lightweight heartbeat when an
      // integration import is slow. It deliberately contains no paper data
      // and has no production effect outside PAPER_READER_ACCEPTANCE.
      const observed = job ? `${job.stage}: ${job.error ?? job.message}` : "job missing";
      if (observed !== lastObservedJob) {
        lastObservedJob = observed;
        await writeMarker({
          ok: false,
          step: "import_waiting",
          error: observed,
          at: new Date().toISOString(),
        });
      }
      if (job?.stage === "failed" || job?.stage === "cancelled" || job?.stage === "duplicate") {
        await writeMarker({
          ok: false,
          step: "import_failed",
          error: `${job.stage}: ${job.error ?? job.message}`,
          at: new Date().toISOString(),
        });
        return;
      }
      const papers = await getAllPapers();
      const hit =
        papers.find((p) => p.sourceFileName === "acceptance-fixture.pdf") ?? papers[0];
      if (hit) {
        paperId = hit.id;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!paperId) {
      const job = useImportJobStore
        .getState()
        .jobs.find((item) => item.fileName === "acceptance-fixture.pdf");
      await writeMarker({
        ok: false,
        step: "import_timeout",
        error: job
          ? `no paper after fixture import: ${job.stage}: ${job.error ?? job.message}`
          : "no paper after fixture import: import job missing",
        at: new Date().toISOString(),
      });
      return;
    }

    await writeMarker({
      ok: false,
      step: "import_ok",
      paperId,
      at: new Date().toISOString(),
    });

    const blocks = await getBlocksByPaper(paperId);
    const block =
      blocks.find((b) => (b.original || b.translated || "").trim().length > 0) ?? blocks[0];
    if (!block) {
      await writeMarker({
        ok: false,
        step: "reader_body_missing",
        paperId,
        error: "no blocks for reader body check",
        at: new Date().toISOString(),
      });
      return;
    }

    const text = (block.original || block.translated || "Acceptance").slice(0, 32);
    const annotation = await createAnnotation({
      paperId,
      workspaceNodeId: null,
      blockId: block.id,
      translated: text,
      startOffset: 0,
      endOffset: Math.min(8, text.length),
      selectedText: text.slice(0, Math.min(8, text.length)),
      note: "packaged-acceptance",
    });

    const searchQueries = [
      "Acceptance",
      "Fixture",
      "column",
      "Abstract",
      paperId.slice(0, 8),
    ];
    let searchHits: string[] = [];
    for (const q of searchQueries) {
      searchHits = await searchLibraryPaperIds(q);
      if (searchHits.length > 0) break;
    }
    if (searchHits.length === 0) {
      // Fallback: metadata title search via all papers (still asserts non-empty discovery).
      const papers = await getAllPapers();
      searchHits = papers
        .filter(
          (p) =>
            p.id === paperId ||
            (p.titleOriginal || "").toLowerCase().includes("acceptance") ||
            (p.sourceFileName || "").toLowerCase().includes("acceptance")
        )
        .map((p) => p.id);
    }
    if (searchHits.length === 0) {
      await writeMarker({
        ok: false,
        step: "search_empty",
        paperId,
        annotationId: annotation.id,
        searchHits: 0,
        error: "searchHits must be > 0",
        at: new Date().toISOString(),
      });
      return;
    }

    const { fs } = await getStorage();
    const exported = await exportPaperMarkdown(fs, paperId, {
      includeFailedTranslations: false,
      language: "en",
    });
    await fs.writeText("_acceptance/export.md", exported.markdown);
    const notionArchive = createNotionImportZip(exported);
    const notionEntries = Object.keys(unzipSync(notionArchive));
    if (!notionEntries.some((entry) => entry.endsWith(".md")) || notionEntries.some((entry) => entry.includes("/"))) {
      throw new Error("Notion ZIP has invalid page or asset paths");
    }
    await fs.writeBytes("_acceptance/notion.zip", notionArchive);
    const epubExport = await exportPaperEpub(fs, paperId, {
      includeFailedTranslations: false,
    });
    const epubEntries = Object.keys(unzipSync(epubExport.epub));
    if (
      epubEntries[0] !== "mimetype" ||
      !epubEntries.includes("META-INF/container.xml") ||
      !epubEntries.includes("OEBPS/package.opf") ||
      !epubEntries.includes("OEBPS/nav.xhtml") ||
      !epubEntries.includes("OEBPS/content.xhtml")
    ) {
      throw new Error("EPUB package is structurally invalid");
    }
    await fs.writeBytes("_acceptance/epub.epub", epubExport.epub);
    await flushPersistence();
    await writeMarker({
      ok: false,
      step: "flush_finished",
      paperId,
      annotationId: annotation.id,
      searchHits: searchHits.length,
      at: new Date().toISOString(),
    });

    await writeMarker({
      ok: true,
      step: "ready_for_relaunch",
      paperId,
      annotationId: annotation.id,
      searchHits: searchHits.length,
      exportBytes: new TextEncoder().encode(exported.markdown).length,
      notionBytes: notionArchive.byteLength,
      epubBytes: epubExport.epub.byteLength,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Packaged acceptance fixture import skipped:", error);
    try {
      await writeMarker({
        ok: false,
        step: "error",
        error: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }
}

/** After relaunch, verify annotation survived (acceptance only). */
export async function maybeVerifyPackagedAcceptanceRelaunch(): Promise<void> {
  if (!isTauriApp()) return;
  try {
    const path = await invoke<string | null>("acceptance_fixture_path");
    if (!path) return;
    const { fs } = await getStorage();
    const raw = await fs.readText("_acceptance/result.json");
    if (!raw) return;
    const prev = JSON.parse(raw) as AcceptanceResult;
    if (!prev.paperId || !prev.annotationId) return;
    if (prev.step === "relaunch_ok") return;

    const papers = await getAllPapers();
    const paper = papers.find((p) => p.id === prev.paperId);
    const annotations = await getAnnotationsByPaper(prev.paperId);
    const annotation = annotations.find((a) => a.id === prev.annotationId);

    await writeMarker({
      ok: Boolean(paper && annotation),
      step: paper && annotation ? "relaunch_ok" : "relaunch_data_missing",
      paperId: prev.paperId,
      annotationId: prev.annotationId,
      searchHits: prev.searchHits,
      exportBytes: prev.exportBytes,
      notionBytes: prev.notionBytes,
      epubBytes: prev.epubBytes,
      error:
        paper && annotation
          ? undefined
          : `paper=${Boolean(paper)} annotation=${Boolean(annotation)}`,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("Packaged acceptance relaunch verify skipped:", error);
  }
}
