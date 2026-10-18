import { strToU8, unzipSync, zipSync } from "fflate";
import type { FileSystem } from "../fs/types";
import type { WorkspaceNode, WorkspacePaper } from "../../types/project";
import { collectDescendantIds } from "../workspace/tree";
import { exportPaperEpub } from "./epubExport";
import {
  exportPaperMarkdown,
  exportVerificationBundle,
  type MarkdownExportVariant,
} from "./markdownExport";
import { createNotionImportZip } from "./saveExport";

export type FolderExportMode = "markdown" | "notion" | "verification" | "epub";

export type FolderExportOptions = {
  mode: FolderExportMode;
  variant?: MarkdownExportVariant;
  includeFailedTranslations?: boolean;
  onProgress?: (current: number, total: number, label: string) => void;
};

export type FolderExportFailure = {
  paperId: string;
  relativeDir: string;
  error: string;
};

export type FolderExportResult = {
  /** ZIP のベース名（拡張子なし） */
  fileName: string;
  zip: Uint8Array;
  exportedCount: number;
  failed: FolderExportFailure[];
  totalPlanned: number;
};

export type FolderExportEntry = {
  paperId: string;
  /** ルートフォルダ直下からの相対ディレクトリ（空文字＝ルート） */
  relativeDir: string;
};

function slugSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "item"
  );
}

function joinZipPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, "").replace(/\\/g, "/"))
    .filter(Boolean)
    .join("/");
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function nodePathSlugs(
  nodes: WorkspaceNode[],
  rootId: string,
  nodeId: string
): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: WorkspaceNode[] = [];
  let current = byId.get(nodeId);
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    chain.push(current);
    if (current.id === rootId) break;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  if (!chain.length || chain[chain.length - 1]?.id !== rootId) return [];
  // root → … → node, drop root name (bundle root already uses it)
  return chain
    .slice(0, -1)
    .reverse()
    .map((node) => slugSegment(node.name));
}

/**
 * 選択フォルダとその子孫に属する論文を、ワークスペース階層どおりの相対パスで列挙する。
 * 同一論文が複数ノードに属していれば、各所属先に 1 エントリずつ出す。
 */
export function planFolderExportEntries(
  rootNodeId: string,
  nodes: WorkspaceNode[],
  memberships: WorkspacePaper[]
): FolderExportEntry[] {
  const subtree = new Set([rootNodeId, ...collectDescendantIds(nodes, rootNodeId)]);
  const entries: FolderExportEntry[] = [];
  for (const link of memberships) {
    if (!subtree.has(link.nodeId)) continue;
    const segments = nodePathSlugs(nodes, rootNodeId, link.nodeId);
    entries.push({
      paperId: link.paperId,
      relativeDir: segments.join("/"),
    });
  }
  entries.sort((a, b) => {
    const dir = a.relativeDir.localeCompare(b.relativeDir);
    if (dir !== 0) return dir;
    return a.paperId.localeCompare(b.paperId);
  });
  return entries;
}

function assetDestPath(assetPath: string): string {
  return assetPath.startsWith("assets/") ? assetPath : `assets/${assetPath}`;
}

function addMarkdownFiles(
  files: Record<string, Uint8Array>,
  baseDir: string,
  result: Awaited<ReturnType<typeof exportPaperMarkdown>>
): void {
  files[joinZipPath(baseDir, `${result.fileName}.md`)] = strToU8(result.markdown);
  for (const asset of result.assets) {
    files[joinZipPath(baseDir, assetDestPath(asset.path))] = asset.bytes.slice();
  }
}

function addVerificationFiles(
  files: Record<string, Uint8Array>,
  baseDir: string,
  result: Awaited<ReturnType<typeof exportVerificationBundle>>
): void {
  files[joinZipPath(baseDir, "translated.md")] = strToU8(result.markdown);
  if (result.sourcePdf) {
    files[joinZipPath(baseDir, "source.pdf")] = result.sourcePdf.slice();
  }
  for (const asset of result.assets) {
    files[joinZipPath(baseDir, assetDestPath(asset.path))] = asset.bytes.slice();
  }
}

