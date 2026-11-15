import { useEffect, useState } from "react";
import { loadPaperAssetBytes } from "../data/package/persist";
import { getStorage } from "../data/runtime";

const blobUrlByKey = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(paperId: string, relativePath: string): string {
  return `${paperId}::${relativePath}`;
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function isPackageRelativeAsset(src: string | undefined | null): boolean {
  if (!src) return false;
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("http")) return false;
  // Package assets are always relative; a root-relative URL is an app-bundled
  // static file (e.g. the filming-only presentation demo assets).
  if (src.startsWith("/")) return false;
  const normalized = src.replace(/^\.\//, "");
  return normalized.startsWith("assets/") || !normalized.includes("://");
}

export function revokePaperAssetUrls(paperId?: string): void {
  for (const [key, url] of [...blobUrlByKey.entries()]) {
    if (paperId && !key.startsWith(`${paperId}::`)) continue;
    URL.revokeObjectURL(url);
    blobUrlByKey.delete(key);
  }
}

async function resolveAssetUrl(paperId: string, relativePath: string): Promise<string | null> {
  const key = cacheKey(paperId, relativePath);
  const cached = blobUrlByKey.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    try {
      const { fs } = await getStorage();
      const bytes = await loadPaperAssetBytes(fs, paperId, relativePath);
      if (!bytes) return null;
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const blob = new Blob([copy], { type: mimeFromPath(relativePath) });
      const url = URL.createObjectURL(blob);
      blobUrlByKey.set(key, url);
      return url;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task;
}

/**
 * Resolve figure/table image URLs lazily. Package-relative paths become Blob URLs
 * on demand; data:/blob:/http URLs pass through unchanged.
 */
export function usePaperAssetUrl(
  paperId: string | undefined,
  src: string | undefined | null
): string | undefined {
  const needsLoad = Boolean(paperId && isPackageRelativeAsset(src));
  const [resolved, setResolved] = useState<string | undefined>(() =>
    needsLoad ? undefined : src || undefined
  );

  useEffect(() => {
    if (!paperId || !src) {
      setResolved(undefined);
      return;
    }
    if (!isPackageRelativeAsset(src)) {
      setResolved(src);
      return;
    }
    let cancelled = false;
    void resolveAssetUrl(paperId, src.replace(/^\.\//, "")).then((url) => {
      if (!cancelled) setResolved(url ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [paperId, src]);

  return resolved;
}
