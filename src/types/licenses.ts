export type LicenseEcosystem =
  | "app"
  | "npm"
  | "python"
  | "rust"
  | "model"
  | "asset";

export type LicenseStatus = "ok" | "unknown" | "partial";

export type LicensePackage = {
  id: string;
  name: string;
  version: string;
  ecosystem: LicenseEcosystem;
  license: string | null;
  copyright: string | null;
  textKey: string | null;
  noticeKey: string | null;
  status: LicenseStatus;
  notes?: string;
};

export type LicenseInventory = {
  generatedAt: string;
  generatorVersion: number;
  packages: LicensePackage[];
  texts: Record<string, string>;
  warnings: string[];
  summary: {
    total: number;
    byEcosystem: Record<string, number>;
    byStatus: Record<string, number>;
    uniqueTexts: number;
  };
};
