import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "../ui/MaterialSymbol";
import { getSetting, saveSetting, clearTranslationCache, restoreTranslationCache } from "../../services/database";
import { checkOllamaAvailability } from "../../services/llm/ollamaProvider";
import { addSamplePaper } from "../../services/samplePaper";
import { useLibraryCache } from "../../stores/libraryCache";
import { showToast } from "../../stores/toastStore";
import { samplePaper } from "../../data/samplePaper";
import {
  mergeTranslationSettingsV2,
  type TranslationSettingsV2,
} from "../../utils/translationSettings";
import {
  SETTINGS_SCROLL_SECTIONS,
  isSettingsScrollSection,
  settingsSectionElementId,
  type SettingsScrollSectionId,
  type SettingsSectionId,
} from "../../utils/settingsToc";
import { SettingsNavigation } from "./SettingsNavigation";
import { TranslationSettingsSection } from "./TranslationSettingsSection";
import { ReadingSettingsSection } from "./ReadingSettingsSection";
import { StorageSettingsSection } from "./StorageSettingsSection";
import { DiagnosticsSettingsSection } from "./DiagnosticsSettingsSection";
import { LicensesSettingsSection } from "./LicensesSettingsSection";
import {
  useSettingsPanelTransition,
  type SettingsPanelPage,
} from "./useSettingsElasticPull";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

const IDLE_STATUS: ServiceStatus = { checking: false, available: false };
const LAST_SCROLL_SECTION =
  SETTINGS_SCROLL_SECTIONS[SETTINGS_SCROLL_SECTIONS.length - 1].id;

const GAUGE_RADIUS = 13;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function PullCommitGauge({
  progress,
  ready,
}: {
  progress: number;
  ready: boolean;
}) {
  const p = Math.min(1, Math.max(0, progress));
  return (
    <svg
      className={`${styles.pullGauge} ${ready ? styles.pullGaugeReady : ""}`}
      width="36"
      height="36"
      viewBox="0 0 36 36"
      aria-hidden="true"
    >
      <circle
        className={styles.pullGaugeTrack}
        cx="18"
        cy="18"
        r={GAUGE_RADIUS}
        fill="none"
      />
      <circle
        className={styles.pullGaugeFill}
        cx="18"
        cy="18"
        r={GAUGE_RADIUS}
        fill="none"
        strokeDasharray={GAUGE_CIRCUMFERENCE}
        strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - p)}
        transform="rotate(-90 18 18)"
      />
    </svg>
  );
}

