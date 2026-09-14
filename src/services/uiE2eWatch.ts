import { invoke } from "@tauri-apps/api/core";
import { isTauriApp } from "../utils/serverReady";
import { getStorage } from "../data/runtime";

type UiE2eMarker = {
  ok: boolean;
  step: string;
  detail?: string;
  searchVisible?: boolean;
  annotationVisible?: boolean;
  at: string;
};

let started = false;
let selectionTried = false;

async function writeUiMarker(marker: UiE2eMarker): Promise<void> {
  const { fs } = await getStorage();
  await fs.writeText("_acceptance/ui-result.json", JSON.stringify(marker, null, 2));
}

/**
 * Packaged UI E2E only (PAPER_READER_UI_E2E=1).
 * Observes real DOM for Library → Reader → memo → search → export and
 * records markers. Does not drive imports via service APIs.
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
  started = true;

  await writeUiMarker({
    ok: false,
    step: "ui_watch_started",
    at: new Date().toISOString(),
  });

  const tick = async () => {
    const paperCard = document.querySelector('[data-testid="paper-card"]');
    const reader = document.querySelector('[data-testid="reader-screen"]');
    const readerBody = document.querySelector('[data-testid="reader-body"]');
    const memo = document.querySelector('[data-testid="memo-popover"]');
    const searchPanel = document.querySelector('[data-testid="reader-search-panel"]');
    const searchHits = document.querySelectorAll('[data-testid="search-hit"]');
    const exportDialog = document.querySelector('[data-testid="export-dialog"]');
    const annotationMark = document.querySelector('[data-testid="annotation-mark"]');

    let step = "ui_waiting_library";
    if (paperCard && !reader) step = "ui_library_card_visible";
    if (reader && readerBody) step = "ui_reader_visible";
    if (memo) step = "ui_memo_open";
    if (annotationMark) step = "ui_annotation_visible";
    if (searchPanel) {
      step = searchHits.length > 0 ? "ui_search_hits_visible" : "ui_search_open";
    }
    if (exportDialog) step = "ui_export_open";

    // Once Reader body exists, synthesize a real DOM selection once so MemoPopover
    // opens through the production selection path (AX text selection in WKWebView
    // is unreliable). External automation still types the note and clicks Save.
    if (readerBody && !selectionTried && !memo && !annotationMark) {
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

    const ready =
      Boolean(paperCard) &&
      Boolean(reader) &&
      Boolean(annotationMark || memo) &&
      Boolean(searchPanel && searchHits.length > 0);

    await writeUiMarker({
      ok: ready,
      step: ready ? "ui_core_flow_ready" : step,
      searchVisible: Boolean(searchPanel && searchHits.length > 0),
      annotationVisible: Boolean(annotationMark || memo),
      detail: `cards=${document.querySelectorAll('[data-testid="paper-card"]').length} hits=${searchHits.length}`,
      at: new Date().toISOString(),
    });
  };

  window.setInterval(() => {
    void tick();
  }, 700);
  void tick();
}
