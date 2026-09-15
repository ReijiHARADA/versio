import type { FileSystem } from "../fs/types";
import type { LayoutFile } from "../types/layout";
import type { PaperJson, PaperPackage } from "../types/package";
import type { StructureFile } from "../types/structure";
import type { TranslationFile } from "../types/translation";
import { gunzipJson, gzipJson } from "./gzip";
import { validatePaperPackage } from "./validate";

export const persistMetrics = {
  fullPackageWrites: 0,
  mutableFileWrites: 0,
  sourcePdfWrites: 0,
  assetWrites: 0,
  layoutWrites: 0,
  sqliteExports: 0,
};

export const packageLoadMetrics = {
  documentReads: 0,
  sourcePdfReads: 0,
  assetReads: 0,
  layoutReads: 0,
};

export function resetPersistMetrics(): void {
  persistMetrics.fullPackageWrites = 0;
  persistMetrics.mutableFileWrites = 0;
  persistMetrics.sourcePdfWrites = 0;
  persistMetrics.assetWrites = 0;
  persistMetrics.layoutWrites = 0;
  persistMetrics.sqliteExports = 0;
}

export function resetPackageLoadMetrics(): void {
  packageLoadMetrics.documentReads = 0;
  packageLoadMetrics.sourcePdfReads = 0;
  packageLoadMetrics.assetReads = 0;
  packageLoadMetrics.layoutReads = 0;
}

export type LoadPaperPackageOptions = {
  /** Default false for Reader opens — avoid pulling multi‑MB PDFs into the renderer. */
  includeSourcePdf?: boolean;
  /** Default false — figures/tables load per-asset on demand. */
  includeAssets?: boolean;
  /** Default false — layout is not needed for Reader body projection. */
  includeLayout?: boolean;
};

export function paperDir(paperId: string): string {
  return `papers/${paperId}`;
}

export function paperBackupDir(paperId: string): string {
  return `papers/${paperId}.bak`;
}

export function paperTmpDir(paperId: string): string {
  return `papers/${paperId}.tmp`;
}

function normalizeFsPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

async function copyPackageTree(fs: FileSystem, from: string, to: string): Promise<void> {
  const fromRoot = normalizeFsPath(from);
  const toRoot = normalizeFsPath(to);
  await fs.remove(toRoot);
  const files = await fs.list(fromRoot);
  for (const file of files) {
    const rel =
      file === fromRoot
        ? ""
        : file.startsWith(fromRoot + "/")
          ? file.slice(fromRoot.length + 1)
          : "";
    if (!rel) continue;
    const bytes = await fs.readBytes(file);
    if (!bytes) continue;
    await fs.writeBytes(`${toRoot}/${rel}`, bytes);
  }
}

async function packageCoreComplete(fs: FileSystem, root: string): Promise<boolean> {
  const base = normalizeFsPath(root);
  const paperText = await fs.readText(`${base}/paper.json`);
  const originalMarkdown = await fs.readText(`${base}/original.md`);
  const translatedMarkdown = await fs.readText(`${base}/ja.md`);
  const structureText = await fs.readText(`${base}/structure.json`);
  return Boolean(paperText && originalMarkdown && translatedMarkdown && structureText);
}

/**
 * If the live package dir is incomplete after a crashed atomic write, restore
 * from `.bak` / `.tmp` leftovers when those are complete.
 */
export async function recoverPaperPackageIfNeeded(
  fs: FileSystem,
  paperId: string
): Promise<"primary" | "bak" | "tmp" | null> {
  const primary = paperDir(paperId);
  if (await packageCoreComplete(fs, primary)) return "primary";

  const bak = paperBackupDir(paperId);
  if (await packageCoreComplete(fs, bak)) {
    await copyPackageTree(fs, bak, primary);
    await fs.remove(bak);
    await fs.remove(paperTmpDir(paperId));
    return "bak";
  }

  const tmp = paperTmpDir(paperId);
  if (await packageCoreComplete(fs, tmp)) {
    await copyPackageTree(fs, tmp, primary);
    await fs.remove(tmp);
    await fs.remove(bak);
    return "tmp";
  }

  return null;
}

