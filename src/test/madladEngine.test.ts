import { describe, expect, it, vi } from "vitest";
import { MADLADEngine } from "../services/translation/madladEngine";
import { projectPartialTranslation, projectSafeUnitTranslation } from "../services/translation/partialProjection";

describe("MADLADEngine batch integrity", () => {
  it("rejects a result count that cannot be mapped to the input units", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ text: "翻訳" }] }),
    }));

    await expect(new MADLADEngine().translateBatch(["one", "two"], "en", "ja"))
      .rejects.toThrow("Batch translation result count mismatch");
    vi.unstubAllGlobals();
  });

  it("retries transient sidecar failures before surfacing an error", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          text: "これは翻訳です。",
          source_language: "en",
          target_language: "ja",
          model: "madlad",
          model_version: "test",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MADLADEngine().translate("A short sentence.", "en", "ja"))
      .resolves.toMatchObject({ text: "これは翻訳です。" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("retries a transient 503 response for batch translation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "loading" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              text: "これは翻訳です。",
              source_language: "en",
              target_language: "ja",
              model: "madlad",
              model_version: "test",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MADLADEngine().translateBatch(["A short sentence."], "en", "ja"))
      .resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does not report the sidecar unavailable after a transient status failure", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: true,
          model_loaded: true,
          model_name: "madlad400-3b-mt",
          model_version: "test",
          device: "cpu",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MADLADEngine().getStatus()).resolves.toMatchObject({
      available: true,
      modelLoaded: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("does not retry deterministic client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid request",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new MADLADEngine().translate("bad", "en", "ja"))
      .rejects.toThrow("Translation failed: 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("preserves unit-level fallback metadata for later partial projection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "前半は翻訳済み。後半は原文。",
        source_language: "en",
        target_language: "ja",
        model: "madlad",
        model_version: "test",
        fallback_stage: "partial_unit_fallback",
        fallback_reason: "unit_1:protected_token_restore_failed",
        unit_fallback_indices: [1],
        partial_text: "前半は翻訳済み。後半は原文。",
        partial_source_units: ["The second sentence."],
        partial_unit_texts: ["前半は翻訳済み。", "The second sentence."],
      }),
    }));

    await expect(new MADLADEngine().translate("The first sentence. The second sentence.", "en", "ja"))
      .resolves.toMatchObject({
        fallbackStage: "partial_unit_fallback",
        unitFallbackIndices: [1],
        partialSourceUnits: ["The second sentence."],
      });
    vi.unstubAllGlobals();
  });

  it("accepts a safe partial projection from the batch endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{
          text: "前半は翻訳済み。The second sentence.",
          source_language: "en",
          target_language: "ja",
          model: "madlad",
          model_version: "test",
          translation_units: ["The first sentence.", "The second sentence."],
          partial_unit_texts: ["前半は翻訳済み。", "The second sentence."],
          fallback_stage: "partial_unit_fallback",
          unit_fallback_indices: [1],
        }],
      }),
    }));

    await expect(new MADLADEngine().translateBatch(["The first sentence. The second sentence."], "en", "ja"))
      .resolves.toEqual([expect.objectContaining({ text: "前半は翻訳済み。 The second sentence." })]);
    vi.unstubAllGlobals();
  });

  it("projects mapped units even when the server labels the aggregate fallback as whole-item", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: "The first sentence. The second sentence.",
        source_language: "en",
        target_language: "ja",
        model: "madlad",
        model_version: "test",
        fallback_stage: "whole_item_fallback",
        translation_units: ["The first sentence.", "The second sentence."],
        partial_unit_texts: ["前半は翻訳済み。", "The second sentence."],
        unit_fallback_indices: [1],
      }),
    }));

    await expect(new MADLADEngine().translate("The first sentence. The second sentence.", "en", "ja"))
      .resolves.toMatchObject({ text: "前半は翻訳済み。 The second sentence." });
    vi.unstubAllGlobals();
  });

  it("projects partial units only as an explicitly unsafe audit candidate", () => {
    const candidate = projectPartialTranslation({
      fallbackStage: "partial_unit_fallback",
      unitFallbackIndices: [1],
      partialUnitTexts: ["前半は翻訳済み。", "The second sentence."],
      partialSourceUnits: ["The second sentence."],
    });
    expect(candidate).toEqual({
      text: "前半は翻訳済み。 The second sentence.",
      failedIndices: [1],
      complete: false,
      safeForReader: false,
    });
  });

  it("falls back only unsafe mapped units while retaining safe Japanese units", () => {
    const candidate = projectSafeUnitTranslation({
      translationUnits: ["A study investigates posture.", "The experiment measured accuracy."],
      partialUnitTexts: ["姿勢を調査する研究である。", "The measurement result remains English."],
    });
    expect(candidate).toEqual({
      text: "姿勢を調査する研究である。 The experiment measured accuracy.",
      failedIndices: [1],
      complete: false,
    });
  });

  it("does not project when every mapped unit fails", () => {
    expect(projectSafeUnitTranslation({
      translationUnits: ["First study.", "Second study."],
      partialUnitTexts: ["First study.", "Second study."],
    })).toBeNull();
  });

  it("rejects a partial projection whose units do not reconstruct the source", () => {
    expect(projectSafeUnitTranslation({
      translationUnits: ["The first sentence.", "An invented sentence."],
      partialUnitTexts: ["最初の文。", "An invented sentence."],
    }, "The first sentence. The second sentence.")).toBeNull();
  });

  it("rejects malformed or whole-item fallback metadata", () => {
    expect(projectPartialTranslation({ fallbackStage: "whole_item_fallback", unitFallbackIndices: [0], partialUnitTexts: ["x"], partialSourceUnits: ["x"] })).toBeNull();
    expect(projectPartialTranslation({ fallbackStage: "partial_unit_fallback", unitFallbackIndices: [2], partialUnitTexts: ["x"], partialSourceUnits: ["missing"] })).toBeNull();
  });
});
