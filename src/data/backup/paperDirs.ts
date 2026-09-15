/** Atomic persist leftovers — never treat as paper packages. */
export function isTransientPaperDirName(name: string): boolean {
  return name.endsWith(".tmp") || name.endsWith(".bak");
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/**
 * Collect top-level paper directory names under a papers/ listing.
 * Skips `.tmp` / `.bak` atomic-write leftovers.
 */
export function collectPaperPackageDirNames(
  files: string[],
  papersRoot: string
): string[] {
  const ids = new Set<string>();
  const root = normalize(papersRoot);
  for (const file of files) {
    const rel =
      file === root
        ? ""
        : file.startsWith(root + "/")
          ? file.slice(root.length + 1)
          : file.startsWith("papers/")
            ? file.slice("papers/".length)
            : null;
    if (!rel) continue;
    const id = rel.split("/")[0];
    if (!id || id.includes("..") || isTransientPaperDirName(id)) continue;
    ids.add(id);
  }
  return [...ids].sort();
}

/** True when `rel` (path under papers/) belongs to a transient package dir. */
export function isUnderTransientPaperDir(rel: string): boolean {
  const top = rel.split("/")[0] ?? "";
  return Boolean(top) && isTransientPaperDirName(top);
}
