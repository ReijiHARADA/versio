import { useCallback, useState } from "react";
import type { ExportDialogValues } from "../ExportDialog";

export function useReaderExport(paperId: string | undefined) {
  const [showExport, setShowExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(
    async (values: ExportDialogValues) => {
      if (!paperId) return;
      setExportBusy(true);
      setExportError(null);
      setExportStatus("保存先を選んでいます...");
      try {
        const { getStorage } = await import("../../../data/runtime");
        const { exportPaperMarkdown, exportVerificationBundle } = await import(
          "../../../data/export/markdownExport"
        );
        const { saveMarkdownExport, saveNotionImportExport, saveVerificationExport } = await import(
          "../../../data/export/saveExport"
        );
        const { fs } = await getStorage();
        if (values.mode === "verification") {
          const result = await exportVerificationBundle(fs, paperId, {
            includeFailedTranslations: values.includeFailedTranslations,
          });
          setExportStatus("検証用パッケージを書き出しています...");
          const saved = await saveVerificationExport(paperId, result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          setExportStatus(`書き出しました: ${saved.path}`);
          return;
        }
        const result = await exportPaperMarkdown(fs, paperId, {
          language: "ja",
          variant: values.variant,
          stripBlockIds: values.variant !== "verification",
          includeFailedTranslations: values.includeFailedTranslations,
        });
        if (values.mode === "notion") {
          setExportStatus("Notion インポート用 ZIP を作成しています...");
          const saved = await saveNotionImportExport(result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          setExportStatus(`Notion 用 ZIP を書き出しました: ${saved.path}`);
          return;
        }
        setExportStatus("Markdown を書き出しています...");
        const saved = await saveMarkdownExport(result);
        if (!saved) {
          setExportStatus("キャンセルしました");
          return;
        }
        setExportStatus(`書き出しました: ${saved.path}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setExportError(message || "書き出しに失敗しました");
        setExportStatus(null);
      } finally {
        setExportBusy(false);
      }
    },
    [paperId]
  );

  return {
    showExport,
    setShowExport,
    exportBusy,
    exportStatus,
    exportError,
    setExportStatus,
    setExportError,
    handleExport,
  };
}
