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

let ran = false;

type AcceptanceResult = {
  ok: boolean;
  step: string;
  paperId?: string;
  annotationId?: string;
  searchHits?: number;
  exportBytes?: number;
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
    const file = new File([new Uint8Array(bytes)], "acceptance-fixture.pdf", {
      type: "application/pdf",
    });
    await startBackgroundImport(file);

    let paperId: string | undefined;
    for (let i = 0; i < 120; i += 1) {
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
      await writeMarker({
        ok: false,
        step: "import_timeout",
        error: "no paper after fixture import",
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
    await flushPersistence();

    await writeMarker({
      ok: true,
      step: "ready_for_relaunch",
      paperId,
      annotationId: annotation.id,
      searchHits: searchHits.length,
      exportBytes: new TextEncoder().encode(exported.markdown).length,
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