function addNotionFiles(
  files: Record<string, Uint8Array>,
  baseDir: string,
  result: Awaited<ReturnType<typeof exportPaperMarkdown>>
): void {
  const archive = createNotionImportZip(result);
  // Re-expand so the folder ZIP keeps a navigable tree (not nested zips).
  const nested = unzipSync(archive);
  for (const [name, bytes] of Object.entries(nested)) {
    files[joinZipPath(baseDir, name)] = bytes;
  }
}

/**
 * ワークスペースフォルダ配下の論文を 1 つの ZIP にまとめる。
 * 失敗した論文はスキップし、`export-report.txt` に残す。
 */
export async function exportWorkspaceFolder(
  fs: FileSystem,
  rootNode: WorkspaceNode,
  nodes: WorkspaceNode[],
  memberships: WorkspacePaper[],
  options: FolderExportOptions
): Promise<FolderExportResult> {
  const planned = planFolderExportEntries(rootNode.id, nodes, memberships);
  const rootSlug = slugSegment(rootNode.name);
  const files: Record<string, Uint8Array> = {};
  const failed: FolderExportFailure[] = [];
  let exportedCount = 0;
  const usedNamesByDir = new Map<string, Set<string>>();

  const total = planned.length;
  let index = 0;
  for (const entry of planned) {
    index += 1;
    options.onProgress?.(index, total, entry.paperId);
    const dirKey = entry.relativeDir;
    const used = usedNamesByDir.get(dirKey) ?? new Set<string>();
    usedNamesByDir.set(dirKey, used);

    try {
      if (options.mode === "epub") {
        const result = await exportPaperEpub(fs, entry.paperId, {
          includeFailedTranslations: options.includeFailedTranslations === true,
        });
        const name = uniqueName(result.fileName, used);
        const path = joinZipPath(rootSlug, entry.relativeDir, `${name}.epub`);
        files[path] = result.epub.slice();
        exportedCount += 1;
        continue;
      }

      if (options.mode === "verification") {
        const result = await exportVerificationBundle(fs, entry.paperId, {
          includeFailedTranslations: options.includeFailedTranslations === true,
        });
        const name = uniqueName(result.folderName || result.fileName, used);
        const baseDir = joinZipPath(rootSlug, entry.relativeDir, name);
        addVerificationFiles(files, baseDir, result);
        exportedCount += 1;
        continue;
      }

      const result = await exportPaperMarkdown(fs, entry.paperId, {
        language: "ja",
        variant:
          options.mode === "notion"
            ? "clean"
            : options.variant === "verification"
              ? "verification"
              : "clean",
        stripBlockIds: options.mode === "notion" || options.variant !== "verification",
        includeFailedTranslations: options.includeFailedTranslations === true,
      });
      const name = uniqueName(result.fileName, used);
      const baseDir = joinZipPath(rootSlug, entry.relativeDir, name);
      if (options.mode === "notion") {
        addNotionFiles(files, baseDir, { ...result, fileName: name });
      } else {
        addMarkdownFiles(files, baseDir, { ...result, fileName: name });
      }
      exportedCount += 1;
    } catch (error) {
      failed.push({
        paperId: entry.paperId,
        relativeDir: entry.relativeDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failed.length > 0 || exportedCount === 0) {
    const lines = [
      `folder: ${rootNode.name}`,
      `exported: ${exportedCount}`,
      `failed: ${failed.length}`,
      `planned: ${total}`,
      "",
    ];
    for (const item of failed) {
      const where = item.relativeDir ? `${item.relativeDir}/` : "";
      lines.push(`- ${where}${item.paperId}: ${item.error}`);
    }
    if (exportedCount === 0 && failed.length === 0) {
      lines.push("- (no papers in this folder subtree)");
    }
    files[joinZipPath(rootSlug, "export-report.txt")] = strToU8(lines.join("\n") + "\n");
  }

  if (Object.keys(files).length === 0) {
    files[joinZipPath(rootSlug, "export-report.txt")] = strToU8(
      `folder: ${rootNode.name}\nexported: 0\nfailed: 0\nplanned: 0\n\n- (no papers in this folder subtree)\n`
    );
  }

  return {
    fileName: `${rootSlug}-folder-export`,
    zip: zipSync(files),
    exportedCount,
    failed,
    totalPlanned: total,
  };
}
