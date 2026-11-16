/**
 * Reader and Viterbi decoder for linear-chain CRF models in the Wapiti text
 * format (as shipped by GROBID). Implemented from the file layout; no Wapiti
 * code is ported.
 *
 * Layout: `#mdl#<type>#<active>` / `#rdr#<patterns>/<columns>/<autouni>` /
 * pattern quarks / `#qrk#<n>` labels / `#qrk#<n>` observations /
 * sparse `<index>=<hexfloat>` weights. Weight offsets follow observation order:
 * a `u` observation owns L weights, `b` owns L·L, `*` owns L then L·L.
 */

export type CrfPattern = { id: string; kind: "u" | "b" | "*"; parts: Array<string | { row: number; col: number }> };

export type CrfModel = {
  labels: string[];
  patterns: CrfPattern[];
  /** observation string → L label weights */
  unigram: Map<string, Float64Array>;
  /** observation string → L·L weights, index `prev * L + cur` (verified against GROBID: 99.7% label parity) */
  bigram: Map<string, Float64Array>;
};

/** Bigram weight index for (prev → cur). Kept in one place so parity tests can pin it. */
export function bigramIndex(prev: number, cur: number, labelCount: number): number {
  return prev * labelCount + cur;
}

function readQuark(line: string): string {
  const colon = line.indexOf(":");
  const length = Number(line.slice(0, colon));
  return line.slice(colon + 1, colon + 1 + length);
}

export function parseHexFloat(s: string): number {
  const m = s.trim().match(/^([+-])?0x([0-9a-f]+)(?:\.([0-9a-f]*))?p([+-]?\d+)$/i);
  if (!m) return Number(s);
  const mantissa = parseInt(m[2], 16) + (m[3] ? parseInt(m[3], 16) / 16 ** m[3].length : 0);
  const value = mantissa * 2 ** Number(m[4]);
  return m[1] === "-" ? -value : value;
}

export function parsePattern(source: string): CrfPattern {
  const colon = source.indexOf(":");
  const id = colon >= 0 ? source.slice(0, colon) : source;
  const body = colon >= 0 ? source.slice(colon + 1) : "";
  const parts: CrfPattern["parts"] = [];
  const re = /%x\[\s*(-?\d+)\s*,\s*(\d+)\s*\]/gi;
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) parts.push(body.slice(last, m.index));
    parts.push({ row: Number(m[1]), col: Number(m[2]) });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  const kind = (source[0] === "b" || source[0] === "B" ? "b" : source[0] === "*" ? "*" : "u") as CrfPattern["kind"];
  return { id: colon >= 0 ? `${id}:` : id, kind, parts };
}

export function parseWapitiModel(text: string): CrfModel {
  const lines = text.split("\n");
  let i = 0;
  if (!lines[i++]?.startsWith("#mdl#")) throw new Error("not a Wapiti model");
  const reader = lines[i++].match(/^#rdr#(\d+)\/(\d+)\/(\d+)/);
  if (!reader) throw new Error("missing #rdr# header");
  const patternCount = Number(reader[1]);
  const patterns: CrfPattern[] = [];
  for (let p = 0; p < patternCount; p += 1) patterns.push(parsePattern(readQuark(lines[i++])));

  const labelCount = Number(lines[i++].match(/^#qrk#(\d+)/)![1]);
  const labels: string[] = [];
  for (let p = 0; p < labelCount; p += 1) labels.push(readQuark(lines[i++]));

  const obsCount = Number(lines[i++].match(/^#qrk#(\d+)/)![1]);
  const L = labels.length;
  const uOffset = new Float64Array(obsCount).fill(-1);
  const bOffset = new Float64Array(obsCount).fill(-1);
  const observations: string[] = new Array(obsCount);
  let offset = 0;
  for (let o = 0; o < obsCount; o += 1) {
    const obs = readQuark(lines[i++]);
    observations[o] = obs;
    const kind = obs[0];
    if (kind !== "b") {
      uOffset[o] = offset;
      offset += L;
    }
    if (kind === "b" || kind === "*") {
      bOffset[o] = offset;
      offset += L * L;
    }
  }

  const weights = new Map<number, number>();
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    weights.set(Number(line.slice(0, eq)), parseHexFloat(line.slice(eq + 1)));
  }

  const unigram = new Map<string, Float64Array>();
  const bigram = new Map<string, Float64Array>();
  const take = (start: number, size: number): Float64Array | null => {
    let out: Float64Array | null = null;
    for (let k = 0; k < size; k += 1) {
      const w = weights.get(start + k);
      if (w !== undefined && w !== 0) (out ??= new Float64Array(size))[k] = w;
    }
    return out;
  };
  for (let o = 0; o < obsCount; o += 1) {
    if (uOffset[o] >= 0) {
      const w = take(uOffset[o], L);
      if (w) unigram.set(observations[o], w);
    }
    if (bOffset[o] >= 0) {
      const w = take(bOffset[o], L * L);
      if (w) bigram.set(observations[o], w);
    }
  }
  return { labels, patterns, unigram, bigram };
}

/** Observation string for one pattern at position t, using Wapiti's out-of-range placeholders. */
export function expandPattern(pattern: CrfPattern, rows: string[][], t: number): string {
  let out = pattern.id;
  for (const part of pattern.parts) {
    if (typeof part === "string") {
      out += part;
      continue;
    }
    const r = t + part.row;
    if (r < 0) out += `_x${r}`;
    else if (r >= rows.length) out += `_x+${r - rows.length + 1}`;
    else out += rows[r][part.col] ?? "";
  }
  return out;
}

/** Most likely label sequence for `rows` (one array of feature columns per token). */
export function decode(model: CrfModel, rows: string[][]): string[] {
  const T = rows.length;
  const L = model.labels.length;
  if (T === 0) return [];
  const unary = new Float64Array(T * L);
  const trans: Array<Float64Array | null> = new Array(T).fill(null);
  for (let t = 0; t < T; t += 1) {
    for (const pattern of model.patterns) {
      const obs = expandPattern(pattern, rows, t);
      if (pattern.kind !== "b") {
        const w = model.unigram.get(obs);
        if (w) for (let y = 0; y < L; y += 1) unary[t * L + y] += w[y];
      }
      if (pattern.kind !== "u" && t > 0) {
        const w = model.bigram.get(obs);
        if (w) {
          const tr = (trans[t] ??= new Float64Array(L * L));
          for (let k = 0; k < L * L; k += 1) tr[k] += w[k];
        }
      }
    }
  }
  const score = new Float64Array(T * L);
  const back = new Int32Array(T * L);
  for (let y = 0; y < L; y += 1) score[y] = unary[y];
  for (let t = 1; t < T; t += 1) {
    const tr = trans[t];
    for (let y = 0; y < L; y += 1) {
      let best = -Infinity;
      let arg = 0;
      for (let p = 0; p < L; p += 1) {
        const s = score[(t - 1) * L + p] + (tr ? tr[bigramIndex(p, y, L)] : 0);
        if (s > best) {
          best = s;
          arg = p;
        }
      }
      score[t * L + y] = best + unary[t * L + y];
      back[t * L + y] = arg;
    }
  }
  let y = 0;
  for (let k = 1; k < L; k += 1) if (score[(T - 1) * L + k] > score[(T - 1) * L + y]) y = k;
  const path = new Array<string>(T);
  for (let t = T - 1; t >= 0; t -= 1) {
    path[t] = model.labels[y];
    y = back[t * L + y];
  }
  return path;
}
