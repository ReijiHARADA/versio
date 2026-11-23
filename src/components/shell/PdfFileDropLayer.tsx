import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Upload } from "lucide-react";
import {
  fileFromDroppedPath,
  firstPdfPath,
  importWorkspaceNodeIdFromLocation,
  tryStartPdfImport,
} from "../../services/pdfImport";
import { showToast } from "../../stores/toastStore";
import { isTauriApp } from "../../utils/serverReady";
import styles from "./PdfFileDropLayer.module.css";
import { Presence, MotionDiv } from "../ui/Presence";
import motion from "../../styles/motion.module.css";

function dragHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

export function PdfFileDropLayer() {
  const location = useLocation();
  const [hovering, setHovering] = useState(false);
  const dragDepth = useRef(0);
  const locationRef = useRef(location);
  locationRef.current = location;

  const importDroppedFile = useCallback(async (file: File) => {
    const loc = locationRef.current;
    if (loc.pathname.startsWith("/import")) return;
    const workspaceNodeId = importWorkspaceNodeIdFromLocation(loc.pathname, loc.search);
    await tryStartPdfImport(file, { workspaceNodeId });
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const stop = await getCurrentWebview().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setHovering(true);
          return;
        }
        if (payload.type === "leave") {
          setHovering(false);
          return;
        }
        setHovering(false);
        const path = firstPdfPath(payload.paths);
        if (!path) {
          showToast({ kind: "error", message: "PDF形式ではありません" });
          return;
        }
        void fileFromDroppedPath(path)
          .then((file) => importDroppedFile(file))
          .catch((error: unknown) => {
            console.error("Failed to read dropped PDF:", error);
            showToast({ kind: "error", message: "読み込みに失敗しました" });
          });
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [importDroppedFile]);

  // PDFs opened from Finder ("Open With") or `open -a Versio a.pdf b.pdf`.
  // Rust queues them (they can arrive before this mounts); drain on mount and on each signal.
  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const drain = async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const paths = await invoke<string[]>("take_opened_pdfs");
      for (const path of paths) {
        try {
          await importDroppedFile(await fileFromDroppedPath(path));
        } catch (error: unknown) {
          console.error("Failed to read opened PDF:", error);
          showToast({ kind: "error", message: "読み込みに失敗しました" });
        }
      }
    };

    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen("opened-pdfs", () => void drain());
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      await drain();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [importDroppedFile]);

  useEffect(() => {
    if (isTauriApp()) return;

    const onEnter = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setHovering(true);
    };
    const onOver = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
    };
    const onLeave = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setHovering(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setHovering(false);
      const file = event.dataTransfer?.files[0];
      if (file) void importDroppedFile(file);
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [importDroppedFile]);

  const show = hovering && !location.pathname.startsWith("/import");
  return (
    <Presence>
      {show && (
        <MotionDiv className={`${styles.overlay} ${motion.overlay}`} role="status">
          <Upload size={64} />
          <p>PDFをドロップしてインポート</p>
        </MotionDiv>
      )}
    </Presence>
  );
}
