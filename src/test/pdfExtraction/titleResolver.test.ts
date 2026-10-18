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

  it("strips a spaced ORIGINAL RESEARCH banner from the title", () => {
    const result = resolveTitle({
      candidates: [
        candidate("O R I G I N A L R E S E A R C H Patterns and Gaps in Adolescent Belonging", 90),
        candidate("A. Researcher", 160, "author"),
      ],
    });
    expect(result.text).toBe("Patterns and Gaps in Adolescent Belonging");
  });

  it("skips an affiliation mash that stole the title role", () => {
    const result = resolveTitle({
      candidates: [
        candidate("Fatih Sultan Mehmet Education and review", 70),
        candidate("Applications of natural language processing and large language models in sports injury", 110),
        candidate("assessment and rehabilitation decision-making: a scoping review", 128),
      ],
    });
    expect(result.text).toMatch(/^Applications of natural language processing/i);
    expect(result.text).not.toMatch(/Fatih Sultan Mehmet/i);
  });

  it("skips spaced SYSTEMATIC REVIEW banners and citation bylines", () => {
    expect(
      resolveTitle({
        candidates: [
          candidate("S YS T E M AT I C R E V I E W Open Access", 40),
          candidate("Machine learning-assisted mRNA vaccine pharmacovigilance: a systematic review", 120),
        ],
      }).text
    ).toMatch(/^Machine learning-assisted mRNA/i);

    expect(
      resolveTitle({
        candidates: [
          candidate("Peng et al. BMC Med Inform Decis Mak 2020, 20(Suppl 11):322 https://doi.org/10.1186/example", 40),
          candidate("Natural language processing (NLP) tools in extracting biomedical concepts from radiology reports", 110),
        ],
      }).text
    ).toMatch(/^Natural language processing \(NLP\) tools/i);
  });

  it("joins a title split after a DOI masthead and false author band", () => {
    const doi = candidate("doi:10.1017/jme.2025.10224", 50);
    doi.layoutBlock.lines[0].fontSize = 7;
    const lead = candidate("Leveraging Artificial Intelligence and Natural Language Processing in", 120);
    const rest = candidate("Legal Epidemiology Studies: Opportunities and Challenges", 140, "author");
    rest.roleScores.title = 0.9;
    const falseAuthor = candidate("Independent Articles", 90, "author");
    falseAuthor.roleScores.title = 0.1;
    const result = resolveTitle({ candidates: [doi, falseAuthor, lead, rest] });
    expect(result.text).toMatch(/^Leveraging Artificial Intelligence/i);
    expect(result.text).toMatch(/Legal Epidemiology Studies/i);
  });

  it("skips PRISMA checklist header rows as titles", () => {
    const result = resolveTitle({
      candidates: [
        candidate("Section and Item Location where item is Checklist item Topic # reported TITLE Title Page 1 ABSTRACT", 80),
        candidate("Optimizing clinical decision support system functionality by leveraging AI", 160),
      ],
    });
    expect(result.text).toMatch(/^Optimizing clinical decision support/i);
  });

  it("removes an inline journal rail between wrapped title fragments", () => {
    const result = resolveTitle({
      candidates: [candidate("Eco-Linguistics in English: Reviewing the role", 120), candidate("IJLE 2026; 6(1): 05-09 language in environmental discourse", 136)],
    });
    expect(result.text).toBe("Eco-Linguistics in English: Reviewing the role language in environmental discourse");
  });

  it("joins an uppercase title split across author-scored lines", () => {
    const firstTitleLine = candidate("INFLUENCE OF ADVERTISING INCENTIVES ON CONSUMERS", 120, "author");
    const secondTitleLine = candidate("IN THE DIGITAL ENVIRONMENT (RUSSIAN EXPERIENCE)", 138, "author");
    firstTitleLine.roleScores.title = 0.9;
    secondTitleLine.roleScores.title = 0.9;
    const result = resolveTitle({
      candidates: [
        candidate("Social and Behavioural Sciences", 70),
        firstTitleLine,
        secondTitleLine,
      ],
    });
    expect(result.text).toBe("INFLUENCE OF ADVERTISING INCENTIVES ON CONSUMERS IN THE DIGITAL ENVIRONMENT (RUSSIAN EXPERIENCE)");
  });
});
