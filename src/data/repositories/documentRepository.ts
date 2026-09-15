import type { Paper, PaperBlock, ProcessingStatus, Section } from "../../types/paper";
import type { FileSystem } from "../fs/types";
import { paperToPaperJson, projectionToPackage } from "../package/fromProjection";
import {
  loadPaperPackage,
  paperPackageExists,
  persistMutablePaperFiles,
  persistPaperPackage,
  resetPackageLoadMetrics,
  type LoadPaperPackageOptions,
} from "../package/persist";
import { packageToProjection } from "../package/toProjection";
import { indexPaperText, upsertPaperIndex } from "./paperRepository";
import type { SqliteClient } from "../sqlite/client";

const MUTABLE_FLUSH_MS = 1500;

export type CachedDocument = {
  paper: Paper;
  sections: Section[];
  blocks: PaperBlock[];
  sourcePdf?: Uint8Array;
  /** True when in-memory state has mutations that must be written back. */
  dirty: boolean;
};

type PendingFlush = {
  fs: FileSystem;
  db: SqliteClient;
  timer: ReturnType<typeof setTimeout>;
};

const cache = new Map<string, CachedDocument>();
const pendingFlushes = new Map<string, PendingFlush>();

export const documentPersistMetrics = {
  fullPackageWrites: 0,
  mutableWrites: 0,
  skippedCleanFlushes: 0,
};

export function resetDocumentPersistMetrics(): void {
  documentPersistMetrics.fullPackageWrites = 0;
  documentPersistMetrics.mutableWrites = 0;
  documentPersistMetrics.skippedCleanFlushes = 0;
}

function markDirty(paperId: string): void {
  const current = cache.get(paperId);
  if (current) current.dirty = true;
}

export function rememberDocument(paper: Paper, sections?: Section[], blocks?: PaperBlock[]): void {
  const current = cache.get(paper.id);
  cache.set(paper.id, {
    paper,
    sections: sections ?? current?.sections ?? [],
    blocks: blocks ?? current?.blocks ?? [],
    sourcePdf: current?.sourcePdf,
    dirty: current?.dirty ?? false,
  });
}

export function rememberSourcePdf(paperId: string, sourcePdf: Uint8Array): void {
  const current = cache.get(paperId);
  if (current) {
    current.sourcePdf = sourcePdf;
    current.dirty = true;
    return;
  }
  cache.set(paperId, {
    paper: placeholderPaper(paperId),
    sections: [],
    blocks: [],
    sourcePdf,
    dirty: true,
  });
}

export function forgetDocument(paperId: string): void {
  cancelMutableFlush(paperId);
  cache.delete(paperId);
}

export function peekDocument(paperId: string): CachedDocument | undefined {
  return cache.get(paperId);
}

export function resetDocumentCache(): void {
  for (const paperId of [...pendingFlushes.keys()]) {
    cancelMutableFlush(paperId);
  }
  cache.clear();
}

function isHotPersistStatus(status: ProcessingStatus): boolean {
  return status === "translating" || status === "glossary";
}

