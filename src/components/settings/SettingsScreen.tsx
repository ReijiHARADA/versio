import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { getSetting, saveSetting, clearTranslationCache, restoreTranslationCache } from "../../services/database";
import { checkMADLADServer } from "../../services/translation/madladEngine";
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
  SETTINGS_SECTIONS,
  settingsSectionElementId,
  type SettingsSectionId,
} from "../../utils/settingsToc";
import { SettingsNavigation } from "./SettingsNavigation";
import { TranslationSettingsSection } from "./TranslationSettingsSection";
import { ReadingSettingsSection } from "./ReadingSettingsSection";
import { StorageSettingsSection } from "./StorageSettingsSection";
import { DiagnosticsSettingsSection } from "./DiagnosticsSettingsSection";
import { LicensesSettingsSection } from "./LicensesSettingsSection";
import type { ServiceStatus } from "./settingsTypes";
import styles from "./SettingsScreen.module.css";

const IDLE_STATUS: ServiceStatus = { checking: false, available: false };

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
  const [madladStatus, setMadladStatus] = useState<ServiceStatus>(IDLE_STATUS);
  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>({
    ...IDLE_STATUS,
    models: [],
  });
  const [activeSection, setActiveSection] = useState<SettingsSectionId>("reading");
  const [clearingCache, setClearingCache] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const settingsRef = useRef(settings);

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

  const checkMadlad = useCallback(async (url = settingsRef.current.madladServerUrl) => {
    setMadladStatus((prev) => ({ ...prev, checking: true }));
    const status = await checkMADLADServer(url);
    setMadladStatus({
      checking: false,
      available: status.available,
      modelLoaded: status.modelLoaded,
      error: status.error,
    });
  }, []);

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
    void checkMadlad();
    void checkOllama();
  }, [loaded, checkMadlad, checkOllama]);

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

  const handleSelectSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    const element = document.getElementById(settingsSectionElementId(id));
    const root = contentRef.current;
    if (!element || !root) return;

    // First section: reset to the top so the page title isn't clipped under the
    // scrollport (offsetTop is unreliable vs. the padded scroll container).
    if (id === SETTINGS_SECTIONS[0]?.id) {
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

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 8;
      if (atBottom) {
        const last = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;
        setActiveSection((current) => (current === last ? current : last));
        return;
      }
      if (root.scrollTop <= 8) {
        const first = SETTINGS_SECTIONS[0].id;
        setActiveSection((current) => (current === first ? current : first));
        return;
      }
      const rootTop = root.getBoundingClientRect().top;
      const next =
        SETTINGS_SECTIONS.filter((section) => {
          const el = document.getElementById(settingsSectionElementId(section.id));
          if (!el) return false;
          return el.getBoundingClientRect().top - rootTop <= 80;
        }).at(-1)?.id ?? SETTINGS_SECTIONS[0].id;
      setActiveSection((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Settings size={20} className={styles.logo} />
          <h1 className={styles.title}>設定</h1>
        </div>
      </header>

      <div className={styles.main}>
        <aside className={styles.sidebar}>
          <SettingsNavigation activeId={activeSection} onSelect={handleSelectSection} />
        </aside>
        <main ref={contentRef} className={styles.content}>
          <section id={settingsSectionElementId("reading")} className={styles.section}>
            <ReadingSettingsSection />
          </section>
          <section id={settingsSectionElementId("translation")} className={styles.section}>
            <TranslationSettingsSection
              settings={settings}
              onChange={updateSettings}
              madladStatus={madladStatus}
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
              madladStatus={madladStatus}
              ollamaStatus={ollamaStatus}
              settings={settings}
              onChange={updateSettings}
              onRecheck={() => {
                void checkMadlad();
                void checkOllama();
              }}
              sampleAlreadyAdded={sampleAlreadyAdded}
              isAddingSample={isAddingSample}
              sampleMessage={sampleMessage}
              onAddSample={() => void handleAddSample()}
            />
          </section>
          <section id={settingsSectionElementId("licenses")} className={styles.section}>
            <LicensesSettingsSection />
          </section>
        </main>
      </div>
    </div>
  );
}
