import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { ProjectScreen } from "./components/project/ProjectScreen";
import { InboxScreen } from "./components/library/InboxScreen";
import { FavoritesScreen } from "./components/library/FavoritesScreen";
import { RecentScreen } from "./components/library/RecentScreen";
import { ReaderScreen } from "./components/reader/ReaderScreen";
import { ImportScreen } from "./components/import/ImportScreen";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { PdfFileDropLayer } from "./components/shell/PdfFileDropLayer";
import { useAppStore } from "./stores/appStore";
import {
  isTauriApp,
  markTranslationServerReady,
  waitForTranslationServer,
  type TranslationServerHealth,
} from "./utils/serverReady";
import { flushPersistence } from "./services/database";
import { resumeAfterTranslationServerReady } from "./services/import/startBackgroundImport";

function formatModelBanner(health: TranslationServerHealth | null, attempt: number): string {
  const phase = health?.phase;
  const progress =
    typeof health?.progress === "number" && Number.isFinite(health.progress)
      ? ` ${Math.round(Math.min(1, Math.max(0, health.progress)) * 100)}%`
      : "";
  if (health?.message) return health.message;
  switch (phase) {
    case "downloading":
      return `翻訳モデルを取得しています${progress}`;
    case "loading":
      return `翻訳モデルを読み込んでいます${progress}`;
    case "warming_up":
      return "翻訳モデルを準備しています…";
    case "model_missing":
      return "翻訳モデルの準備を開始しています…";
    case "error":
      return health?.error || "翻訳サーバーでエラーが発生しました";
    default:
      return attempt > 5
        ? `翻訳サーバーを起動しています（${attempt}秒）`
        : "翻訳サーバーを起動しています…";
  }
}

function App() {
  const displaySettings = useAppStore((state) => state.displaySettings);
  const [serverReady, setServerReady] = useState(!isTauriApp());
  const [serverError, setServerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [health, setHealth] = useState<TranslationServerHealth | null>(null);

  useEffect(() => {
    if (!isTauriApp()) {
      markTranslationServerReady();
      resumeAfterTranslationServerReady();
    }
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      if (displaySettings.theme === "system") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
      } else {
        document.documentElement.setAttribute("data-theme", displaySettings.theme);
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (displaySettings.theme === "system") applyTheme();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [displaySettings.theme]);

  useEffect(() => {
    const flush = () => {
      void flushPersistence();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);

    let unlisten: (() => void) | undefined;
    let closing = false;
    if (isTauriApp()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const current = getCurrentWindow();
        unlisten = await current.onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();
          closing = true;
          try {
            await flushPersistence();
          } finally {
            try {
              await current.destroy();
            } catch {
              await current.close();
            }
          }
        });
      });
    }

    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriApp()) return;
    let cancelled = false;
    const ac = new AbortController();

    const run = async () => {
      setServerError(null);
      try {
        await waitForTranslationServer({
          signal: ac.signal,
          onProgress: (n, h) => {
            if (cancelled) return;
            setAttempt(n);
            setHealth(h);
          },
        });
        if (cancelled) return;
        setServerReady(true);
        setServerError(null);
        resumeAfterTranslationServerReady();
      } catch (error) {
        if (cancelled || ac.signal.aborted) return;
        setServerError(error instanceof Error ? error.message : "翻訳サーバーを起動できませんでした");
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const handleRetry = () => {
    setServerError(null);
    setServerReady(false);
    setAttempt(0);
    setHealth(null);
    void waitForTranslationServer({
      onProgress: (n, h) => {
        setAttempt(n);
        setHealth(h);
      },
    })
      .then(() => {
        setServerReady(true);
        resumeAfterTranslationServerReady();
      })
      .catch((error) => {
        setServerError(error instanceof Error ? error.message : "翻訳サーバーを起動できませんでした");
      });
  };

  return (
    <HashRouter>
      {!serverReady && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#1a365d",
            color: "#ffffff",
            fontFamily: '-apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif',
            fontSize: 13,
          }}
        >
          {serverError ? (
            <>
              <span>{serverError}</span>
              <button
                type="button"
                onClick={handleRetry}
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid #ffffff",
                  background: "transparent",
                  color: "#ffffff",
                  cursor: "pointer",
                }}
              >
                再試行
              </button>
            </>
          ) : (
            <span>{formatModelBanner(health, attempt)}</span>
          )}
        </div>
      )}
      <PdfFileDropLayer />
      <div style={{ paddingTop: !serverReady ? 40 : 0, minHeight: "100%" }}>
        <Routes>
          <Route path="/import" element={<ImportScreen />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<LibraryScreen />} />
            <Route path="/inbox" element={<InboxScreen />} />
            <Route path="/favorites" element={<FavoritesScreen />} />
            <Route path="/recent" element={<RecentScreen />} />
            <Route path="/project/:projectId" element={<ProjectScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/reader/:paperId" element={<ReaderScreen />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
