import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  exportWorkspaceFolder,
  planFolderExportEntries,
} from "../../data/export/folderExport";
import { createMemoryFileSystem } from "../../data/fs/memoryFs";
import { projectionToPackage } from "../../data/package/fromProjection";
import { persistPaperPackage } from "../../data/package/persist";
import type { WorkspaceNode, WorkspacePaper } from "../../types/project";
import type { Paper, PaperBlock, Section } from "../../types/paper";

const now = "2026-10-19T00:00:00.000Z";

function node(
  id: string,
  name: string,
  parentId: string | null,
  order = 0
): WorkspaceNode {
  return {
    id,
    name,
    parentId,
    order,
    description: "",
    researchQuestion: "",
    keywords: [],
    createdAt: now,
    updatedAt: now,
  };
}

function link(nodeId: string, paperId: string, order = 0): WorkspacePaper {
  return {
    nodeId,
    paperId,
    order,
    createdAt: now,
    updatedAt: now,
  };
}

async function seedPaper(fs: ReturnType<typeof createMemoryFileSystem>, id: string, title: string) {
  const paper: Paper = {
    id,
    sourceFilePath: `${id}.pdf`,
    sourceFileHash: `hash-${id}`,
    titleOriginal: title,
    titleTranslated: `${title} 訳`,
    authors: [],
    publication: null,
    year: 2026,
    pageCount: 1,
    processingStatus: "completed",
    lastReadBlockId: null,
    lastReadOffset: null,
    createdAt: now,
    updatedAt: now,
  };
  const sections: Section[] = [
    {
      id: `${id}-s1`,
      paperId: id,
      parentSectionId: null,
      order: 0,
      level: 1,
      originalTitle: "Abstract",
      translatedTitle: "概要",
      normalizedKind: "abstract",
    },
  ];
  const blocks: PaperBlock[] = [
    {
      id: `${id}-b1`,
      paperId: id,
      sectionId: `${id}-s1`,
      type: "paragraph",
      order: 0,
      pageStart: 1,
      pageEnd: 1,
      boundingBoxes: [],
      original: "Hello world.",
      translated: "こんにちは世界。",
      extractionConfidence: 1,
      translationStatus: "completed",
      parentBlockId: null,
      metadata: {},
    },
  ];
  const pkg = projectionToPackage({ paper, sections, blocks, revision: 1 });
  await persistPaperPackage(fs, pkg);
}

describe("planFolderExportEntries", () => {
  it("mirrors subtree memberships and includes child folders", () => {
    const nodes = [
      node("root", "Root", null),
      node("child", "Child Folder", "root"),
      node("other", "Other", null),
    ];
    const memberships = [
      link("root", "p-root"),
      link("child", "p-child"),
      link("other", "p-other"),
      link("child", "p-shared"),
      link("root", "p-shared"),
    ];
    const planned = planFolderExportEntries("root", nodes, memberships);
    expect(planned).toEqual([
      { paperId: "p-root", relativeDir: "" },
      { paperId: "p-shared", relativeDir: "" },
      { paperId: "p-child", relativeDir: "child-folder" },
      { paperId: "p-shared", relativeDir: "child-folder" },
    ]);
  });
});

describe("exportWorkspaceFolder", () => {
  it("builds a hierarchical markdown zip and reports failures", async () => {
    const fs = createMemoryFileSystem();
    await seedPaper(fs, "p-ok", "Alpha Study");
    await seedPaper(fs, "p-child", "Beta Study");

    const root = node("root", "My Corpus", null);
    const child = node("child", "Sub Topic", "root");
    const memberships = [link("root", "p-ok"), link("child", "p-child"), link("root", "p-missing")];

    const result = await exportWorkspaceFolder(fs, root, [root, child], memberships, {
      mode: "markdown",
      variant: "clean",
    });

    expect(result.exportedCount).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.paperId).toBe("p-missing");

    const files = unzipSync(result.zip);
    const names = Object.keys(files).sort();
    expect(names.some((name) => name.endsWith("export-report.txt"))).toBe(true);
    expect(names.some((name) => name.startsWith("my-corpus/") && name.endsWith(".md"))).toBe(true);
    expect(names.some((name) => name.includes("/sub-topic/") && name.endsWith(".md"))).toBe(true);
    expect(names.every((name) => name.startsWith("my-corpus/"))).toBe(true);
  });

  it("exports notion layout without nested zip files", async () => {
    const fs = createMemoryFileSystem();
    await seedPaper(fs, "p1", "Notion Paper");
    const root = node("root", "Bundle", null);
    const result = await exportWorkspaceFolder(fs, root, [root], [link("root", "p1")], {
      mode: "notion",
    });
    const files = unzipSync(result.zip);
    const names = Object.keys(files);
    expect(names.some((name) => name.endsWith(".md"))).toBe(true);
    expect(names.some((name) => name.endsWith(".zip"))).toBe(false);
  });
});
