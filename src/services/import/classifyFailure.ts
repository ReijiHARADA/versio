export type ImportFailureKind =
  | "pdf_read"
  | "extraction"
  | "ocr"
  | "translation_engine"
  | "model_download"
  | "storage"
  | "duplicate"
  | "unknown";

export type ImportRecoveryAction =
  | "retry"
  | "resume"
  | "open_existing"
  | "restore_existing"
  | "dismiss"
  | "readd";

export type ClassifiedImportFailure = {
  kind: ImportFailureKind;
  title: string;
  guidance: string;
  /** Prefer this primary action in the UI. */
  primaryAction: ImportRecoveryAction;
  /** Extra actions that still make sense. */
  secondaryActions: ImportRecoveryAction[];
  /** When true, retrying should not re-run successful extraction/translation. */
  preservePartialWork: boolean;
};

function includesAny(message: string, needles: string[]): boolean {
  const lower = message.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

/**
 * Map free-form import errors into actionable UX categories.
 * Does not alter pipeline stages — only interprets messages already produced.
 */
export function classifyImportFailure(
  message: string | undefined | null,
  stage?: string | null
): ClassifiedImportFailure {
  const text = (message || "").trim();

  if (
    includesAny(text, ["同じ論文がゴミ箱", "ゴミ箱にあります"])
  ) {
    return {
      kind: "duplicate",
      title: "同じ論文がゴミ箱にあります",
      guidance: "ゴミ箱から復元するか、この追加を取り消してください。",
      primaryAction: "restore_existing",
      secondaryActions: ["dismiss"],
      preservePartialWork: true,
    };
  }

  if (
    includesAny(text, ["既にインポート", "already imported", "duplicate"]) ||
    stage === "duplicate"
  ) {
    return {
      kind: "duplicate",
      title: "同じPDFがすでにあります",
      guidance: "既存の論文を開くか、この追加を取り消してください。",
      primaryAction: "open_existing",
      secondaryActions: ["dismiss"],
      preservePartialWork: true,
    };
  }

  if (
    includesAny(text, [
      "翻訳サーバー",
      "madlad",
      "model not ready",
      "server unavailable",
      "接続できません",
    ])
  ) {
    return {
      kind: "translation_engine",
      title: "翻訳エンジンに接続できません",
      guidance: "サーバー起動後に「再開」すると、保存済みの抽出結果から翻訳を続けます。",
      primaryAction: "resume",
      secondaryActions: ["retry", "dismiss"],
      preservePartialWork: true,
    };
  }

  if (
    includesAny(text, ["download", "ダウンロード", "huggingface", "model", "ディスク容量"])
  ) {
    return {
      kind: "model_download",
      title: "翻訳モデルの取得に失敗しました",
      guidance: "ネットワークを確認してから再試行してください。抽出が終わっている場合は翻訳だけ再開します。",
      primaryAction: "resume",
      secondaryActions: ["retry", "dismiss"],
      preservePartialWork: true,
    };
  }

  if (
    includesAny(text, ["ocr", "tesseract"]) ||
    stage === "ocr"
  ) {
    return {
      kind: "ocr",
      title: "OCRに失敗しました",
      guidance: "スキャンPDFの文字認識に失敗しました。再試行するか、別のPDFで試してください。",
      primaryAction: "retry",
      secondaryActions: ["dismiss", "readd"],
      preservePartialWork: false,
    };
  }

  if (
    includesAny(text, ["extract", "抽出", "pdf.js", "password", "暗号化"]) ||
    stage === "extracting" ||
    stage === "structuring"
  ) {
    return {
      kind: "extraction",
      title: "PDFの解析に失敗しました",
      guidance: "ファイルが壊れているか未対応の形式の可能性があります。再試行するか、別ファイルを追加してください。",
      primaryAction: "retry",
      secondaryActions: ["dismiss", "readd"],
      preservePartialWork: false,
    };
  }

  if (
    includesAny(text, ["read", "読み込", "file", "not found", "大きすぎ"]) ||
    stage === "reading"
  ) {
    return {
      kind: "pdf_read",
      title: "PDFを読めませんでした",
      guidance: "ファイルを選び直して追加してください。",
      primaryAction: "readd",
      secondaryActions: ["dismiss"],
      preservePartialWork: false,
    };
  }

  if (
    includesAny(text, ["storage", "quota", "sqlite", "persist", "保存", "disk"]) ||
    stage === "saving"
  ) {
    return {
      kind: "storage",
      title: "保存に失敗しました",
      guidance: "空き容量を確認してから再開してください。抽出結果が残っている場合は上書きしません。",
      primaryAction: "resume",
      secondaryActions: ["retry", "dismiss"],
      preservePartialWork: true,
    };
  }

  return {
    kind: "unknown",
    title: "読み込みに失敗しました",
    guidance: text || "もう一度試すか、項目を削除してPDFを追加し直してください。",
    primaryAction: "retry",
    secondaryActions: ["dismiss", "readd"],
    preservePartialWork: Boolean(stage && stage !== "reading" && stage !== "extracting"),
  };
}

export function actionLabel(action: ImportRecoveryAction): string {
  switch (action) {
    case "retry":
      return "最初から再試行";
    case "resume":
      return "続きから再開";
    case "open_existing":
      return "既存の論文を開く";
    case "restore_existing":
      return "ゴミ箱から復元";
    case "dismiss":
      return "閉じる";
    case "readd":
      return "PDFを選び直す";
  }
}
