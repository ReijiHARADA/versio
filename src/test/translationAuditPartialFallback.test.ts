import { describe, expect, it } from "vitest";
import { detectPartialSourceFallback, evaluateJaTranslation, isPlausibleJaTranslation } from "../services/translation/quality";

describe("translation audit partial source fallback detection", () => {
  it("flags a long source sentence left untranslated inside accepted Japanese", () => {
    const source = "The system uses two wearable prototypes to evaluate social acceptability in public settings. Participants then rated each condition on a seven-point scale.";
    const translation = "このシステムは公共空間での社会的受容性を評価します。 Participants then rated each condition on a seven-point scale.";

    expect(detectPartialSourceFallback(source, translation)).toMatchObject({ partial: true });
  });

  it("does not flag short preserved acronyms or citations", () => {
    const source = "We compared the IR camera condition with the baseline condition [12].";
    const translation = "IR カメラ条件をベースライン条件 [12] と比較した。";

    expect(detectPartialSourceFallback(source, translation)).toEqual({ partial: false });
  });

  it("rejects partial source fallback in production quality gate", () => {
    const source = "While we have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1, directly estimating the core body temperature from the earlobe temperature requires further study. It is known that skin temperature is affected by ambient temperature.";
    const translation = "While we have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1, directly estimating the core body temperature from the earlobe temperature requires further study.皮膚温は周囲温度の影響を受ける。";

    expect(evaluateJaTranslation(translation, source).reasons.join(" ")).toContain("unmodified source span");
    expect(isPlausibleJaTranslation(translation, source)).toBe(false);
  });
});
