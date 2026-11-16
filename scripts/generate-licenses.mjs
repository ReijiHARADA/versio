#!/usr/bin/env node
/**
 * Build-time license inventory for Settings → ライセンス.
 *
 * Inclusion policy (掲載が必須のものだけ):
 * 1. Distributed with the macOS app — not build-only / not other-platform crates,
 *    not npm optionalDependencies, not unbundled Python.
 * 2. License requires notice / attribution in redistributed copies — or metadata is
 *    missing (kept as unknown/partial for review). Packages where a no-attribution
 *    alternative can be elected (0BSD, Unlicense, CC0-1.0, MIT-0, WTFPL) are omitted.
 *
 * Collects declared licenses + LICENSE/NOTICE texts from:
 * - Versio (LICENSE)
 * - npm production dependency closure (non-optional)
 * - Rust crates reachable for macOS targets via cargo tree (no-dev, no-build)
 * - Curated distributed assets / model weights (verified sources only)
 *
 * Does not invent license types. Missing metadata → status "unknown".
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OUT_DIR = path.join(ROOT, "src", "generated");
const OUT_JSON = path.join(OUT_DIR, "thirdPartyLicenses.json");

/** Distribution targets for Versio (Tauri macOS). */
const MACOS_TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin"];

/**
 * SPDX / common ids that do not require copyright notice republication
 * when that license is the elected alternative.
 */
const NO_ATTRIBUTION_LICENSES = new Set([
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "MIT-0",
  "WTFPL",
]);

const LICENSE_FILE_NAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENSE.MIT",
  "LICENSE-MIT",
  "LICENSE_MIT",
  "LICENSE.APACHE",
  "LICENSE-APACHE",
  "LICENSE_APACHE",
  "LICENSE_APACHE-2.0",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "COPYING.txt",
];

const NOTICE_FILE_NAMES = ["NOTICE", "NOTICE.md", "NOTICE.txt", "NOTICE.TXT"];

/** @typedef {"app"|"npm"|"python"|"rust"|"model"|"asset"} Ecosystem */
/** @typedef {"ok"|"unknown"|"partial"} LicenseStatus */

/** @type {Map<string, string>} */
const texts = new Map();
/** @type {string[]} */
const warnings = [];
/** @type {Map<string, object>} */
const packagesById = new Map();
/** @type {{ skippedNoAttribution: number, skippedNonDistributed: number }} */
const filterStats = { skippedNoAttribution: 0, skippedNonDistributed: 0 };

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function storeText(text) {
  if (!text || !text.trim()) return null;
  const normalized = text.replace(/\r\n/g, "\n").trimEnd() + "\n";
  const key = sha256(normalized);
  texts.set(key, normalized);
  return key;
}

