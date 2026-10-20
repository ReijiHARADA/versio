import type { EvaluationBundle } from "./schema";

const PREFIX = "paper-reader/extraction-evaluation/";
export function storageKey(fileHash: string) { return `${PREFIX}${fileHash}`; }
export function saveBundle(bundle: EvaluationBundle) {
  localStorage.setItem(storageKey(bundle.snapshot.source.fileHash), JSON.stringify(bundle));
}
export function loadBundle(fileHash: string): EvaluationBundle | null {
  const raw = localStorage.getItem(storageKey(fileHash));
  if (!raw) return null;
  try { return JSON.parse(raw) as EvaluationBundle; } catch { return null; }
}
export function downloadJson(filename: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
