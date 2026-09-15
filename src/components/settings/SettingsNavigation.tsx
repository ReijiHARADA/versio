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
  return (
    <nav className={styles.nav} aria-label="設定カテゴリ">
      <ul className={styles.list}>
        {SETTINGS_SECTIONS.map((section) => {
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
    </nav>
  );
}
