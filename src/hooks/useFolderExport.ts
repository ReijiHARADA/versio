import { useCallback, useState } from "react";
import type { ExportDialogValues } from "../components/reader/ExportDialog";
import type { WorkspaceNode } from "../types/project";
import { useProjectStore } from "../stores/projectStore";
import { showToast } from "../stores/toastStore";

export function useFolderExport() {
  const [target, setTarget] = useState<WorkspaceNode | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const showExport = target != null;

  const openExport = useCallback((node: WorkspaceNode) => {
    setTarget(node);
    setExportBusy(false);
    setExportStatus(null);
    setExportError(null);
  }, []);

  const closeExport = useCallback(() => {
    if (exportBusy) return;
    setTarget(null);
    setExportStatus(null);
    setExportError(null);
  }, [exportBusy]);

  const handleExport = useCallback(
    async (values: ExportDialogValues) => {
      if (!target) return;
      setExportBusy(true);
      setExportError(null);
      setExportStatus("論文を集めています...");
      try {
        const { getStorage } = await import("../data/runtime");
        const { exportWorkspaceFolder } = await import("../data/export/folderExport");
        const { saveFolderExport } = await import("../data/export/saveExport");
        const { listPapersForWorkspace } = await import("../services/projectService");
        const papers = await listPapersForWorkspace(target.id);
        if (papers.length === 0) {
          setExportError("このフォルダ配下に書き出す論文がありません");
          setExportStatus(null);
          return;
        }
        const { fs } = await getStorage();
        const nodes = useProjectStore.getState().workspaceNodes;
        const memberships = useProjectStore.getState().memberships;
        setExportStatus(`書き出しています… 0/${papers.length}`);
        const result = await exportWorkspaceFolder(fs, target, nodes, memberships, {
          mode: values.mode,
          variant: values.variant,
          includeFailedTranslations: values.includeFailedTranslations,
          onProgress: (current, total, paperId) => {
            setExportStatus(`書き出しています… ${current}/${total}（${paperId.slice(0, 8)}）`);
          },
        });
        if (result.exportedCount === 0) {
          setExportError(
            result.failed.length > 0
              ? `すべての論文の書き出しに失敗しました（${result.failed.length} 件）`
              : "書き出す論文がありません"
          );
          setExportStatus(null);
          return;
        }
        setExportStatus("保存先を選んでいます...");
        const saved = await saveFolderExport(result);
        if (!saved) {
          setExportStatus("キャンセルしました");
          return;
        }
        const failNote =
          result.failed.length > 0
            ? `（失敗 ${result.failed.length} 件は ZIP 内の export-report.txt を参照）`
            : "";
        showToast({
          kind: "success",
          message: `${result.exportedCount} 件を書き出しました${failNote}`,
        });
        setTarget(null);
        setExportStatus(null);
        setExportError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setExportError(message || "フォルダの書き出しに失敗しました");
        setExportStatus(null);
      } finally {
        setExportBusy(false);
      }
    },
    [target]
  );

  return {
    target,
    showExport,
    exportBusy,
    exportStatus,
    exportError,
    openExport,
    closeExport,
    handleExport,
  };
}
