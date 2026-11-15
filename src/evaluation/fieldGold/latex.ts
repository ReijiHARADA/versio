import type { FieldRecord } from "./types";

/** Index just past the brace group starting at `open` (s[open] === "{"), or -1. */
function braceEnd(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === "\\") { i += 1; continue; }
    if (s[i] === "{") depth += 1;
    else if (s[i] === "}") { depth -= 1; if (depth === 0) return i + 1; }
  }
  return -1;
}

/** Arguments of every `\cmd[opt]{arg}`; returns the mandatory arg and its span. */
function commandArgs(s: string, cmd: string): Array<{ arg: string; start: number; end: number }> {
  const out: Array<{ arg: string; start: number; end: number }> = [];
  const re = new RegExp(`\\\\${cmd}(?![A-Za-z])\\s*(?:\\[[^\\]]*\\]\\s*)*`, "g");
  for (const m of s.matchAll(re)) {
    const open = m.index! + m[0].length;
    if (s[open] !== "{") continue;
    const end = braceEnd(s, open);
    if (end < 0) continue;
    out.push({ arg: s.slice(open + 1, end - 1), start: m.index!, end });
  }
  return out;
}

function removeCommand(s: string, cmd: string): string {
  let out = s;
  for (const c of commandArgs(s, cmd).reverse()) out = out.slice(0, c.start) + out.slice(c.end);
  return out;
}

/** Environments `\begin{name}...\end{name}` (outermost, nesting-aware). */
function environments(s: string, names: string[]): Array<{ name: string; body: string; start: number; end: number }> {
  const alt = names.map((n) => n.replace("*", "\\*")).join("|");
  const re = new RegExp(`\\\\(begin|end)\\{(${alt})\\}`, "g");
  const out: Array<{ name: string; body: string; start: number; end: number }> = [];
  let depth = 0;
  let start = 0;
  let bodyStart = 0;
  let name = "";
  for (const m of s.matchAll(re)) {
    if (m[1] === "begin") {
      if (depth === 0) { start = m.index!; bodyStart = m.index! + m[0].length; name = m[2]; }
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) out.push({ name, body: s.slice(bodyStart, m.index), start, end: m.index! + m[0].length });
    }
  }
  return out;
}

export function stripComments(tex: string): string {
  return tex
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\iffalse\b[\s\S]*?\\fi\b/g, "");
}

const ACCENTS: Record<string, string> = { "'": "́", "`": "̀", "^": "̂", '"': "̈", "~": "̃", "=": "̄", ".": "̇", u: "̆", v: "̌", H: "̋", c: "̧" };

/** Best-effort LaTeX → plain text for gold strings. */
export function latexToText(s: string): string {
  let t = s
    .replace(/\\([`'^"~=.uvHc])\s*\{?\\?([A-Za-z])\}?/g, (_, a: string, l: string) => (l + (ACCENTS[a] ?? "")).normalize("NFC"))
    .replace(/\\(ss|ae|oe|o|aa|l)\b\{?\}?/g, (_, c: string) => ({ ss: "ß", ae: "æ", oe: "œ", o: "ø", aa: "å", l: "ł" })[c] ?? c)
    .replace(/\\\\(\[[^\]]*\])?/g, " ")
    .replace(/\\(newblock|newline|par|noindent|centering|and)\b/g, " ")
    .replace(/\\([%&$#_{}])/g, "$1")
    .replace(/(?<!\\)~/g, " ")
    .replace(/\$\^\{?[^$}]*\}?\$/g, "")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\(?:label|ref|cite[a-z]*|footnote|thanks|inst|textsuperscript|url|href)\s*(?:\[[^\]]*\])?\{[^{}]*\}/g, "");
  // Unwrap remaining \cmd{arg} and drop bare \cmd.
  for (let i = 0; i < 5; i += 1) t = t.replace(/\\[A-Za-z]+\*?\s*(?:\[[^\]]*\])?\{([^{}]*)\}/g, "$1");
  t = t.replace(/\\[A-Za-z]+\*?/g, "").replace(/[{}]/g, "").replace(/\^/g, "");
  return t.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function authorNames(tex: string): string[] {
  const ieee = commandArgs(tex, "IEEEauthorblockN").map((c) => c.arg);
  const raw = ieee.length > 0 ? ieee : commandArgs(tex, "author").map((c) => c.arg);
  return raw
    .flatMap((a) => removeCommand(removeCommand(a, "thanks"), "footnote").split(/\\and\b|\\AND\b|,(?![^{]*\})/))
    .map((chunk) => chunk.split(/\\\\/)[0])
    .map((chunk) => latexToText(chunk).replace(/[0-9*†‡,]+$/u, "").trim())
    .filter((n) => n && n.split(/\s+/).length <= 6);
}

function captionsOf(tex: string): FieldRecord["captions"] {
  return environments(tex, ["figure", "figure*", "table", "table*"]).flatMap((env) => {
    const body = environments(env.body, ["subfigure", "subtable", "minipage"]).reduceRight(
      (b, sub) => (/\\caption/.test(sub.body) && !/\\caption/.test(b.slice(0, sub.start) + b.slice(sub.end)) ? b : b.slice(0, sub.start) + b.slice(sub.end)),
      env.body,
    );
    const caps = commandArgs(body, "caption");
    const main = caps[caps.length - 1];
    if (!main) return [];
    return [{ kind: env.name.startsWith("table") ? "table" as const : "figure" as const, label: null, text: latexToText(main.arg) }];
  });
}

function bblReferences(bbl: string): FieldRecord["references"] {
  const body = bbl.replace(/\\begin\{thebibliography\}\{[^}]*\}/, "").replace(/\\end\{thebibliography\}[\s\S]*/, "");
  return body
    .split(/\\bibitem\s*(?:\[[^\]]*(?:\[[^\]]*\][^\]]*)*\])?\s*\{[^}]*\}/)
    .slice(1)
    .map((item) => ({ raw: latexToText(item.replace(/\\(em|it|bf)\b/g, "")) }))
    .filter((r) => r.raw.length > 0);
}

/** arXiv LaTeX gold. Affiliations / emails are deliberately empty (not trusted for this source). */
export function parseLatexFields(input: { mainTex: string; bbl: string | null }): FieldRecord {
  const tex = stripComments(input.mainTex);
  const title = commandArgs(tex, "title")[0];
  return {
    title: title ? latexToText(title.arg) : null,
    authors: authorNames(tex).map((name) => ({ name, affiliationKeys: [] })),
    affiliations: [],
    emails: [],
    captions: captionsOf(tex),
    references: input.bbl ? bblReferences(stripComments(input.bbl)) : [],
  };
}
