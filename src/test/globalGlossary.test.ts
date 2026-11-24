import { beforeEach, describe, expect, it } from "vitest";
import { resetStorageForTests } from "../data/runtime";
import { saveGlossary, savePaper } from "../services/database";
import {
  getGlobalGlossary,
  getTranslationGlossary,
  mergeGlossaries,
  normalizeGlossaryEntries,
  saveGlobalGlossary,
} from "../services/glossary/global";
import type { Paper } from "../types/paper";

describe("global glossary", () => {
  beforeEach(async () => {
    await resetStorageForTests();
  });

  it("drops blank rows and keeps the last entry per term", () => {
    expect(
      normalizeGlossaryEntries([
        { term: " Cognitive load ", translation: "認知負担" },
        { term: "", translation: "空" },
        { term: "cognitive load", translation: " 認知負荷 " },
        { term: "UI", translation: "" },
      ])
    ).toEqual([{ term: "cognitive load", translation: "認知負荷" }]);
  });

  it("lets a paper entry override the shared one", () => {
    expect(
      mergeGlossaries(
        [
          { term: "agent", translation: "エージェント" },
          { term: "token", translation: "トークン" },
        ],
        [{ term: "Agent", translation: "主体" }]
      )
    ).toEqual([
      { term: "token", translation: "トークン" },
      { term: "Agent", translation: "主体" },
    ]);
  });

  it("persists and merges into the translation glossary", async () => {
    const now = new Date().toISOString();
    const paper: Paper = {
      id: "p1",
      sourceFilePath: "p.pdf",
      sourceFileHash: "ph",
      titleOriginal: "T",
      titleTranslated: "T",
      authors: [],
      publication: null,
      year: null,
      pageCount: 1,
      processingStatus: "completed",
      lastReadBlockId: null,
      lastReadOffset: null,
      createdAt: now,
      updatedAt: now,
    };
    await savePaper(paper);
    await saveGlossary("p1", [{ term: "agent", translation: "主体" }]);
    await saveGlobalGlossary([
      { term: "agent", translation: "エージェント" },
      { term: "token", translation: "トークン" },
    ]);
    expect(await getGlobalGlossary()).toHaveLength(2);
    expect(await getTranslationGlossary("p1")).toEqual([
      { term: "token", translation: "トークン" },
      { term: "agent", translation: "主体" },
    ]);
  });
});