async function writeTextAtomic(fs: FileSystem, path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await fs.writeText(tmp, text);
  await fs.rename(tmp, path);
}

async function writeTree(fs: FileSystem, root: string, pkg: PaperPackage): Promise<void> {
  await fs.writeText(`${root}/paper.json`, JSON.stringify(pkg.paper, null, 2));
  await fs.writeText(`${root}/original.md`, pkg.originalMarkdown);
  await fs.writeText(`${root}/ja.md`, pkg.translatedMarkdown);
  await fs.writeText(`${root}/structure.json`, JSON.stringify(pkg.structure, null, 2));
  if (pkg.translation) {
    await fs.writeText(`${root}/translation.json`, JSON.stringify(pkg.translation, null, 2));
  }
  if (pkg.layout) {
    persistMetrics.layoutWrites += 1;
    await fs.writeBytes(`${root}/layout.json.gz`, gzipJson(pkg.layout));
  }
  for (const asset of pkg.assets) {
    persistMetrics.assetWrites += 1;
    const path = asset.path.startsWith("assets/")
      ? `${root}/${asset.path}`
      : `${root}/assets/${asset.path}`;
    await fs.writeBytes(path, asset.bytes);
  }
  if (pkg.sourcePdf) {
    persistMetrics.sourcePdfWrites += 1;
    await fs.writeBytes(`${root}/source.pdf`, pkg.sourcePdf);
  }
}

export async function persistMutablePaperFiles(
  fs: FileSystem,
  paperId: string,
  files: {
    jaMarkdown?: string;
    paperJson?: PaperJson;
    structure?: StructureFile;
    translation?: TranslationFile;
  }
): Promise<void> {
  const root = paperDir(paperId);
  persistMetrics.mutableFileWrites += 1;
  if (files.jaMarkdown != null) {
    await writeTextAtomic(fs, `${root}/ja.md`, files.jaMarkdown);
  }
  if (files.paperJson) {
    await writeTextAtomic(fs, `${root}/paper.json`, JSON.stringify(files.paperJson, null, 2));
  }
  if (files.structure) {
    await writeTextAtomic(fs, `${root}/structure.json`, JSON.stringify(files.structure, null, 2));
  }
  if (files.translation) {
    await writeTextAtomic(fs, `${root}/translation.json`, JSON.stringify(files.translation, null, 2));
  }
}

export async function persistPaperPackage(
  fs: FileSystem,
  pkg: PaperPackage
): Promise<{ revision: number; diagnostics: ReturnType<typeof validatePaperPackage> }> {
  const validation = validatePaperPackage(pkg);
  if (!validation.ok) {
    throw new Error(
      `Paper Package validation failed: ${validation.diagnostics
        .filter((item) => item.level === "error")
        .map((item) => item.message)
        .join("; ")}`
    );
  }

  const paperId = pkg.paper.paperId;
  const dest = paperDir(paperId);
  const tmp = `papers/${paperId}.tmp`;
  const bak = `papers/${paperId}.bak`;
  const next: PaperPackage = {
    ...pkg,
    paper: { ...pkg.paper, revision: (pkg.paper.revision ?? 0) + 1 },
  };

  persistMetrics.fullPackageWrites += 1;
  await fs.remove(tmp);
  await writeTree(fs, tmp, next);

  const loaded = await loadPaperPackage(fs, paperId, {
    root: tmp,
    includeSourcePdf: true,
    includeAssets: true,
    includeLayout: true,
  });
  const recheck = validatePaperPackage(loaded);
  if (!recheck.ok) {
    await fs.remove(tmp);
    throw new Error("Paper Package tmp validation failed");
  }

  if (await fs.exists(dest)) {
    await fs.remove(bak);
    await fs.rename(dest, bak);
  }
  await fs.rename(tmp, dest);
  await fs.remove(bak);
  return { revision: next.paper.revision, diagnostics: recheck };
}

