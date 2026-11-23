import type { Paper } from "../../types/paper";
import { showToast } from "../../stores/toastStore";

export async function copyBibTeX(paper: Paper): Promise<void> {
  try {
    const text = import("./exportCitations").then(({ formatCitations }) => formatCitations([paper], "bibtex"));
    // WebKit drops clipboard writes made after an await; a promised ClipboardItem keeps the gesture.
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": text.then((t) => new Blob([t], { type: "text/plain" })) }),
      ]);
    } else {
      await navigator.clipboard.writeText(await text);
    }
    showToast({ kind: "success", message: "BibTeX をコピーしました" });
  } catch {
    showToast({ kind: "error", message: "BibTeX をコピーできませんでした" });
  }
}
