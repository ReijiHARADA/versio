import { describe, expect, it } from "vitest";
import type { PaperBlock } from "../../types/paper";
import { resolveParagraphTranslationUi } from "../../components/reader/paragraphTranslationUi";

function makeBlock(overrides: Partial<PaperBlock> = {}): PaperBlock {
  return {
    id: "b1",
    paperId: "p1",
    type: "paragraph",
    sectionId: "s1",
    order: 0,
    pageStart: 1,
    pageEnd: 1,
    boundingBoxes: [],
    // Three 3+ letter tokens: eligible as a list item, but below the
    // generic paragraph threshold of six content words.
    original: "• Design the carefully",
    translated: null,
    extractionConfidence: 1,
    translationStatus: "pending",
    parentBlockId: null,
    metadata: { listRole: "item" },
    ...overrides,
  };
}

describe("resolveParagraphTranslationUi", () => {
  it("shows pending list items that import would translate but the paragraph heuristic rejects", () => {
    const block = makeBlock();
    const ui = resolveParagraphTranslationUi(block);
    expect(ui.skipTranslation).toBe(false);
    expect(ui.isPending).toBe(true);
    expect(ui.isWaiting).toBe(true);
    expect(ui.isFailed).toBe(false);
  });

  it("surfaces failed list items with a retry surface instead of silent English", () => {
    const ui = resolveParagraphTranslationUi(
      makeBlock({ translationStatus: "failed", translated: null })
    );
    expect(ui.skipTranslation).toBe(false);
    expect(ui.isFailed).toBe(true);
    expect(ui.isWaiting).toBe(false);
  });

  it("keeps intentionally skipped chrome as source-only without waiting UI", () => {
    const ui = resolveParagraphTranslationUi(
      makeBlock({
        original: "Accepted: 27 December 2017",
        translationStatus: "skipped",
        metadata: {},
      })
    );
    expect(ui.skipTranslation).toBe(true);
    expect(ui.isWaiting).toBe(false);
    expect(ui.isFailed).toBe(false);
  });

  it("keeps accepted Japanese translations visible", () => {
    const ui = resolveParagraphTranslationUi(
      makeBlock({
        original: "Touch screens have become the predominant input method.",
        translated: "タッチスクリーンが主要な入力方式になった。",
        translationStatus: "completed",
        metadata: {},
      })
    );
    expect(ui.hasTranslation).toBe(true);
    expect(ui.skipTranslation).toBe(false);
    expect(ui.isWaiting).toBe(false);
  });

  it("explains a skipped prose fragment that has no extraction warning", () => {
    const ui = resolveParagraphTranslationUi(makeBlock({
      translationStatus: "skipped",
      metadata: {},
      original: "Conversely, coherence can boost the creativity of final products, as the following passage illustrates for creativity:",
    }));
    expect(ui.hasTranslation).toBe(false);
    expect(ui.untranslatedReason).toBeTruthy();
  });

  it("keeps intentionally untranslated chrome and references silent", () => {
    const refs = new Set(["refs"]);
    expect(resolveParagraphTranslationUi(makeBlock({
      translationStatus: "skipped", metadata: {}, sectionId: "refs",
      original: "Smith J, Doe A. A study of things that happen in the world of papers. Nature. 2020.",
    }), refs).untranslatedReason).toBeNull();
    expect(resolveParagraphTranslationUi(makeBlock({
      translationStatus: "skipped", metadata: { role: "copyright" },
      original: "Copyright is held by the owner and author of this work and its publication rights are licensed.",
    })).untranslatedReason).toBeNull();
  });

  it("does not warn about a completed translation", () => {
    const original = "We designed the experiment to foster both mundane and psychological realism in the study.";
    const ui = resolveParagraphTranslationUi(makeBlock({
      translationStatus: "completed", metadata: {}, original,
      translated: "私たちは、研究において日常的リアリズムと心理的リアリズムの両方を育むよう実験を設計した。",
    }));
    expect(ui.untranslatedReason).toBeNull();
  });
});
