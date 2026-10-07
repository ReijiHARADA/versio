import { describe, expect, it } from "vitest";
import { resolveTitle } from "../../services/pdfExtraction/resolver/titleResolver";

function candidate(text: string, y: number, role: "title" | "author" = "title", lines?: string[]) {
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
      lines: (lines ?? [text]).map((line, index) => ({ text: line, page: 1, x: 40, y: y + index * 14, width: 320, height: 14, fontSize: 10 })),
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

  it("skips duplicated glyph runs produced by a broken ToUnicode map", () => {
    const result = resolveTitle({
      candidates: [
        candidate("АПФАПФ&ПЛ&ПЛ ПАРАДИГМЕ", 80),
        candidate("Взаимосвязь прикладной лингвистики и практики преподавания", 150),
      ],
    });
    expect(result.text).toBe("Взаимосвязь прикладной лингвистики и практики преподавания");
  });

  it("does not join an event masthead into the article title", () => {
    const result = resolveTitle({
      candidates: [
        candidate("Author / The 5th Seminar and Workshop in Public Health Action (ISWOPHA) September 16, 2025", 40),
        candidate("International Seminar and Workshop on Public Health Action", 88),
        candidate("Analysis of Burnout and Occupational Safety in Nurses: A Literature Review", 132),
        candidate("Delistiani", 220, "author"),
      ],
    });
    expect(result.text).toBe("Analysis of Burnout and Occupational Safety in Nurses: A Literature Review");
  });

  it("removes a numbered author row swallowed by a title block", () => {
    const result = resolveTitle({
      candidates: [candidate(
        "Взаимосвязь прикладной лингвистики и практикой преподавания английского языка и Ненгах Лаба1, Путу К. Деви2, Тамара Н. Цинкерман3",
        150,
        "title",
        [
          "Взаимосвязь прикладной лингвистики и практикой преподавания английского языка",
          "и Ненгах Лаба1, Путу К. Деви2, Тамара Н. Цинкерман3",
        ],
      )],
    });
    expect(result.text).toBe("Взаимосвязь прикладной лингвистики и практикой преподавания английского языка");
  });

  it("removes a URL and publication metadata swallowed into the title", () => {
    const result = resolveTitle({
      candidates: [candidate(
        "A review of rural consumer behavior marketing strategies and consumer protection for FMCG www.marketingjournal.net IJRMMS 2021; 3(1): 63-65",
        120,
      )],
    });
    expect(result.text).toBe("A review of rural consumer behavior marketing strategies and consumer protection for FMCG");
  });

  it("does not join an adjacent publication line emitted as a title", () => {
    const result = resolveTitle({
      candidates: [
        candidate("A review of rural consumer behavior marketing strategies and consumer protection for FMCG", 120),
        candidate("www.marketingjournal.net IJRMMS 2021; 3(1): 63-65", 135),
      ],
    });
    expect(result.text).toBe("A review of rural consumer behavior marketing strategies and consumer protection for FMCG");
  });

  it("uses an explicit research-book title label despite a non-title role", () => {
    const labeled = candidate("Research Book Title :Human Factors and Ergonomics", 120, "author");
    const result = resolveTitle({ candidates: [labeled, candidate("Abstract: Human Factors and Ergonomics presents a comprehensive interdisciplinary", 260)] });
    expect(result.text).toBe("Human Factors and Ergonomics");
  });

  it("removes an inline journal rail between wrapped title fragments", () => {
    const result = resolveTitle({
      candidates: [candidate("Eco-Linguistics in English: Reviewing the role", 120), candidate("IJLE 2026; 6(1): 05-09 language in environmental discourse", 136)],
    });
    expect(result.text).toBe("Eco-Linguistics in English: Reviewing the role language in environmental discourse");
  });
});
