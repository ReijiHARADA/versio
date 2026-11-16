import { describe, expect, it } from "vitest";
import { acceptFor, isPersistedTranslationUsable } from "../services/translation/acceptance";
import { isPlausibleJaTranslation } from "../services/translation/quality";
import { isAcceptableTranslation } from "../services/translation/translationCheck";

const SRC = "We used BERT-base, RoBERTa-large, GPT-2 XL, T5-11B, and LLaMA-2-70B.";
const OUT = "BERT-base、RoBERTa-large、GPT-2 XL、T5-11B、LLaMA-2-70Bを使用した。";

describe("translation acceptance", () => {
  it("uses the deterministic check", () => {
    expect(acceptFor()).toBe(isAcceptableTranslation);
  });
  it("does not re-queue a persisted legacy translation the new check rejects", () => {
    expect(isAcceptableTranslation(OUT, SRC)).toBe(false);
    expect(isPersistedTranslationUsable(OUT, SRC)).toBe(isPlausibleJaTranslation(OUT, SRC));
  });
});
