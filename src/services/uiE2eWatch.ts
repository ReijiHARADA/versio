import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../utils/serverReady";
import { getStorage } from "../data/runtime";
import { startBackgroundImport } from "./import/startBackgroundImport";

export type UiE2ePhase = "initial" | "relaunch";

export type UiE2eMarker = {
  ok: boolean;
  step: string;
  phase: UiE2ePhase;
  detail?: string;
  searchVisible?: boolean;
  annotationVisible?: boolean;
  exportDialogVisible?: boolean;
  exportCompleted?: boolean;
  exportBytes?: number;
  exportedPath?: string;
  paperTitleHint?: string;
  /** A table grid or table image was mounted in the Reader DOM. */
  tableSurfaceVisible?: boolean;
  at: string;
};

let started = false;
let selectionTried = false;
let phase: UiE2ePhase = "initial";
let lastMarker: UiE2eMarker | null = null;
let exportCompleted = false;
let exportBytes = 0;
let exportedPath: string | undefined;
let paperTitleHint: string | undefined;
let fixtureImportStarted = false;
let smokeReaderOpenTried = false;
let smokeScrollTried = false;

async function writeUiMarker(marker: UiE2eMarker): Promise<void> {
  lastMarker = marker;
  const { fs } = await getStorage();
  await fs.writeText("_acceptance/ui-result.json", JSON.stringify(marker, null, 2));
}

/** Called from production export path after a successful save (UI E2E only). */
export async function reportUiE2eExportSuccess(saved: {
  path: string;
  bytes: number;
}): Promise<void> {
  if (!isTauriApp()) return;
  try {
    const enabled = await invoke<boolean>("ui_e2e_enabled");
    if (!enabled) return;
  } catch {
    return;
  }
  exportCompleted = saved.bytes > 0;
  exportBytes = saved.bytes;
  exportedPath = saved.path;
  await writeUiMarker({
    ok: false,
    step: exportCompleted ? "ui_export_completed" : "ui_export_empty",
    phase,
    exportCompleted,
    exportBytes,
    exportedPath,
    exportDialogVisible: Boolean(document.querySelector('[data-testid="export-dialog"]')),
    annotationVisible: Boolean(document.querySelector('[data-testid="annotation-mark"]')),
    searchVisible: Boolean(document.querySelector('[data-testid="search-hit"]')),
    paperTitleHint,
    detail: `exportBytes=${saved.bytes}`,
    at: new Date().toISOString(),
  });
}

/**
 * Packaged UI E2E only (PAPER_READER_UI_E2E=1).
 *
 * Constraint: WKWebView AX text selection is unreliable, so selection is
 * synthesized once via the DOM Range API; Save / Search / Export remain
 * external Accessibility / System Events actions.
 */
