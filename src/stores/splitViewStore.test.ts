import { beforeEach, describe, expect, it } from "vitest";
import { useSplitView } from "./splitViewStore";

const state = () => useSplitView.getState();

describe("split view left tab group", () => {
  beforeEach(() => state().closeSplit());

  it("starts the left group with the paper opened on the left", () => {
    state().openSplit("a");
    expect(state()).toMatchObject({ paperId: "a", leftTabs: ["a"] });
  });

  it("adds left tabs only while split, and shows one without dropping the others", () => {
    state().addLeftTab("x");
    expect(state().leftTabs).toEqual([]);
    state().openSplit("a");
    state().addLeftTab("b");
    state().openSplit("b");
    expect(state()).toMatchObject({ paperId: "b", leftTabs: ["a", "b"] });
  });

  it("shows a neighbouring left tab when the one on screen leaves, and closes when none is left", () => {
    state().openSplit("a");
    state().addLeftTab("b");
    state().removeLeftTab("a");
    expect(state()).toMatchObject({ paperId: "b", leftTabs: ["b"] });
    state().removeLeftTab("b");
    expect(state()).toMatchObject({ paperId: null, leftTabs: [] });
  });

  it("removing a hidden left tab keeps the paper on screen", () => {
    state().openSplit("a");
    state().addLeftTab("b");
    state().removeLeftTab("b");
    expect(state()).toMatchObject({ paperId: "a", leftTabs: ["a"] });
  });
});
