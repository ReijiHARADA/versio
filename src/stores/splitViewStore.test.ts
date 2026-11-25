import { beforeEach, describe, expect, it } from "vitest";
import { useSplitView } from "./splitViewStore";

const state = () => useSplitView.getState();

describe("split view left tab group", () => {
  beforeEach(() => state().closeSplit());

  it("starts the left group with the paper opened on the left", () => {
    state().openSplit("paper:a");
    expect(state()).toMatchObject({ tab: "paper:a", leftTabs: ["paper:a"] });
  });

  it("adds left tabs only while split, and shows one without dropping the others", () => {
    state().addLeftTab("paper:x");
    expect(state().leftTabs).toEqual([]);
    state().openSplit("paper:a");
    state().addLeftTab("paper:b");
    state().openSplit("paper:b");
    expect(state()).toMatchObject({ tab: "paper:b", leftTabs: ["paper:a", "paper:b"] });
  });

  it("shows a neighbouring left tab when the one on screen leaves, and closes when none is left", () => {
    state().openSplit("paper:a");
    state().addLeftTab("paper:b");
    state().removeLeftTab("paper:a");
    expect(state()).toMatchObject({ tab: "paper:b", leftTabs: ["paper:b"] });
    state().removeLeftTab("paper:b");
    expect(state()).toMatchObject({ tab: null, leftTabs: [] });
  });

  it("removing a hidden left tab keeps the paper on screen", () => {
    state().openSplit("paper:a");
    state().addLeftTab("paper:b");
    state().removeLeftTab("paper:b");
    expect(state()).toMatchObject({ tab: "paper:a", leftTabs: ["paper:a"] });
  });
});
