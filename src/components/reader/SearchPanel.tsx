import { useState, useMemo, useEffect } from "react";
import {
  CloseIcon as X,
  AltArrowUpIcon as ChevronUp,
  AltArrowDownIcon as ChevronDown,
} from "@solar-icons/react/linear";
import type { PaperBlock, Section } from "../../types/paper";
import { sectionDisplayTitle } from "../../services/translation/quality";
import styles from "./SearchPanel.module.css";
import { useMotionState } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

type SearchResult = {
  block: PaperBlock;
  section?: Section;
  matchType: "translated" | "original";
  snippet: string;
};

const MAX_RESULTS = 50;

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + length + 50);
  return (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
}

export function findSearchResults(
  blocks: PaperBlock[],
  sections: Section[],
  query: string
): SearchResult[] {
  if (query.length < 2) return [];
  const lowerQuery = query.toLowerCase();
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const results: SearchResult[] = [];
  for (const block of blocks) {
    if (block.type === "heading" || block.type === "reference") continue;
    const section = block.sectionId ? sectionMap.get(block.sectionId) : undefined;
    const translatedAt = block.translated?.toLowerCase().indexOf(lowerQuery) ?? -1;
    if (block.translated && translatedAt >= 0) {
      results.push({ block, section, matchType: "translated", snippet: snippetAround(block.translated, translatedAt, query.length) });
    } else {
      const originalAt = block.original?.toLowerCase().indexOf(lowerQuery) ?? -1;
      if (block.original && originalAt >= 0) {
        results.push({ block, section, matchType: "original", snippet: snippetAround(block.original, originalAt, query.length) });
      }
    }
    if (results.length === MAX_RESULTS) break;
  }
  return results;
}

/** Compact find bar over the paper: hit count and step. The query field is the title bar. */
export function SearchBar({
  hitIndex,
  hitCount,
  query,
  resultCount,
  onClose,
  onStep,
}: {
  hitIndex: number;
  hitCount: number;
  query: string;
  resultCount: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const motionState = useMotionState();
  return (
    <div
      className={`${styles.bar} ${motion.drop}`}
      data-motion={motionState}
      data-search-panel=""
      data-testid="reader-search-panel"
      role="search"
      aria-label="論文内検索"
    >
      <span className={styles.count} aria-live="polite">
        {query.length < 2
          ? "2 文字以上で検索"
          : hitCount > 0
            ? `${hitIndex + 1} / ${hitCount} 件`
            : resultCount > 0
              ? `原文に ${resultCount} 件`
              : "見つかりません"}
      </span>
      <button type="button" className={styles.stepButton} onClick={() => onStep(-1)} disabled={hitCount === 0} title="前のヒット（Shift+Enter）" aria-label="前のヒット">
        <ChevronUp size={14} />
      </button>
      <button type="button" className={styles.stepButton} onClick={() => onStep(1)} disabled={hitCount === 0} title="次のヒット（Enter）" aria-label="次のヒット">
        <ChevronDown size={14} />
      </button>
      <button type="button" className={styles.closeButton} onClick={onClose} title="検索を閉じる（Esc）" aria-label="検索を閉じる">
        <X size={14} />
      </button>
    </div>
  );
}

/** Results list the inspector shows while in-paper search is active. */
export function SearchResults({
  blocks,
  sections,
  query,
  onResultClick,
}: {
  blocks: PaperBlock[];
  sections: Section[];
  query: string;
  onResultClick: (blockId: string) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const results = useMemo(() => findSearchResults(blocks, sections, query), [query, blocks, sections]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const highlightMatch = (text: string): React.ReactNode => {
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.split(regex).map((part, i) =>
      i % 2 === 1 ? <mark key={i} className={styles.highlight}>{part}</mark> : part
    );
  };

  if (query.length < 2) {
    return <p className={styles.hint}>2 文字以上入力すると、ここに結果が並びます。</p>;
  }
  if (results.length === 0) {
    return <p className={styles.hint}>「{query}」は見つかりませんでした。</p>;
  }
  return (
    <div className={styles.results} data-search-panel="">
      <p className={styles.resultCount}>
        {results.length}件{results.length === MAX_RESULTS && "（最初の50件）"}
      </p>
      <ul className={styles.resultList}>
        {results.map((result, index) => (
          <li
            key={`${result.block.id}-${result.matchType}`}
            className={`${styles.resultItem} ${index === selectedIndex ? styles.selected : ""}`}
            data-testid="search-hit"
            onClick={() => {
              setSelectedIndex(index);
              onResultClick(result.block.id);
            }}
          >
            {result.section && <span className={styles.sectionName}>{sectionDisplayTitle(result.section)}</span>}
            <p className={styles.snippet}>{highlightMatch(result.snippet)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