function cancelMutableFlush(paperId: string): void {
  const pending = pendingFlushes.get(paperId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingFlushes.delete(paperId);
}

async function persistCached(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string
): Promise<void> {
  cancelMutableFlush(paperId);
  const cached = cache.get(paperId);
  if (!cached || cached.blocks.length === 0) return;
  if (!cached.dirty) {
    documentPersistMetrics.skippedCleanFlushes += 1;
    return;
  }
  const existing = (await paperPackageExists(fs, paperId))
    ? await loadPaperPackage(fs, paperId, {
        includeSourcePdf: true,
        includeAssets: true,
        includeLayout: true,
      }).catch(() => null)
    : null;
  const pkg = projectionToPackage({
    paper: cached.paper,
    sections: cached.sections,
    blocks: cached.blocks,
    revision: existing?.paper.revision ?? 0,
    layout: existing?.layout,
    sourcePdf: existing?.sourcePdf ?? cached.sourcePdf,
  });
  if (existing?.assets.length && pkg.assets.length === 0) {
    pkg.assets = existing.assets;
  }
  try {
    const persisted = await persistPaperPackage(fs, pkg);
    documentPersistMetrics.fullPackageWrites += 1;
    cached.sourcePdf = undefined;
    cached.paper.packageRevision = persisted.revision;
    cached.dirty = false;
    upsertPaperIndex(db, cached.paper);
    indexPaperText(db, cached.paper, pkg.originalMarkdown, pkg.translatedMarkdown);
  } catch (error) {
    console.warn("Paper Package persist failed:", error);
  }
}

async function persistMutableFromCache(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string
): Promise<void> {
  const cached = cache.get(paperId);
  if (!cached || cached.blocks.length === 0) return;
  if (!cached.dirty) {
    documentPersistMetrics.skippedCleanFlushes += 1;
    return;
  }
  if (!(await paperPackageExists(fs, paperId))) {
    await persistCached(fs, db, paperId);
    return;
  }
  const paperJsonText = await fs.readText(`papers/${paperId}/paper.json`);
  const currentRevision = paperJsonText
    ? (JSON.parse(paperJsonText) as { revision?: number }).revision ?? 1
    : 1;
  const pkg = projectionToPackage({
    paper: cached.paper,
    sections: cached.sections,
    blocks: cached.blocks,
    revision: currentRevision,
  });
  try {
    await persistMutablePaperFiles(fs, paperId, {
      jaMarkdown: pkg.translatedMarkdown,
      paperJson: paperToPaperJson(cached.paper, currentRevision),
      structure: pkg.structure,
      translation: pkg.translation,
    });
    documentPersistMetrics.mutableWrites += 1;
    cached.dirty = false;
    upsertPaperIndex(db, cached.paper);
    indexPaperText(db, cached.paper, pkg.originalMarkdown, pkg.translatedMarkdown);
  } catch (error) {
    console.warn("Translation checkpoint persist failed:", error);
  }
}

function scheduleMutablePersist(fs: FileSystem, db: SqliteClient, paperId: string): void {
  if (pendingFlushes.has(paperId)) return;
  const timer = setTimeout(() => {
    pendingFlushes.delete(paperId);
    void persistMutableFromCache(fs, db, paperId);
  }, MUTABLE_FLUSH_MS);
  pendingFlushes.set(paperId, { fs, db, timer });
}

export async function persistAfterMutation(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string
): Promise<void> {
  const cached = cache.get(paperId);
  if (!cached || cached.blocks.length === 0) return;
  markDirty(paperId);
  if (isHotPersistStatus(cached.paper.processingStatus) && (await paperPackageExists(fs, paperId))) {
    scheduleMutablePersist(fs, db, paperId);
    return;
  }
  await persistCached(fs, db, paperId);
}

export async function flushDocumentPersist(
  fs: FileSystem,
  db: SqliteClient,
  paperId?: string
): Promise<void> {
  const ids = paperId ? [paperId] : [...pendingFlushes.keys(), ...cache.keys()];
  const unique = [...new Set(ids)];
  for (const id of unique) {
    cancelMutableFlush(id);
    const cached = cache.get(id);
    if (!cached?.dirty) {
      if (cached) documentPersistMetrics.skippedCleanFlushes += 1;
      continue;
    }
    await persistMutableFromCache(fs, db, id);
  }
}

export async function saveDocumentSections(
  fs: FileSystem,
  db: SqliteClient,
  sections: Section[]
): Promise<void> {
  if (sections.length === 0) return;
  const paperId = sections[0].paperId;
  const current = cache.get(paperId);
  if (current) current.sections = sections;
  else cache.set(paperId, { paper: placeholderPaper(paperId), sections, blocks: [], dirty: true });
  await persistAfterMutation(fs, db, paperId);
}

export async function saveDocumentBlocks(
  fs: FileSystem,
  db: SqliteClient,
  blocks: PaperBlock[]
): Promise<void> {
  if (blocks.length === 0) return;
  const paperId = blocks[0].paperId;
  const current = cache.get(paperId);
  if (current) current.blocks = blocks;
  else cache.set(paperId, { paper: placeholderPaper(paperId), sections: [], blocks, dirty: true });
  await persistAfterMutation(fs, db, paperId);
}

export async function updateDocumentBlock(
  fs: FileSystem,
  db: SqliteClient,
  block: PaperBlock
): Promise<void> {
  const current = cache.get(block.paperId);
  const blocks = current?.blocks ?? [];
  const next = blocks.some((item) => item.id === block.id)
    ? blocks.map((item) => (item.id === block.id ? block : item))
    : [...blocks, block];
  if (current) current.blocks = next;
  else
    cache.set(block.paperId, {
      paper: placeholderPaper(block.paperId),
      sections: [],
      blocks: next,
      dirty: true,
    });
  await persistAfterMutation(fs, db, block.paperId);
}

export async function updateBlockTranslationText(
  fs: FileSystem,
  db: SqliteClient,
  paperId: string,
  blockId: string,
  translated: string
): Promise<void> {
  const docs = cache.get(paperId) ? [[paperId, cache.get(paperId)!] as const] : [...cache];
  for (const [id, doc] of docs) {
    if (id !== paperId) continue;
    const block = doc.blocks.find((item) => item.id === blockId);
    if (!block) continue;
    block.translated = translated;
    block.translationStatus = "completed";
    if (block.type === "figure" || block.type === "table") {
      block.metadata = { ...block.metadata, captionTranslated: translated };
    }
    if (doc.paper.titleOriginal === block.original) {
      doc.paper.titleTranslated = translated;
    }
    await persistAfterMutation(fs, db, paperId);
    return;
  }
}

const DEFAULT_READER_LOAD: LoadPaperPackageOptions = {
  includeSourcePdf: false,
  includeAssets: false,
  includeLayout: false,
};

export async function loadDocument(
  fs: FileSystem,
  paper: Paper,
  options: LoadPaperPackageOptions = DEFAULT_READER_LOAD
): Promise<CachedDocument> {
  const cached = cache.get(paper.id);
  if (cached && cached.blocks.length > 0) return cached;
  if (await paperPackageExists(fs, paper.id)) {
    try {
      const pkg = await loadPaperPackage(fs, paper.id, options);
      const projected = packageToProjection(pkg, paper);
      const entry: CachedDocument = {
        ...projected,
        dirty: false,
      };
      cache.set(paper.id, entry);
      return entry;
    } catch (error) {
      console.warn("Failed to load paper package:", paper.id, error);
      return cached ?? { paper, sections: [], blocks: [], dirty: false };
    }
  }
  return cached ?? { paper, sections: [], blocks: [], dirty: false };
}

export async function getDocumentSections(
  fs: FileSystem,
  paper: Paper
): Promise<Section[]> {
  return (await loadDocument(fs, paper)).sections;
}

export async function getDocumentBlocks(
  fs: FileSystem,
  paper: Paper
): Promise<PaperBlock[]> {
  return (await loadDocument(fs, paper)).blocks;
}

/** Test helper: reopen many papers read-only and flush without writing. */
export async function openDocumentsReadOnly(
  fs: FileSystem,
  papers: Paper[]
): Promise<void> {
  resetPackageLoadMetrics();
  resetDocumentPersistMetrics();
  for (const paper of papers) {
    await loadDocument(fs, paper);
  }
}

function placeholderPaper(id: string): Paper {
  const now = new Date().toISOString();
  return {
    id,
    sourceFilePath: "",
    sourceFileHash: "",
    titleOriginal: null,
    titleTranslated: null,
    authors: [],
    publication: null,
    year: null,
    pageCount: 0,
    processingStatus: "structuring",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
}

export { persistCached as persistDocumentPackage };
