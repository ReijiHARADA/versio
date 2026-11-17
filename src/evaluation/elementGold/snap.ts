/**
 * Snap a LaTeX-drafted string onto the PDF's printed words.
 *
 * LaTeX drafts lose what the compiler generates (citation labels, \ref numbers,
 * macros). The PDF text layer has those words but not the structure. A word-level
 * alignment keeps the draft's extent (where the paragraph starts and ends) and takes
 * the printed words inside it; short printed-only runs (a citation, a number) are
 * kept, long ones (a running header, a figure's text) are dropped.
 */
export type PrintedWords = { words: string[]; keys: string[]; at: Map<string, number[]> };

const wordsOf = (s: string) => s.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

export function printedWords(text: string): PrintedWords {
  // Line-end hyphenation is a layout artifact, not a printed word boundary.
  const words = wordsOf(text.replace(/(\p{L})[-­]\s*\n?\s+(\p{Ll})/gu, "$1$2"));
  const keys = words.map((w) => w.toLowerCase());
  const at = new Map<string, number[]>();
  for (let i = 0; i + 2 < keys.length; i += 1) {
    const k = `${keys[i]} ${keys[i + 1]} ${keys[i + 2]}`;
    const list = at.get(k);
    if (list) list.push(i);
    else at.set(k, [i]);
  }
  return { words, keys, at };
}

/** Longest run of printed-only words kept inside a paragraph (a citation group, an equation number). */
const MAX_INSERT = 12;

export function snapToPrinted(draft: string, printed: PrintedWords): { text: string; matched: number } {
  const d = wordsOf(draft).map((w) => w.toLowerCase());
  if (d.length < 3) return { text: draft, matched: 0 };
  // Anchor: the printed position most draft trigrams agree on (start offset).
  const votes = new Map<number, number>();
  for (let i = 0; i + 2 < d.length; i += 1) {
    const hits = printed.at.get(`${d[i]} ${d[i + 1]} ${d[i + 2]}`);
    if (!hits || hits.length > 3) continue;
    for (const h of hits) {
      const bucket = Math.round((h - i) / 20);
      votes.set(bucket, (votes.get(bucket) ?? 0) + 1);
    }
  }
  if (votes.size === 0) return { text: draft, matched: 0 };
  const best = [...votes].sort((a, b) => b[1] - a[1])[0][0] * 20;
  const lo = Math.max(0, best - 40);
  const hi = Math.min(printed.keys.length, best + Math.ceil(d.length * 1.6) + 60);
  const p = printed.keys.slice(lo, hi);
  // LCS between draft words and the printed window.
  const n = d.length;
  const m = p.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = d[i] === p[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  // Alignment ops: a matched word, or a printed-only word between matches.
  const ops: Array<{ match: boolean; word: string; j: number; i: number }> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (d[i] === p[j]) {
      ops.push({ match: true, word: printed.words[lo + j], j, i });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1; // draft-only word (a macro the PDF prints differently): dropped
    } else {
      ops.push({ match: false, word: printed.words[lo + j], j, i });
      j += 1;
    }
  }
  // The extent starts and ends at a run of 3 consecutive printed words: a lone match far away
  // (the word "results" in the previous heading) must not pull neighbouring text in.
  const runAt = (k: number) => [0, 1, 2].every((x) => ops[k + x]?.match && (x === 0 || ops[k + x].j === ops[k + x - 1].j + 1));
  const first = ops.findIndex((_, k) => runAt(k));
  let last = -1;
  for (let k = ops.length - 3; k >= 0; k -= 1) if (runAt(k)) { last = k + 2; break; }
  if (first < 0) return { text: draft, matched: 0 };
  const out: string[] = [];
  // Words the LCS paired with an earlier duplicate ("the") are re-attached when the printed
  // word right before the extent is the draft word right before it.
  for (let di = ops[first].i - 1, pj = ops[first].j - 1; di >= 0 && pj >= 0 && d[di] === p[pj]; di -= 1, pj -= 1) out.unshift(printed.words[lo + pj]);
  let pending: string[] = [];
  let matched = out.length;
  for (const op of ops.slice(first, last + 1)) {
    if (!op.match) { pending.push(op.word); continue; }
    if (pending.length <= MAX_INSERT) out.push(...pending);
    pending = [];
    out.push(op.word);
    matched += 1;
  }
  return { text: out.join(" "), matched: matched / n };
}
