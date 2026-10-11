import { describe, expect, it } from "vitest";
import {
  coalesceSplitReferenceBlocks,
  isPageNumberArtifactBlock,
  isStandalonePageNumberLine,
  looksLikeAuthorsOnlyReferenceStub,
  looksLikeBibliographyEntry,
  looksLikeConferenceRunningHeader,
  looksLikeYearTitleReferenceContinuation,
  referenceKeyFromText,
} from "../services/citations";

describe("bibliography display helpers", () => {
  it("detects standalone page numbers", () => {
    expect(isStandalonePageNumberLine("51")).toBe(true);
    expect(isStandalonePageNumberLine("  3  ")).toBe(true);
    expect(isStandalonePageNumberLine("[51]")).toBe(false);
    expect(isStandalonePageNumberLine("15. Author. 2007.")).toBe(false);
  });

  it("treats translated-only page digits as artifacts (body footnotes)", () => {
    expect(isPageNumberArtifactBlock("49")).toBe(true);
    expect(isPageNumberArtifactBlock(null, "49")).toBe(true);
    expect(isPageNumberArtifactBlock("", "49")).toBe(true);
    expect(isPageNumberArtifactBlock("Interesting prose.", "49")).toBe(false);
  });

  it("detects ACM conference running headers that interrupt REFERENCES", () => {
    expect(
      looksLikeConferenceRunningHeader(
        "Share, Show And Tell TEI 2016, February 14-17, 2016, Eindhoven, the Netherlands"
      )
    ).toBe(true);
    expect(
      looksLikeConferenceRunningHeader(
        "30. John Zimmerman, Jodi Forlizzi, and Shelley Evenson."
      )
    ).toBe(false);
  });

  it("rejoins author stubs with year-title continuations", () => {
    expect(
      looksLikeAuthorsOnlyReferenceStub(
        "30. John Zimmerman, Jodi Forlizzi, and Shelley Evenson."
      )
    ).toBe(true);
    expect(
      looksLikeYearTitleReferenceContinuation(
        "2007. Research Through Design as a Method for Interaction Design Research in HCI."
      )
    ).toBe(true);
    expect(referenceKeyFromText("2007. Research Through Design…")).toBeNull();

    const merged = coalesceSplitReferenceBlocks([
      {
        type: "reference",
        original: "30. John Zimmerman, Jodi Forlizzi, and Shelley Evenson.",
        metadata: { role: "reference" },
      },
      {
        type: "paragraph",
        original:
          "2007. Research Through Design as a Method for Interaction Design Research in HCI.",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].original).toContain("2007. Research Through Design");
    expect(merged[0].type).toBe("reference");
  });

  it("recognizes numbered ACM-style reference lines without DOI", () => {
    const line =
      "15. Sarah Kettley. 2007. 100 Years of the Wearable Artifacts. In Proceedings of the 4th Nordic Conference on Human-Computer Interaction.";
    expect(looksLikeBibliographyEntry(line)).toBe(true);
  });

  it("rejects ordinary numbered list items outside bibliography shape", () => {
    expect(looksLikeBibliographyEntry("1. First step")).toBe(false);
  });
});
