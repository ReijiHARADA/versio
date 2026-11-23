import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Font sizes come from --font-size-* tokens in variables.css.
 * Allowed without a token: var(), inherit, em/% (relative to the parent), calc().
 * A one-off literal carries `font-size-literal-ok: <reason>` on the same line.
 * variables.css, generated squircle*.css and the dev-only evaluation studio are exempt.
 */
const FONT_SIZE = /font-size\s*:\s*([^;}]+)/g;
const ALLOWED = /^(?:var\(|inherit\b|calc\(|[\d.]+(?:em|%)\s*$)/;

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "evaluation" ? [] : cssFiles(full);
    const skip = entry.name.startsWith("squircle") || entry.name === "variables.css";
    return entry.name.endsWith(".css") && !skip ? [full] : [];
  });
}

export function fontSizeOffenders(css: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  code.split("\n").forEach((line, index) => {
    const raw = css.split("\n")[index];
    if (raw.includes("font-size-literal-ok:")) return;
    for (const match of line.matchAll(FONT_SIZE)) {
      if (!ALLOWED.test(match[1].trim())) found.push({ line: index + 1, text: raw.trim() });
    }
  });
  return found;
}

describe("font-size guard", () => {
  it("flags literals and honours exemptions", () => {
    expect(fontSizeOffenders(".a { font-size: 1rem; }")).toHaveLength(1);
    expect(fontSizeOffenders(".a { font-size: 12px; }")).toHaveLength(1);
    expect(fontSizeOffenders(".a { font-size: var(--font-size-body); }")).toHaveLength(0);
    expect(fontSizeOffenders(".a { font-size: inherit; font-size: 0.9375em; font-size: calc(1em + 1px); }")).toHaveLength(0);
    expect(fontSizeOffenders(".a { font-size: 1.75rem; /* font-size-literal-ok: hero */ }")).toHaveLength(0);
    expect(fontSizeOffenders("/* old: font-size: 12px */ .a {}")).toHaveLength(0);
    expect(fontSizeOffenders("--sq-x: 1px;\n.a { font-size: 10px; }")).toEqual([{ line: 2, text: ".a { font-size: 10px; }" }]);
  });

  it("component CSS uses font-size tokens", () => {
    const offenders = cssFiles(path.resolve(__dirname, "..")).flatMap((file) =>
      fontSizeOffenders(fs.readFileSync(file, "utf8")).map(
        (hit) => `${path.relative(process.cwd(), file)}:${hit.line} ${hit.text}`
      )
    );
    // Use a --font-size-* token from styles/variables.css (add one if the value repeats), or mark a one-off with font-size-literal-ok.
    expect(offenders).toEqual([]);
  });
});
