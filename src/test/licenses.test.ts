import { describe, expect, it } from "vitest";
import {
  filterLicensePackages,
  getLicenseText,
  loadLicenseInventory,
} from "../data/licenses";

describe("license inventory", () => {
  it("includes Paper Reader MIT and production ecosystems", async () => {
    const inventory = await loadLicenseInventory();
    expect(inventory.generatorVersion).toBe(1);
    expect(inventory.packages.length).toBeGreaterThan(10);

    const app = inventory.packages.find((pkg) => pkg.id === "app:paper-reader");
    expect(app?.license).toBe("MIT");
    expect(getLicenseText(inventory, app!)).toMatch(/MIT License/);

    const ecosystems = new Set(inventory.packages.map((pkg) => pkg.ecosystem));
    expect(ecosystems.has("npm")).toBe(true);
    expect(ecosystems.has("rust")).toBe(true);
    expect(ecosystems.has("python")).toBe(true);
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
