import { useRef, useState } from "react";
import type { SearchRelation } from "../../domain/search/searchQuery";
import { useLibrarySearchQuery } from "../../hooks/useLibraryPaperSearch";
import { useAppStore } from "../../stores/appStore";
import { useProjectStore } from "../../stores/projectStore";
import { InfoPopover } from "../reader/InfoPopover";
import type { AnchorBox } from "../reader/memo/popoverPosition";
import { Presence } from "../ui/Presence";
import { Toggle } from "../ui/Toggle";
import styles from "./SearchExpansionButton.module.css";

const RELATION_LABEL: Record<SearchRelation, string> = {
  exact: "",
  variant: "表記ゆれ",
  abbr: "略語",
  expansion: "正式名称",
  translation: "訳語",
  synonym: "類義語",
};

/**
 * In the library search field: how many dictionary variants (synonyms,
 * translations, abbreviations, spellings) the search also matches, with a
 * Popover to switch each one or the whole feature (UI principles: local
 * operation → Popover).
 */
export function SearchExpansionButton({ query }: { query: string }) {
  const searchQuery = useLibrarySearchQuery(query);
  const synonymsOn = useAppStore(
    (state) => state.displaySettings.searchSynonyms !== false,
  );
  const setDisplaySettings = useAppStore((state) => state.setDisplaySettings);
  const setOverride = useProjectStore((state) => state.setSearchOverride);
  const [anchor, setAnchor] = useState<AnchorBox | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const groups = searchQuery.groups.filter(
    (group) => group.suggestions.length > 0,
  );
  const activeCount = searchQuery.groups.reduce(
    (sum, group) => sum + group.variants.length - 1,
    0,
  );
  if (synonymsOn && groups.length === 0 && !anchor) return null;

  return (
    <>
      <span className={styles.slot}>
        <button
          ref={buttonRef}
          type="button"
          className={styles.button}
          data-off={synonymsOn ? undefined : ""}
          data-testid="search-expansion"
          title={
            synonymsOn
              ? `類義語・訳語なども検索中（${activeCount} 語）`
              : "類義語・訳語の検索はオフ"
          }
          aria-label={
            synonymsOn
              ? `類義語・訳語なども検索中、${activeCount} 語`
              : "類義語・訳語の検索はオフ"
          }
          aria-haspopup="dialog"
          aria-expanded={anchor != null}
          // Keep focus in the search field.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;
            setAnchor(
              anchor
                ? null
                : {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  },
            );
          }}
        >
          {synonymsOn ? `+${activeCount}` : "≈"}
        </button>
      </span>
      <Presence>
        {anchor && (
          <InfoPopover
            anchor={anchor}
            title="類義語・訳語も検索"
            onClose={() => setAnchor(null)}
          >
            <label className={styles.master}>
              <span>辞書の言い換えも検索する</span>
              <Toggle
                checked={synonymsOn}
                onChange={(checked) =>
                  setDisplaySettings({ searchSynonyms: checked })
                }
                aria-label="辞書の言い換えも検索する"
              />
            </label>
            {synonymsOn && groups.length === 0 ? (
              <p className={styles.empty}>この語の言い換えは辞書にありません</p>
            ) : null}
            {synonymsOn
              ? groups.map((group) => (
                  <section key={group.term} className={styles.group}>
                    <h3 className={styles.term}>{group.variants[0].label}</h3>
                    <div className={styles.chips}>
                      {group.suggestions.map((variant) => (
                        <button
                          key={variant.term}
                          type="button"
                          className={styles.chip}
                          aria-pressed={variant.active}
                          title={
                            variant.active
                              ? "クリックで外す"
                              : "クリックで検索に含める"
                          }
                          onClick={() =>
                            setOverride(variant.term, !variant.active)
                          }
                        >
                          {variant.label}
                          <span className={styles.relation}>
                            {RELATION_LABEL[variant.relation]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              : null}
          </InfoPopover>
        )}
      </Presence>
    </>
  );
}
