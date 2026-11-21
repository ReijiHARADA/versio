import { describe, expect, it } from "vitest";
import { importByIdentifier } from "./importByIdentifier";

describe("importByIdentifier", () => {
  it("rejects input without an arXiv id or DOI before any download", async () => {
    await expect(importByIdentifier("attention is all you need")).rejects.toThrow("arXiv ID か DOI");
  });

  it("explains that the browser build cannot download", async () => {
    await expect(importByIdentifier("arXiv:1706.03762")).rejects.toThrow("デスクトップ版のみ");
  });
});
