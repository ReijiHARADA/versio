import { describe, expect, it, vi } from "vitest";
import { ocrDocument, ocrPage } from "../services/ocrService";

const invoke = vi.hoisted(() => vi.fn(async () => [{ text: "GROUNDING", confidence: 1 }]));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("ocrPage Tauri call", () => {
  it("sends the argument key Tauri derives from the Rust `image_b64` parameter", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    vi.stubGlobal("document", {
      createElement: () => ({ getContext: () => ({}), toDataURL: () => "data:image/png;base64,AAAA" }),
    });
    const page = { getViewport: () => ({ width: 10, height: 10 }), render: () => ({ promise: Promise.resolve() }) };
    const result = await ocrPage(page, 1, ["en-US"]);
    // Tauri v2 camelCases command args: `image_b64` is only accepted as `imageB64`.
    expect(invoke).toHaveBeenCalledWith("ocr_image", { imageB64: "AAAA", languages: ["en-US"] });
    expect(result.fullText).toBe("GROUNDING");
    vi.unstubAllGlobals();
  });
});

describe("ocrDocument page selection", () => {
  it("requests only pages selected by the extraction classifier", async () => {
    const getPage = vi.fn(async (pageNumber: number) => ({ pageNumber }));
    const progress: Array<[number, number]> = [];
    const result = await ocrDocument(
      { numPages: 4, getPage },
      ["en-US"],
      (page, total) => progress.push([page, total]),
      new Set([3, 1, 99, 0]),
    );

    expect(getPage).toHaveBeenCalledTimes(2);
    expect(getPage.mock.calls.map(([page]) => page)).toEqual([1, 3]);
    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result.map((page) => page.pageNumber)).toEqual([1, 3]);
  });

  it("does not request any page when the classifier found no OCR targets", async () => {
    const getPage = vi.fn();
    const result = await ocrDocument({ numPages: 4, getPage }, [], undefined, new Set());
    expect(getPage).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("keeps the import moving when a Vision page request stalls", async () => {
    const getPage = vi.fn(async (pageNumber: number) => ({ pageNumber }));
    const stalled = vi.fn(() => new Promise<never>(() => undefined));
    const result = await ocrDocument(
      { numPages: 1, getPage },
      ["en-US"],
      undefined,
      new Set([1]),
      { pageTimeoutMs: 1, recognizePage: stalled },
    );

    expect(stalled).toHaveBeenCalledOnce();
    expect(result).toEqual([{ pageNumber: 1, lines: [], fullText: "" }]);
  });

  it("keeps the import moving when PDF.js page acquisition stalls", async () => {
    const stalledGetPage = vi.fn(() => new Promise<never>(() => undefined));
    const result = await ocrDocument(
      { numPages: 1, getPage: stalledGetPage },
      ["en-US"],
      undefined,
      new Set([1]),
      { pageTimeoutMs: 1 },
    );

    expect(stalledGetPage).toHaveBeenCalledOnce();
    expect(result).toEqual([{ pageNumber: 1, lines: [], fullText: "" }]);
  });
});
