import { useCallback, useMemo } from "react";
import type { Section } from "../../types/paper";
import { sectionDisplayTitle } from "../../services/translation/quality";
import styles from "./Outline.module.css";

type OutlineProps = {
  sections: Section[];
  activeSection: string | null;
  onSectionClick: (sectionId: string) => void;
};

type OutlineTree = {
  roots: Section[];
  children: Map<string, Section[]>;
};

function buildOutlineTree(sections: Section[]): OutlineTree {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const ids = new Set(ordered.map((section) => section.id));
  const children = new Map<string, Section[]>();
  const roots: Section[] = [];
  const stack: Section[] = [];

  for (const section of ordered) {
    // Older packages may contain the level but no parent relation. Reconstruct
    // that relation for navigation only, without mutating persisted sections.
    while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
      stack.pop();
    }
    const inferredParent = stack[stack.length - 1]?.id ?? null;
    const parentId = section.parentSectionId && ids.has(section.parentSectionId)
      ? section.parentSectionId
      : inferredParent;
    if (parentId) {
      const siblings = children.get(parentId) ?? [];
      siblings.push(section);
      children.set(parentId, siblings);
    } else {
      roots.push(section);
    }
    stack.push(section);
  }
  return { roots, children };
}

function flattenSectionIds(tree: OutlineTree): string[] {
  const out: string[] = [];
  const walk = (section: Section) => {
    out.push(section.id);
    tree.children.get(section.id)?.forEach(walk);
  };
  tree.roots.forEach((section) => walk(section));
  return out;
}

export function Outline({
  sections,
  activeSection,
  onSectionClick,
}: OutlineProps) {
  const tree = useMemo(() => buildOutlineTree(sections), [sections]);
  const flatIds = useMemo(
    () => flattenSectionIds(tree),
    [tree]
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
    const children = tree.children.get(section.id) ?? [];
    const isActive = activeSection === section.id;

    return (
      <li key={section.id} className={styles.item}>
        <button
          type="button"
          className={`${styles.link} ${isActive ? styles.active : ""}`}
          style={{ paddingLeft: `${Math.max(0, section.level - 1) * 16 + 16}px` }}
          data-outline-section={section.id}
          aria-current={isActive ? "location" : undefined}
          onClick={() => onSectionClick(section.id)}
          onKeyDown={(event) => handleKeyDown(event, section.id)}
        >
          <span className={styles.title}>{sectionDisplayTitle(section)}</span>
        </button>
        {children.length > 0 && (
          <ul className={styles.sublist} aria-label={`${sectionDisplayTitle(section)}の下位項目`}>
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
        {tree.roots.map((section) => renderSection(section))}
      </ul>
    </nav>
  );
}
