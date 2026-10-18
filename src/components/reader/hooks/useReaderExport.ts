import { useCallback, useEffect, useState } from "react";
import type { ExportDialogValues } from "../ExportDialog";
import { getEpubSyncFolder, syncEpubFile } from "../../../services/epubSync";
import { showToast } from "../../../stores/toastStore";

export function useReaderExport(paperId: string | undefined) {
  const [showExport, setShowExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [epubSyncFolder, setEpubSyncFolder] = useState<string | null>(null);

  useEffect(() => {
    void getEpubSyncFolder().then(setEpubSyncFolder);
  }, []);

  const finishSuccess = useCallback((message: string) => {
    showToast({ kind: "success", message });
    setShowExport(false);
    setExportStatus(null);
    setExportError(null);
  }, []);

  const handleExport = useCallback(
    async (values: ExportDialogValues) => {
      if (!paperId) return;
      setExportBusy(true);
      setExportError(null);
      setExportStatus("準備しています...");
      try {
        const { getStorage } = await import("../../../data/runtime");
        const { exportPaperEpub } = await import("../../../data/export/epubExport");
        const { exportPaperMarkdown, exportVerificationBundle } = await import(
          "../../../data/export/markdownExport"
        );
        const { saveEpubExport, saveMarkdownExport, saveNotionImportExport, saveVerificationExport } = await import(
          "../../../data/export/saveExport"
        );
        const { fs } = await getStorage();
        if (values.mode === "epub") {
          setExportStatus("EPUBを作成しています...");
          const result = await exportPaperEpub(fs, paperId, {
            includeFailedTranslations: values.includeFailedTranslations,
          });
          setExportStatus("保存先を選んでいます...");
          const saved = await saveEpubExport(result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          const selectedSyncFolder = values.syncToFolder
            ? await getEpubSyncFolder()
            : epubSyncFolder;
          if (values.syncToFolder && selectedSyncFolder) {
            setExportStatus("同期先フォルダへコピーしています...");
            await syncEpubFile(selectedSyncFolder, `${result.fileName}.epub`, result.epub);
          }
          finishSuccess(`EPUBを書き出しました`);
          return;
        }
        if (values.mode === "verification") {
          setExportStatus("検証用パッケージを作成しています...");
          const result = await exportVerificationBundle(fs, paperId, {
            includeFailedTranslations: values.includeFailedTranslations,
          });
          setExportStatus("保存先を選んでいます...");
          const saved = await saveVerificationExport(paperId, result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          finishSuccess("検証用パッケージを書き出しました");
          return;
        }
        setExportStatus("Markdown を作成しています...");
        const result = await exportPaperMarkdown(fs, paperId, {
          language: "ja",
          variant: values.variant,
          stripBlockIds: values.variant !== "verification",
          includeFailedTranslations: values.includeFailedTranslations,
        });
        if (values.mode === "notion") {
          setExportStatus("保存先を選んでいます...");
          const saved = await saveNotionImportExport(result);
          if (!saved) {
            setExportStatus("キャンセルしました");
            return;
          }
          finishSuccess("Notion 用 ZIP を書き出しました");
          return;
        }
        setExportStatus("保存先を選んでいます...");
        const saved = await saveMarkdownExport(result);
        if (!saved) {
          setExportStatus("キャンセルしました");
          return;
        }
        try {
          const { reportUiE2eExportSuccess } = await import("../../../services/uiE2eWatch");
          const bytes = new TextEncoder().encode(result.markdown).length;
          await reportUiE2eExportSuccess({ path: saved.path, bytes });
        } catch {
          // UI E2E reporter is optional outside acceptance launches.
        }
        finishSuccess("Markdown を書き出しました");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setExportError(message || "書き出しに失敗しました");
        setExportStatus(null);
      } finally {
        setExportBusy(false);
      }
    },
    [epubSyncFolder, finishSuccess, paperId]
  );

  return {
    showExport,
    setShowExport,
    exportBusy,
    exportStatus,
    exportError,
    epubSyncFolder,
    setExportStatus,
    setExportError,
    handleExport,
  };
}
