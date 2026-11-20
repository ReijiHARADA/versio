import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/shell/AppShell";
import { LibraryScreen } from "./components/library/LibraryScreen";
import { ProjectScreen } from "./components/project/ProjectScreen";
import { InboxScreen } from "./components/library/InboxScreen";
import { FavoritesScreen } from "./components/library/FavoritesScreen";
import { RecentScreen } from "./components/library/RecentScreen";
import { TrashScreen } from "./components/library/TrashScreen";
import { ReaderScreen } from "./components/reader/ReaderScreen";
import { ImportScreen } from "./components/import/ImportScreen";
import { SettingsScreen } from "./components/settings/SettingsScreen";
import { PdfFileDropLayer } from "./components/shell/PdfFileDropLayer";
import { IntroOverlay } from "./components/intro/IntroOverlay";
import { useAppStore } from "./stores/appStore";
import { isTauriApp } from "./utils/serverReady";
import { flushPersistence } from "./services/database";
import {
  maybeRunPackagedAcceptanceImport,
  maybeVerifyPackagedAcceptanceRelaunch,
} from "./services/packagedAcceptance";
import { maybeStartUiE2eWatcher } from "./services/uiE2eWatch";
import { invoke } from "@tauri-apps/api/core";
import styles from "./App.module.css";

function App() {
  const displaySettings = useAppStore((state) => state.displaySettings);

  useEffect(() => {
    if (!isTauriApp()) return;
    void maybeStartUiE2eWatcher();
    void maybeVerifyPackagedAcceptanceRelaunch().then(() =>
      maybeRunPackagedAcceptanceImport()
    );
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const resolved =
        displaySettings.theme === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : displaySettings.theme;
      document.documentElement.setAttribute("data-theme", resolved);
      if (isTauriApp()) {
        void invoke("sync_window_chrome_theme", { theme: resolved }).catch(() => {});
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

  return (
    <HashRouter>
      <PdfFileDropLayer />
      <IntroOverlay />
      <div className={`${styles.root} ${isTauriApp() ? styles.rootDesktop : ""}`}>
        <div className={styles.routes}>
          <Routes>
            <Route path="/import" element={<ImportScreen />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<LibraryScreen />} />
              <Route path="/inbox" element={<InboxScreen />} />
              <Route path="/favorites" element={<FavoritesScreen />} />
              <Route path="/recent" element={<RecentScreen />} />
              <Route path="/trash" element={<TrashScreen />} />
              <Route path="/project/:projectId" element={<ProjectScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/reader/:paperId" element={<ReaderScreen />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}

export default App;
