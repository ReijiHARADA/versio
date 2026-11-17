import { describe, expect, it } from "vitest";
import { cleanRunningVenue, findVenue } from "../../services/pdfExtraction/projection/venue";
import { isInstitutionList, isSmallTypeNote, splitFootnoteRun } from "../../services/pdfExtraction/projection/toPaper";

describe("splitFootnoteRun", () => {
  it("splits consecutive glued markers", () => {
    expect(splitFootnoteRun("6https://segeval.readthedocs.io/ 7https://github.com/a/b 8https://github.com/c")).toEqual([
      "6 https://segeval.readthedocs.io/", "7 https://github.com/a/b", "8 https://github.com/c",
    ]);
    expect(splitFootnoteRun("10 https://github.com/a 11 https://github.com/b")).toEqual(["10 https://github.com/a", "11 https://github.com/b"]);
  });
  it("leaves numbers that are not the next marker", () => {
    expect(splitFootnoteRun("1We used 2 GPUs and 3D models.")).toEqual(["1 We used 2 GPUs and 3D models."]);
    expect(splitFootnoteRun("3D scans were aligned.")).toEqual(["3D scans were aligned."]);
    expect(splitFootnoteRun("Corresponding author.")).toEqual(["Corresponding author."]);
  });
});

describe("isSmallTypeNote", () => {
  it("accepts marked, foot-of-page and funding notes in small type", () => {
    expect(isSmallTypeNote("¶https://huggingface.co/flair/chunk-english", 0.68, 0.5)).toBe(true);
    expect(isSmallTypeNote("https://github.com/Lee-zix/RE-GCN", 0.84, 0.91)).toBe(true);
    expect(isSmallTypeNote("This work was supported partly by the Villum Investigator Grant.", 0.8, 0.5)).toBe(true);
  });
  it("keeps body-size prose and small prose high on the page", () => {
    expect(isSmallTypeNote("This work was supported by the results in Section 3.", 1, 0.95)).toBe(false);
    expect(isSmallTypeNote("We report the results of the second experiment below.", 0.8, 0.4)).toBe(false);
  });
  it("treats a page-one institution list as a note at any size", () => {
    const aff = "National Key Laboratory for Multimedia Information Processing, Peking University School of Software, Peking University, China";
    expect(isInstitutionList(aff)).toBe(true);
    expect(isSmallTypeNote(aff, 1.12, 0.17, 1)).toBe(true);
    expect(isInstitutionList("Patients at the university hospital were enrolled after consent was obtained from each participant.")).toBe(false);
  });
});

describe("cleanRunningVenue", () => {
  it("reduces running headers and footers to the journal name", () => {
    expect(cleanRunningVenue("Smith et al. BMC Psychology (2024) 12:150")).toBe("BMC Psychology");
    expect(cleanRunningVenue("Frontiers in Psychology 05 frontiersin.org")).toBe("Frontiers in Psychology");
    expect(cleanRunningVenue("2024 Sallam et al. Cureus 16(3): e57176. DOI 10.7759/cureus.57176 2 of 40")).toBe("Cureus");
    expect(cleanRunningVenue("PLOS ONE ")).toBe("PLOS ONE");
  });
});

describe("isSmallTypeNote at the page foot", () => {
  it("leaves small-type equation fragments and table rows", () => {
    expect(isSmallTypeNote("k=1", 0.7, 0.9)).toBe(false);
    expect(isSmallTypeNote("Segment Length [Sent.] 21.5 ± 34.2 13.6 ± 20.3", 0.7, 0.9)).toBe(false);
    expect(isSmallTypeNote("(Continued)", 0.7, 0.9)).toBe(false);
  });
});

describe("findVenue running heads", () => {
  const page = (lines: Array<[number, string]>) => ({
    pageNumber: 1, width: 600, height: 800,
    textItems: lines.map(([y, text]) => ({ text, x: 50, y, width: text.length * 5, height: 8, fontSize: 8, fontName: "f" })),
  });
  it("takes the journal name repeated on most pages, not author running heads", () => {
    const pages = [1, 2, 3, 4].map((n) => page([[20, "Limbu and Gautam"], [780, `Frontiers in Robotics and AI 0${n} frontiersin.org`], [400, "Body text."]]));
    expect(findVenue(pages as never)).toBe("Frontiers in Robotics and AI");
  });
});
