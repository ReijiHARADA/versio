import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * gap / padding / margin come from --spacing-* tokens in variables.css.
 * Allowed without a token: 0, auto, var(), calc() geometry, em and % (relative sizes).
 * A deliberate nudge carries `spacing-literal-ok: <reason>` on the same line.
 * Positioning (top / left / inset) is out of scope: those are mostly optical offsets.
 */
const DECL = /(?<![\w-])(gap|row-gap|column-gap|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g;
const LITERAL = /(?<![\w.-])-?\d*\.?\d+(?:px|rem)\b/;
const EXEMPT = /spacing-literal-ok:/;

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "evaluation" ? [] : cssFiles(full);
    const skip = entry.name.startsWith("squircle") || entry.name === "variables.css";
    return entry.name.endsWith(".css") && !skip ? [full] : [];
  });
}

export function spacingOffenders(css: string): { line: number; text: string }[] {
  const lines = css.split("\n");
  // Blank out comments but keep offsets, so match positions map back to lines.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const found: { line: number; text: string }[] = [];
  for (const match of code.matchAll(DECL)) {
    const [, prop, rawValue] = match;
    const value = rawValue.trim();
    if (value.includes("calc(") || !LITERAL.test(value)) continue;
    const line = code.slice(0, match.index).split("\n").length;
    if (EXEMPT.test(lines[line - 1] ?? "")) continue;
    found.push({ line, text: `${prop}: ${value}` });
  }
  return found;
}

describe("spacing guard", () => {
  it("flags literals and honours exemptions", () => {
    expect(spacingOffenders(".a { padding: 10px; }")).toHaveLength(1);
    expect(spacingOffenders(".a { margin: 0 0.5rem; }")).toHaveLength(1);
    expect(spacingOffenders(".a { gap: var(--spacing-sm); padding: 0 auto; margin: 0.35em 2%; }")).toHaveLength(0);
    expect(spacingOffenders(".a { padding: calc(4px + 22px); }")).toHaveLength(0);
    expect(spacingOffenders(".a { margin-left: -2px; /* spacing-literal-ok: optical */ }")).toHaveLength(0);
    expect(spacingOffenders(".a { top: 3px; width: 10px; --row-gap: 3px; }")).toHaveLength(0);
    expect(spacingOffenders("/* padding: 10px */ .a {}")).toHaveLength(0);
    expect(spacingOffenders(".a {\n  gap: 1px;\n}")).toEqual([{ line: 2, text: "gap: 1px" }]);
  });

  it("component CSS uses spacing tokens", () => {
    const offenders = cssFiles(path.resolve(__dirname, "..")).flatMap((file) =>
      spacingOffenders(fs.readFileSync(file, "utf8")).map(
        (hit) => `${path.relative(process.cwd(), file)}:${hit.line} ${hit.text}`
      )
    );
    // Use a --spacing-* token from styles/variables.css, or mark a deliberate nudge with spacing-literal-ok.
    expect(offenders).toEqual([]);
  });
});
