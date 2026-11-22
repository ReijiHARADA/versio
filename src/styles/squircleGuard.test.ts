import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Corners are clothoid (squircle.module.css), never a plain circular border-radius.
 * Allowed without a squircle: no rounding, circles (50%), inherit, and var(--sq-radius-*)
 * (which only shapes box-shadow / outline under a squircle surface). A pill (999px) must
 * compose .pill (G2 ends) or carry the --sq-pill masks itself.
 * A rule that must stay circular says why with a `squircle-exempt: <reason>` comment inside it.
 */
const ALLOWED = /^(0|0px|50%|100%|inherit|none)$|var\(--sq-radius-/;
const PILL = /^(999|9999)px$/;

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") && !entry.name.startsWith("squircle") ? [full] : [];
  });
}

function plainRadiusRules(css: string): { selector: string; value: string; line: number }[] {
  const found: { selector: string; value: string; line: number }[] = [];
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let match = rule.exec(css); match; match = rule.exec(css)) {
    const body = match[2];
    if (body.includes("squircle-exempt:")) continue;
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const radius of code.matchAll(/border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius\s*:\s*([^;]+)/g)) {
      const value = radius[1].trim();
      if (value.split(/\s+/).every((part) => ALLOWED.test(part)) || ALLOWED.test(value)) continue;
      if (PILL.test(value) && /composes:\s*pill\b|--sq-pill-/.test(code)) continue;
      const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim().split("\n").pop()!.trim();
      found.push({ selector, value, line: css.slice(0, match.index + match[1].length).split("\n").length });
    }
  }
  return found;
}

describe("squircle guard", () => {
  it("flags plain radii and honours exemptions", () => {
    expect(plainRadiusRules(".a { border-radius: 8px; }")).toHaveLength(1);
    expect(plainRadiusRules(".a { border-radius: var(--radius-md); }")).toHaveLength(1);
    expect(plainRadiusRules(".a { border-radius: var(--sq-radius-md); }")).toHaveLength(0);
    expect(plainRadiusRules(".a { border-radius: 999px; }")).toHaveLength(1);
    expect(plainRadiusRules('.a { composes: pill from "x"; border-radius: 999px; } .b { border-radius: 50%; }')).toHaveLength(0);
    expect(plainRadiusRules(".a { /* squircle-exempt: paper edge */ border-radius: 3px; }")).toHaveLength(0);
  });

  it("no CSS rule uses a plain circular corner", () => {
    const offenders = cssFiles(path.resolve(__dirname, "..")).flatMap((file) =>
      plainRadiusRules(fs.readFileSync(file, "utf8")).map(
        (hit) => `${path.relative(process.cwd(), file)}:${hit.line} ${hit.selector} → ${hit.value}`
      )
    );
    // Use composes: surface / pill (or .clip) from styles/squircle.module.css, or add a squircle-exempt comment.
    expect(offenders).toEqual([]);
  });
});
