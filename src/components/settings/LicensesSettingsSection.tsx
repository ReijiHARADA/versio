import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  ECOSYSTEM_LABELS,
  STATUS_LABELS,
  filterLicensePackages,
  loadLicenseInventory,
} from "../../data/licenses";
import type {
  LicenseEcosystem,
  LicenseInventory,
  LicensePackage,
} from "../../types/licenses";
import { SettingsCard } from "./SettingsPrimitives";
import { LicenseTextSheet } from "./LicenseTextSheet";
import styles from "./SettingsScreen.module.css";
import licenseStyles from "./LicensesSettingsSection.module.css";

const FILTERS: Array<{ id: LicenseEcosystem | "all"; label: string }> = [
  { id: "all", label: "すべて" },
  { id: "app", label: ECOSYSTEM_LABELS.app },
  { id: "npm", label: ECOSYSTEM_LABELS.npm },
  { id: "python", label: ECOSYSTEM_LABELS.python },
  { id: "rust", label: ECOSYSTEM_LABELS.rust },
  { id: "model", label: ECOSYSTEM_LABELS.model },
  { id: "asset", label: ECOSYSTEM_LABELS.asset },
];

export function LicensesSettingsSection() {
  const [inventory, setInventory] = useState<LicenseInventory | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ecosystem, setEcosystem] = useState<LicenseEcosystem | "all">("all");
  const [selected, setSelected] = useState<LicensePackage | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLicenseInventory()
      .then((data) => {
        if (!cancelled) setInventory(data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "ライセンス情報を読み込めませんでした"
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const appPackage = useMemo(
    () => inventory?.packages.find((pkg) => pkg.ecosystem === "app") ?? null,
    [inventory]
  );

  const listPackages = useMemo(() => {
    if (!inventory) return [];
    const filtered = filterLicensePackages(inventory.packages, query, ecosystem);
    if (ecosystem === "app") return filtered;
    return filtered.filter((pkg) => pkg.ecosystem !== "app");
  }, [ecosystem, inventory, query]);

  const unknownCount = inventory?.summary.byStatus.unknown ?? 0;
  const partialCount = inventory?.summary.byStatus.partial ?? 0;

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>ライセンス</h2>

      <div className={styles.cardStack}>
        {appPackage ? (
          <SettingsCard title="Versio">
            <button
              type="button"
              className={licenseStyles.packageRow}
              onClick={() => setSelected(appPackage)}
            >
              <span className={licenseStyles.packageMain}>
                <span className={licenseStyles.packageName}>{appPackage.name}</span>
                <span className={licenseStyles.packageMeta}>
                  MIT License · v{appPackage.version}
                </span>
              </span>
              <span className={licenseStyles.packageAction}>
                全文
                <ChevronRight size={16} aria-hidden="true" />
              </span>
            </button>
            <p className={licenseStyles.hint}>
              本体ソースコードは MIT License です。翻訳モデルや依存ライブラリにはそれぞれのライセンスが適用されます。
            </p>
          </SettingsCard>
        ) : null}

        <SettingsCard title="サードパーティ">
          {!inventory && !loadError ? (
            <p className={licenseStyles.empty}>読み込み中…</p>
          ) : null}
          {loadError ? <p className={licenseStyles.empty}>{loadError}</p> : null}

          {inventory ? (
            <>
              <div className={licenseStyles.toolbar}>
                <label className={licenseStyles.search}>
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ライブラリ名・ライセンスを検索"
                    aria-label="ライセンスを検索"
                  />
                </label>
                <div className={licenseStyles.filters} role="tablist" aria-label="依存の種類">
                  {FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={ecosystem === filter.id}
                      className={`${licenseStyles.filterChip} ${
                        ecosystem === filter.id ? licenseStyles.filterChipActive : ""
                      }`}
                      onClick={() => setEcosystem(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className={licenseStyles.summary}>
                {listPackages.length} 件
                {unknownCount > 0 || partialCount > 0
                  ? `（要確認 ${unknownCount} / 一部未確認 ${partialCount}）`
                  : null}
              </p>

              {listPackages.length === 0 ? (
                <p className={licenseStyles.empty}>一致するライブラリはありません</p>
              ) : (
                <ul className={licenseStyles.list}>
                  {listPackages.map((pkg) => (
                    <li key={pkg.id}>
                      <button
                        type="button"
                        className={licenseStyles.packageRow}
                        onClick={() => setSelected(pkg)}
                      >
                        <span className={licenseStyles.packageMain}>
                          <span className={licenseStyles.packageName}>{pkg.name}</span>
                          <span className={licenseStyles.packageMeta}>
                            {[
                              `v${pkg.version}`,
                              ECOSYSTEM_LABELS[pkg.ecosystem],
                              pkg.license ?? "種別未確認",
                            ].join(" · ")}
                          </span>
                        </span>
                        <span className={licenseStyles.packageSide}>
                          {pkg.status !== "ok" ? (
                            <span
                              className={
                                pkg.status === "unknown"
                                  ? licenseStyles.badgeUnknown
                                  : licenseStyles.badgePartial
                              }
                            >
                              {STATUS_LABELS[pkg.status]}
                            </span>
                          ) : null}
                          <ChevronRight size={16} aria-hidden="true" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </SettingsCard>
      </div>

      <LicenseTextSheet
        inventory={inventory}
        pkg={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
