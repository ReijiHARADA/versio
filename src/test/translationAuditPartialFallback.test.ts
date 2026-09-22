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

  it("does not flag a retained author-year citation clause", () => {
    const source = "Explicit cases guide the reader's interpretation of later implicit cases (see e.g. dynamic reader positioning in Coffin and O'Halloran 2005, Coffin and O'Halloran 2006; White 2008). Once the meaning is established, it can be supported by later facts.";
    const translation = "明示的な事例は後の暗黙的な事例の解釈を導く（see e.g. dynamic reader positioning in Coffin and O'Halloran 2005, Coffin and O'Halloran 2006; White 2008）。意味が確立されると、後の事実によって裏付けられる。";

    expect(detectPartialSourceFallback(source, translation)).toEqual({ partial: false });
  });

  it("rejects partial source fallback in production quality gate", () => {
    const source = "While we have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1, directly estimating the core body temperature from the earlobe temperature requires further study. It is known that skin temperature is affected by ambient temperature.";
    const translation = "While we have shown that an increase in core body temperature can be reflected in earlobe temperature measurements made by Thermal Earring in section 6.1, directly estimating the core body temperature from the earlobe temperature requires further study.皮膚温は周囲温度の影響を受ける。";

    expect(evaluateJaTranslation(translation, source).reasons.join(" ")).toContain("unmodified source span");
    expect(isPlausibleJaTranslation(translation, source)).toBe(false);
  });

  it("rejects repeated extracted English labels embedded in Japanese", () => {
    const source = "Procedures Interventions Interventions were performed twice a week for 16 weeks.";
    const translation = "InterventionsおよびInterventionsは週2回、16週間実施された。";

    expect(evaluateJaTranslation(translation, source).reasons).toContain("untranslated repeated source label");
    expect(isPlausibleJaTranslation(translation, source)).toBe(false);
  });

  it("rejects repeated labels separated by a Japanese particle", () => {
    const source = "Assessments Assessments were performed before and after the intervention.";
    const translation = "Assessments と Assessments は介入の前後に実施された。";

    expect(isPlausibleJaTranslation(translation, source)).toBe(false);
  });

  it("does not reject a repeated technical proper noun", () => {
    const source = "GPT-3 was compared with GPT-3 under the same experimental conditions.";
    const translation = "同じ実験条件でGPT-3とGPT-3を比較した。";

    expect(isPlausibleJaTranslation(translation, source)).toBe(true);
  });
});
