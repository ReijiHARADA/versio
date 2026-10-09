#!/usr/bin/env node
/**
 * Build-time license inventory for Settings → ライセンス.
 *
 * Collects declared licenses + LICENSE/NOTICE texts from:
 * - Paper Reader (LICENSE)
 * - npm production dependency closure (non-optional)
 * - Rust crates linked via src-tauri (cargo metadata resolve)
 * - Python packages in the bundled translation-server/venv
 * - Curated distributed assets / model weights (with verified sources only)
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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const OUT_DIR = path.join(ROOT, "src", "generated");
const OUT_JSON = path.join(OUT_DIR, "thirdPartyLicenses.json");

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

function addPackage(entry) {
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

// ---------------------------------------------------------------------------
// Paper Reader
// ---------------------------------------------------------------------------

function collectApp() {
  const licensePath = path.join(ROOT, "LICENSE");
  const licenseText = readText(licensePath);
  const textKey = storeText(licenseText);
  const copyright = extractCopyright(licenseText);
  addPackage({
    id: "app:paper-reader",
    name: "Paper Reader",
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
  });
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
  // Resolved path hint from lock (npm v2+ may include "resolved" only)
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
// Rust
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
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
    meta = JSON.parse(raw);
  } catch (error) {
    warnings.push(`cargo metadata 失敗: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const resolvedIds = new Set((meta.resolve?.nodes ?? []).map((n) => n.id));
  for (const pkg of meta.packages ?? []) {
    if (!resolvedIds.has(pkg.id)) continue;
    if (pkg.name === "app" && pkg.manifest_path?.includes(`${path.sep}src-tauri${path.sep}`)) {
      continue; // covered by Paper Reader entry
    }

    const version = pkg.version ?? "?";
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
}

// ---------------------------------------------------------------------------
// Python (bundled venv)
// ---------------------------------------------------------------------------

function collectPython() {
  const venv = path.join(ROOT, "translation-server", "venv");
  if (!existsSync(venv)) {
    warnings.push(
      "translation-server/venv が無いため Python 依存を収集できませんでした（npm run bundle:python 後に再生成）"
    );
    return;
  }

  const sitePackages = findSitePackages(venv);
  if (!sitePackages) {
    warnings.push("translation-server/venv 内に site-packages が見つかりません");
    return;
  }

  const distInfos = readdirSync(sitePackages)
    .filter((name) => name.endsWith(".dist-info"))
    .map((name) => path.join(sitePackages, name))
    .filter((p) => statSync(p).isDirectory());

  for (const distInfo of distInfos) {
    const meta = parseDistInfoMetadata(path.join(distInfo, "METADATA"));
    if (!meta.name) continue;

    // Skip the editable / local project if any
    if (meta.name.toLowerCase() === "paper-reader") continue;

    const version = meta.version ?? "?";
    const license =
      meta.licenseExpression ||
      meta.license ||
      null;
    const { licenseText, noticeText } = resolvePythonLicenseTexts(distInfo, meta);
    const textKey = storeText(licenseText);
    const noticeKey = storeText(noticeText);
    const copyright = extractCopyright(licenseText) ?? extractCopyright(noticeText);
    const status = packageStatus(license, textKey);

    addPackage({
      id: `python:${meta.name}@${version}`,
      name: meta.name,
      version,
      ecosystem: "python",
      license,
      copyright,
      textKey,
      noticeKey,
      status,
      notes: statusNotes(status, license, textKey),
    });
  }
}

function findSitePackages(venvRoot) {
  const lib = path.join(venvRoot, "lib");
  if (!existsSync(lib)) return null;
  for (const entry of readdirSync(lib)) {
    const candidate = path.join(lib, entry, "site-packages");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function parseDistInfoMetadata(filePath) {
  const raw = readText(filePath) ?? "";
  /** @type {Record<string, string>} */
  const fields = {};
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith(" ")) continue;
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in fields)) fields[key] = value;
  }
  return {
    name: fields.Name ?? null,
    version: fields.Version ?? null,
    license: fields.License && fields.License !== "UNKNOWN" ? fields.License : null,
    licenseExpression: fields["License-Expression"] ?? null,
    licenseFile: fields["License-File"] ?? null,
  };
}