export function SettingsScreen() {
  const sampleAlreadyAdded = useLibraryCache((state) =>
    state.papers.some((paper) => paper.id === samplePaper.id)
  );
  const [settings, setSettings] = useState<TranslationSettingsV2>(
    mergeTranslationSettingsV2(null)
  );
  const [loaded, setLoaded] = useState(false);
  const [isAddingSample, setIsAddingSample] = useState(false);
  const [sampleMessage, setSampleMessage] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>({
    ...IDLE_STATUS,
    models: [],
  });
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("reading");
  const [clearingCache, setClearingCache] = useState(false);
  const pendingScrollRef = useRef<SettingsScrollSectionId | null>(null);
  /** Remember settings scroll while on that page; restore after pull-back from licenses. */
  const settingsScrollTopRef = useRef(0);
  /** When set, return from licenses restores this scrollTop instead of jumping to a section top. */
  const restoreScrollTopRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);

  const panelPage: SettingsPanelPage =
    activeSection === "licenses" ? "licenses" : "settings";

  const handlePanelPageChange = useCallback((next: SettingsPanelPage) => {
    if (next === "licenses") {
      pendingScrollRef.current = null;
      setActiveSection("licenses");
      return;
    }
    // Sidebar may already have queued a target section; keep it.
    if (pendingScrollRef.current) {
      setActiveSection(pendingScrollRef.current);
      return;
    }
    // Pull-back from licenses: stay where the user left settings (usually the
    // bottom / 詳細), instead of scrolling to the top of that section.
    restoreScrollTopRef.current = settingsScrollTopRef.current;
    setActiveSection(LAST_SCROLL_SECTION);
  }, []);

  const panel = useSettingsPanelTransition({
    page: panelPage,
    onPageChange: handlePanelPageChange,
  });

  const contentRef = panel.settingsRef;

  useEffect(() => {
    if (panelPage !== "settings") return;
    const root = contentRef.current;
    if (!root) return;
    const remember = () => {
      settingsScrollTopRef.current = root.scrollTop;
    };
    remember();
    root.addEventListener("scroll", remember, { passive: true });
    return () => root.removeEventListener("scroll", remember);
  }, [panelPage, contentRef]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    async function loadSettings() {
      const saved = await getSetting<TranslationSettingsV2>("translationSettingsV2");
      setSettings(mergeTranslationSettingsV2(saved));
      setLoaded(true);
    }
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const handle = window.setTimeout(() => {
      void saveSetting("translationSettingsV2", settings);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [loaded, settings]);

  useEffect(() => {
    return () => {
      if (!loaded) return;
      void saveSetting("translationSettingsV2", settingsRef.current);
    };
  }, [loaded]);

  const checkOllama = useCallback(async (url = settingsRef.current.ollamaServerUrl) => {
    setOllamaStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkOllamaAvailability(url);
    setOllamaStatus({
      checking: false,
      available: status.available,
      models: status.models,
      error: status.error,
    });
    if (
      status.available &&
      status.models.length > 0 &&
      !status.models.includes(settingsRef.current.ollamaModel)
    ) {
      setSettings((prev) => ({ ...prev, ollamaModel: status.models[0] }));
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    void checkOllama();
  }, [loaded, checkOllama]);

  const updateSettings = (patch: Partial<TranslationSettingsV2>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleAddSample = async () => {
    if (isAddingSample) return;
    setIsAddingSample(true);
    setSampleMessage(null);
    try {
      const result = await addSamplePaper();
      if (result === "exists") {
        setSampleMessage("すでにライブラリにあります");
      } else {
        setSampleMessage("ライブラリに追加しました");
      }
    } catch (error) {
      console.error("Failed to add sample paper:", error);
      setSampleMessage("追加に失敗しました");
    } finally {
      setIsAddingSample(false);
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      const { count, snapshot } = await clearTranslationCache();
      if (count === 0) {
        showToast({ kind: "info", message: "削除するキャッシュはありませんでした" });
        return;
      }
      showToast({
        kind: "info",
        message: `翻訳キャッシュを削除しました（${count}件）`,
        actionLabel: "元に戻す",
        onAction: () => {
          void restoreTranslationCache(snapshot)
            .then(() => {
              showToast({ kind: "info", message: "翻訳キャッシュを元に戻しました" });
            })
            .catch((error: unknown) => {
              console.error("Failed to restore translation cache:", error);
              showToast({
                kind: "error",
                message:
                  error instanceof Error ? error.message : "キャッシュの復元に失敗しました",
              });
            });
        },
      });
    } catch (error) {
      console.error("Failed to clear translation cache:", error);
      showToast({ kind: "error", message: "削除に失敗しました" });
    } finally {
      setClearingCache(false);
    }
  };

  const scrollToSection = (id: SettingsScrollSectionId) => {
    const element = document.getElementById(settingsSectionElementId(id));
    const root = contentRef.current;
    if (!element || !root) return;

    // First section: reset to the top so the page title isn't clipped under the
    // scrollport (offsetTop is unreliable vs. the padded scroll container).
    if (id === SETTINGS_SCROLL_SECTIONS[0]?.id) {
      root.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const top =
      element.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop;
    root.scrollTo({
      top: Math.max(0, top - 24),
      behavior: "smooth",
    });
  };

  const handleSelectSection = (id: SettingsSectionId) => {
    if (id === "licenses") {
      pendingScrollRef.current = null;
      // Animate like overscroll — do not hard-cut activeSection / stackOffset.
      panel.goToPage("licenses");
      return;
    }
    pendingScrollRef.current = id;
    if (panelPage === "licenses") {
      panel.goToPage("settings");
      return;
    }
    setActiveSection(id);
  };

  useEffect(() => {
    if (!isSettingsScrollSection(activeSection)) return;
    const root = contentRef.current;
    if (!root) return;

    const pending = pendingScrollRef.current;
    const restoreTop = restoreScrollTopRef.current;
    if (restoreTop != null && !pending) {
      restoreScrollTopRef.current = null;
      root.scrollTo({ top: restoreTop });
    } else if (pending) {
      pendingScrollRef.current = null;
      restoreScrollTopRef.current = null;
      scrollToSection(pending);
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 8;
      if (atBottom) {
        const last = SETTINGS_SCROLL_SECTIONS[SETTINGS_SCROLL_SECTIONS.length - 1].id;
        setActiveSection((current) => (current === last ? current : last));
        return;
      }
      if (root.scrollTop <= 8) {
        const first = SETTINGS_SCROLL_SECTIONS[0].id;
        setActiveSection((current) => (current === first ? current : first));
        return;
      }
      const rootTop = root.getBoundingClientRect().top;
      const next =
        SETTINGS_SCROLL_SECTIONS.filter((section) => {
          const el = document.getElementById(settingsSectionElementId(section.id));
          if (!el) return false;
          return el.getBoundingClientRect().top - rootTop <= 80;
        }).at(-1)?.id ?? SETTINGS_SCROLL_SECTIONS[0].id;
      setActiveSection((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs on section change only; scrollToSection is recreated every render
  }, [activeSection]);

  return (
    <div className={styles.container}>
      <header className={styles.header} data-tauri-drag-region>
        <div className={styles.headerLeft}>
          <Settings size={20} className={styles.logo} />
          <h1 className={styles.title}>設定</h1>
        </div>
      </header>

      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <SettingsNavigation activeId={activeSection} onSelect={handleSelectSection} />
        </aside>
        <div ref={panel.viewportRef} className={styles.viewport}>
          <div
            className={`${styles.stack} ${panel.transitioning ? styles.stackSnap : ""}`}
            style={{
              height: panel.viewportH > 0 ? panel.viewportH * 2 : "200%",
              transform: `translateY(${-panel.stackOffset}px)`,
              transitionDuration: panel.transitioning ? `${panel.transitionMs}ms` : undefined,
            }}
          >
            <main
              ref={contentRef}
              className={`${styles.page} ${
                panelPage === "settings" && panel.snapping && !panel.transitioning
                  ? styles.pagePullSettle
                  : ""
              }`}
              style={{
                height: panel.viewportH > 0 ? panel.viewportH : "50%",
                transform:
                  panelPage === "settings" ? `translateY(${-panel.pullOffset}px)` : undefined,
                transitionDuration:
                  panelPage === "settings" && panel.snapping && !panel.transitioning
                    ? `${panel.settleMs}ms`
                    : undefined,
              }}
              aria-hidden={panelPage === "licenses"}
            >
              <section id={settingsSectionElementId("reading")} className={styles.section}>
                <ReadingSettingsSection />
              </section>
              <section id={settingsSectionElementId("translation")} className={styles.section}>
                <TranslationSettingsSection
                  settings={settings}
                  onChange={updateSettings}
                />
              </section>
              <section id={settingsSectionElementId("data")} className={styles.section}>
                <StorageSettingsSection
                  busy={clearingCache}
                  onClearCache={() => void handleClearCache()}
                />
              </section>
              <section id={settingsSectionElementId("advanced")} className={styles.section}>
                <DiagnosticsSettingsSection
                  ollamaStatus={ollamaStatus}
                  settings={settings}
                  onChange={updateSettings}
                  onRecheck={() => {
                    void checkOllama();
                  }}
                  sampleAlreadyAdded={sampleAlreadyAdded}
                  isAddingSample={isAddingSample}
                  sampleMessage={sampleMessage}
                  onAddSample={() => void handleAddSample()}
                />
              </section>
            </main>
            <main
              ref={panel.licensesRef}
              className={`${styles.page} ${
                panelPage === "licenses" && panel.snapping && !panel.transitioning
                  ? styles.pagePullSettle
                  : ""
              }`}
              style={{
                height: panel.viewportH > 0 ? panel.viewportH : "50%",
                transform:
                  panelPage === "licenses" ? `translateY(${panel.pullOffset}px)` : undefined,
                transitionDuration:
                  panelPage === "licenses" && panel.snapping && !panel.transitioning
                    ? `${panel.settleMs}ms`
                    : undefined,
              }}
              aria-hidden={panelPage === "settings"}
            >
              <LicensesSettingsSection />
            </main>
          </div>
          {panel.pulling || panel.transitioning ? (
            <div
              className={`${styles.elasticHint} ${
                panelPage === "settings" ? styles.elasticHintBottom : styles.elasticHintTop
              } ${panel.pastThreshold && !panel.latching ? styles.elasticHintActive : ""}`}
              style={{
                opacity: panel.transitioning
                  ? 0
                  : Math.min(1, 0.35 + panel.progress * 0.65),
              }}
              aria-hidden="true"
            >
              <PullCommitGauge
                progress={panel.progress}
                ready={panel.pastThreshold && !panel.latching}
              />
              <span className={styles.elasticHintLabel}>
                {panel.arming || panel.latching
                  ? "端でいったん停止"
                  : panelPage === "settings"
                    ? panel.pastThreshold
                      ? "離してライセンスへ"
                      : "ゆっくり引っ張ってゲージをためる"
                    : panel.pastThreshold
                      ? "離して設定へ"
                      : "ゆっくり引っ張ってゲージをためる"}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
