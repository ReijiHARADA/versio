import { describe, expect, it } from "vitest";
import { resolveReaderInspector } from "../utils/readerRightPanel";

describe("resolveReaderInspector", () => {
  it("opens the info tab on first launch only in wide windows", () => {
    expect(resolveReaderInspector(undefined, true)).toEqual({ open: true, tab: "info" });
    expect(resolveReaderInspector(undefined, false)).toEqual({ open: false, tab: "info" });
  });

  it("keeps the saved state, including closed", () => {
    expect(resolveReaderInspector({ open: false, tab: "notes" }, true)).toEqual({ open: false, tab: "notes" });
    expect(resolveReaderInspector({ open: true, tab: "glossary" }, false)).toEqual({ open: true, tab: "glossary" });
    // The removed search tab falls back to info.
    expect(resolveReaderInspector({ open: true, tab: "search" as never }, false)).toEqual({ open: true, tab: "info" });
  });
});
