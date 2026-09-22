import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MADLAD_MODEL_VERSION } from "../services/translation/madladEngine";
import { TRANSLATION_QUALITY_VERSION } from "../services/translation/quality";

const segmenterSource = readFileSync(
  new URL("../../translation-server/engines/segmenter.py", import.meta.url),
  "utf8"
);
const protectionSource = readFileSync(
  new URL("../../translation-server/engines/citation_protect.py", import.meta.url),
  "utf8"
);
const engineSource = readFileSync(
  new URL("../../translation-server/engines/madlad_mps.py", import.meta.url),
  "utf8"
);
const requirementsSource = readFileSync(
  new URL("../../translation-server/requirements.txt", import.meta.url),
  "utf8"
);
const lockSource = readFileSync(
  new URL("../../translation-server/requirements.lock", import.meta.url),
  "utf8"
);

describe("MADLAD translation cache identity", () => {
  it("includes the client quality gate and server pipeline in the cache identity", () => {
    const segmenterVersion = segmenterSource.match(
      /SEGMENTER_VERSION\s*=\s*["']([^"']+)["']/
    )?.[1];
    const protectionVersion = protectionSource.match(
      /SOURCE_PROTECTION_VERSION\s*=\s*["']([^"']+)["']/
    )?.[1];

    expect(segmenterVersion).toBeTruthy();
    expect(protectionVersion).toBeTruthy();
    expect(engineSource).toContain('TRANSFORMERS_RUNTIME_VERSION = "4.57.6"');
    expect(engineSource).toContain(
      'f"3b-mt-v6-transformers-{TRANSFORMERS_RUNTIME_VERSION}-{SEGMENTER_VERSION}-"'
    );
    expect(engineSource).toContain('f"{SOURCE_PROTECTION_VERSION}-strict-restore-v28-{QUALITY_GATE_VERSION}"');
    expect(engineSource).toContain('QUALITY_GATE_VERSION = "quality-v11"');
    expect(requirementsSource).toContain("transformers==4.57.6");
    expect(lockSource).toContain("transformers==4.57.6");
    expect(TRANSLATION_QUALITY_VERSION).toBe("quality-v11");
    expect(MADLAD_MODEL_VERSION).toBe(
      `3b-mt-v6-transformers-4.57.6-${segmenterVersion}-${protectionVersion}-strict-restore-v28-${TRANSLATION_QUALITY_VERSION}`
    );
  });
});
