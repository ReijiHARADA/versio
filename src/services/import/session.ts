export const activeImportPaperIds = new Set<string>();
export const resumingPapers = new Set<string>();
/** AbortControllers for in-flight resumeIncompleteTranslation runs. */
export const resumeAbortControllers = new Map<string, AbortController>();