function readText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findNamedFile(dir, names) {
  if (!dir || !existsSync(dir)) return null;
  for (const name of names) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // Case-insensitive fallback for mixed LICENSE casing
  try {
    const entries = readdirSync(dir);
    const lowerMap = new Map(entries.map((e) => [e.toLowerCase(), e]));
    for (const name of names) {
      const hit = lowerMap.get(name.toLowerCase());
      if (!hit) continue;
      const candidate = path.join(dir, hit);
      if (statSync(candidate).isFile()) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractCopyright(text) {
  if (!text) return null;
  const lines = text.split("\n").slice(0, 40);
  const hits = [];
  for (const line of lines) {
    const trimmed = line.replace(/^%%Copyright:\s*/i, "").trim();
    if (/copyright\s*[©(c)]/i.test(trimmed) || /^copyright\b/i.test(trimmed)) {
      hits.push(trimmed.replace(/^#+\s*/, ""));
    }
  }
  if (hits.length === 0) return null;
  return hits.slice(0, 3).join("\n");
}

/**
 * True when the redistributed work must carry a copyright / permission / NOTICE.
 * Missing metadata → true (keep for review). Dual-license expressions where a
 * no-attribution alternative can be elected → false.
 */
function requiresAttributionListing(license) {
  if (!license || !String(license).trim()) return true;

  let normalized = String(license)
    .replace(/\s*\/\s*/g, " OR ")
    .replace(/\s+/g, " ")
    .trim();

  // Compound AND: keep — cannot drop the whole package by electing one branch.
  if (/\bAND\b/i.test(normalized)) return true;

  const alts = normalized
    .split(/\s+OR\s+/i)
    .map((part) =>
      part
        .replace(/^\(+/, "")
        .replace(/\)+$/, "")
        .replace(/\s+WITH\s+.*/i, "")
        .trim()
    )
    .filter(Boolean);

  if (alts.length === 0) return true;

  const electableNoAttr = alts.some(
    (alt) => NO_ATTRIBUTION_LICENSES.has(alt) || /^public domain$/i.test(alt)
  );
  return !electableNoAttr;
}

function addPackage(entry, { force = false } = {}) {
  if (!force && entry.ecosystem !== "app" && !requiresAttributionListing(entry.license)) {
    filterStats.skippedNoAttribution += 1;
    return;
  }

  const existing = packagesById.get(entry.id);
  if (existing) {
    // Prefer entries that already have license text.
    if (!existing.textKey && entry.textKey) {
      packagesById.set(entry.id, { ...existing, ...entry });
    }
    return;
  }
  packagesById.set(entry.id, entry);
}

function resolveLicenseFiles(pkgDir) {
  const licensePath = findNamedFile(pkgDir, LICENSE_FILE_NAMES);
  let licenseText = licensePath ? readText(licensePath) : null;

  // Prefer licenses/ subdirectory contents when present (Python / some crates).
  const licensesDir = path.join(pkgDir, "licenses");
  if ((!licenseText || licenseText.length < 40) && existsSync(licensesDir)) {
    try {
      const files = readdirSync(licensesDir)
        .filter((f) => /license|copying|notice/i.test(f))
        .sort();
      const chunks = [];
      for (const f of files) {
        const body = readText(path.join(licensesDir, f));
        if (body?.trim()) chunks.push(`--- ${f} ---\n${body.trimEnd()}`);
      }
      if (chunks.length) licenseText = chunks.join("\n\n");
    } catch {
      /* ignore */
    }
  }

  // Dual-license crates often ship LICENSE-MIT + LICENSE-APACHE at root.
  if (!licenseText && pkgDir && existsSync(pkgDir)) {
    try {
      const dual = readdirSync(pkgDir)
        .filter((f) => /^license/i.test(f) || /^copying/i.test(f))
        .sort();
      const chunks = [];
      for (const f of dual) {
        const full = path.join(pkgDir, f);
        if (!statSync(full).isFile()) continue;
        const body = readText(full);
        if (body?.trim()) chunks.push(`--- ${f} ---\n${body.trimEnd()}`);
      }
      if (chunks.length) licenseText = chunks.join("\n\n");
    } catch {
      /* ignore */
    }
  }

  const noticePath = findNamedFile(pkgDir, NOTICE_FILE_NAMES);
  const noticeText = noticePath ? readText(noticePath) : null;
  return { licenseText, noticeText };
}

function packageStatus(license, textKey) {
  if (license && textKey) return "ok";
  if (license || textKey) return "partial";
  return "unknown";
}

function statusNotes(status, license, textKey) {
  if (status === "ok") return undefined;
  const parts = [];
  if (!license) parts.push("パッケージメタデータにライセンス表記がありません");
  if (!textKey) parts.push("LICENSE / NOTICE 全文をパッケージ同梱ファイルから取得できませんでした");
  return parts.join("。") + "。";
}

function cargoEnv() {
  const cargoHome = path.join(homedir(), ".cargo", "bin");
  const pathEnv = process.env.PATH ?? "";
  return {
    ...process.env,
    PATH: pathEnv.includes(cargoHome) ? pathEnv : `${cargoHome}${path.delimiter}${pathEnv}`,
  };
}

// ---------------------------------------------------------------------------
// Versio
// ---------------------------------------------------------------------------

function collectApp() {
  const licensePath = path.join(ROOT, "LICENSE");
  const licenseText = readText(licensePath);
  const textKey = storeText(licenseText);
  const copyright = extractCopyright(licenseText);
  addPackage(
    {
      id: "app:versio",
      name: "Versio",
      version: readPackageJsonVersion(),
      ecosystem: "app",
      license: "MIT",
      copyright,
      textKey,
      noticeKey: null,
      status: packageStatus("MIT", textKey),
      notes: textKey
        ? undefined
        : "リポジトリ直下の LICENSE を読めませんでした。",
    },
    { force: true }
  );
}

function readPackageJsonVersion() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---------------------------------------------------------------------------
// npm
// ---------------------------------------------------------------------------

function collectNpm() {
  const lockPath = path.join(ROOT, "package-lock.json");
  if (!existsSync(lockPath)) {
    warnings.push("package-lock.json が無いため npm 依存を収集できませんでした");
    return;
  }
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const packages = lock.packages ?? {};
  const root = packages[""] ?? {};
  const queue = Object.keys(root.dependencies ?? {});
  const visited = new Set();

  while (queue.length) {
    const name = queue.shift();
    if (!name || visited.has(name)) continue;
    visited.add(name);

    const entry = findLockPackageEntry(packages, name);
    if (!entry) {
      warnings.push(`npm: lock に ${name} が見つかりません`);
      continue;
    }

    const version = entry.version ?? "?";
    const pkgDir = resolveNodeModulesDir(name, entry);
    const pkgJson = pkgDir ? readPackageJson(pkgDir) : null;
    const license =
      normalizeLicenseField(pkgJson?.license) ??
      normalizeLicenseField(entry.license) ??
      null;
    const { licenseText, noticeText } = resolveLicenseFiles(pkgDir);
    const textKey = storeText(licenseText);
    const noticeKey = storeText(noticeText);
    const copyright = extractCopyright(licenseText) ?? extractCopyright(noticeText);
    const status = packageStatus(license, textKey);

    addPackage({
      id: `npm:${name}@${version}`,
      name,
      version,
      ecosystem: "npm",
      license,
      copyright,
      textKey,
      noticeKey,
      status,
      notes: statusNotes(status, license, textKey),
    });

    for (const dep of Object.keys(entry.dependencies ?? {})) {
      if (!visited.has(dep)) queue.push(dep);
    }
    // optionalDependencies are build/native helpers not shipped in the app bundle.
  }
}

function findLockPackageEntry(packages, name) {
  const direct = packages[`node_modules/${name}`];
  if (direct) return direct;
  // Scoped / nested: pick the shallowest match
  const suffix = `/node_modules/${name}`;
  const key = Object.keys(packages)
    .filter((k) => k === `node_modules/${name}` || k.endsWith(suffix))
    .sort((a, b) => a.length - b.length)[0];
  return key ? packages[key] : null;
}

function resolveNodeModulesDir(name, lockEntry) {
  const candidates = [
    path.join(ROOT, "node_modules", ...name.split("/")),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "package.json"))) return c;
  }
  void lockEntry;
  return null;
}

function readPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function normalizeLicenseField(license) {
  if (!license) return null;
  if (typeof license === "string") return license.trim() || null;
  if (typeof license === "object" && typeof license.type === "string") {
    return license.type.trim() || null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rust (macOS distribution graph only)
// ---------------------------------------------------------------------------

function collectRust() {
  const manifest = path.join(ROOT, "src-tauri", "Cargo.toml");
  if (!existsSync(manifest)) {
    warnings.push("src-tauri/Cargo.toml が無いため Rust 依存を収集できませんでした");
    return;
  }

  let meta;
  try {
    const raw = execFileSync(
      "cargo",
      ["metadata", "--format-version", "1", "--manifest-path", manifest],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: cargoEnv() }
    );
    meta = JSON.parse(raw);
  } catch (error) {
    warnings.push(`cargo metadata 失敗: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const distributedKeys = collectMacosDistributedCrateKeys(manifest);
  if (distributedKeys.size === 0) {
    warnings.push(
      "macOS 向け cargo tree が空のため Rust 依存を収集できませんでした"
    );
    return;
  }

  const resolvedIds = new Set((meta.resolve?.nodes ?? []).map((n) => n.id));
  let considered = 0;

  for (const pkg of meta.packages ?? []) {
    if (!resolvedIds.has(pkg.id)) continue;
    if (pkg.name === "app" && pkg.manifest_path?.includes(`${path.sep}src-tauri${path.sep}`)) {
      continue; // covered by Versio entry
    }

    const version = pkg.version ?? "?";
    const key = `${pkg.name}@${version}`;
    if (!distributedKeys.has(key)) {
      filterStats.skippedNonDistributed += 1;
      continue;
    }
    considered += 1;

    const license = typeof pkg.license === "string" && pkg.license.trim()
      ? pkg.license.trim()
      : null;
    const pkgDir = pkg.manifest_path ? path.dirname(pkg.manifest_path) : null;
    let licenseText = null;
    let noticeText = null;

    if (pkg.license_file && pkgDir) {
      licenseText = readText(path.join(pkgDir, pkg.license_file));
    }
    if (!licenseText && pkgDir) {
      const found = resolveLicenseFiles(pkgDir);
      licenseText = found.licenseText;
      noticeText = found.noticeText;
    } else if (pkgDir) {
      noticeText = resolveLicenseFiles(pkgDir).noticeText;
    }

    const textKey = storeText(licenseText);
    const noticeKey = storeText(noticeText);
    const copyright = extractCopyright(licenseText) ?? extractCopyright(noticeText);
    const status = packageStatus(license, textKey);

    addPackage({
      id: `rust:${pkg.name}@${version}`,
      name: pkg.name,
      version,
      ecosystem: "rust",
      license,
      copyright,
      textKey,
      noticeKey,
      status,
      notes: statusNotes(status, license, textKey),
    });
  }

  console.log(
    `  rust: macOS distributed crates=${distributedKeys.size}, considered=${considered}`
  );
}

/**
 * Union of crates linked into the macOS app binary (normal deps, excluding
 * build-dependencies and other-platform targets such as Windows / GTK).
 * @param {string} manifest
 * @returns {Set<string>} name@version keys
 */
function collectMacosDistributedCrateKeys(manifest) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const target of MACOS_TARGETS) {
    try {
      const raw = execFileSync(
        "cargo",
        [
          "tree",
          "--manifest-path",
          manifest,
          "--target",
          target,
          "-e",
          "no-dev,no-build",
          "--prefix",
          "none",
        ],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, env: cargoEnv() }
      );
      for (const line of raw.split("\n")) {
        const match = line.match(/^(\S+)\s+v(\S+)/);
        if (!match) continue;
        const name = match[1];
        const version = match[2].replace(/\(.*/, "").replace(/\*$/, "").trim();
        if (!name || !version || name === "app") continue;
        keys.add(`${name}@${version}`);
      }
    } catch (error) {
      warnings.push(
        `cargo tree (${target}) 失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Curated distributed assets / models (verified sources only)
// ---------------------------------------------------------------------------

function collectCurated() {
  // Adobe CMaps shipped via pdfjs-dist (bundled into the app for CID fonts).
  const cmapsLicense = path.join(ROOT, "node_modules", "pdfjs-dist", "cmaps", "LICENSE");
  if (existsSync(cmapsLicense)) {
    const licenseText = readText(cmapsLicense);
    const textKey = storeText(licenseText);
    addPackage({
      id: "asset:pdfjs-dist/cmaps",
      name: "Adobe CMaps (pdfjs-dist)",
      version: readInstalledVersion("pdfjs-dist") ?? "bundled",
      ecosystem: "asset",
      license: null, // No SPDX in file; do not invent. BSD-style text is preserved in full.
      copyright: extractCopyright(licenseText),
      textKey,
      noticeKey: null,
      status: textKey ? "partial" : "unknown",
      notes: textKey
        ? "SPDX 識別子はメタデータに無く、同梱 LICENSE 全文のみを保持しています。"
        : "pdfjs-dist/cmaps/LICENSE を読めませんでした。",
    });
  } else {
    warnings.push("node_modules/pdfjs-dist/cmaps/LICENSE が見つかりません");
  }

  // GROBID 0.9.1 CRF models, lexicons and feature code ported to TypeScript
  // (src/services/pdfExtraction/crf). License text copied from the GROBID repository.
  const grobidLicense = path.join(ROOT, "src", "services", "pdfExtraction", "crf", "GROBID-LICENSE.txt");
  if (existsSync(grobidLicense)) {
    addPackage({
      id: "asset:grobid-crf-models",
      name: "GROBID CRF models, lexicons and feature extraction (ported)",
      version: "0.9.1",
      ecosystem: "asset",
      license: "Apache-2.0",
      copyright: null,
      textKey: storeText(readText(grobidLicense)),
      noticeKey: null,
      status: "ok",
      notes: "GROBID (https://github.com/grobidOrg/grobid) の reference-segmenter / citation モデル（重みを刈り込み）、辞書、特徴量計算を TypeScript に移植・改変して同梱しています。",
    });
  } else {
    warnings.push("src/services/pdfExtraction/crf/GROBID-LICENSE.txt が見つかりません");
  }

  // PLaMo 3 Translate weights are downloaded on first use for the llama-server sidecar.
  const plamoTextKey = storeText(readText(path.join(ROOT, "licenses", "plamo-community-license.txt")));
  addPackage({
    id: "model:pfnet/plamo-3-translate-2b-GGUF",
    name: "PLaMo 3 Translate 2B (model weights) — Built with PLaMo",
    version: "4f672106b847200bfdc0f6af6c321cd94eba1aed",
    ecosystem: "model",
    license: "PLaMo Community License",
    copyright: "Preferred Networks, Inc.",
    textKey: plamoTextKey,
    noticeKey: null,
    status: packageStatus("PLaMo Community License", plamoTextKey),
    notes: "Built with PLaMo. 翻訳エンジンのモデル重み（初回利用時にダウンロード）。全文は licenses/plamo-community-license.txt（Hugging Face LICENSE/en を固定 revision で取得）。",
  }, { force: true });

  // llama-server sidecar (static build of llama.cpp b12110) with its linked MIT dependencies.
  const llamaTextKey = storeText(readText(path.join(ROOT, "licenses", "llama-cpp-LICENSE.txt")));
  addPackage({
    id: "binary:llama.cpp",
    name: "llama.cpp (llama-server)",
    version: "b12110",
    ecosystem: "asset",
    license: "MIT",
    copyright: "The ggml authors",
    textKey: llamaTextKey,
    noticeKey: null,
    status: packageStatus("MIT", llamaTextKey),
    notes: "翻訳サイドカーとして同梱。cpp-httplib (MIT) と nlohmann/json (MIT) の表記を含む。",
  });

}

function readInstalledVersion(name) {
  const pkg = readPackageJson(path.join(ROOT, "node_modules", ...name.split("/")));
  return pkg?.version ?? null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function pruneUnusedTexts(packages) {
  const used = new Set();
  for (const pkg of packages) {
    if (pkg.textKey) used.add(pkg.textKey);
    if (pkg.noticeKey) used.add(pkg.noticeKey);
  }
  for (const key of [...texts.keys()]) {
    if (!used.has(key)) texts.delete(key);
  }
}

function writeOutput() {
  mkdirSync(OUT_DIR, { recursive: true });

  const packages = [...packagesById.values()].sort((a, b) => {
    const eco = String(a.ecosystem).localeCompare(String(b.ecosystem));
    if (eco !== 0) return eco;
    return String(a.name).localeCompare(String(b.name)) || String(a.version).localeCompare(String(b.version));
  });

  pruneUnusedTexts(packages);

  const textObj = Object.fromEntries([...texts.entries()].sort((a, b) => a[0].localeCompare(b[0])));

  const inventory = {
    generatedAt: new Date().toISOString(),
    generatorVersion: 2,
    inclusionPolicy: {
      distributedOnly: true,
      platforms: ["macos"],
      rust: "cargo tree --target {aarch64,x86_64}-apple-darwin -e no-dev,no-build",
      skipElectableNoAttribution: [...NO_ATTRIBUTION_LICENSES],
    },
    packages,
    texts: textObj,
    warnings,
    summary: {
      total: packages.length,
      byEcosystem: countBy(packages, "ecosystem"),
      byStatus: countBy(packages, "status"),
      uniqueTexts: texts.size,
      skippedNoAttribution: filterStats.skippedNoAttribution,
      skippedNonDistributed: filterStats.skippedNonDistributed,
    },
  };

  writeFileSync(OUT_JSON, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const unknown = packages.filter((p) => p.status === "unknown").length;
  const partial = packages.filter((p) => p.status === "partial").length;
  console.log(
    `generate-licenses: ${packages.length} packages, ${texts.size} unique texts, unknown=${unknown}, partial=${partial}, warnings=${warnings.length}`
  );
  console.log(
    `  filtered: non-distributed=${filterStats.skippedNonDistributed}, no-attribution-electable=${filterStats.skippedNoAttribution}`
  );
  console.log(`  → ${path.relative(ROOT, OUT_JSON)}`);
  for (const w of warnings) console.warn(`  warn: ${w}`);
}

function countBy(items, key) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const item of items) {
    const k = String(item[key] ?? "?");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function main() {
  collectApp();
  collectNpm();
  collectRust();
  collectCurated();
  writeOutput();
}

main();
