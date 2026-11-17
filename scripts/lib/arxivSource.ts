import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...listFiles(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function expandInputs(file: string, srcDir: string, depth = 0): string {
  const tex = fs.readFileSync(file, "utf8");
  if (depth > 5) return tex;
  return tex.replace(/\\(?:input|include)\s*\{([^}]+)\}/g, (m, name: string) => {
    const target = path.resolve(srcDir, name.trim().endsWith(".tex") ? name.trim() : `${name.trim()}.tex`);
    if (!target.startsWith(srcDir + path.sep) || !fs.existsSync(target) || fs.lstatSync(target).isSymbolicLink()) return m;
    return expandInputs(target, srcDir, depth + 1);
  });
}

/** Unpack an arXiv e-print into srcDir (once) and return the main .tex (inputs expanded) and its .bbl. */
export function unpackSource(archive: Buffer, srcDir: string): { mainTex: string; bbl: string | null } | null {
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
    const archivePath = `${srcDir}.eprint`;
    fs.writeFileSync(archivePath, archive);
    try {
      execFileSync("tar", ["-xzf", archivePath, "-C", srcDir], { stdio: "ignore" });
    } catch {
      try {
        fs.writeFileSync(path.join(srcDir, "main.tex"), execFileSync("gunzip", ["-c", archivePath]));
      } catch {
        return null;
      }
    }
  }
  const files = listFiles(srcDir);
  const mains = files.filter((f) => f.endsWith(".tex") && /\\begin\s*\{document\}/.test(fs.readFileSync(f, "utf8")));
  if (mains.length === 0) return null;
  const main = mains.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  const sameName = main.replace(/\.tex$/, ".bbl");
  const bblPath = fs.existsSync(sameName) ? sameName : files.find((f) => f.endsWith(".bbl"));
  return { mainTex: expandInputs(main, srcDir), bbl: bblPath ? fs.readFileSync(bblPath, "utf8") : null };
}
