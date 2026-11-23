import { describe, expect, it } from "vitest";
import type { Paper, PaperBlock, Section } from "../../../types/paper";
import { authorsWithAffiliationNumbers, paperInfoStats } from "./paperInfoData";

const block = (over: Partial<PaperBlock>): PaperBlock =>
  ({ id: "b", type: "paragraph", sectionId: "s", original: "x", translated: null, translationStatus: "pending", ...over }) as PaperBlock;

describe("paperInfoStats", () => {
  it("counts parts, translation progress and collects the abstract", () => {
    const sections = [{ id: "abs", normalizedKind: "abstract" }, { id: "s", normalizedKind: "introduction" }] as Section[];
    const stats = paperInfoStats(
      [
        block({ sectionId: "abs", translated: "要旨", translationStatus: "completed" }),
        block({}),
        block({ type: "heading" }),
        block({ type: "reference" }),
        block({ type: "figure", translationStatus: "completed" }),
        block({ type: "table", translationStatus: "skipped" }),
      ],
      sections
    );
    expect(stats).toMatchObject({ references: 1, figures: 1, tables: 1, translatable: 3, translated: 2 });
    expect(stats.abstract).toEqual([{ translated: "要旨", original: "x" }]);
  });
});

describe("authorsWithAffiliationNumbers", () => {
  it("numbers affiliations by list order and falls back to plain names", () => {
    const paper = {
      authors: ["A", "B"],
      authorsStructured: [
        { id: "a", name: "A", affiliationIds: ["y", "x"] },
        { id: "b", name: "B", affiliationIds: [] },
      ],
      affiliations: [{ id: "x", name: "X" }, { id: "y", name: "Y" }],
    } as unknown as Paper;
    expect(authorsWithAffiliationNumbers(paper)).toEqual([{ name: "A", marks: [2, 1] }, { name: "B", marks: [] }]);
    expect(authorsWithAffiliationNumbers({ ...paper, authorsStructured: undefined })).toEqual([
      { name: "A", marks: [] },
      { name: "B", marks: [] },
    ]);
  });
});
