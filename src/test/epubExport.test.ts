import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { exportPaperEpub } from "../data/export/epubExport";
import type { FileSystem } from "../data/fs/types";

function fixtureFileSystem(): FileSystem {
  const paperId = "paper-1";
  const files = new Map<string, Uint8Array>();
  const putText = (path: string, value: string) =>
    files.set(path, new TextEncoder().encode(value));
  const path = (name: string) => "papers/" + paperId + "/" + name;
  putText(
    path("paper.json"),
    JSON.stringify({
      schemaVersion: 1,
      paperId,
      revision: 1,
      title: { original: "A paper", translated: "論文" },
      authors: [{ id: "a1", name: "Author", affiliationIds: [] }],
      affiliations: [],
      publication: "Test",
      year: 2026,
      doi: null,
      pageCount: 1,
      sourceFileHash: "hash",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })
  );
  const front = "---\npaperId: paper-1\nlanguage: en\nschemaVersion: 1\n---\n\n";
  const original =
    front +
    "# A paper\n<!-- pr:block id=\"title\" -->\n\n" +
    "![Figure](assets/figure.png)\n<!-- pr:block id=\"figure-1\" -->\n\n" +
    "*Figure 1*\n";
  const translated =
    front.replace("language: en", "language: ja") +
    "# 論文\n<!-- pr:block id=\"title\" -->\n\n" +
    "![図](assets/figure.png)\n<!-- pr:block id=\"figure-1\" -->\n\n" +
    "*図1*\n";
  putText(path("original.md"), original);
  putText(path("ja.md"), translated);
  putText(
    path("structure.json"),
    JSON.stringify({
      schemaVersion: 1,
      blocks: {
        title: { type: "title", pageStart: 1, pageEnd: 1, boundingBoxes: [], extractionConfidence: 1 },
        "figure-1": { type: "figure", pageStart: 1, pageEnd: 1, boundingBoxes: [], extractionConfidence: 1 },
      },
      relations: [],
    })
  );
  files.set(path("assets/figure.png"), new Uint8Array([137, 80, 78, 71]));
  const read = async (filePath: string) => files.get(filePath)?.slice() ?? null;
  return {
    readBytes: read,
    readText: async (filePath) => {
      const bytes = await read(filePath);
      return bytes ? new TextDecoder().decode(bytes) : null;
    },
    writeBytes: async () => {},
    writeText: async () => {},
    exists: async (filePath) => files.has(filePath),
    remove: async () => {},
    rename: async () => {},
    list: async (prefix) =>
      [...files.keys()].filter((filePath) => filePath === prefix || filePath.startsWith(prefix + "/")),
  };
}

describe("EPUB export", () => {
  it("creates a valid EPUB container with a navigation document and assets", async () => {
    const result = await exportPaperEpub(fixtureFileSystem(), "paper-1");
    const archive = unzipSync(result.epub);
    const names = Object.keys(archive);

    expect(names[0]).toBe("mimetype");
    expect(strFromU8(archive.mimetype)).toBe("application/epub+zip");
    expect(archive["META-INF/container.xml"]).toBeDefined();
    expect(archive["OEBPS/package.opf"]).toBeDefined();
    expect(archive["OEBPS/nav.xhtml"]).toBeDefined();
    expect(archive["OEBPS/content.xhtml"]).toBeDefined();
    expect(archive["OEBPS/images/figure.png"]).toBeDefined();
    expect(strFromU8(archive["OEBPS/content.xhtml"])).toContain('src="images/figure.png"');
    expect(strFromU8(archive["OEBPS/nav.xhtml"])).toContain("論文");
  });
});
