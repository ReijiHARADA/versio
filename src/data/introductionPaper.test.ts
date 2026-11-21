import { describe, expect, it } from "vitest";
import { introductionBlocks, introductionPaper, introductionSections } from "./introductionPaper";

describe("bundled Introduction paper", () => {
  it("keeps every block and section on the Introduction paper", () => {
    expect(introductionPaper.id).toBe("versio-introduction");
    for (const item of [...introductionSections, ...introductionBlocks]) {
      expect(item.paperId).toBe("versio-introduction");
    }
  });

  it("pairs every heading and paragraph with a non-empty translation", () => {
    const text = introductionBlocks.filter((b) => b.type === "heading" || b.type === "paragraph");
    expect(text.length).toBeGreaterThan(10);
    for (const block of text) {
      expect(block.original?.trim(), block.id).toBeTruthy();
      expect(block.translated?.trim(), block.id).toBeTruthy();
      expect(block.translationStatus).toBe("completed");
    }
  });

  it("references only known sections and has unique ids and orders", () => {
    const sectionIds = new Set(introductionSections.map((s) => s.id));
    for (const block of introductionBlocks) expect(sectionIds.has(block.sectionId), block.id).toBe(true);
    expect(new Set(introductionBlocks.map((b) => b.id)).size).toBe(introductionBlocks.length);
    expect(new Set(introductionBlocks.map((b) => b.order)).size).toBe(introductionBlocks.length);
  });

  it("covers each feature the onboarding must teach", () => {
    const titles = introductionSections.map((s) => s.originalTitle).join("\n");
    for (const word of ["Importing", "Translation", "Notes", "Glossary", "Search", "Workspace", "Export", "PLaMo"]) {
      expect(titles).toContain(word);
    }
  });
});
