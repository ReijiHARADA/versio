import { describe, expect, it } from "vitest";
import { resolveReaderInspector, toggleReaderInspectorTab } from "../utils/readerRightPanel";

describe("resolveReaderInspector", () => {
  it("opens the info tab on first launch only in wide windows", () => {
    expect(resolveReaderInspector(undefined, true)).toEqual({ open: true, tab: "info" });
    expect(resolveReaderInspector(undefined, false)).toEqual({ open: false, tab: "info" });
  });

  it("keeps the saved state, including closed", () => {
    expect(resolveReaderInspector({ open: false, tab: "notes" }, true)).toEqual({ open: false, tab: "notes" });
    expect(resolveReaderInspector({ open: true, tab: "search" }, false)).toEqual({ open: true, tab: "search" });
  });
});

describe("toggleReaderInspectorTab", () => {
  it("opens on the target tab from closed or another tab", () => {
    expect(toggleReaderInspectorTab({ open: false, tab: "info" }, "glossary")).toEqual({ open: true, tab: "glossary" });
    expect(toggleReaderInspectorTab({ open: true, tab: "notes" }, "glossary")).toEqual({ open: true, tab: "glossary" });
  });

  it("closes when the target tab is already showing, remembering the tab", () => {
    expect(toggleReaderInspectorTab({ open: true, tab: "notes" }, "notes")).toEqual({ open: false, tab: "notes" });
  });
});
