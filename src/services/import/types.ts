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
  /** Build-gated presentation fixture; never persisted to user settings. */
  presentationDemo?: boolean;
  madladServerUrl?: string;
  ollamaServerUrl?: string;
  ollamaModel?: string;
  /** Optional ordered alternate-model candidates; used only with selective cascade. */
  ollamaModels?: string[];
  /** Opt-in alternate translation after a primary failure or high-impact quality risk. */
  enableSelectiveCascade?: boolean;
  /** Use macOS Apple Translation for eligible clean prose, with MADLAD fallback. */
  enableAppleTranslation?: boolean;
  generateGlossary?: boolean;
  translationConcurrency?: number;
  useCache?: boolean;
};
