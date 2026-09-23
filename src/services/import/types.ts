import type { Paper, PaperBlock, Section } from "../../types/paper";

export type ImportStage =
  | "idle"
  | "reading"
  | "extracting"
  | "structuring"
  | "glossary"
  | "translating"
  | "saving"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export type ImportProgress = {
  stage: ImportStage;
  stageProgress: number;
  stageTotal: number;
  message: string;
  paper?: Paper;
  sections?: Section[];
  blocks?: PaperBlock[];
  error?: string;
};

export type ImportCallbacks = {
  onProgress: (progress: ImportProgress) => void;
  onStageChange: (stage: ImportStage) => void;
  onPartialReady: (paper: Paper, sections: Section[], blocks: PaperBlock[]) => void;
  onBlockTranslated?: (block: PaperBlock) => void;
  onPaperUpdated?: (paper: Paper) => void;
  onSectionTranslated?: (section: Section) => void;
  /** Called after extraction/partial ready, before translation queue starts. */
  waitForTranslationEngine?: (signal?: AbortSignal) => Promise<boolean>;
  /** Cooperative cancellation; checked at safe checkpoints only. */
  signal?: AbortSignal;
};

export type ImportConfig = {
  madladServerUrl?: string;
  ollamaServerUrl?: string;
  ollamaModel?: string;
  /** Opt-in alternate translation after a primary failure or high-impact quality risk. */
  enableSelectiveCascade?: boolean;
  generateGlossary?: boolean;
  translationConcurrency?: number;
  useCache?: boolean;
};
