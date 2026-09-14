import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PaperBlock } from "../../../types/paper";
import {
  listSearchHits,
  paintCurrentSearchHit,
  scrollToSearchHit,
  wrapSearchHitIndex,
} from "../../../utils/searchHits";
import type { ReaderContentHandle } from "../PaperContent";

export function useReaderSearch(opts: {
  contentRef: RefObject<HTMLDivElement | null>;
  paperContentRef: RefObject<ReaderContentHandle | null>;
  storeBlocks: PaperBlock[];
}) {
  const { contentRef, paperContentRef, storeBlocks } = opts;

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHitIndex, setSearchHitIndex] = useState(0);
  const [searchHitCount, setSearchHitCount] = useState(0);
  const searchHitIndexRef = useRef(0);
  const searchQueryRef = useRef(searchQuery);
  const showSearchRef = useRef(showSearch);
  searchQueryRef.current = searchQuery;
  showSearchRef.current = showSearch;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  const applySearchHits = useCallback(
    (opts: { reset?: boolean; delta?: number; scroll?: boolean }) => {
      const root = contentRef.current;
      const query = searchQueryRef.current;
      const open = showSearchRef.current;
      if (!root || !open || query.length < 2) {
        searchHitIndexRef.current = 0;
        setSearchHitIndex(0);
        setSearchHitCount(0);
        return;
      }

      const hits = listSearchHits(root);
      setSearchHitCount(hits.length);

      let next = searchHitIndexRef.current;
      if (opts.reset) next = 0;
      if (typeof opts.delta === "number" && hits.length > 0) {
        next = wrapSearchHitIndex(next, hits.length, opts.delta);
      }
      if (hits.length === 0) next = 0;
      else next = Math.min(Math.max(0, next), hits.length - 1);

      searchHitIndexRef.current = next;
      setSearchHitIndex(next);
      if (hits.length === 0) return;
      if (opts.scroll) scrollToSearchHit(hits, next);
      else paintCurrentSearchHit(hits, next);
    },
    [contentRef]
  );

  useLayoutEffect(() => {
    applySearchHits({ reset: true, scroll: searchQuery.length >= 2 });
  }, [searchQuery, showSearch, applySearchHits]);

  useLayoutEffect(() => {
    if (!showSearch || searchQuery.length < 2) return;
    applySearchHits({ scroll: false });
  }, [storeBlocks, showSearch, searchQuery, applySearchHits]);

  useEffect(() => {
    if (!showSearch) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      if (target instanceof HTMLElement) {
        const inSearchPanel = Boolean(target.closest("[data-search-panel]"));
        const tag = target.tagName;
        const typingElsewhere =
          !inSearchPanel &&
          (tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable);
        if (typingElsewhere) return;
      }

      if (searchQueryRef.current.length < 2) return;

      if (e.key === "ArrowDown" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        applySearchHits({ delta: 1, scroll: true });
      } else if (e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey)) {
        e.preventDefault();
        applySearchHits({ delta: -1, scroll: true });
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [showSearch, applySearchHits]);

  const handleSearchResultClick = useCallback(
    (blockId: string) => {
      void (async () => {
        await paperContentRef.current?.ensureBlockMounted(blockId);
        const root = contentRef.current;
        const blockEl = document.getElementById(`block-${blockId}`);
        if (root && blockEl) {
          const firstHit = blockEl.querySelector<HTMLElement>("[data-search-hit]");
          if (firstHit) {
            const hits = listSearchHits(root);
            const index = hits.indexOf(firstHit);
            if (index >= 0) {
              searchHitIndexRef.current = index;
              setSearchHitIndex(index);
              scrollToSearchHit(hits, index);
              return;
            }
          }
        }
        blockEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      })();
    },
    [contentRef, paperContentRef]
  );

  const handleSearchClose = useCallback(() => {
    setShowSearch(false);
    setSearchQuery("");
  }, []);

  return {
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    searchHitIndex,
    searchHitCount,
    applySearchHits,
    handleSearchResultClick,
    handleSearchClose,
  };
}