export async function loadPaperPackage(
  fs: FileSystem,
  paperId: string,
  options: LoadPaperPackageOptions & { root?: string } = {}
): Promise<PaperPackage> {
  const explicitRoot = options.root;
  if (!explicitRoot) {
    await recoverPaperPackageIfNeeded(fs, paperId);
  }

  const root = explicitRoot ?? paperDir(paperId);
  const includeSourcePdf = options.includeSourcePdf === true;
  const includeAssets = options.includeAssets === true;
  const includeLayout = options.includeLayout === true;

  packageLoadMetrics.documentReads += 1;
  const paperText = await fs.readText(`${root}/paper.json`);
  const originalMarkdown = await fs.readText(`${root}/original.md`);
  const translatedMarkdown = await fs.readText(`${root}/ja.md`);
  const structureText = await fs.readText(`${root}/structure.json`);
  if (!paperText || !originalMarkdown || !translatedMarkdown || !structureText) {
    throw new Error(`Paper Package が不完全です: ${paperId}`);
  }
  const paper = JSON.parse(paperText) as PaperJson;
  const structure = JSON.parse(structureText) as StructureFile;
  const translationText = await fs.readText(`${root}/translation.json`);
  const translation = translationText ? (JSON.parse(translationText) as TranslationFile) : undefined;

  let layout: LayoutFile | undefined;
  if (includeLayout) {
    const layoutBytes = await fs.readBytes(`${root}/layout.json.gz`);
    if (layoutBytes) {
      packageLoadMetrics.layoutReads += 1;
      layout = gunzipJson<LayoutFile>(layoutBytes);
    }
  }

  let sourcePdf: Uint8Array | undefined;
  if (includeSourcePdf) {
    const bytes = await fs.readBytes(`${root}/source.pdf`);
    if (bytes) {
      packageLoadMetrics.sourcePdfReads += 1;
      sourcePdf = bytes;
    }
  }

  const assets: Array<{ path: string; bytes: Uint8Array }> = [];
  if (includeAssets) {
    const files = await fs.list(`${root}/assets`);
    for (const path of files) {
      const bytes = await fs.readBytes(path);
      if (!bytes) continue;
      packageLoadMetrics.assetReads += 1;
      assets.push({
        path: path.replace(`${root}/`, ""),
        bytes,
      });
    }
  }

  return {
    paper,
    originalMarkdown,
    translatedMarkdown,
    structure,
    translation,
    layout,
    assets,
    sourcePdf,
  };
}

export async function loadPaperAssetBytes(
  fs: FileSystem,
  paperId: string,
  relativePath: string
): Promise<Uint8Array | null> {
  const normalized = relativePath.replace(/^\.\//, "").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return null;
  const root = paperDir(paperId);
  const path = normalized.startsWith("assets/")
    ? `${root}/${normalized}`
    : `${root}/assets/${normalized}`;
  const bytes = await fs.readBytes(path);
  if (bytes) packageLoadMetrics.assetReads += 1;
  return bytes;
}

export async function loadSourcePdfBytes(
  fs: FileSystem,
  paperId: string
): Promise<Uint8Array | null> {
  const bytes = await fs.readBytes(`${paperDir(paperId)}/source.pdf`);
  if (bytes) packageLoadMetrics.sourcePdfReads += 1;
  return bytes;
}

export async function paperPackageExists(fs: FileSystem, paperId: string): Promise<boolean> {
  if (await fs.exists(`${paperDir(paperId)}/paper.json`)) return true;
  if (await fs.exists(`${paperBackupDir(paperId)}/paper.json`)) return true;
  if (await fs.exists(`${paperTmpDir(paperId)}/paper.json`)) return true;
  return false;
}

export async function updateTranslatedMarkdown(
  fs: FileSystem,
  paperId: string,
  translatedMarkdown: string
): Promise<void> {
  await persistMutablePaperFiles(fs, paperId, { jaMarkdown: translatedMarkdown });
}