function resolvePythonLicenseTexts(distInfo, meta) {
  // Prefer licenses/ inside dist-info (PEP 639 layout).
  let { licenseText, noticeText } = resolveLicenseFiles(distInfo);

  const licenseFileCandidates = [];
  if (meta.licenseFile) {
    licenseFileCandidates.push(
      path.join(distInfo, meta.licenseFile),
      path.join(distInfo, "licenses", meta.licenseFile),
      path.join(distInfo, "license_files", meta.licenseFile)
    );
  }
  for (const candidate of licenseFileCandidates) {
    if (!licenseText && existsSync(candidate) && statSync(candidate).isFile()) {
      licenseText = readText(candidate);
    }
  }

  const licensesSub = path.join(distInfo, "licenses");
  if (existsSync(licensesSub)) {
    const found = resolveLicenseFiles(licensesSub);
    if (!licenseText) licenseText = found.licenseText;
    if (!noticeText) noticeText = found.noticeText;
  }

  return { licenseText, noticeText };
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

  // MADLAD-400 weights are downloaded for the translation server (not MIT).
  // License type confirmed from Hugging Face model card (see THIRD_PARTY_NOTICES.md).
  // Full text: use the Apache-2.0 text already present in a dependency if available,
  // otherwise mark partial with expression only (do not fabricate alternate terms).
  const apacheText =
    findApache20TextFromTree() ??
    null;
  const madladTextKey = storeText(apacheText);
  addPackage({
    id: "model:google/madlad400-3b-mt",
    name: "MADLAD-400 3B MT (model weights)",
    version: "google/madlad400-3b-mt",
    ecosystem: "model",
    license: "Apache-2.0",
    copyright: null,
    textKey: madladTextKey,
    noticeKey: null,
    status: packageStatus("Apache-2.0", madladTextKey),
    notes: madladTextKey
      ? "ライセンス種別は Hugging Face モデルカード（license: apache-2.0）で確認。全文は依存ツリー内の Apache-2.0 テキストを再利用。"
      : "ライセンス種別はモデルカードで Apache-2.0 と確認済みだが、全文テキストを依存ツリーから取得できませんでした。",
  });
}

function readInstalledVersion(name) {
  const pkg = readPackageJson(path.join(ROOT, "node_modules", ...name.split("/")));
  return pkg?.version ?? null;
}

function findApache20TextFromTree() {
  // Prefer a clearly named Apache license file from known packages.
  const candidates = [
    path.join(ROOT, "node_modules", "pdfjs-dist", "LICENSE"),
    path.join(ROOT, "node_modules", "@tauri-apps", "api", "LICENSE_APACHE-2.0"),
  ];
  for (const c of candidates) {
    const text = readText(c);
    if (text && /Apache License/i.test(text) && /Version 2\.0/i.test(text)) {
      return text;
    }
  }
  // Fall back to any stored text already collected that looks like Apache-2.0
  for (const text of texts.values()) {
    if (/Apache License/i.test(text) && /Version 2\.0/i.test(text) && text.length > 500) {
      return text;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function writeOutput() {
  mkdirSync(OUT_DIR, { recursive: true });

  const packages = [...packagesById.values()].sort((a, b) => {
    const eco = String(a.ecosystem).localeCompare(String(b.ecosystem));
    if (eco !== 0) return eco;
    return String(a.name).localeCompare(String(b.name)) || String(a.version).localeCompare(String(b.version));
  });

  const textObj = Object.fromEntries([...texts.entries()].sort((a, b) => a[0].localeCompare(b[0])));

  const inventory = {
    generatedAt: new Date().toISOString(),
    generatorVersion: 1,
    packages,
    texts: textObj,
    warnings,
    summary: {
      total: packages.length,
      byEcosystem: countBy(packages, "ecosystem"),
      byStatus: countBy(packages, "status"),
      uniqueTexts: texts.size,
    },
  };

  writeFileSync(OUT_JSON, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

  const unknown = packages.filter((p) => p.status === "unknown").length;
  const partial = packages.filter((p) => p.status === "partial").length;
  console.log(
    `generate-licenses: ${packages.length} packages, ${texts.size} unique texts, unknown=${unknown}, partial=${partial}, warnings=${warnings.length}`
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
  collectPython();
  collectCurated();
  // Re-run curated apache text pickup after tree texts exist
  const madlad = packagesById.get("model:google/madlad400-3b-mt");
  if (madlad && !madlad.textKey) {
    const apache = findApache20TextFromTree();
    if (apache) {
      madlad.textKey = storeText(apache);
      madlad.status = packageStatus(madlad.license, madlad.textKey);
      madlad.notes = statusNotes(madlad.status, madlad.license, madlad.textKey);
    }
  }
  writeOutput();
}

main();
