import { useCallback, useMemo } from "react";
import type { Section } from "../../types/paper";
import { sectionDisplayTitle } from "../../services/translation/quality";
import styles from "./Outline.module.css";

type OutlineProps = {
  sections: Section[];
  activeSection: string | null;
  onSectionClick: (sectionId: string) => void;
};

function flattenSectionIds(sections: Section[], roots: Section[]): string[] {
  const out: string[] = [];
  const walk = (section: Section) => {
    out.push(section.id);
    sections
      .filter((s) => s.parentSectionId === section.id)
      .forEach((child) => walk(child));
  };
  roots.forEach((section) => walk(section));
  return out;
}

export function Outline({
  sections,
  activeSection,
  onSectionClick,
}: OutlineProps) {
  const rootSections = useMemo(
    () => sections.filter((s) => s.parentSectionId === null),
    [sections]
  );
  const flatIds = useMemo(
    () => flattenSectionIds(sections, rootSections),
    [sections, rootSections]
  );

  const focusSectionButton = (sectionId: string) => {
    document
      .querySelector<HTMLButtonElement>(`[data-outline-section="${sectionId}"]`)
      ?.focus();
  };

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, sectionId: string) => {
      const index = flatIds.indexOf(sectionId);
      if (index < 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusSectionButton(flatIds[Math.min(flatIds.length - 1, index + 1)]);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusSectionButton(flatIds[Math.max(0, index - 1)]);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusSectionButton(flatIds[0]);
      } else if (event.key === "End") {
        event.preventDefault();
        focusSectionButton(flatIds[flatIds.length - 1]);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSectionClick(sectionId);
      }
    },
    [flatIds, onSectionClick]
  );

  const renderSection = (section: Section) => {
    const children = sections.filter((s) => s.parentSectionId === section.id);
    const isActive = activeSection === section.id;

    return (
      <li key={section.id} className={styles.item}>
        <button
          type="button"
          className={`${styles.link} ${isActive ? styles.active : ""}`}
          style={{ paddingLeft: `${(section.level - 1) * 16 + 12}px` }}
          data-outline-section={section.id}
          aria-current={isActive ? "location" : undefined}
          onClick={() => onSectionClick(section.id)}
          onKeyDown={(event) => handleKeyDown(event, section.id)}
        >
          <span className={styles.title}>{sectionDisplayTitle(section)}</span>
        </button>
        {children.length > 0 && (
          <ul className={styles.sublist}>
            {children.map((child) => renderSection(child))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className={styles.container} aria-label="目次">
      <h2 className={styles.heading}>目次</h2>
      <ul className={styles.list} role="list">
        {rootSections.map((section) => renderSection(section))}
      </ul>
    </nav>
  );
}
