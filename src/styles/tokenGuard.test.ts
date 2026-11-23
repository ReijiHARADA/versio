import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Colors and stacking order come from tokens in variables.css.
 * - Component CSS must not hard-code hex / rgb() / rgba() colors. A literal that must stay
 *   (one-off content color, shadow tint) carries `color-literal-ok: <reason>` on the same line.
 * - z-index uses var(--z-*); only `auto` and the local `-1` (behind its own parent) are literal.
 * variables.css, generated squircle*.css and the dev-only evaluation studio are exempt.
 */
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;
const Z_LITERAL = /z-index\s*:(?!\s*(?:auto\b|-1\b|var\())/;

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "evaluation" ? [] : cssFiles(full);
    const skip = entry.name.startsWith("squircle") || entry.name === "variables.css";
    return entry.name.endsWith(".css") && !skip ? [full] : [];
  });
}

export function tokenOffenders(css: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  let inComment = false;
  css.split("\n").forEach((raw, index) => {
    let code = raw;
    if (inComment) {
      const end = code.indexOf("*/");
      if (end < 0) return;
      code = code.slice(end + 2);
      inComment = false;
    }
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");
    const open = code.indexOf("/*");
    if (open >= 0) {
      code = code.slice(0, open);
      inComment = true;
    }
    const colorHit = COLOR.test(code) && !raw.includes("color-literal-ok:");
    if (colorHit || Z_LITERAL.test(code)) found.push({ line: index + 1, text: raw.trim() });
  });
  return found;
}

describe("token guard", () => {
  it("flags literals and honours exemptions", () => {
    expect(tokenOffenders(".a { color: #fff; }")).toHaveLength(1);
    expect(tokenOffenders(".a { background: rgba(0, 0, 0, 0.1); }")).toHaveLength(1);
    expect(tokenOffenders(".a { color: #fff; /* color-literal-ok: lightbox */ }")).toHaveLength(0);
    expect(tokenOffenders(".a { color: var(--color-text); }")).toHaveLength(0);
    expect(tokenOffenders(".a { z-index: 10; }")).toHaveLength(1);
    expect(tokenOffenders(".a { z-index: var(--z-overlay); z-index: auto; z-index: -1; }")).toHaveLength(0);
    expect(tokenOffenders("/* old: #fff\n z-index: 3 */ .a { color: red; }")).toHaveLength(0);
  });

  it("component CSS uses color and z-index tokens", () => {
    const offenders = cssFiles(path.resolve(__dirname, "..")).flatMap((file) =>
      tokenOffenders(fs.readFileSync(file, "utf8")).map(
        (hit) => `${path.relative(process.cwd(), file)}:${hit.line} ${hit.text}`
      )
    );
    // Use a token from styles/variables.css (add one if the value repeats), or mark a one-off with color-literal-ok.
    expect(offenders).toEqual([]);
  });
});
