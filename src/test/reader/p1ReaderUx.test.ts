import { describe, expect, it } from "vitest";
import { buildCitationPreview } from "../../components/reader/citations/citationPreview";
import { findGlossaryTermMatches, segmentTextWithGlossary } from "../../components/reader/glossary/glossaryTerms";
import {
  actionLabel,
  classifyImportFailure,
} from "../../services/import/classifyFailure";

describe("citation preview", () => {
  it("extracts authors title year and doi from a reference line", () => {
    const preview = buildCitationPreview(
      "12",
      "ref-smith-2020",
      "[12] Smith, J. Deep Learning for HCI. CHI (2020). https://doi.org/10.1145/1234"
    );
    expect(preview.year).toBe("2020");
    expect(preview.doiUrl).toContain("doi.org/10.1145/1234");
    expect(preview.title?.toLowerCase()).toContain("deep learning");
    expect(preview.authors).toContain("Smith");
  });

  it("falls back to raw text when structured fields are thin", () => {
    const preview = buildCitationPreview("1", "b-1", "[1] misc note without structure");
    expect(preview.rawText).toContain("misc note");
  });
});

describe("glossary term matching", () => {
  const entries = [
    { term: "HCI", translation: "ヒューマンコンピュータインタラクション" },
    { term: "deep learning", translation: "深層学習", definition: "多層NN" },
  ];

  it("matches longer terms first without overlapping", () => {
    const matches = findGlossaryTermMatches("deep learning and HCI together", entries);
    expect(matches.map((m) => m.entry.term)).toEqual(["deep learning", "HCI"]);
  });

  it("segments text for inline term buttons", () => {
    const parts = segmentTextWithGlossary("Using HCI methods", entries);
    expect(parts.some((p) => p.kind === "term" && p.entry.term === "HCI")).toBe(true);
  });
});

describe("import failure classification", () => {
  it("classifies translation engine failures as resume-first", () => {
    const result = classifyImportFailure("翻訳サーバーに接続できません");
    expect(result.kind).toBe("translation_engine");
    expect(result.primaryAction).toBe("resume");
    expect(result.preservePartialWork).toBe(true);
    expect(actionLabel("resume")).toBe("続きから再開");
  });

  it("classifies duplicates with open-existing action", () => {
    const result = classifyImportFailure("このPDFは既にインポートされています");
    expect(result.kind).toBe("duplicate");
    expect(result.primaryAction).toBe("open_existing");
  });

  it("classifies trashed duplicates with restore action", () => {
    const result = classifyImportFailure("同じ論文がゴミ箱にあります");
    expect(result.kind).toBe("duplicate");
    expect(result.primaryAction).toBe("restore_existing");
    expect(actionLabel("restore_existing")).toBe("ゴミ箱から復元");
  });

  it("classifies extraction failures as retry", () => {
    const result = classifyImportFailure("failed to extract pdf", "extracting");
    expect(result.kind).toBe("extraction");
    expect(result.primaryAction).toBe("retry");
    expect(result.preservePartialWork).toBe(false);
  });
});
