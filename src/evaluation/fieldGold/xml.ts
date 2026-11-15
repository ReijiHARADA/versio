/** Minimal tag scanner for gold XML (JATS / Atom / TEI). The repo has no XML parser dependency. */
export type XmlElement = { attrs: Record<string, string>; inner: string; outerStart: number; outerEnd: number };

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3] ?? "";
  return attrs;
}

/** Outermost `<tag>` elements, nesting-aware for the same tag name. */
export function elements(xml: string, tag: string): XmlElement[] {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(/?)${esc}(?=[\\s>/])([^>]*?)(/?)>`, "g");
  const out: XmlElement[] = [];
  let depth = 0;
  let start = 0;
  let outerStart = 0;
  let attrs: Record<string, string> = {};
  for (const m of xml.matchAll(re)) {
    const closing = m[1] === "/";
    const selfClosing = m[3] === "/";
    if (!closing && selfClosing) {
      if (depth === 0) out.push({ attrs: parseAttrs(m[2]), inner: "", outerStart: m.index!, outerEnd: m.index! + m[0].length });
      continue;
    }
    if (!closing) {
      if (depth === 0) {
        attrs = parseAttrs(m[2]);
        outerStart = m.index!;
        start = m.index! + m[0].length;
      }
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) out.push({ attrs, inner: xml.slice(start, m.index), outerStart, outerEnd: m.index! + m[0].length });
    }
  }
  return out;
}

export function first(xml: string, tag: string): XmlElement | null {
  return elements(xml, tag)[0] ?? null;
}

/** Remove every `<tag>` element (nesting-aware) from xml. */
export function removeElements(xml: string, tag: string): string {
  let out = "";
  let last = 0;
  for (const el of elements(xml, tag)) {
    out += xml.slice(last, el.outerStart) + " ";
    last = el.outerEnd;
  }
  return out + xml.slice(last);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

/** Plain text: tags become nothing (inline) — callers insert separators where structure needs them. */
export function text(xml: string): string {
  return decodeEntities(xml.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
