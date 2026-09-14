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
});
