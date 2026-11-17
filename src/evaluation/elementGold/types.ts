/**
 * Element-level ground truth: every structural element a reader sees in a paper,
 * not only body paragraphs. One shape for every source so one scorer covers
 * publisher JATS, LaTeX drafts and Claude-verified gold.
 */
export type ElementGoldSource = "europepmc" | "arxiv" | "acl";

/**
 * How the gold was made:
 * - jats: publisher XML, no model involved
 * - latex: drafted from the author's LaTeX source, not reviewed
 * - latex+claude: LaTeX draft corrected by Claude against the rendered PDF pages
 */
export type ElementGoldProvenance = "jats" | "latex" | "latex+claude";

export type ElementGold = {
  id: string;
  source: ElementGoldSource;
  provenance: ElementGoldProvenance;
  license: string;
  sourceUrl: string;
  title: string;
  authors: string[];
  affiliations: string[];
  emails: string[];
  /** Journal or conference name as printed (e.g. "Proceedings of ACL 2024"). */
  venue: string | null;
  doi: string | null;
  /** License / copyright statement printed on the paper, if any. */
  permissions: string | null;
  headings: Array<{ text: string; level: number }>;
  paragraphs: string[];
  footnotes: string[];
  figures: Array<{ label: string | null; caption: string }>;
  tables: Array<{ label: string | null; caption: string; cells: string[] }>;
  /** Number of display (numbered or unnumbered) equations. */
  equations: number;
  references: string[];
  links: string[];
  /** Set when Claude reviewed the draft. */
  review?: { by: string; date: string; corrections: number; notes: string };
};
