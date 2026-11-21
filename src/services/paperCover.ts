import { getStorage } from "../data/runtime";
import { openPdfDocument } from "./pdfjsRuntime";

const COVER_WIDTH = 360;
const cache = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: Array<() => void> = [];

// Rendering opens the whole PDF, so only two covers are made at a time.
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

async function renderFirstPage(pdf: Uint8Array): Promise<Blob | null> {
  const doc = await openPdfDocument(pdf).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } finally {
    void doc.destroy();
  }
}

async function loadCover(paperId: string): Promise<string | null> {
  const { fs } = await getStorage();
  // shortcut: covers/ is a rebuildable cache and is not removed when a paper is deleted; prune it if it grows.
  const coverPath = `covers/${paperId}.jpg`;
  const cached = await fs.readBytes(coverPath).catch(() => null);
  if (cached) return URL.createObjectURL(new Blob([cached.slice()], { type: "image/jpeg" }));
  const pdf = await fs.readBytes(`papers/${paperId}/source.pdf`);
  if (!pdf) return null;
  const blob = await withSlot(() => renderFirstPage(pdf));
  if (!blob) return null;
  void fs.writeBytes(coverPath, new Uint8Array(await blob.arrayBuffer())).catch(() => {});
  return URL.createObjectURL(blob);
}

/** Object URL of the paper's first PDF page, or null when there is no source PDF. */
export function getPaperCover(paperId: string): Promise<string | null> {
  let entry = cache.get(paperId);
  if (!entry) {
    entry = loadCover(paperId).catch(() => null);
    cache.set(paperId, entry);
  }
  return entry;
}
