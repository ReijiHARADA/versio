import { useCallback, useEffect, useState } from "react";
import { getGlossary, saveGlossary } from "../../../services/database";
import type { GlossaryEntry } from "../../../services/llm/types";

export function useReaderGlossary(paperId: string | undefined) {
  const [glossary, setGlossaryState] = useState<GlossaryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!paperId) {
      setGlossaryState([]);
      return;
    }
    void getGlossary(paperId).then((entries) => {
      if (!cancelled) setGlossaryState(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  const setGlossary = useCallback(
    (entries: GlossaryEntry[]) => {
      setGlossaryState(entries);
      if (paperId) void saveGlossary(paperId, entries);
    },
    [paperId]
  );

  return { glossary, setGlossary };
}
