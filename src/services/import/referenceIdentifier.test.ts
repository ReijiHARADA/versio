import { describe, expect, it } from "vitest";
import { findPaperByIdentifiers, referenceIdentifiers } from "./referenceIdentifier";
import type { Paper } from "../../types/paper";

describe("referenceIdentifiers", () => {
  it("finds a DOI", () => {
    expect(referenceIdentifiers("A. Author. Title. CHI (2019). https://doi.org/10.1145/3290605.3300233.")).toEqual([
      { kind: "doi", id: "10.1145/3290605.3300233" },
    ]);
  });

  it("finds arXiv mentions and puts them before the DOI", () => {
    expect(
      referenceIdentifiers("Vaswani et al. Attention. arXiv preprint arXiv:1706.03762v5, 2017. doi:10.5555/3295222.3295349")
    ).toEqual([
      { kind: "arxiv", id: "1706.03762v5" },
      { kind: "doi", id: "10.5555/3295222.3295349" },
    ]);
    expect(referenceIdentifiers("He et al. CoRR, abs/1512.03385, 2015.")).toEqual([
      { kind: "arxiv", id: "1512.03385" },
    ]);
  });

  it("routes arXiv DOIs to arXiv and dedupes", () => {
    expect(referenceIdentifiers("arXiv:2101.00001. https://doi.org/10.48550/arXiv.2101.00001")).toEqual([
      { kind: "arxiv", id: "2101.00001" },
    ]);
  });

  it("ignores bare numbers that are not arXiv ids", () => {
    expect(referenceIdentifiers("Smith J. Nature 2019;1234.5678 pages.")).toEqual([]);
  });
});

describe("findPaperByIdentifiers", () => {
  const paper = (over: Partial<Paper>) => ({ id: "p", doi: null, ...over }) as Paper;

  it("matches DOI case-insensitively and arXiv across versions", () => {
    const papers = [paper({ id: "a", doi: "10.1145/ABC" }), paper({ id: "b", bibliography: { arxivId: "1706.03762" } })];
    expect(findPaperByIdentifiers(papers, [{ kind: "doi", id: "10.1145/abc" }])?.id).toBe("a");
    expect(findPaperByIdentifiers(papers, [{ kind: "arxiv", id: "1706.03762v5" }])?.id).toBe("b");
  });

  it("matches an arXiv DOI stored on the paper and skips trashed papers", () => {
    const papers = [
      paper({ id: "t", doi: "10.1145/x", trashedAt: "2026-01-01" }),
      paper({ id: "c", doi: "10.48550/arXiv.2101.00001" }),
    ];
    expect(findPaperByIdentifiers(papers, [{ kind: "doi", id: "10.1145/x" }])).toBeUndefined();
    expect(findPaperByIdentifiers(papers, [{ kind: "arxiv", id: "2101.00001" }])?.id).toBe("c");
  });
});
