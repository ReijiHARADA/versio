import { describe, expect, it, vi } from "vitest";
import { MADLADEngine } from "../services/translation/madladEngine";

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
});
