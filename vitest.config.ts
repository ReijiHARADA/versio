import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Extraction-quality corpus checks are a separate stream (see CURRENT_STATE).
    // They must not gate Reader/foundation CI; run via `npm run test:extraction-corpus`.
    exclude: [
      "node_modules/**",
      "src/test/readingOrder/realPapers.test.ts",
      "src/test/pdfExtraction/baselineRealPapers.test.ts",
    ],
  },
});