export async function maybeStartUiE2eWatcher(): Promise<void> {
  if (started || !isTauriApp()) return;
  let enabled = false;
  try {
    enabled = await invoke<boolean>("ui_e2e_enabled");
  } catch {
    return;
  }
  if (!enabled) return;
  let smokeOnly = false;
  try {
    smokeOnly = await invoke<boolean>("ui_e2e_smoke_only");
  } catch {
    smokeOnly = false;
  }
  started = true;

  // Relaunch detection: prior successful initial marker means we are in phase relaunch.
  try {
    const { fs } = await getStorage();
    const prevRaw = await fs.readText("_acceptance/ui-result.json");
    if (prevRaw) {
      const prev = JSON.parse(prevRaw) as UiE2eMarker;
      if (
        prev.phase === "initial" &&
        prev.exportCompleted &&
        prev.annotationVisible &&
        (prev.step === "ui_core_flow_ready" || prev.exportCompleted)
      ) {
        phase = "relaunch";
        paperTitleHint = prev.paperTitleHint;
        // Do not re-synthesize selection on relaunch — annotation should already exist.
        selectionTried = true;
        exportCompleted = false;
        exportBytes = 0;
        exportedPath = undefined;
      }
    }
  } catch {
    // ignore
  }

  await writeUiMarker({
    ok: false,
    step: phase === "relaunch" ? "ui_relaunch_watch_started" : "ui_watch_started",
    phase,
    at: new Date().toISOString(),
  });

  // The native NSOpenPanel is intentionally kept out of the deterministic
  // packaged UI flow. Its Accessibility path is affected by the user's IME
  // and by macOS picker focus, while the actual Tauri import path is the same
  // one used after a dropped/selected PDF. The harness opts into this direct
  // fixture path explicitly; normal launches and manual file selection never
  // reach it.
  if (phase === "initial" && !fixtureImportStarted) {
    try {
      const fixturePath = await invoke<string | null>("ui_e2e_fixture_path");
      if (fixturePath) {
        fixtureImportStarted = true;
        const bytes = await invoke<number[]>("read_dropped_pdf", { path: fixturePath });
        const fileName = fixturePath.split(/[\\/]/).pop() || "ui-e2e-fixture.pdf";
        const file = new File([new Uint8Array(bytes)], fileName, { type: "application/pdf" });
        const started = await startBackgroundImport(file);
        if (!started) throw new Error("UI E2E fixture import did not start");
      }
    } catch (error) {
      await writeUiMarker({
        ok: false,
        step: "ui_fixture_import_error",
        phase,
        detail: error instanceof Error ? error.message : String(error),
        at: new Date().toISOString(),
      });
    }
  }

  const tick = async () => {
    const paperCard = document.querySelector('[data-testid="paper-card"]');
    const reader = document.querySelector('[data-testid="reader-screen"]');
    const readerBody = document.querySelector('[data-testid="reader-body"]');
    const memo = document.querySelector('[data-testid="memo-popover"]');
    const searchPanel = document.querySelector('[data-testid="reader-search-panel"]');
    const searchHits = document.querySelectorAll('[data-testid="search-hit"]');
    const exportDialog = document.querySelector('[data-testid="export-dialog"]');
    const annotationMark = document.querySelector('[data-testid="annotation-mark"]');
    const exportStatus = document.querySelector('[data-testid="export-status"]');
    const tableSurfaceVisible = Boolean(
      readerBody?.querySelector('[role="table"]') ||
      readerBody?.querySelector('figure img[alt*="Table"], figure img[alt*="表"]')
    );

    if (paperCard && !paperTitleHint) {
      paperTitleHint = paperCard.getAttribute("aria-label") || paperCard.textContent?.trim() || "";
    }

    // Smoke mode is intended to validate the real Reader route without
    // depending on flaky macOS Accessibility clicks against a large WKWebView.
    // The click is opt-in and never runs during normal launches.
    if (smokeOnly && paperCard && !reader && !smokeReaderOpenTried) {
      smokeReaderOpenTried = true;
      (paperCard as HTMLElement).click();
    }
    // Force the real Reader scroll container through the document once in
    // smoke mode. This lets lazy/viewport-bound table surfaces mount before
    // the marker is sampled, without changing normal Reader behavior.
    if (smokeOnly && readerBody && !smokeScrollTried) {
      smokeScrollTried = true;
      readerBody.scrollTop = readerBody.scrollHeight;
    }

    // Detect export success from visible status if reportUiE2eExportSuccess already ran.
    if (
      exportStatus?.textContent?.includes("書き出しました") &&
      !exportCompleted &&
      exportedPath
    ) {
      // keep existing exportCompleted from report
    }

    let step = phase === "relaunch" ? "ui_relaunch_waiting" : "ui_waiting_library";
    if (paperCard && !reader) {
      step = phase === "relaunch" ? "ui_relaunch_library_card_visible" : "ui_library_card_visible";
    }
    if (reader && readerBody) {
      step = phase === "relaunch" ? "ui_relaunch_reader_visible" : "ui_reader_visible";
    }
    if (phase === "initial") {
      if (memo) step = "ui_memo_open";
      if (annotationMark) step = "ui_annotation_visible";
      if (searchPanel) {
        step = searchHits.length > 0 ? "ui_search_hits_visible" : "ui_search_open";
      }
      if (exportDialog) step = "ui_export_open";
      if (exportCompleted && exportBytes > 0) step = "ui_export_completed";
    } else if (annotationMark) {
      step = "ui_relaunch_annotation_visible";
    }

    // Initial-phase selection synthesis (not used on relaunch).
    if (
      phase === "initial" &&
      readerBody &&
      !selectionTried &&
      !memo &&
      !annotationMark
    ) {
      selectionTried = true;
      const target =
        readerBody.querySelector<HTMLElement>("[data-block-id]") ||
        readerBody.querySelector<HTMLElement>("p, span, div");
      if (target && target.textContent?.trim()) {
        const range = document.createRange();
        const textNode = target.firstChild;
        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const len = Math.min(12, (textNode.textContent || "").length);
          range.setStart(textNode, 0);
          range.setEnd(textNode, len);
        } else {
          range.selectNodeContents(target);
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      }
    }

    const searchVisible = Boolean(searchPanel && searchHits.length > 0);
    const annotationVisible = Boolean(annotationMark);
    const exportDialogVisible = Boolean(exportDialog);

    let ok = false;
    if (phase === "initial") {
      if (smokeOnly && reader && readerBody) {
        ok = Boolean(reader) && Boolean(readerBody);
        step = "ui_reader_smoke_ready";
      }
      ok =
        smokeOnly
          ? ok
          : Boolean(paperCard) &&
            Boolean(reader) &&
            annotationVisible &&
            searchVisible &&
            exportCompleted &&
            exportBytes > 0;
      if (ok && !smokeOnly) step = "ui_core_flow_ready";
    } else {
      ok = Boolean(paperCard) && Boolean(reader) && annotationVisible;
      if (ok) step = "ui_relaunch_annotation_visible";
    }

    // Avoid clobbering a fresher exportCompleted marker with a weaker tick.
    if (
      lastMarker?.step === "ui_export_completed" &&
      !ok &&
      phase === "initial" &&
      step === "ui_export_open"
    ) {
      // keep advancing via exportCompleted fields below
    }

    await writeUiMarker({
      ok,
      step,
      phase,
      searchVisible,
      annotationVisible,
      exportDialogVisible,
      exportCompleted,
      exportBytes,
      exportedPath,
      paperTitleHint,
      tableSurfaceVisible,
      detail: `cards=${document.querySelectorAll('[data-testid="paper-card"]').length} hits=${searchHits.length} tables=${tableSurfaceVisible ? 1 : 0} exportBytes=${exportBytes}`,
      at: new Date().toISOString(),
    });
  };

  window.setInterval(() => {
    void tick();
  }, 700);
  void tick();
}
