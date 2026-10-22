import { useEffect, useRef, type MutableRefObject } from "react";
import { getSetting } from "../../../services/database";
import {
  resumeIncompleteTranslation,
  type ImportConfig,
} from "../../../services/importServiceV2";
import { subscribeTranslationServerReady } from "../../../utils/serverReady";
import { upsertSection } from "../../../utils/mergePaperData";
import type { Paper, PaperBlock, Section } from "../../../types/paper";

export function useReaderTranslationResume(opts: {
  paperId: string | undefined;
  isLoading: boolean;
  blockBatcherRef: MutableRefObject<{ push: (block: PaperBlock) => void } | null>;
  updatePaper: (id: string, patch: Partial<Paper>) => void;
  setSectionsInStore: (
    paperId: string,
    updater: Section[] | ((prev: Section[]) => Section[])
  ) => void;
}) {
  const { paperId, isLoading, blockBatcherRef, updatePaper, setSectionsInStore } = opts;
  const resumeStartedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!paperId || isLoading) return;

    let cancelled = false;
    const runResume = async () => {
      const settings = await getSetting<ImportConfig>("translationSettingsV2");
      if (cancelled) return;
      await resumeIncompleteTranslation(
        paperId,
        {
          onBlockTranslated: (block) => {
            blockBatcherRef.current?.push(block);
          },
          onPaperUpdated: (updated) => {
            updatePaper(updated.id, updated);
          },
          onSectionTranslated: (section) => {
            setSectionsInStore(paperId, (prev) => upsertSection(prev, section));
          },
        },
        settings || {}
      );
    };

    // First open: try immediately (no-ops if the sidecar is still down).
    if (resumeStartedFor.current !== paperId) {
      resumeStartedFor.current = paperId;
      void runResume();
    }

    // When the sidecar becomes ready after a paper was opened early, resume again.
    const unsubscribe = subscribeTranslationServerReady(() => {
      if (!cancelled) void runResume();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [paperId, isLoading, blockBatcherRef, updatePaper, setSectionsInStore]);
}
