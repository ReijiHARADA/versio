import { afterEach, describe, expect, it } from "vitest";
import { paperDisplayOrder, setPaperDisplayOrder } from "../../components/library/paperDisplayOrder";
import { rangeBetween } from "../../stores/paperSelectionStore";

describe("paperDisplayOrder", () => {
  afterEach(() => setPaperDisplayOrder(null));

  it("lets Shift-click ranges reach cards a virtual list has not mounted", () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `p${i}`);
    setPaperDisplayOrder(ids);
    expect(rangeBetween(paperDisplayOrder(), "p10", "p900")).toHaveLength(891);
  });
});
