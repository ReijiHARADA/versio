import { strToU8, zipSync, type Zippable } from "fflate";
import { parsePaperMarkdown } from "../markdown/parse";
import { loadPaperPackage } from "../package/persist";
import type { FileSystem } from "../fs/types";
import type { DocumentNode } from "../types/document";
import { exportPaperMarkdown, type MarkdownExportResult } from "./markdownExport";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
}

function inlineHtml(value: string): string {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function tableHtml(text: string): string {
  const rows = text.split(/\r?\n/).filter((line) => line.includes("|"));
  if (rows.length < 2) return `<pre>${escapeHtml(text)}</pre>`;
  const cells = (row: string) => row.replace(/^\s*\|\s*|\s*\|\s*$/g, "").split("|").map((cell) => cell.trim());
  const body = rows.filter((row) => !/^\s*\|?\s*:?-{3,}/.test(row));
  if (body.length === 0) return `<pre>${escapeHtml(text)}</pre>`;
  return `<table><tbody>${body.map((row, index) => `<tr>${cells(row).map((cell) => index === 0 ? `<th>${inlineHtml(cell)}</th>` : `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function normalizedAssetPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function mimeTypeFromName(name: string): string {
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

type EpubAsset = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
};

const MOBILE_IMAGE_MAX_DIMENSION = 1600;
const MOBILE_JPEG_QUALITY = 0.92;

function extensionForMimeType(mimeType: string, fallbackName: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/gif") return "gif";
  if (mimeType === "image/svg+xml") return "svg";
  return fallbackName.split(".").pop() || "bin";
}

/**
 * EPUB has no need to retain the source PDF's lossless, oversized PNG crops.
 * Convert ordinary figures to a high-quality JPEG only for the exported book;
 * tables remain PNG so small text and ruling lines stay crisp. This deliberately
 * leaves the Paper Package assets untouched.
 */
async function optimizeFigureForMobileEpub(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
  enabled: boolean
): Promise<EpubAsset> {
  const original: EpubAsset = {
    bytes,
    mimeType,
    extension: extensionForMimeType(mimeType, fileName),
  };
  if (!enabled || mimeType !== "image/png" || typeof document === "undefined" || typeof Image === "undefined") {
    return original;
  }

  try {
    const image = new Image();
    image.decoding = "async";
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    try {
      const decoded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("could not decode EPUB image"));
      });
      image.src = objectUrl;
      await decoded;
      const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
      if (longestEdge === 0) return original;
      const scale = Math.min(1, MOBILE_IMAGE_MAX_DIMENSION / longestEdge);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return original;
      // JPEG has no alpha. Academic figures conventionally render on the reader's
      // white page, so make that background explicit rather than turning it black.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", MOBILE_JPEG_QUALITY)
      );
      if (!encoded) return original;
      const compressed = new Uint8Array(await encoded.arrayBuffer());
      // Do not replace an unusually efficient source PNG with a larger JPEG.
      if (compressed.byteLength >= bytes.byteLength) return original;
      return { bytes: compressed, mimeType: "image/jpeg", extension: "jpg" };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Export must remain available in browsers that cannot decode a source crop.
    return original;
  }
}

function nodeHtml(node: DocumentNode, assetNames: Map<string, string>, headingId?: string): string {
  const text = inlineHtml(node.text);
  if (node.type === "title" || node.type === "heading") {
    const level = Math.min(6, Math.max(1, node.level ?? (node.type === "title" ? 1 : 2)));
    return `<h${level} id="${escapeHtml(headingId || node.id || `heading-${level}`)}">${text}</h${level}>`;
  }
  if (node.type === "figure" || node.type === "table") {
    const asset = node.src ? assetNames.get(node.src.replace(/^\.\//, "")) : undefined;
    if (asset) return `<figure class="${node.type}"><img src="${escapeHtml(asset)}" alt="${escapeHtml(node.alt || node.text || node.type)}" /></figure>`;
    return node.type === "table" ? tableHtml(node.text) : `<p>${text}</p>`;
  }
  if (node.type === "caption") return `<p class="caption">${text}</p>`;
  if (node.type === "equation") return `<pre class="equation">${escapeHtml(node.text)}</pre>`;
  if (node.type === "footnote") return `<aside class="footnote">${text}</aside>`;
  if (node.type === "callout") return `<aside class="callout">${text.replace(/\n/g, "<br />")}</aside>`;
  if (node.type === "divider") return "<hr />";
  return `<p>${text.replace(/\n/g, "<br />")}</p>`;
}

function packageName(title: string, paperId: string): string {
  return (title || paperId).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "paper";
}

export type EpubExportOptions = {
  includeFailedTranslations?: boolean;
  /** Keep original image assets for archival rather than mobile reading. */
  optimizeImagesForMobile?: boolean;
};

export async function exportPaperEpub(
  fs: FileSystem,
  paperId: string,
  options: EpubExportOptions = {}
): Promise<MarkdownExportResult & { epub: Uint8Array }> {
  // Reuse the Markdown exporter so EPUB follows the same failed-translation
  // policy and page-number filtering as the other export paths.
  const markdownResult = await exportPaperMarkdown(fs, paperId, {
    language: "ja",
    variant: "clean",
    stripBlockIds: true,
    includeFailedTranslations: options.includeFailedTranslations,
  });
  const pkg = await loadPaperPackage(fs, paperId, { includeAssets: true, includeSourcePdf: false, includeLayout: false });
  const parsed = parsePaperMarkdown(markdownResult.markdown, paperId);
  const tableAssetPaths = new Set(
    parsed.nodes
      .filter((node) => node.type === "table" && node.src)
      .map((node) => normalizedAssetPath(node.src!))
  );
  const assetNames = new Map<string, string>();
  const assetMimeTypes = new Map<string, string>();
  const usedAssetNames = new Set<string>();
  const files: Zippable = {
    // EPUB requires mimetype to be the first, uncompressed ZIP entry.
    "mimetype": [strToU8("application/epub+zip"), { level: 0 }],
  };
  for (const [index, asset] of pkg.assets.entries()) {
    const base = asset.path.split("/").pop() || `asset-${index + 1}.bin`;
    const sourcePath = normalizedAssetPath(asset.path);
    const optimized = await optimizeFigureForMobileEpub(
      asset.bytes,
      asset.mimeType || mimeTypeFromName(base),
      base,
      options.optimizeImagesForMobile !== false && !tableAssetPaths.has(sourcePath)
    );
    const stem = base.replace(/\.[^.]+$/, "");
    let fileName = `${stem}.${optimized.extension}`;
    let suffix = 2;
    while (usedAssetNames.has(fileName)) {
      fileName = `${stem}-${suffix}.${optimized.extension}`;
      suffix += 1;
    }
    usedAssetNames.add(fileName);
    const name = `images/${fileName}`;
    assetNames.set(sourcePath, name);
    assetMimeTypes.set(name, optimized.mimeType);
    files[`OEBPS/${name}`] = optimized.bytes;
  }
  const headingIds = new Map<DocumentNode, string>();
  const usedHeadingIds = new Set<string>();
  const headingIdFor = (node: DocumentNode, index: number): string => {
    const base = node.id || `heading-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedHeadingIds.has(id)) id = `${base}-${suffix++}`;
    usedHeadingIds.add(id);
    headingIds.set(node, id);
    return id;
  };
  const headings = parsed.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === "title" || node.type === "heading")
    .map(({ node, index }) => ({ node, id: headingIdFor(node, index) }));
  const body = parsed.nodes.map((node) => nodeHtml(node, assetNames, headingIds.get(node))).join("\n");
  const title = pkg.paper.title.translated || pkg.paper.title.original || paperId;
  const authors = pkg.paper.authors.map((author) => author.name).join(", ");
  const nav = headings.map(({ node, id }) => `<li><a href="content.xhtml#${escapeHtml(id)}">${inlineHtml(node.text)}</a></li>`).join("");
  files["META-INF/container.xml"] = strToU8('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  files["OEBPS/styles.css"] = strToU8("body{font-family:serif;line-height:1.7;margin:1em}h1,h2,h3,h4,h5,h6{margin-top:1.5em}img{max-width:100%;height:auto}figure{margin:1em 0;text-align:center}.caption{color:#666;font-size:.9em;text-align:center}.equation{white-space:pre-wrap}.footnote{font-size:.85em;color:#555;margin:1em 0}.callout{padding:.75em;background:#f3f3f3}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:.35em;text-align:left}");
  files["OEBPS/content.xhtml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${escapeHtml(title)}</title><link rel="stylesheet" href="styles.css"/></head><body>${body}</body></html>`);
  files["OEBPS/nav.xhtml"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目次</title></head><body><nav epub:type="toc" id="toc"><h1>目次</h1><ol>${nav}</ol></nav></body></html>`);
  const manifestAssets = [...assetNames.values()]
    .map((name, index) => `<item id="img${index}" href="${escapeHtml(name)}" media-type="${escapeHtml(assetMimeTypes.get(name) || "application/octet-stream")}"/>`)
    .join("");
  files["OEBPS/package.opf"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:paper-reader:${escapeHtml(paperId)}</dc:identifier><dc:title>${escapeHtml(title)}</dc:title><dc:creator>${escapeHtml(authors)}</dc:creator><dc:language>ja</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles.css" media-type="text/css"/>${manifestAssets}</manifest><spine toc="nav"><itemref idref="content"/></spine></package>`);
  const epub = zipSync(files);
  return { ...markdownResult, fileName: packageName(title, paperId), epub };
}
