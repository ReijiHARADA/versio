import { describe, expect, it } from "vitest";
import { resolveTitle } from "../../services/pdfExtraction/resolver/titleResolver";

function candidate(text: string, y: number, role: "title" | "author" = "title") {
  return {
    id: `${role}-${y}`,
    role,
    text,
    pageStart: 1,
    pageEnd: 1,
    confidence: 0.9,
    roleScores: { title: role === "title" ? 0.95 : 0.1 },
    boundingBoxes: [{ page: 1, x: 40, y, width: 320, height: 14 }],
    layoutBlock: {
      id: `block-${role}-${y}`,
      role,
      text,
      pageStart: 1,
      pageEnd: 1,
      bbox: { page: 1, x: 40, y, width: 320, height: 14 },
      lines: [{ text, page: 1, x: 40, y, width: 320, height: 14, fontSize: 10 }],
    },
  } as any;
}

describe("title resolver masthead filtering", () => {
  it("selects a later article title when the first candidate is a DOI masthead", () => {
    const result = resolveTitle({
      candidates: [
        candidate("https://doi.org/10.1000/example", 80),
        candidate("A general method for reliable document extraction", 150),
        candidate("A. Researcher", 210, "author"),
      ],
    });
    expect(result.text).toBe("A general method for reliable document extraction");
  });

  it("keeps a normal first title when no masthead evidence is present", () => {
    const result = resolveTitle({
      candidates: [
        candidate("A general method for reliable document extraction", 80),
        candidate("A. Researcher", 150, "author"),
      ],
    });
    expect(result.text).toBe("A general method for reliable document extraction");
  });
});
