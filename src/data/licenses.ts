import type {
  LicenseEcosystem,
  LicenseInventory,
  LicensePackage,
  LicenseStatus,
} from "../types/licenses";

export type { LicenseEcosystem, LicenseInventory, LicensePackage, LicenseStatus };

export const ECOSYSTEM_LABELS: Record<LicenseEcosystem, string> = {
  app: "Versio",
  npm: "npm",
  python: "Python",
  rust: "Rust",
  model: "モデル",
  asset: "アセット",
};

export const STATUS_LABELS: Record<LicenseStatus, string> = {
  ok: "確認済み",
  partial: "一部未確認",
  unknown: "要確認",
};

let cachedInventory: LicenseInventory | null = null;
let loadingPromise: Promise<LicenseInventory> | null = null;

export async function loadLicenseInventory(): Promise<LicenseInventory> {
  if (cachedInventory) return cachedInventory;
  if (!loadingPromise) {
    loadingPromise = import("../generated/thirdPartyLicenses.json").then((mod) => {
      const data = ("default" in mod ? mod.default : mod) as LicenseInventory;
      cachedInventory = data;
      return data;
    });
  }
  return loadingPromise;
}

export function getLicenseText(
  inventory: LicenseInventory,
  pkg: LicensePackage
): string | null {
  if (!pkg.textKey) return null;
  return inventory.texts[pkg.textKey] ?? null;
}

export function getNoticeText(
  inventory: LicenseInventory,
  pkg: LicensePackage
): string | null {
  if (!pkg.noticeKey) return null;
  return inventory.texts[pkg.noticeKey] ?? null;
}

export function filterLicensePackages(
  packages: LicensePackage[],
  query: string,
  ecosystem: LicenseEcosystem | "all"
): LicensePackage[] {
  const q = query.trim().toLowerCase();
  return packages.filter((pkg) => {
    if (ecosystem !== "all" && pkg.ecosystem !== ecosystem) return false;
    if (!q) return true;
    const haystack = [
      pkg.name,
      pkg.version,
      pkg.license ?? "",
      pkg.copyright ?? "",
      ECOSYSTEM_LABELS[pkg.ecosystem],
      pkg.notes ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
