import { describe, expect, it } from "vitest";
import {
  filterLicensePackages,
  getLicenseText,
  loadLicenseInventory,
} from "../data/licenses";

describe("license inventory", () => {
  it("includes Versio MIT and production ecosystems", async () => {
    const inventory = await loadLicenseInventory();
    expect(inventory.generatorVersion).toBe(2);
    expect(inventory.packages.length).toBeGreaterThan(10);

    const app = inventory.packages.find((pkg) => pkg.id === "app:versio");
    expect(app?.license).toBe("MIT");
    expect(getLicenseText(inventory, app!)).toMatch(/MIT License/);

    const ecosystems = new Set(inventory.packages.map((pkg) => pkg.ecosystem));
    expect(ecosystems.has("npm")).toBe(true);
    expect(ecosystems.has("rust")).toBe(true);
    expect(ecosystems.has("python")).toBe(true);
  });

  it("omits non-distributed and no-attribution-electable packages", async () => {
    const inventory = await loadLicenseInventory();
    expect(inventory.summary.skippedNonDistributed).toBeGreaterThan(0);

    // Windows / GTK-only crates must not appear in the macOS inventory.
    const names = new Set(inventory.packages.map((pkg) => pkg.name));
    expect(names.has("windows-sys")).toBe(false);
    expect(names.has("webview2-com")).toBe(false);
    expect(names.has("webkit2gtk")).toBe(false);

    // Unlicense OR MIT (and similar) — Unlicense can be elected, so omit.
    const electable = inventory.packages.filter((pkg) =>
      /^(Unlicense\s+OR\s+MIT|0BSD\s+OR\s+MIT|CC0-1\.0\s+OR)/i.test(pkg.license ?? "")
    );
    expect(electable).toEqual([]);
  });

  it("does not invent SPDX for packages without declared license metadata", async () => {
    const inventory = await loadLicenseInventory();
    const invented = inventory.packages.filter(
      (pkg) => pkg.status === "unknown" && pkg.license != null
    );
    expect(invented).toEqual([]);
  });

  it("filters by query and ecosystem", async () => {
    const inventory = await loadLicenseInventory();
    const reactHits = filterLicensePackages(inventory.packages, "react", "npm");
    expect(reactHits.some((pkg) => pkg.name === "react")).toBe(true);
    expect(reactHits.every((pkg) => pkg.ecosystem === "npm")).toBe(true);

    const empty = filterLicensePackages(inventory.packages, "___no_such_package___", "all");
    expect(empty).toEqual([]);
  });
});
