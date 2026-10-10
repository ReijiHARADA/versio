import { describe, expect, it } from "vitest";
import {
  isStandalonePageNumberLine,
  looksLikeBibliographyEntry,
} from "../services/citations";

describe("bibliography display helpers", () => {
  it("detects standalone page numbers", () => {
    expect(isStandalonePageNumberLine("51")).toBe(true);
    expect(isStandalonePageNumberLine("  3  ")).toBe(true);
    expect(isStandalonePageNumberLine("[51]")).toBe(false);
    expect(isStandalonePageNumberLine("15. Author. 2007.")).toBe(false);
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
