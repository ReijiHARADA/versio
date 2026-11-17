import { commandArgs, environments, latexToText, parseLatexFields, removeCommand, stripComments } from "../fieldGold/latex";
import type { ElementGold } from "./types";

const DISPLAY_MATH = ["equation", "equation*", "align", "align*", "gather", "gather*", "multline", "multline*", "eqnarray", "eqnarray*", "displaymath", "flalign", "flalign*"];
const FLOATS = ["figure", "figure*", "table", "table*", "wrapfigure", "wraptable", "algorithm", "algorithm*", "lstlisting", "verbatim", "tikzpicture", "thebibliography"];
const SECTION = /\\(section|subsection|subsubsection)\*?\s*(?:\[[^\]]*\])?\s*\{/g;

/** Remove every listed environment (outermost first) from s, leaving a space. */
function dropEnvironments(s: string, names: string[], placeholder = " "): string {
  let out = s;
  for (const env of environments(s, names).reverse()) out = out.slice(0, env.start) + placeholder + out.slice(env.end);
  return out;
}

function tableCells(body: string): string[] {
  return environments(body, ["tabular", "tabular*", "tabularx", "longtable", "tblr"]).flatMap((t) =>
    t.body
      .replace(/^\s*\{[^}]*\}/, "")
      .replace(/\\(hline|toprule|midrule|bottomrule|cline\{[^}]*\}|cmidrule(\([^)]*\))?\{[^}]*\}|addlinespace(\[[^\]]*\])?)/g, " ")
      .split(/\\\\/)
      .flatMap((row) => row.split(/(?<!\\)&/))
      .map((c) => latexToText(c.replace(/\\multi(column|row)\{[^}]*\}\{[^}]*\}/g, "")))
      .filter((c) => /[\p{L}\p{N}]/u.test(c)),
  );
}

/**
 * Draft element gold from an arXiv LaTeX source. It is a draft: macro-heavy sources
 * lose words, and the camera-ready PDF may differ, so it is reviewed against the
 * rendered pages (and printed text) before it is used as gold.
 */
export function latexElementDraft(input: { mainTex: string; bbl: string | null }, meta: Pick<ElementGold, "id" | "source" | "license" | "sourceUrl">): ElementGold {
  const tex = stripComments(input.mainTex);
  const fields = parseLatexFields(input);
  const doc = tex.split(/\\begin\{document\}/)[1]?.split(/\\end\{document\}/)[0] ?? tex;
  const main = doc.split(/\\bibliography\{|\\printbibliography|\\begin\{thebibliography\}/)[0];

  const headings = [...main.matchAll(SECTION)].map((m) => {
    const arg = commandArgs(main.slice(m.index!), m[1])[0];
    return { text: latexToText(arg?.arg ?? ""), level: { section: 1, subsection: 2, subsubsection: 3 }[m[1] as "section"] };
  }).filter((h) => h.text);
  const footnotes = commandArgs(tex, "footnote").map((f) => latexToText(f.arg)).filter(Boolean);
  const floats = environments(main, ["figure", "figure*", "table", "table*", "wrapfigure", "wraptable"]);
  const figures = fields.captions.filter((c) => c.kind === "figure").map((c) => ({ label: null, caption: c.text }));
  const tables = floats.filter((f) => f.name.startsWith("table") || f.name === "wraptable").map((f) => {
    const caps = commandArgs(f.body, "caption");
    return { label: null, caption: caps.length ? latexToText(caps[caps.length - 1].arg) : "", cells: tableCells(f.body) };
  });
  const textOnly = dropEnvironments(main, FLOATS);
  const equations = environments(textOnly, DISPLAY_MATH).length + (textOnly.match(/\\\[/g)?.length ?? 0) + Math.floor((textOnly.match(/(?<!\\)\$\$/g)?.length ?? 0) / 2);

  // Paragraphs: blank lines, section commands, list items and display math end a paragraph.
  const abstract = environments(main, ["abstract"])[0]?.body ?? "";
  // A blank placeholder boundary makes text on either side of a display equation separate paragraphs.
  let prose = dropEnvironments(dropEnvironments(textOnly, ["abstract"]), DISPLAY_MATH, "⟨eq⟩")
    .replace(/\\\[[\s\S]*?\\\]/g, "⟨eq⟩")
    .replace(/\$\$[\s\S]*?\$\$/g, "⟨eq⟩");
  prose = removeCommand(removeCommand(prose, "footnote"), "maketitle");
  prose = prose.replace(SECTION, "\n\n\\$1{").replace(/\\item\b(\s*\[[^\]]*\])?/g, "\n\n$1 ").replace(/\\(begin|end)\{(itemize|enumerate|description)\}/g, "\n\n");
  for (const name of ["title", "author", "date", "affiliation", "institute", "email", "section", "subsection", "subsubsection"]) prose = removeCommand(prose, name);
  const paragraphs = [abstract, ...prose.split(/\s*⟨eq⟩\s*|\n\s*\n/)]
    .map((p) => latexToText(p.replace(/⟨eq⟩/g, " ")))
    .filter((p) => (p.match(/[\p{L}]+/gu)?.length ?? 0) >= 8);

  const links = [...commandArgs(tex, "url").map((u) => u.arg), ...[...tex.matchAll(/\\href\s*\{([^}]+)\}/g)].map((m) => m[1])].filter((u) => !/^mailto:/i.test(u)).map((u) => u.replace(/\\([_%#&~])/g, "$1"));
  const emails = [...new Set([...tex.split(/\\begin\{document\}/)[1]?.slice(0, 20_000).matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []].map((m) => m[0].toLowerCase()))];

  return {
    ...meta,
    provenance: "latex",
    title: fields.title ?? "",
    authors: fields.authors.map((a) => a.name),
    affiliations: [],
    emails,
    venue: null,
    doi: null,
    permissions: null,
    headings,
    paragraphs,
    footnotes,
    figures,
    tables,
    equations,
    references: fields.references.map((r) => r.raw),
    links: [...new Set(links)],
  };
}
