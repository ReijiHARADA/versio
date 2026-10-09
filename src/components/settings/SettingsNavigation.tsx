import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "../../utils/settingsToc";
import styles from "./SettingsNavigation.module.css";

type SettingsNavigationProps = {
  activeId: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
};

export function SettingsNavigation({ activeId, onSelect }: SettingsNavigationProps) {
  const mainSections = SETTINGS_SECTIONS.filter((section) => section.id !== "licenses");
  const licenseSection = SETTINGS_SECTIONS.find((section) => section.id === "licenses");

  return (
    <nav className={styles.nav} aria-label="設定カテゴリ">
      <ul className={styles.list}>
        {mainSections.map((section) => {
          const active = activeId === section.id;
          return (
            <li key={section.id}>
              <button
                type="button"
                className={`${styles.item} ${active ? styles.active : ""}`}
                onClick={() => onSelect(section.id)}
                aria-current={active ? "page" : undefined}
              >
                {section.label}
              </button>
            </li>
          );
        })}
      </ul>
      {licenseSection ? (
        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.item} ${activeId === licenseSection.id ? styles.active : ""}`}
            onClick={() => onSelect(licenseSection.id)}
            aria-current={activeId === licenseSection.id ? "page" : undefined}
          >
            {licenseSection.label}
          </button>
        </div>
      ) : null}
    </nav>
  );
}
