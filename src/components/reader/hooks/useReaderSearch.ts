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
  findSearchHitBlockIds,
  listSearchHits,
  paintCurrentSearchHit,
  scrollToSearchHit,
  wrapSearchHitIndex,
} from "../../../utils/searchHits";
import { isImeComposing } from "../../../utils/ime";
import { useProjectStore } from "../../../stores/projectStore";
import type { ReaderContentHandle } from "../PaperContent";

export function useReaderSearch(opts: {
  contentRef: RefObject<HTMLDivElement | null>;
  paperContentRef: RefObject<ReaderContentHandle | null>;
  storeBlocks: PaperBlock[];
}) {
  const { contentRef, paperContentRef, storeBlocks } = opts;

  // The title bar search field drives in-paper search while Reader is open.
  const searchQuery = useProjectStore((state) => state.searchQuery);
  const setSearchQuery = useProjectStore((state) => state.setSearchQuery);
  const showSearch = searchQuery.length > 0;
  const [searchHitIndex, setSearchHitIndex] = useState(0);
  const [searchHitCount, setSearchHitCount] = useState(0);
  const searchHitIndexRef = useRef(0);
  const searchQueryRef = useRef(searchQuery);
  const showSearchRef = useRef(showSearch);
  const storeBlocksRef = useRef(storeBlocks);
  searchQueryRef.current = searchQuery;
  showSearchRef.current = showSearch;
  storeBlocksRef.current = storeBlocks;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        const input = document.getElementById("library-search") as HTMLInputElement | null;
        input?.focus();
        input?.select();
      }
      if (e.key === "Escape" && showSearch) {
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch, setSearchQuery]);

  const mountAndScrollToHit = useCallback(
    async (index: number, blockIds: string[]) => {
      const root = contentRef.current;
      if (!root || blockIds.length === 0) return;
      const blockId = blockIds[Math.min(Math.max(index, 0), blockIds.length - 1)];
      await paperContentRef.current?.ensureBlockMounted(blockId);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const hits = listSearchHits(root);
      setSearchHitCount(hits.length);
      if (hits.length === 0) return;
      const clamped = Math.min(Math.max(index, 0), hits.length - 1);
      searchHitIndexRef.current = clamped;
      setSearchHitIndex(clamped);
      scrollToSearchHit(hits, clamped);
    },
    [contentRef, paperContentRef]
  );

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

      const blockIds = findSearchHitBlockIds(query, storeBlocksRef.current);
      setSearchHitCount(blockIds.length);

      let next = searchHitIndexRef.current;
      if (opts.reset) next = 0;
      if (typeof opts.delta === "number" && blockIds.length > 0) {
        next = wrapSearchHitIndex(next, blockIds.length, opts.delta);
      }
      if (blockIds.length === 0) next = 0;
      else next = Math.min(Math.max(0, next), blockIds.length - 1);

      searchHitIndexRef.current = next;
      setSearchHitIndex(next);

      if (blockIds.length === 0) return;

      if (opts.scroll) {
        void mountAndScrollToHit(next, blockIds);
        return;
      }

      const hits = listSearchHits(root);
      if (hits.length > 0) {
        const domIndex = Math.min(next, hits.length - 1);
        paintCurrentSearchHit(hits, domIndex);
      }
    },
    [contentRef, mountAndScrollToHit]
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
      if (isImeComposing(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      if (target instanceof HTMLElement) {
        const inSearchPanel =
          Boolean(target.closest("[data-search-panel]")) || target.id === "library-search";
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

  const handleSearchClose = useCallback(() => setSearchQuery(""), [setSearchQuery]);

  return {
    showSearch,
    searchQuery,
    searchHitIndex,
    searchHitCount,
    applySearchHits,
    handleSearchClose,
  };
}
